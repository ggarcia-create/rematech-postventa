import { validate, localDate } from "./utils.js";
import { CATALOG } from "./catalog.js";
export const ROLES = {
  admin: "Administrador",
  ingresos: "Ingresos",
  reparacion: "Reparación",
  calidad: "Calidad",
};
export const STATUSES = {
  pendiente: "Pendiente de recepción",
  reparacion: "En reparación",
  administracion: "En seguimiento con Administración",
  calidad: "Enviado a Calidad",
  finalizado: "Proceso finalizado",
};
export const RESULTS = [
  "Reparado",
  "Sin falla detectada",
  "Cambio de equipo",
  "Se requiere pieza",
  "No procede garantía",
  "Requiere pruebas",
];
export const FAULT_LOCATIONS = [
  ...Object.keys(CATALOG),
  "Sin falla detectada",
  "Por determinar",
];
export const normalizeResult = (value) =>
  ({
    "Requiere cambio": "Cambio de equipo",
    "Pendiente de pieza": "Se requiere pieza",
  })[value] ||
  value ||
  "";
export const goesToQuality = (result) =>
  ["Reparado", "Sin falla detectada"].includes(normalizeResult(result));
export const can = (user, role) =>
  Boolean(user && (user.role === "admin" || user.role === role));
export const normalize = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase("es-MX");
export const matchesCase = (r, query) =>
  !normalize(query) ||
  ["folio", "order", "serial"].some((key) =>
    normalize(r.intake[key]).includes(normalize(query)),
  );
