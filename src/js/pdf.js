import { jsPDF } from "jspdf";
import { warranty } from "./warranty.js";
import { displayDate, filename } from "./utils.js";
import { faultNames } from "./documents.js";
import { REQUESTS } from "./catalog.js";
import { blobDataURL } from "./evidence.js";
import { isTauri } from "@tauri-apps/api/core";
import logoURL from "../assets/rematech-logo.png";
// Text-based PDFs remain searchable, sharp, and paginate without cutting lines.
function writer(
  pdf,
  width,
  { margin = 15, bottom = 15, paginate = true } = {},
) {
  let y = margin;
  const ensure = (height) => {
    if (paginate && y + height > pdf.internal.pageSize.getHeight() - bottom) {
      pdf.addPage();
      y = margin;
    }
  };
  const text = (value, size = 9, bold = false, gap = 2) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(String(value || "—"), width - 2 * margin);
    const leading = size * 0.3528 * 1.3;
    for (const line of lines) {
      ensure(leading);
      pdf.text(line, margin, y + leading * 0.8);
      y += leading;
    }
    y += gap;
  };
  const rule = () => {
    ensure(5);
    pdf.setDrawColor(192, 203, 196);
    pdf.line(margin, y, width - margin, y);
    y += 4;
  };
  const heading = (value) => {
    ensure(14);
    y += 3;
    rule();
    text(value, 9, true, 3);
  };
  const check = (label, checked) => {
    ensure(6);
    pdf.setDrawColor(80);
    pdf.rect(margin, y + 0.8, 3, 3);
    if (checked) {
      pdf.line(margin + 0.5, y + 2.1, margin + 1.2, y + 2.9);
      pdf.line(margin + 1.2, y + 2.9, margin + 2.6, y + 1.3);
    }
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(label, margin + 5, y + 3.3);
    y += 6;
  };
  return {
    text,
    rule,
    heading,
    check,
    ensure,
    get y() {
      return y;
    },
    set y(v) {
      y = v;
    },
  };
}
function ticketContent(pdf, d, logo) {
  const w = writer(pdf, Number(d.ticketWidth), { margin: 5, paginate: false });
  const logoSize = Number(d.ticketWidth) === 58 ? 38 : 48;
  pdf.addImage(
    logo,
    "PNG",
    (Number(d.ticketWidth) - logoSize) / 2,
    0,
    logoSize,
    logoSize,
    undefined,
    "FAST",
  );
  w.y = logoSize - 6;
  w.text("RECEPCIÓN DE EQUIPO", 10, true);
  w.text("Comprobante de servicio", 8);
  w.rule();
  w.text(`Folio: ${d.folio}`, 8, true);
  w.text(`Fecha: ${displayDate(d.date)}`, 8);
  w.heading("DATOS DEL CLIENTE");
  for (const [k, v] of [
    ["Cliente", d.client],
    ["Correo", d.clientEmail],
    ["Pedido", d.order],
    ["Tipo de ingreso", d.intakeType || "No especificado"],
    ["Equipo", d.equipment],
    ["Número de serie", d.serial],
  ])
    w.text(`${k}: ${v || "—"}`, 8);
  w.heading("FALLA REPORTADA");
  w.text(`Motivo: ${d.reason}`, 8, true);
  w.text(d.description, 8);
  w.heading("DECLARACIÓN DE GARANTÍA");
  w.text(warranty(d.client), Number(d.ticketWidth) === 58 ? 7.5 : 8);
  w.rule();
  w.text("REMATECH MÉXICO", 9, true);
  w.text("Conserva este comprobante para cualquier seguimiento.", 7);
  return w.y + 5;
}
export async function generatePDF(d, kind, evidence = [null, null]) {
  let pdf;
  const logo = await blobDataURL(await (await fetch(logoURL)).blob());
  if (kind === "ticket") {
    const width = Number(d.ticketWidth);
    const probe = new jsPDF({ unit: "mm", format: [width, 3000] });
    const height = ticketContent(probe, d, logo);
    pdf = new jsPDF({
      unit: "mm",
      format: [width, Math.max(height, width + 1)],
    });
    ticketContent(pdf, d, logo);
  } else {
    pdf = new jsPDF({ unit: "mm", format: "letter" });
    const w = writer(pdf, 215.9);
    pdf.addImage(logo, "PNG", 150, 0, 55, 55, undefined, "FAST");
    w.text("USO INTERNO · ÁREA DE REPARACIÓN", 8);
    w.text("REQUISICIÓN DE SERVICIO TÉCNICO", 14, true);
    w.text(`Folio: ${d.folio}     Fecha: ${displayDate(d.date)}`, 9);
    w.heading("01  DATOS DEL EQUIPO");
    for (const [k, v] of [
      ["Equipo", d.equipment],
      ["Número de serie", d.serial],
      ["Pedido", d.order],
      [
        "Origen",
        `${d.origin || "—"}     Tipo de ingreso: ${d.intakeType || "No especificado"}`,
      ],
    ])
      w.text(`${k}: ${v || "—"}`, 9, false, 1);
    w.heading("02  CLASIFICACIÓN PARA DIAGNÓSTICO");
    d.components
      .filter((c) => c.component)
      .forEach((c, i) => {
        w.ensure(17);
        w.text(`COMPONENTE ${i === 0 ? "PRINCIPAL" : "ADICIONAL"}`, 7, true, 1);
        w.text(c.component, 10, true, 1);
        faultNames(c).forEach((f) => w.text(`• ${f}`, 9, false, 1));
      });
    w.heading("03  REPORTE ORIGINAL DEL CLIENTE");
    w.text(`Motivo de reclamo: ${d.reason}`, 9, true, 1);
    w.text(d.description, 9);
    w.heading("04  SOLICITUD AL ÁREA TÉCNICA");
    for (let i = 0; i < REQUESTS.length; i += 2) {
      const y = w.y;
      w.check(REQUESTS[i], d.requests.includes(REQUESTS[i]));
      pdf.rect(110, y + 0.8, 3, 3);
      if (d.requests.includes(REQUESTS[i + 1])) {
        pdf.line(110.5, y + 2, 111.2, y + 2.8);
        pdf.line(111.2, y + 2.8, 112.6, y + 1.2);
      }
      pdf.text(REQUESTS[i + 1], 115, y + 3.3);
    }
    if (d.technical?.diagnosis) {
      w.heading("USO EXCLUSIVO DEL ÁREA DE REPARACIÓN");
      for (const [label, value] of [
        ["Diagnóstico técnico", d.technical.diagnosis],
        ["Falla encontrada", d.technical.fault],
        ["Acciones realizadas / Componentes utilizados", d.technical.actions],
        ["Resultado", d.technical.result],
        ["Técnico", d.technical.technician],
        ["Fecha", displayDate(d.technical.date)],
        [
          "Ubicación de la falla",
          (d.technical.faultLocations || []).join(", "),
        ],
      ]) {
        w.text(label, 8, true, 1);
        w.text(value, 9);
      }
      const reviews = d.qualityReviews?.length
        ? d.qualityReviews
        : d.quality?.decision || d.quality?.approved
          ? [d.quality]
          : [];
      for (const review of reviews) {
        w.heading(
          review.decision === "approved" || review.approved
            ? "PROCESO FINALIZADO · CALIDAD"
            : "INSPECCIÓN NO APROBADA · CALIDAD",
        );
        w.text(`Responsable: ${review.reviewer}`, 9);
        w.text(`Fecha: ${displayDate(review.date)}`, 9);
        if (review.notes) w.text(review.notes, 9);
      }
      if (d.comments?.length) {
        w.heading("COMENTARIOS DEL EXPEDIENTE");
        for (const entry of d.comments) {
          w.text(
            `${entry.actor} · ${new Date(entry.at).toLocaleDateString("es-MX")}`,
            8,
            true,
          );
          w.text(entry.body, 9);
        }
      }
    } else {
      w.ensure(73);
      w.heading("USO EXCLUSIVO DEL ÁREA DE REPARACIÓN");
      for (const t of [
        "Diagnóstico técnico",
        "Falla encontrada",
        "Acciones realizadas / Componentes utilizados",
      ]) {
        w.text(t, 8);
        w.y += 5;
        w.rule();
      }
      w.text("Resultado:", 8, true, 1);
      // Compact two-column rows reserve room for technician sign-off.
      for (const pair of [
        ["Reparado", "No procede garantía"],
        ["Cambio de equipo", "Sin falla detectada"],
        ["Se requiere pieza", "Requiere pruebas"],
      ]) {
        w.ensure(6);
        const y = w.y;
        w.check(pair[0], false);
        pdf.rect(110, y + 0.8, 3, 3);
        pdf.text(pair[1], 115, y + 3.3);
      }
      w.y += 4;
      w.text("Técnico: __________________   Fecha: __________", 8);
    }
    if (evidence.some(Boolean)) {
      pdf.addPage("letter");
      const a = writer(pdf, 215.9);
      pdf.addImage(logo, "PNG", 150, 0, 55, 55, undefined, "FAST");
      a.text("EVIDENCIAS DEL CLIENTE", 15, true);
      a.text("Anexo de requisición técnica", 9);
      a.text(`Folio: ${d.folio}     Fecha: ${displayDate(d.date)}`, 9);
      a.text(`Equipo: ${d.equipment}`, 9);
      a.rule();
      for (const [index, blob] of evidence.entries()) {
        if (!blob) continue;
        a.text(`Evidencia ${index + 1}`, 9, true);
        const data = await blobDataURL(blob);
        const info = pdf.getImageProperties(data);
        const scale = Math.min(185 / info.width, 82 / info.height);
        const iw = info.width * scale,
          ih = info.height * scale;
        pdf.addImage(
          data,
          "JPEG",
          (215.9 - iw) / 2,
          a.y,
          iw,
          ih,
          undefined,
          "FAST",
        );
        a.y += 87;
      }
    }
  }
  pdf.setProperties({
    title: `${kind === "ticket" ? "Ticket" : "Requisición"} ${d.folio}`,
    author: "Rematech México",
    creator: "Rematech Postventa",
  });
  return pdf.output("blob");
}
export async function savePDF(blob, kind, folio) {
  const name = filename(kind, folio);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: name,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!path) return false;
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
