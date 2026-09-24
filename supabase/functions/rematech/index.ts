import {
  deliverMail,
  mailConfigured,
  buildMessage,
  MAIL_ACCOUNT,
} from "./mail.js";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  createCase,
  applyAction,
  ROLES,
  PERMISSIONS,
  defaultPermissions,
  can,
  STATUSES,
  normalizeRecord,
} from "./shared/workflow.js";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Content-Type": "application/json",
};
const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const check = (result: any) => {
  if (result.error)
    throw new Error(
      result.error.code === "23505"
        ? "Este folio o correo ya está registrado."
        : result.error.message,
    );
  return result.data;
};
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST")
    return answer({ error: "Método no permitido." }, 405);
  try {
    if (Number(request.headers.get("content-length") || 0) > 7000000)
      return answer({ error: "Solicitud demasiado grande." }, 413);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return answer({ error: "Inicia sesión." }, 401);
    const {
      data: { user: identity },
      error,
    } = await db.auth.getUser(token);
    if (error || !identity)
      return answer({ error: "Tu sesión expiró. Vuelve a entrar." }, 401);
    const profile = check(
      await db
        .from("rematech_profiles")
        .select("*")
        .eq("id", identity.id)
        .single(),
    );
    if (!profile?.active)
      return answer({ error: "Cuenta no habilitada." }, 403);
    const raw = await request.text();
    if (raw.length > 7000000)
      return answer({ error: "Solicitud demasiado grande." }, 413);
    const input = JSON.parse(raw);
    const mailEnv = Object.fromEntries(
      [
        "GMAIL_CLIENT_ID",
        "GMAIL_CLIENT_SECRET",
        "GMAIL_REFRESH_TOKEN",
        "GMAIL_ACCOUNT",
      ].map((key) => [key, Deno.env.get(key)]),
    );
    const user = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      mustChangePassword: profile.must_change_password,
      permissions: profile.permissions || [],
    };
    if (input.action === "profile")
      return answer({
        ...user,
        emailEnabled: mailConfigured(mailEnv),
        emailSender: MAIL_ACCOUNT,
      });
    if (input.action === "change-password") {
      const { password, confirmation } = input;
      if (
        typeof password !== "string" ||
        password.length < 10 ||
        password !== confirmation
      )
        throw new Error(
          "Usa al menos 10 caracteres y confirma la misma contraseña.",
        );
      const probe = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const attempt = await probe.auth.signInWithPassword({
        email: profile.email,
        password,
      });
      if (!attempt.error) {
        await probe.auth.signOut({ scope: "local" });
        throw new Error("Usa una contraseña distinta a la actual.");
      }
      check(await db.auth.admin.updateUserById(identity.id, { password }));
      check(
        await db
          .from("rematech_profiles")
          .update({ must_change_password: false })
          .eq("id", identity.id),
      );
      return answer({ ...user, mustChangePassword: false });
    }
    if (profile.must_change_password)
      return answer(
        { error: "Cambia tu contraseña temporal antes de continuar." },
        403,
      );
    const admin = () => {
      if (user.role !== "admin")
        throw new Error("Acción exclusiva del administrador.");
    };
    if (input.action === "suggestion-create") {
      const title = String(input.title || "").trim();
      const body = String(input.body || "").trim();
      if (title.length < 3 || body.length < 3)
        throw new Error(
          "Escribe un título y una descripción para la propuesta.",
        );
      return answer(
        check(
          await db
            .from("rematech_suggestions")
            .insert({
              author_id: identity.id,
              author_name: user.name,
              title,
              body,
            })
            .select("*")
            .single(),
        ),
      );
    }
    if (input.action === "suggestions") {
      admin();
      return answer(
        check(
          await db
            .from("rematech_suggestions")
            .select("*")
            .order("created_at", { ascending: false }),
        ),
      );
    }
    if (input.action === "suggestion-update") {
      admin();
      const status = String(input.status || "");
      if (
        !["pendiente", "en_revision", "implementada", "descartada"].includes(
          status,
        )
      )
        throw new Error("Estado de propuesta no válido.");
      return answer(
        check(
          await db
            .from("rematech_suggestions")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", input.id)
            .select("*")
            .single(),
        ),
      );
    }
    if (input.action === "sales-get" || input.action === "sales-save") {
      admin();
      const salesBucket = db.storage.from("rematech-config");
      const readSales = async () => {
        const file = await salesBucket.download("manual-sales.json");
        if (file.error) {
          if (
            String(file.error.message).includes("not found") ||
            String(file.error.message).includes("Object not found")
          )
            return {};
          throw file.error;
        }
        return JSON.parse(await file.data.text());
      };
      if (input.action === "sales-get")
        return answer({ rows: await readSales() });
      if (
        typeof input.period !== "string" ||
        !/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.period)
      )
        throw new Error("Selecciona un mes y año válidos.");
      const channels = ["Mercado Libre", "Shopify", "Coppel", "Amazon"];
      if (
        !input.values ||
        typeof input.values !== "object" ||
        Array.isArray(input.values) ||
        Object.keys(input.values).sort().join("|") !==
          channels.sort().join("|") ||
        channels.some(
          (channel) =>
            !Number.isFinite(input.values[channel]) ||
            input.values[channel] < 0 ||
            input.values[channel] > 1e12 ||
            Math.round(input.values[channel] * 100) !==
              input.values[channel] * 100,
        )
      )
        throw new Error("Ingresa importes válidos para los cuatro canales.");
      const rows = await readSales();
      rows[input.period] = input.values;
      check(
        await salesBucket.upload(
          "manual-sales.json",
          new Blob([JSON.stringify(rows)], { type: "application/json" }),
          { upsert: true, contentType: "application/json" },
        ),
      );
      return answer({ period: input.period, values: rows[input.period] });
    }
    if (input.action === "users") {
      admin();
      return answer(
        check(
          await db
            .from("rematech_profiles")
            .select(
              "id,name,email,role,must_change_password,permissions,active",
            ),
        ).map((p: any) => ({
          ...p,
          mustChangePassword: p.must_change_password,
          permissions: p.permissions || [],
        })),
      );
    }
    if (input.action === "create-user") {
      admin();
      const {
        name,
        email,
        password,
        role,
        permissions = defaultPermissions(role),
      } = input;
      if (
        !Array.isArray(permissions) ||
        permissions.some((p: string) => !Object.hasOwn(PERMISSIONS, p))
      )
        throw new Error("Permisos no válidos.");
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 120 ||
        !Object.hasOwn(ROLES, role) ||
        typeof password !== "string" ||
        password.length < 10
      )
        throw new Error("Revisa nombre, rol y contraseña temporal.");
      const created = check(
        await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      ).user;
      const saved = await db.from("rematech_profiles").insert({
        id: created.id,
        name: name.trim(),
        email: created.email,
        role,
        permissions: Array.isArray(permissions) ? permissions : [],
        must_change_password: true,
      });
      if (saved.error) {
        await db.auth.admin.deleteUser(created.id);
        throw new Error("No se pudo crear la cuenta.");
      }
      return answer({ id: created.id });
    }
    if (input.action === "reset-user-password") {
      admin();
      if (input.id === user.id)
        throw new Error("No puedes restablecer tu propia contraseña aquí.");
      if (typeof input.password !== "string" || input.password.length < 10)
        throw new Error(
          "La contraseña temporal debe tener al menos 10 caracteres.",
        );
      const target = check(
        await db
          .from("rematech_profiles")
          .select("id")
          .eq("id", input.id)
          .single(),
      );
      check(
        await db
          .from("rematech_profiles")
          .update({ must_change_password: true })
          .eq("id", target.id),
      );
      check(
        await db.auth.admin.updateUserById(target.id, {
          password: input.password,
        }),
      );
      return answer({ ok: true });
    }
    if (input.action === "set-role") {
      admin();
      if (input.id === user.id || !Object.hasOwn(ROLES, input.role))
        throw new Error(
          "No puedes cambiar tu propio rol o asignar un rol inválido.",
        );
      check(
        await db
          .from("rematech_profiles")
          .update({ role: input.role })
          .eq("id", input.id),
      );
      return answer({ ok: true });
    }
    if (input.action === "set-permissions") {
      admin();
      if (input.id === user.id)
        throw new Error("No puedes cambiar tus propios permisos.");
      if (
        !Array.isArray(input.permissions) ||
        input.permissions.some(
          (p: string) =>
            ![
              "dashboard",
              "ingresos",
              "reparacion",
              "calidad",
              "settings",
            ].includes(p),
        )
      )
        throw new Error("Permisos no válidos.");
      const saved = check(
        await db
          .from("rematech_profiles")
          .update({ permissions: [...new Set(input.permissions)] })
          .eq("id", input.id)
          .select("id,permissions")
          .single(),
      );
      return answer({ ok: true, permissions: saved.permissions });
    }
    const allCases = async () => {
      const rows: any[] = [];
      for (let offset = 0; ; offset += 500) {
        const batch = check(
          await db
            .from("rematech_cases")
            .select("id,body")
            .order("id")
            .range(offset, offset + 499),
        );
        rows.push(...batch);
        if (batch.length < 500) return rows;
      }
    };
    if (input.action === "list") {
      if (!Object.keys(PERMISSIONS).some((key) => can(user, key)))
        throw new Error("Sin permiso para consultar expedientes.");
      const rows = await allCases();
      return answer(
        rows
          .map((r: any) => ({ ...r.body, evidence: [] }))
          .sort((a: any, b: any) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    }
    if (input.action === "notifications") {
      const rows = await allCases();
      const ids = new Set<string>();
      for (let offset = 0; ; offset += 500) {
        const read = check(
          await db
            .from("rematech_notification_reads")
            .select("notification_id")
            .eq("user_id", user.id)
            .order("notification_id")
            .range(offset, offset + 499),
        );
        read.forEach((r: any) => ids.add(r.notification_id));
        if (read.length < 500) break;
      }
      return answer(
        rows
          .flatMap((r: any) =>
            (r.body.notifications || [])
              .filter((n: any) => n.targets.includes(user.role))
              .map((n: any) => ({
                ...n,
                caseId: r.id,
                folio: r.body.intake.folio,
                unread: !ids.has(n.id),
              })),
          )
          .sort((a: any, b: any) => b.at.localeCompare(a.at)),
      );
    }
    if (input.action === "register" || input.action === "import-local") {
      const files = input.evidence || [];
      if (files.length > 2) throw new Error("Máximo dos evidencias.");
      let record: any;
      if (input.action === "import-local") {
        admin();
        const source = input.record;
        if (
          !source ||
          !/^[0-9a-f-]{36}$/i.test(source.id) ||
          !Object.hasOwn(STATUSES, source.status) ||
          !Array.isArray(source.history)
        )
          throw new Error("Expediente local no válido.");
        const valid = createCase(source.intake, [], user);
        const existing = check(
          await db
            .from("rematech_cases")
            .select("id")
            .eq("id", source.id)
            .maybeSingle(),
        );
        if (existing) return answer({ skipped: true });
        record = {
          ...normalizeRecord(source),
          id: source.id,
          folioKey: valid.folioKey,
          revision: 1,
          evidence: [],
          updatedAt: new Date().toISOString(),
        };
        record.history.push({
          id: crypto.randomUUID(),
          at: record.updatedAt,
          actorId: user.id,
          actor: user.name,
          role: user.role,
          action: "Transferido del archivo local",
          status: record.status,
        });
      } else record = createCase(input.intake, [], user);
      const paths: string[] = [];
      try {
        for (let i = 0; i < files.length; i++) {
          if (!files[i]) {
            record.evidence.push(null);
            continue;
          }
          const { type, base64 } = files[i];
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(type) ||
            typeof base64 !== "string" ||
            base64.length > 2800000
          )
            throw new Error("Evidencia no válida.");
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const path = `${record.id}/${i}`;
          check(
            await db.storage
              .from("rematech-evidence")
              .upload(path, bytes, { contentType: type }),
          );
          paths.push(path);
          record.evidence.push(path);
        }
        if (input.action === "register")
          record.notifications.push({
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            actor: user.name,
            actorId: user.id,
            role: user.role,
            action: "Nuevo ingreso pendiente de recepción",
            status: record.status,
            targets: ["reparacion"],
            readBy: [],
          });
        check(
          await db.rpc("rematech_save_case", {
            p_id: record.id,
            p_revision: null,
            p_body: record,
          }),
        );
        return answer({ ...record, evidence: [] });
      } catch (error) {
        if (paths.length)
          await db.storage.from("rematech-evidence").remove(paths);
        throw error;
      }
    }
    if (input.action === "email") {
      if (!["admin", "ingresos", "reparacion", "calidad"].includes(user.role))
        throw new Error("Sin permiso para enviar documentos.");
      if (!mailConfigured(mailEnv))
        throw new Error("Falta conectar la cuenta de Gmail de Rematech.");
      const destination =
        input.kind === "repair"
          ? Deno.env.get("REPAIR_EMAIL")
          : input.destination;
      const message = {
        destination,
        kind: input.kind,
        folio: input.folio,
        pdf: input.pdf,
      };
      buildMessage(message);
      check(await db.rpc("rematech_claim_email", { p_user: user.id }));
      return answer(await deliverMail(message, mailEnv));
    }

    const row = check(
      await db
        .from("rematech_cases")
        .select("body,revision")
        .eq("id", input.id)
        .single(),
    );
    if (input.action === "get") {
      if (!Object.keys(PERMISSIONS).some((key) => can(user, key)))
        throw new Error("Sin permiso para consultar expedientes.");
      const record = normalizeRecord(row.body);
      record.evidence = await Promise.all(
        record.evidence.map(async (path: string | null) =>
          path
            ? check(
                await db.storage
                  .from("rematech-evidence")
                  .createSignedUrl(path, 120),
              ).signedUrl
            : null,
        ),
      );
      return answer(record);
    }
    if (input.action === "delete") {
      admin();
      const paths = (row.body.evidence || []).filter(Boolean);
      if (paths.length)
        check(await db.storage.from("rematech-evidence").remove(paths));
      // Read receipts reference the case. Remove those auxiliary rows first so
      // the case can be deleted without leaving foreign-key references behind.
      check(await db.from("rematech_notification_reads").delete().eq("case_id", input.id));
      check(await db.from("rematech_cases").delete().eq("id", input.id));
      return answer({ ok: true });
    }
    if (input.action === "read") {
      const note = (row.body.notifications || []).find(
        (n: any) =>
          n.id === input.notificationId && n.targets.includes(user.role),
      );
      if (!note) throw new Error("Notificación no disponible.");
      check(
        await db.from("rematech_notification_reads").upsert({
          user_id: user.id,
          case_id: input.id,
          notification_id: note.id,
        }),
      );
      return answer({ ok: true });
    }
    if (input.action === "act") {
      if (row.revision !== input.revision)
        throw new Error(
          "Otro usuario actualizó el expediente. Vuelve a abrirlo.",
        );
      const next = applyAction(
        row.body,
        input.operation,
        input.payload || {},
        user,
      );
      check(
        await db.rpc("rematech_save_case", {
          p_id: input.id,
          p_revision: input.revision,
          p_body: next,
        }),
      );
      return answer({ ...next, evidence: [] });
    }
    return answer({ error: "Acción no válida." }, 400);
  } catch (error) {
    return answer(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar la operación.",
      },
      400,
    );
  }
});