export function technicalDefaults(name = "") {
  return {
    diagnosis: "",
    fault: "",
    faultLocations: [],
    actions: "",
    result: "",
    technician: name,
    technicianId: "",
    date: localDate(),
    adminComment: "",
  };
}
export function qualityDefaults(name = "") {
  return {
    reviewer: name,
    date: localDate(),
    notes: "",
    decision: "",
    approved: false,
  };
}
export function normalizeRecord(record) {
  const r = structuredClone(record);
  r.technical = {
    ...technicalDefaults(),
    ...r.technical,
    result: normalizeResult(r.technical?.result),
  };
  r.quality = {
    ...qualityDefaults(),
    ...r.quality,
    decision: r.quality?.decision || (r.quality?.approved ? "approved" : ""),
  };
  r.comments ??= [];
  r.notifications ??= [];
  r.qualityReviews ??= [];
  return r;
}
export function requireRole(user, role) {
  if (!can(user, role))
    throw new Error("Tu usuario no tiene permiso para realizar esta acción.");
}
function required(data, labels) {
  for (const [key, label] of Object.entries(labels))
    if (!String(data[key] || "").trim()) throw new Error(`Completa ${label}.`);
}
function audit(user, action, status) {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actorId: user.id,
    actor: user.name,
    role: user.role,
    action,
    status,
  };
}
function notify(r, user, targets, title) {
  r.notifications.push({
    ...audit(user, title, r.status),
    targets,
    readBy: [],
  });
}
function comment(r, user, text, kind = "comment") {
  const body = String(text || "").trim();
  if (!body) throw new Error("Agrega un comentario para continuar.");
  if (body.length > 4000)
    throw new Error("El comentario admite hasta 4000 caracteres.");
  const entry = { ...audit(user, "Comentario agregado", r.status), body, kind };
  r.comments.push(entry);
  return entry;
}
export function createCase(intake, evidence, user) {
  requireRole(user, "ingresos");
  const errors = validate(intake, "repair");
  if (errors.length) throw new Error(errors.join("\n"));
  if (evidence.length > 2) throw new Error("Solo se admiten dos evidencias.");
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    folioKey: normalize(intake.folio),
    intake: structuredClone(intake),
    evidence,
    status: "pendiente",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    technical: technicalDefaults(),
    quality: qualityDefaults(),
    history: [audit(user, "Ingreso registrado", "pendiente")],
    comments: [],
    notifications: [],
    qualityReviews: [],
  };
}
function captureTechnical(payload, user) {
  const t = technicalDefaults(user.name);
  for (const key of ["diagnosis", "fault", "actions", "date", "adminComment"])
    t[key] = String(payload[key] || "").trim();
  t.result = normalizeResult(payload.result);
  t.technicianId = user.id;
  if (!Array.isArray(payload.faultLocations)) t.faultLocations = [];
  else t.faultLocations = [...new Set(payload.faultLocations)];
  if (t.faultLocations.some((value) => !FAULT_LOCATIONS.includes(value)))
    throw new Error("Selecciona una ubicación de falla válida.");
  if (
    t.faultLocations.length > 1 &&
    t.faultLocations.some((value) =>
      ["Sin falla detectada", "Por determinar"].includes(value),
    )
  )
    throw new Error(
      "No combines componentes con «Sin falla detectada» o «Por determinar».",
    );
  if (
    Object.values(t).some(
      (value) => typeof value === "string" && value.length > 4000,
    )
  )
    throw new Error("Los campos técnicos admiten hasta 4000 caracteres.");
  return t;
}
function validateTechnical(t) {
  required(t, {
    diagnosis: "el diagnóstico técnico",
    fault: "el detalle de la falla encontrada",
    actions: "las acciones realizadas / componentes utilizados",
    result: "el resultado",
    date: "la fecha",
  });
  if (!RESULTS.includes(t.result))
    throw new Error("Selecciona un resultado válido.");
  if (!t.faultLocations.length)
    throw new Error(
      "Marca dónde se encontró la falla, «Sin falla detectada» o «Por determinar».",
    );
  if (
    t.result === "Reparado" &&
    t.faultLocations.some((value) =>
      ["Sin falla detectada", "Por determinar"].includes(value),
    )
  )
    throw new Error(
      "Para un equipo reparado, marca el componente donde estaba la falla.",
    );
  if (
    t.result === "Sin falla detectada" &&
    (t.faultLocations.length !== 1 ||
      t.faultLocations[0] !== "Sin falla detectada")
  )
    throw new Error(
      "Para este resultado, marca únicamente «Sin falla detectada».",
    );
  if (
    t.result !== "Sin falla detectada" &&
    t.faultLocations.includes("Sin falla detectada")
  )
    throw new Error("La ubicación de la falla no coincide con el resultado.");
}
export function applyAction(record, action, payload, user) {
  const r = normalizeRecord(record);
  let description;
  if (action === "receive") {
    requireRole(user, "reparacion");
    if (r.status !== "pendiente")
      throw new Error("Este equipo ya fue recibido. Actualiza la consulta.");
    r.status = "reparacion";
    r.technical = technicalDefaults(user.name);
    r.technical.technicianId = user.id;
    description = "Equipo recibido en Reparación";
  } else if (
    ["save-technical", "send-quality", "notify-admin"].includes(action)
  ) {
    requireRole(user, "reparacion");
    if (!["reparacion", "administracion"].includes(r.status))
      throw new Error(
        "La etapa de Reparación está cerrada. Solo puede reabrirla una devolución de Calidad.",
      );
    r.technical = captureTechnical(payload, user);
    if (action === "save-technical") {
      description = "Información técnica guardada";
    } else {
      validateTechnical(r.technical);
      if (action === "send-quality") {
        if (!goesToQuality(r.technical.result))
          throw new Error(
            "Este resultado requiere notificar al administrador; no puede enviarse a Calidad.",
          );
        r.status = "calidad";
        r.quality = qualityDefaults();
        r.technical.adminComment = "";
        description = "Equipo enviado a Calidad · etapa de Reparación cerrada";
        notify(
          r,
          user,
          ["calidad"],
          "Equipo recibido para inspección de Calidad",
        );
      } else {
        if (goesToQuality(r.technical.result))
          throw new Error("Este resultado debe enviarse a Calidad.");
        comment(r, user, r.technical.adminComment, "admin-request");
        r.technical.adminComment = "";
        r.status = "administracion";
        description = `Administrador notificado: ${r.technical.result}`;
        notify(r, user, ["admin"], description);
      }
    }
  } else if (action === "add-comment") {
    if (!user || !["admin", "reparacion", "calidad"].includes(user.role))
      throw new Error("Tu usuario no puede agregar comentarios al expediente.");
    comment(r, user, payload.body);
    description = "Comentario agregado al expediente";
    notify(
      r,
      user,
      user.role === "reparacion" ? ["admin", "reparacion"] : ["reparacion"],
      "Nuevo comentario en el expediente",
    );
  } else if (action === "finish" || action === "return-repair") {
    requireRole(user, "calidad");
    if (r.status !== "calidad")
      throw new Error(
        "Solo Calidad puede revisar un expediente enviado a su área.",
      );
    const q = {
      reviewer: user.name,
      reviewerId: user.id,
      date: String(payload.date || ""),
      notes: String(payload.notes || "").trim(),
      decision: payload.decision,
      approved: payload.decision === "approved",
    };
    required(q, { date: "la fecha de revisión" });
    if (q.notes.length > 4000)
      throw new Error("Las observaciones admiten hasta 4000 caracteres.");
    if (action === "finish") {
      if (q.decision !== "approved")
        throw new Error(
          "Selecciona «Inspección de calidad aprobada» para finalizar.",
        );
      if (!goesToQuality(r.technical.result))
        throw new Error(
          "Este resultado no puede aprobarse en Calidad. Devuelve el equipo a Reparación con observaciones.",
        );
      r.status = "finalizado";
      description = "Inspección de Calidad aprobada · proceso finalizado";
    } else {
      if (q.decision !== "rejected")
        throw new Error(
          "Selecciona «Inspección de calidad no aprobada» para regresar el equipo.",
        );
      required(q, { notes: "las observaciones de la inspección no aprobada" });
      r.status = "reparacion";
      description =
        "Inspección de Calidad no aprobada · equipo devuelto a Reparación";
      comment(r, user, q.notes, "quality-return");
      notify(r, user, ["reparacion", "admin"], description);
    }
    r.quality = q;
    r.qualityReviews.push({
      ...q,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      technical: structuredClone(r.technical),
    });
  } else throw new Error("Acción de expediente no válida.");
  r.revision += 1;
  r.updatedAt = new Date().toISOString();
  r.history.push(audit(user, description, r.status));
  return r;
}
