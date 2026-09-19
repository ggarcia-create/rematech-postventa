import { escapeHTML as e, displayDate } from "./utils.js";
import { warranty } from "./warranty.js";
import { REQUESTS } from "./catalog.js";
export function faultNames(c) {
  return c.faults.map((f) =>
    ["Otra falla", "Otro periférico"].includes(f) && c.other
      ? `${f}: ${c.other}`
      : f,
  );
}
const row = (label, value) =>
  `<div class="data-row"><span>${label}</span><strong>${e(value || "—")}</strong></div>`;
const metadata = (d) =>
  `<div class="doc-meta"><span>Folio <strong>${e(d.folio)}</strong></span><span>${e(displayDate(d.date))}</span></div>`;
export function documentHTML(d, kind, images) {
  if (kind === "ticket")
    return `<article class="paper ticket ${Number(d.ticketWidth) === 58 ? "narrow" : ""}"><header><div class="doc-brand">REMATECH</div><h3>RECEPCIÓN DE EQUIPO</h3><p>Comprobante de servicio</p></header>${metadata(d)}<h4>DATOS DEL CLIENTE</h4>${row("Cliente", d.client)}${row("Pedido", d.order)}${row("Tipo de ingreso", d.intakeType || "No especificado")}${row("Equipo", d.equipment)}${row("Serie", d.serial)}<h4>FALLA REPORTADA</h4>${row("Motivo", d.reason)}<p class="reported">${e(d.description || "Sin descripción capturada.")}</p><h4>DECLARACIÓN DE GARANTÍA</h4><p class="warranty">${e(warranty(d.client))}</p><div class="signature">FIRMA DEL CLIENTE</div><footer><strong>REMATECH MÉXICO</strong>Conserva este comprobante para cualquier seguimiento.</footer></article>`;
  const cards = d.components
    .filter((c) => c.component)
    .map(
      (c, i) =>
        `<div class="diagnosis-card"><small>COMPONENTE ${i === 0 ? "PRINCIPAL" : "ADICIONAL"}</small><strong>${e(c.component)}</strong><ul>${faultNames(
          c,
        )
          .map((f) => `<li>${e(f)}</li>`)
          .join("")}</ul></div>`,
    )
    .join("");
  const technical = d.technical?.diagnosis
    ? `<div class="exclusive">USO EXCLUSIVO DEL ÁREA DE REPARACIÓN</div>${row("Diagnóstico técnico", d.technical.diagnosis)}${row("Falla encontrada", d.technical.fault)}${row("Acciones / Componentes", d.technical.actions)}${row("Resultado", d.technical.result)}${row("Técnico", d.technical.technician)}${row("Fecha", displayDate(d.technical.date))}${row("Ubicación de la falla", (d.technical.faultLocations || []).join(", "))}${d.quality?.decision || d.quality?.approved ? `<div class="exclusive">${d.quality.decision === "approved" || d.quality.approved ? "PROCESO FINALIZADO" : "INSPECCIÓN NO APROBADA"} · CALIDAD</div>${row("Responsable", d.quality.reviewer)}${row("Fecha", displayDate(d.quality.date))}${row("Observaciones", d.quality.notes)}` : ""}`
    : null;
  const result = `<article class="paper repair"><header><div class="doc-brand">REMATECH</div><p>USO INTERNO · ÁREA DE REPARACIÓN</p></header><h3>REQUISICIÓN DE SERVICIO TÉCNICO</h3>${metadata(d)}<h4><span>01</span> Datos del equipo</h4><div class="doc-grid">${row("Tipo de ingreso", d.intakeType || "No especificado")}${row("Equipo", d.equipment)}${row("Serie", d.serial)}${row("Pedido", d.order)}${row("Origen", d.origin)}</div><h4><span>02</span> Clasificación para diagnóstico</h4>${cards || '<p class="empty-note">Pendiente de clasificación manual.</p>'}<h4><span>03</span> Reporte original del cliente</h4>${row("Motivo", d.reason)}<p class="reported">${e(d.description || "Sin descripción capturada.")}</p><h4><span>04</span> Solicitud al área técnica</h4><div class="check-list">${REQUESTS.map((r) => `<span>${d.requests.includes(r) ? "☑" : "☐"} ${r}</span>`).join("")}</div>${technical || `<div class="exclusive">USO EXCLUSIVO DEL ÁREA DE REPARACIÓN</div>${["Diagnóstico técnico", "Falla encontrada", "Acciones realizadas / Componentes utilizados"].map((t) => `<div class="write-line">${t}</div>`).join("")}<h4>Resultado</h4><div class="check-list">${["Reparado", "No procede garantía", "Cambio de equipo", "Sin falla detectada", "Se requiere pieza", "Requiere pruebas"].map((r) => `<span>☐ ${r}</span>`).join("")}</div><div class="doc-grid"><div class="write-line">Técnico</div><div class="write-line">Fecha</div></div>`}</article>`;
  return (
    result +
    (images.some(Boolean)
      ? `<article class="paper repair evidence-paper"><header><div class="doc-brand">REMATECH</div><p>ANEXO DE REQUISICIÓN TÉCNICA</p></header><h3>EVIDENCIAS DEL CLIENTE</h3>${metadata(d)}${row("Tipo de ingreso", d.intakeType || "No especificado")}${row("Equipo", d.equipment)}${images.map((url, i) => (url ? `<figure><figcaption>Evidencia ${i + 1}</figcaption><img src="${url}" alt="Evidencia del cliente ${i + 1}"></figure>` : "")).join("")}</article>`
      : "")
  );
}
