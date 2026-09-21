import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const url = "https://gxhlrxiiuqlfmjrwllif.supabase.co";
const keys = process.env.SUPABASE_CLI
  ? JSON.parse(
      execFileSync(
        process.env.SUPABASE_CLI,
        [
          "projects",
          "api-keys",
          "--project-ref",
          "gxhlrxiiuqlfmjrwllif",
          "--output",
          "json",
        ],
        { encoding: "utf8" },
      ),
    )
  : JSON.parse(readFileSync("/tmp/rematech-project-keys.json", "utf8"));
const secret = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const adminHeaders = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};
async function request(path, body, headers = adminHeaders, method = "POST") {
  const response = await fetch(url + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { ok: response.ok, status: response.status, data };
}
const accounts = [],
  caseIds = [];
const pass = `Test-${crypto.randomUUID()}`;
async function make(role, temporary = false) {
  const email = `qa-${role}-${crypto.randomUUID()}@rematech.test`;
  const result = await request("/auth/v1/admin/users", {
    email,
    password: pass,
    email_confirm: true,
  });
  assert(result.ok, JSON.stringify(result.data));
  const id = result.data.id;
  accounts.push(id);
  const p = await request("/rest/v1/rematech_profiles", {
    id,
    email,
    name: `QA ${role}`,
    role,
    permissions: ["dashboard", role],
    must_change_password: temporary,
  });
  assert(p.ok, JSON.stringify(p.data));
  const login = await request(
    "/auth/v1/token?grant_type=password",
    { email, password: pass },
    { apikey: anon, "Content-Type": "application/json" },
  );
  assert(login.ok);
  return { id, email, token: login.data.access_token };
}
const call = (user, action, data = {}) =>
  request(
    "/functions/v1/rematech",
    { action, ...data },
    {
      apikey: anon,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
  );
try {
  const admin = await make("admin"),
    intake = await make("ingresos"),
    repair = await make("reparacion"),
    quality = await make("calidad", true);
  assert.equal((await call(quality, "list")).status, 403);
  assert(
    (
      await call(quality, "change-password", {
        password: "Changed-" + pass,
        confirmation: "Changed-" + pass,
      })
    ).ok,
  );
  const renewed = await request(
    "/auth/v1/token?grant_type=password",
    { email: quality.email, password: "Changed-" + pass },
    { apikey: anon, "Content-Type": "application/json" },
  );
  assert(renewed.ok);
  quality.token = renewed.data.access_token;
  assert(
    !(
      await call(repair, "reset-user-password", {
        id: quality.id,
        password: "Reset-" + pass,
      })
    ).ok,
  );
  const mailProfile = (await call(admin, "profile")).data;
  assert.equal(typeof mailProfile.emailEnabled, "boolean");
  assert.equal(mailProfile.emailSender, "g.garcia@rematech.mx");
  const { newDraft } = await import("../src/js/utils.js");
  const d = {
    ...newDraft(),
    client: "QA temporal",
    equipment: "Equipo QA",
    serial: "QA-SN",
    description: "Prueba de flujo",
    components: [
      { component: "Batería / Carga", faults: ["No carga"], other: "" },
    ],
  };
  assert(!(await call(repair, "register", { intake: d, evidence: [] })).ok);
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz0AAAAASUVORK5CYII=";
  const created = await call(intake, "register", {
    intake: d,
    evidence: [{ type: "image/png", base64: png }],
  });
  assert(created.ok, JSON.stringify(created.data));
  let r = created.data;
  caseIds.push(r.id);
  const withImage = await call(repair, "get", { id: r.id });
  assert(withImage.ok);
  const storedImage = await fetch(withImage.data.evidence[0]);
  assert(storedImage.ok);
  assert.equal(
    Buffer.from(await storedImage.arrayBuffer()).toString("base64"),
    png,
  );
  assert((await call(repair, "list")).data.some((x) => x.id === r.id));
  assert(
    (await call(repair, "notifications")).data.some((x) => x.caseId === r.id),
  );
  const act = async (user, operation, payload = {}) => {
    const res = await call(user, "act", {
      id: r.id,
      revision: r.revision,
      operation,
      payload,
    });
    assert(res.ok, JSON.stringify(res.data));
    r = res.data;
  };
  assert(
    !(
      await call(repair, "set-permissions", {
        id: intake.id,
        permissions: ["calidad"],
      })
    ).ok,
  );
  assert(
    (
      await call(admin, "set-permissions", {
        id: repair.id,
        permissions: ["dashboard", "reparacion", "calidad"],
      })
    ).ok,
  );
  assert.deepEqual(
    (await call(admin, "users")).data.find((u) => u.id === repair.id)
      .permissions,
    ["dashboard", "reparacion", "calidad"],
  );
  assert.deepEqual((await call(repair, "profile")).data.permissions, [
    "dashboard",
    "reparacion",
    "calidad",
  ]);
  assert(
    (await call(admin, "set-permissions", { id: repair.id, permissions: [] }))
      .ok,
  );
  assert(
    !(
      await call(repair, "act", {
        id: r.id,
        revision: r.revision,
        operation: "receive",
      })
    ).ok,
  );
  assert(
    (
      await call(admin, "set-permissions", {
        id: repair.id,
        permissions: ["dashboard", "reparacion"],
      })
    ).ok,
  );
  assert(
    !(
      await call(repair, "act", {
        id: r.id,
        revision: r.revision,
        operation: "update-intake",
        payload: { serial: "FORBIDDEN" },
      })
    ).ok,
  );
  const historyCount = r.history.length;
  await act(admin, "update-intake", {
    serial: "QA-SERIAL-UPDATED",
    resolution: "Cerrado a favor de Rematech",
  });
  assert.equal(r.history.length, historyCount + 1);
  const updated = (await call(repair, "get", { id: r.id })).data;
  assert.equal(updated.intake.serial, "QA-SERIAL-UPDATED");
  assert.equal(updated.intake.resolution, "Cerrado a favor de Rematech");
  const returnCreated = await call(intake, "register", {
    intake: {
      ...d,
      folio: "QA-RETURN-" + crypto.randomUUID(),
      intakeType: "Devolución",
      serial: "",
      resolution: "En proceso de devolución",
    },
    evidence: [],
  });
  assert(returnCreated.ok, JSON.stringify(returnCreated.data));
  caseIds.push(returnCreated.data.id);
  const ret = returnCreated.data;
  const retUpdate = await call(admin, "act", {
    id: ret.id,
    revision: ret.revision,
    operation: "update-intake",
    payload: {
      serial: "QA-RECEIVED-SN",
      resolution: "Cerrado a favor de Rematech",
    },
  });
  assert(retUpdate.ok, JSON.stringify(retUpdate.data));
  assert.equal(
    retUpdate.data.returnResolution,
    retUpdate.data.intake.resolution,
  );
  const note = (await call(repair, "notifications")).data.find(
    (x) => x.caseId === r.id,
  );
  assert(
    (await call(repair, "read", { id: r.id, notificationId: note.id })).ok,
  );
  assert(
    !(await call(repair, "notifications")).data.find((x) => x.id === note.id)
      .unread,
  );
  const initialRevision = r.revision;
  await act(repair, "receive");
  assert(
    !(
      await call(repair, "act", {
        id: r.id,
        revision: initialRevision,
        operation: "receive",
      })
    ).ok,
  );
  const t = {
    diagnosis: "Diagnóstico QA",
    fault: "Falla QA",
    actions: "Reparación QA",
    result: "Reparado",
    faultLocations: ["Batería / Carga"],
    date: "2026-09-19",
    technician: "Falso",
  };
  await act(repair, "send-quality", t);
  assert.equal(r.technical.technician, "QA reparacion");
  assert(
    !(
      await call(intake, "act", {
        id: r.id,
        revision: r.revision,
        operation: "finish",
        payload: { decision: "approved", date: "2026-09-19" },
      })
    ).ok,
  );
  await act(quality, "return-repair", {
    decision: "rejected",
    notes: "Observación QA",
    date: "2026-09-19",
  });
  assert(
    (await call(admin, "notifications")).data.some((n) => n.caseId === r.id),
  );
  await act(repair, "send-quality", t);
  await act(quality, "finish", { decision: "approved", date: "2026-09-19" });
  assert.equal(r.status, "finalizado");
  assert(
    (
      await call(admin, "reset-user-password", {
        id: quality.id,
        password: "Reset-" + pass,
      })
    ).ok,
  );
  const resetLogin = await request(
    "/auth/v1/token?grant_type=password",
    { email: quality.email, password: "Reset-" + pass },
    { apikey: anon, "Content-Type": "application/json" },
  );
  assert(resetLogin.ok);
  quality.token = resetLogin.data.access_token;
  assert((await call(quality, "profile")).data.mustChangePassword);
  assert.equal((await call(quality, "list")).status, 403);
  const archived = {
    ...r,
    id: crypto.randomUUID(),
    intake: { ...r.intake, folio: "QA-IMPORT-" + crypto.randomUUID() },
  };
  assert(
    !(await call(repair, "import-local", { record: archived, evidence: [] }))
      .ok,
  );
  const imported = await call(admin, "import-local", {
    record: archived,
    evidence: [],
  });
  assert(imported.ok, JSON.stringify(imported.data));
  caseIds.push(archived.id);
  assert(
    (await call(admin, "import-local", { record: archived, evidence: [] })).data
      .skipped,
  );
  const bypass = await request(
    "/rest/v1/rematech_cases?select=id",
    undefined,
    { apikey: anon, Authorization: `Bearer ${intake.token}` },
    "GET",
  );
  assert(!bypass.ok, "Client must not bypass server permissions");
  console.log(
    "PASS: four independent accounts, temporary password gate, cross-session registration, role guards, repair, rejection, notifications, completion, direct database denied.",
  );
} finally {
  for (const id of caseIds) {
    await request(
      "/storage/v1/object/rematech-evidence",
      { prefixes: [`${id}/0`, `${id}/1`] },
      adminHeaders,
      "DELETE",
    );
    await request(
      `/rest/v1/rematech_notification_reads?case_id=eq.${id}`,
      undefined,
      adminHeaders,
      "DELETE",
    );
    await request(
      `/rest/v1/rematech_cases?id=eq.${id}`,
      undefined,
      adminHeaders,
      "DELETE",
    );
  }
  for (const id of accounts) {
    await request(
      `/rest/v1/rematech_profiles?id=eq.${id}`,
      undefined,
      adminHeaders,
      "DELETE",
    );
    await request(
      `/auth/v1/admin/users/${id}`,
      undefined,
      adminHeaders,
      "DELETE",
    );
  }
}
