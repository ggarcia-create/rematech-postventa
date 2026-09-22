import {
  can,
  STATUSES,
  ROLES,
  RESULTS,
  FAULT_LOCATIONS,
  goesToQuality,
  qualityDefaults,
  RETURN_RESOLUTIONS,
} from "./workflow.js";
import { escapeHTML as e, displayDate } from "./utils.js";
import { faultNames } from "./documents.js";
const stamp = (value) =>
  new Date(value).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
function field(
  label,
  key,
  value,
  { multiline = false, disabled = false, full = false } = {},
) {
  return `<label class="${full ? "full" : ""}">${label}${multiline ? `<textarea name="${key}" maxlength="4000" rows="3" ${disabled ? "disabled" : ""}>${e(value)}</textarea>` : `<input name="${key}" type="${key === "date" ? "date" : "text"}" value="${e(value)}" maxlength="200" ${disabled ? "disabled" : ""}>`}</label>`;
}
export function caseDetailHTML(r, user, images) {
  const t = r.technical;
  const editable =
    ["reparacion", "administracion"].includes(r.status) &&
    can(user, "reparacion");
  const qualityEditable = r.status === "calidad" && can(user, "calidad");
  const q = qualityEditable ? qualityDefaults(user.name) : r.quality;
  const returnEditable =
    r.intake?.intakeType === "Devolución" && can(user, "admin");
  const adminIntake = can(user, "admin")
    ? `<section class="case-block admin-only"><h3>ACTUALIZAR DATOS DEL INGRESO</h3><p class="help">Solo visible para Administración. Los demás usuarios verán los datos actualizados automáticamente.</p><form id="admin-intake-form"><div class="technical-form">${field("Número de serie / SN", "serial", r.intake.serial || "")}
  <label>Resolución<select name="resolution"><option value="">Pendiente de resolución</option>${RETURN_RESOLUTIONS.map((v) => `<option ${r.intake.resolution === v || r.returnResolution === v ? "selected" : ""}>${e(v)}</option>`).join("")}</select></label></div><div class="case-actionbar"><button type="button" data-case-action="update-intake" class="primary">Guardar cambios</button></div></form></section>`
    : "";
  const returnSection =
    r.intake?.intakeType === "Devolución"
      ? `<section class="case-block return-status"><h3>SEGUIMIENTO DE DEVOLUCIÓN</h3><p class="help">Actualiza el resultado conforme avance la devolución. El cambio queda registrado en el historial.</p><form id="return-form"><label>Estado actual<select name="resolution" ${returnEditable ? "" : "disabled"}>${RETURN_RESOLUTIONS.map((value) => `<option ${r.returnResolution === value ? "selected" : ""}>${e(value)}</option>`).join("")}</select></label>${returnEditable ? '<div class="case-actionbar"><button type="button" data-case-action="update-return" class="primary">Actualizar estado</button></div>' : ""}</form></section>`
      : "";
  const locations = t.faultLocations || [];
  const tech = `<section class="case-block"><h3>USO EXCLUSIVO DEL ÁREA DE REPARACIÓN</h3>${!editable ? '<p class="readonly-note">Esta etapa está cerrada para edición. El expediente permanece disponible para consulta.</p>' : ""}<form id="technical-form"><div class="technical-form">${field("Diagnóstico técnico", "diagnosis", t.diagnosis, { multiline: true, full: true, disabled: !editable })}<fieldset class="fault-location-fieldset full"><legend>¿Dónde se encontró la falla?</legend><p>Marca los componentes confirmados durante el diagnóstico.</p><div class="fault-location-grid">${FAULT_LOCATIONS.map((value) => `<label class="check-card"><input type="checkbox" name="faultLocations" value="${e(value)}" ${locations.includes(value) ? "checked" : ""} ${editable ? "" : "disabled"}><span>${e(value)}</span></label>`).join("")}</div></fieldset>${field("Detalle de la falla encontrada", "fault", t.fault, { multiline: true, disabled: !editable })}${field("Acciones realizadas / Componentes utilizados", "actions", t.actions, { multiline: true, disabled: !editable })}<label>Resultado<select name="result" ${editable ? "" : "disabled"}><option value="">Selecciona el resultado</option>${RESULTS.map((result) => `<option ${t.result === result ? "selected" : ""}>${result}</option>`).join("")}</select></label>${field("Técnico · cuenta que registra el trabajo", "technician", editable ? user.name : t.technician, { disabled: true })}${field("Fecha", "date", t.date, { disabled: !editable })}<label class="full admin-comment" ${!editable || !t.result || goesToQuality(t.result) ? "hidden" : ""}>Comentario para el administrador<textarea name="adminComment" maxlength="4000" rows="3" placeholder="Explica qué se requiere y qué debe resolver Administración.">${e(t.adminComment)}</textarea></label></div>${editable ? `<p id="result-routing" class="routing-note"></p><div class="case-actionbar"><button type="button" data-case-action="save-technical">Guardar información</button><button type="button" data-case-action="send-quality" class="primary" hidden>Enviar a Calidad →</button><button type="button" data-case-action="notify-admin" class="primary" hidden>Notificar al administrador</button></div>` : ""}</form></section>`;
  const legacyInvalid = r.status === "calidad" && !goesToQuality(t.result);
  const quality =
    r.status === "calidad" || r.status === "finalizado"
      ? `<section class="case-block"><h3>REVISIÓN DE CALIDAD</h3>${legacyInvalid ? '<p class="readonly-note">Este expediente llegó a Calidad con un resultado de una versión anterior que ahora corresponde a Administración. Regresa el equipo a Reparación con observaciones.</p>' : ""}<form id="quality-form"><div class="technical-form">${field("Responsable de Calidad", "reviewer", qualityEditable ? user.name : q.reviewer, { disabled: true })}${field("Fecha de revisión", "date", q.date, { disabled: !qualityEditable })}<fieldset class="quality-decision full"><legend>Resultado de la inspección</legend><label class="check-card"><input type="radio" name="decision" value="approved" ${q.decision === "approved" ? "checked" : ""} ${!qualityEditable || legacyInvalid ? "disabled" : ""}>Inspección de calidad aprobada</label><label class="check-card"><input type="radio" name="decision" value="rejected" ${q.decision === "rejected" ? "checked" : ""} ${qualityEditable ? "" : "disabled"}>Inspección de calidad no aprobada</label></fieldset><label class="quality-observations full" ${q.decision !== "rejected" ? "hidden" : ""}>Observaciones de la inspección no aprobada<textarea name="notes" rows="4" maxlength="4000" ${qualityEditable ? "" : "disabled"} placeholder="Describe lo que Reparación debe corregir antes de una nueva revisión.">${e(q.notes)}</textarea></label></div>${qualityEditable ? '<div class="case-actionbar"><button type="button" data-case-action="finish" class="primary" hidden>✓ Proceso finalizado</button><button type="button" data-case-action="return-repair" class="primary" hidden>Regresar a Reparación</button></div>' : ""}</form></section>`
      : "";
  const comments = `<section class="case-block case-comments-section"><h3>COMENTARIOS DEL EXPEDIENTE · ${r.comments.length}</h3><div class="case-comments">${r.comments.length ? r.comments.map((c) => `<article class="case-comment"><small>${e(c.actor)} · ${ROLES[c.role] || e(c.role)} · ${e(stamp(c.at))}</small><p>${e(c.body)}</p></article>`).join("") : '<p class="help">Todavía no hay comentarios.</p>'}</div>${["admin", "reparacion", "calidad"].includes(user.role) ? '<form id="comment-form"><label>Agregar comentario<textarea name="body" maxlength="4000" rows="3" placeholder="Escribe una respuesta o indicación para este expediente."></textarea></label><p class="help">Al publicarlo se notificará al área de Reparación. Las respuestas de Reparación también avisarán al administrador.</p><div class="case-actionbar"><button type="button" data-case-action="add-comment">Publicar comentario</button></div></form>' : ""}</section>`;
  const reviews = r.qualityReviews.length
    ? `<section class="case-block"><h3>INSPECCIONES DE CALIDAD ANTERIORES</h3>${r.qualityReviews.map((q) => `<article class="quality-review ${q.decision}"><strong>${q.decision === "approved" ? "Inspección aprobada" : "Inspección no aprobada"}</strong><small>${e(q.reviewer)} · ${e(stamp(q.at))}</small>${q.notes ? `<p>${e(q.notes)}</p>` : ""}<details><summary>Diagnóstico revisado</summary><p>${e(q.technical?.diagnosis || "—")}</p><p>${e(q.technical?.actions || "—")}</p><p>Resultado: ${e(q.technical?.result || "—")}</p></details></article>`).join("")}</section>`
    : "";
  return `${adminIntake}${returnSection}<span class="status-badge ${r.status}">${STATUSES[r.status]}</span><div class="case-overview">${[
    ["Cliente", r.intake.client],
    ["Equipo", r.intake.equipment],
    ["Cantidad", r.intake.quantity ?? 1],
    ["Número de serie", r.intake.serial],
    ["Pedido", r.intake.order],
    ["Origen", r.intake.origin],
    ["Tipo de ingreso", r.intake.intakeType || "No especificado"],
    ["Resolución", r.intake.resolution || "Pendiente de resolución"],
    ["Fecha de ingreso", displayDate(r.intake.date)],
  ]
    .map(
      ([label, value]) =>
        `<div><small>${label}</small>${e(value || "—")}</div>`,
    )
    .join(
      "",
    )}</div><div class="case-actionbar"><button data-case-action="pdf">↓ Requisición PDF</button>${r.status === "pendiente" && can(user, "reparacion") ? '<button class="primary" data-case-action="receive">Confirmar recepción del equipo</button>' : ""}</div><section class="case-block"><h3>REPORTE ORIGINAL DEL CLIENTE</h3><p><strong>${e(r.intake.reason)}</strong><br>${e(r.intake.description)}</p></section><section class="case-block"><h3>CLASIFICACIÓN DE INGRESOS PARA DIAGNÓSTICO</h3><div class="case-classification">${r.intake.components
    .map(
      (c) =>
        `<div><strong>${e(c.component)}</strong><ul>${faultNames(c)
          .map((f) => `<li>${e(f)}</li>`)
          .join("")}</ul></div>`,
    )
    .join(
      "",
    )}</div>${images.some(Boolean) ? `<div class="case-evidence">${images.map((url, i) => (url ? `<img src="${url}" alt="Evidencia ${i + 1}">` : "")).join("")}</div>` : ""}</section>${r.status === "pendiente" ? '<p class="readonly-note">Confirma la recepción física para habilitar la información técnica.</p>' : tech}${quality}${reviews}${comments}<section class="case-block"><h3>HISTORIAL DEL EXPEDIENTE</h3><ol class="case-history">${r.history.map((h) => `<li>${e(h.action)}<small>${e(h.actor)} · ${ROLES[h.role] || e(h.role)} · ${e(stamp(h.at))}</small></li>`).join("")}</ol></section>`;
}
export function updateCaseControls(root) {
  const technical = root.querySelector("#technical-form");
  if (technical) {
    const result = technical.elements.result.value;
    const send = technical.querySelector('[data-case-action="send-quality"]');
    const notify = technical.querySelector('[data-case-action="notify-admin"]');
    if (send) send.hidden = !goesToQuality(result);
    if (notify) notify.hidden = !result || goesToQuality(result);
    const comment = technical.querySelector(".admin-comment");
    if (notify) comment.hidden = !result || goesToQuality(result);
    const note = technical.querySelector("#result-routing");
    if (note)
      note.textContent = !result
        ? "Selecciona un resultado para ver el siguiente paso."
        : goesToQuality(result)
          ? "Al enviarlo a Calidad se cerrará la edición de Reparación."
          : "Este resultado se atiende con Administración y no se envía a Calidad.";
  }
  const quality = root.querySelector("#quality-form");
  if (quality) {
    const decision = quality.querySelector('[name="decision"]:checked')?.value;
    quality.querySelector(".quality-observations").hidden =
      decision !== "rejected";
    const finish = quality.querySelector('[data-case-action="finish"]'),
      back = quality.querySelector('[data-case-action="return-repair"]');
    if (finish) finish.hidden = decision !== "approved";
    if (back) back.hidden = decision !== "rejected";
  }
}
