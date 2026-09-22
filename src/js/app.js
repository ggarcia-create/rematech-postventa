import { auth } from "./auth.js";
import { notify } from "./notice.js";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "../styles/styles.css";
import { initializeWorkspace } from "./workspace.js";
import "../styles/brand.css";
import "../styles/intake.css";
import { CATALOG, REQUESTS } from "./catalog.js";
import { storage } from "./storage.js";
import {
  newDraft,
  generateFolio,
  escapeHTML as e,
  validate,
  validEmail,
  filename,
  intakeTotal,
} from "./utils.js";
import { compressImage } from "./evidence.js";
import { documentHTML } from "./documents.js";
import { generatePDF, savePDF } from "./pdf.js";
import { sendDocument } from "./email.js";
import { printDocument } from "./printing.js";
import { CLOUD_MODE, DEMO_MODE, REPAIR_EMAIL } from "./config.js";
const $ = (selector) => document.querySelector(selector);
let draft = newDraft(),
  kind = "ticket",
  evidence = [null, null],
  imageURLs = [null, null],
  sending = false,
  pendingKind = "ticket",
  snapshot = null,
  pendingImages = null;
const evidenceBusy = new Set();
function persist() {
  try {
    storage.saveDraft(draft);
    $("#save-status").textContent = "Captura guardada";
  } catch {
    $("#save-status").textContent = "No se pudo guardar";
    notify(
      "No se pudo guardar la captura local. Exporta tus documentos antes de cerrar.",
      true,
    );
  }
}
function preview() {
  $("#preview").innerHTML = documentHTML(draft, kind, imageURLs);
  $("#character-count").textContent = `${draft.description.length} / 1500`;
}
function update() {
  persist();
  preview();
}
function fillFields() {
  for (const field of $("#intake-form").querySelectorAll("[name]"))
    if (Object.hasOwn(draft, field.name)) field.value = draft[field.name];
  $("#ticket-width").value = draft.ticketWidth;
  updateResolutionFields();
}
function updateResolutionFields() {
  const partial = draft.resolution === "Cerrado con reembolso parcial";
  const field = $("#partial-refund-field");
  if (field) field.hidden = !partial;
  const total = intakeTotal(draft);
  draft.total = total;
  if ($("#total")) $("#total").value = total;
  $("#total-help").textContent = partial
    ? "Importe del reembolso · MXN"
    : "Cantidad × precio de venta · MXN";
}
function components() {
  const selected = draft.components.map((c) => c.component);
  $("#components").innerHTML = draft.components
    .map(
      (c, i) =>
        `<div class="component-block" data-index="${i}"><div class="component-top"><span>COMPONENTE ${i === 0 ? "PRINCIPAL" : `ADICIONAL ${i}`}</span>${i ? '<button type="button" class="remove-component">Eliminar</button>' : ""}</div><label>Componente<select class="component-select" aria-label="Componente ${i + 1}"><option value="">Selecciona un componente</option>${Object.keys(
          CATALOG,
        )
          .map(
            (name) =>
              `<option ${c.component === name ? "selected" : ""} ${selected.includes(name) && c.component !== name ? "disabled" : ""}>${e(name)}</option>`,
          )
          .join(
            "",
          )}</select></label>${c.component ? `<div class="fault-select"><span>Selecciona las fallas</span><details class="fault-dropdown"><summary>${e(c.faults.length === 1 ? c.faults[0] : c.faults.length ? `${c.faults.length} fallas seleccionadas` : "Selecciona las fallas")}</summary><div class="fault-menu">${CATALOG[c.component].map((f) => `<label><input type="checkbox" value="${e(f)}" ${c.faults.includes(f) ? "checked" : ""}>${e(f)}</label>`).join("")}</div></details></div><label class="other-fault" ${c.faults.some((f) => ["Otra falla", "Otro periférico"].includes(f)) ? "" : "hidden"}>Describe otra falla:<input class="other-input" maxlength="300" value="${e(c.other)}"></label>` : ""}</div>`,
    )
    .join("");
  $("#add-component").disabled =
    draft.components.length >= Object.keys(CATALOG).length;
}
function requests() {
  $("#requests").innerHTML = REQUESTS.map(
    (r) =>
      `<label><input type="checkbox" value="${e(r)}" ${draft.requests.includes(r) ? "checked" : ""}>${r}</label>`,
  ).join("");
}
function renderEvidence() {
  $("#evidence").innerHTML = [0, 1]
    .map(
      (i) =>
        `<div class="evidence-slot"><p>Evidencia ${i + 1}</p>${imageURLs[i] ? `<img src="${imageURLs[i]}" alt="Evidencia ${i + 1}"><div><button type="button" data-change="${i}">Cambiar</button> <button type="button" data-remove="${i}">Eliminar</button></div>` : `<label class="upload-label" for="image-${i}">＋<br>Agregar imagen</label>`}<input type="file" id="image-${i}" data-slot="${i}" accept="image/*" hidden></div>`,
    )
    .join("");
}
function setImage(i, blob) {
  if (imageURLs[i]) URL.revokeObjectURL(imageURLs[i]);
  evidence[i] = blob;
  imageURLs[i] = blob ? URL.createObjectURL(blob) : null;
}

$("#mode-label").textContent = CLOUD_MODE ? "CONECTADO" : "MODO LOCAL";
try {
  draft = storage.loadDraft() || draft;
} catch {
  notify(
    "No se pudo recuperar el borrador. La captura anterior no se sobrescribirá hasta que hagas cambios.",
    true,
  );
}
try {
  const stored = await storage.loadEvidence();
  stored.forEach((blob, i) => setImage(i, blob || null));
} catch {
  notify("No se pudieron recuperar las evidencias locales.", true);
}
fillFields();
components();
requests();
renderEvidence();
preview();
$("#intake-form").addEventListener("input", (event) => {
  const { name, value } = event.target;
  if (name && Object.hasOwn(draft, name)) {
    draft[name] = value;
    if (
      ["resolution", "partialRefundPercent", "salePrice", "quantity"].includes(
        name,
      )
    )
      updateResolutionFields();
    update();
  }
  if (event.target.matches(".other-input")) {
    draft.components[
      Number(event.target.closest("[data-index]").dataset.index)
    ].other = value;
    update();
  }
});
$("#generate-folio").addEventListener("click", () => {
  draft.folio = generateFolio();
  $("#folio").value = draft.folio;
  update();
});
$("#components").addEventListener("change", (event) => {
  const block = event.target.closest("[data-index]");
  if (!block) return;
  const i = Number(block.dataset.index);
  const c = draft.components[i];
  if (event.target.matches(".component-select")) {
    const name = event.target.value;
    if (
      draft.components.some(
        (v, index) => index !== i && v.component === name && name,
      )
    ) {
      notify("Este componente ya está seleccionado.", true);
      components();
      return;
    }
    draft.components[i] = { component: name, faults: [], other: "" };
    components();
  } else if (event.target.matches(".fault-menu input")) {
    c.faults = [...block.querySelectorAll(".fault-menu input:checked")].map(
      (input) => input.value,
    );
    block.querySelector("summary").textContent =
      c.faults.length === 1
        ? c.faults[0]
        : c.faults.length
          ? `${c.faults.length} fallas seleccionadas`
          : "Selecciona las fallas";
    block.querySelector(".other-fault").hidden = !c.faults.some((f) =>
      ["Otra falla", "Otro periférico"].includes(f),
    );
  }
  update();
});
$("#components").addEventListener("click", (event) => {
  if (event.target.matches(".remove-component")) {
    draft.components.splice(
      Number(event.target.closest("[data-index]").dataset.index),
      1,
    );
    components();
    update();
  }
});
$("#add-component").addEventListener("click", () => {
  if (draft.components.some((c) => !c.component)) {
    notify("Selecciona primero el componente del bloque vacío.", true);
    return;
  }
  draft.components.push({ component: "", faults: [], other: "" });
  components();
  update();
});
document.addEventListener("click", (event) =>
  document.querySelectorAll(".fault-dropdown[open]").forEach((details) => {
    if (!details.contains(event.target)) details.open = false;
  }),
);
$("#requests").addEventListener("change", () => {
  draft.requests = [...$("#requests").querySelectorAll(":checked")].map(
    (input) => input.value,
  );
  update();
});
$("#evidence").addEventListener("change", async (event) => {
  if (!event.target.matches("[data-slot]")) return;
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  const i = Number(input.dataset.slot);
  if (evidenceBusy.has(i)) return;
  evidenceBusy.add(i);
  input.disabled = true;
  try {
    const blob = await compressImage(file);
    await storage.saveEvidence(i, blob);
    setImage(i, blob);
    renderEvidence();
    preview();
    notify("Evidencia comprimida y guardada.");
  } catch (error) {
    notify(error.message, true);
  } finally {
    evidenceBusy.delete(i);
    input.disabled = false;
    input.value = "";
  }
});
$("#evidence").addEventListener("click", async (event) => {
  if (event.target.hasAttribute("data-change"))
    $("#image-" + event.target.dataset.change).click();
  if (event.target.hasAttribute("data-remove")) {
    const i = Number(event.target.dataset.remove);
    if (evidenceBusy.has(i)) return;
    try {
      await storage.saveEvidence(i, null);
      setImage(i, null);
      renderEvidence();
      preview();
    } catch {
      notify("No se pudo eliminar la evidencia.", true);
    }
  }
});
function changeDocument(next) {
  kind = next;
  for (const tab of ["ticket", "repair"]) {
    $("#tab-" + tab).classList.toggle("active", tab === kind);
    $("#tab-" + tab).setAttribute("aria-pressed", String(tab === kind));
  }
  $("#size-control").hidden = kind !== "ticket";
  $("#preview-label").textContent =
    kind === "ticket"
      ? "COMPROBANTE DE SERVICIO"
      : "CARTA · REQUISICIÓN INTERNA";
  $("#selected-document").textContent =
    kind === "ticket" ? "Ticket del cliente" : "Requisición de Reparación";
  preview();
}
$("#tab-ticket").addEventListener("click", () => {
  changeDocument("ticket");
  $("#intake-documents").showModal();
});
$("#tab-repair").addEventListener("click", () => {
  changeDocument("repair");
  $("#intake-documents").showModal();
});
$("#close-preview").addEventListener("click", () => {
  if (!sending) $("#intake-documents").close();
});
$("#ticket-width").addEventListener("change", (event) => {
  draft.ticketWidth = Number(event.target.value);
  update();
});
$("#clear").addEventListener("click", () => $("#clear-dialog").showModal());
$("#cancel-clear").addEventListener("click", () => $("#clear-dialog").close());
$("#confirm-clear").addEventListener("click", async () => {
  if (evidenceBusy.size) {
    notify("Espera a que termine de guardarse la imagen.", true);
    return;
  }
  try {
    await storage.clear();
    draft = newDraft();
    [0, 1].forEach((i) => setImage(i, null));
    fillFields();
    components();
    requests();
    renderEvidence();
    update();
    $("#clear-dialog").close();
    notify("Nueva recepción lista.");
  } catch {
    notify("No se pudo limpiar la captura. Intenta de nuevo.", true);
  }
});
$("#pdf").addEventListener("click", async () => {
  const button = $("#pdf");
  button.disabled = true;
  try {
    const d = structuredClone(draft);
    const selected = kind;
    const images = [...evidence];
    const blob = await generatePDF(d, selected, images);
    if (await savePDF(blob, selected, d.folio))
      notify("PDF generado correctamente.");
  } catch (error) {
    notify(`No se pudo guardar el PDF. ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});
$("#print").addEventListener("click", async () => {
  try {
    await printDocument(kind, draft.ticketWidth);
  } catch (error) {
    notify(`No se pudo abrir la impresión. ${error.message}`, true);
  }
});
function openSend(next) {
  if (CLOUD_MODE && !auth.user()?.emailEnabled) {
    notify(
      "Falta autorizar Gmail para enviar desde g.garcia@rematech.mx. Puedes guardar el PDF; Reparación recibe sus avisos dentro de la aplicación.",
      true,
    );
    return;
  }
  if (evidenceBusy.size) {
    notify("Espera a que termine de guardarse la imagen.", true);
    return;
  }
  const errors = validate(draft, next);
  if (errors.length) {
    notify(errors.join("\n"), true);
    return;
  }
  pendingKind = next;
  snapshot = structuredClone(draft);
  pendingImages = [...evidence];
  $("#modal-title").textContent =
    next === "ticket" ? "ENVIAR TICKET" : "ENVIAR REQUISICIÓN";
  $("#modal-content").innerHTML =
    next === "ticket"
      ? `<div class="modal-file">Documento: <strong>${e(filename(next, draft.folio))}</strong><br>De: <strong>g.garcia@rematech.mx</strong><br>Asunto: <strong>${e(`Ticket de seguimiento - ${draft.folio}`)}</strong></div><label>Correo del cliente:<input type="email" id="customer-email" required autocomplete="email" value="${e(draft.clientEmail || "")}" placeholder="cliente@correo.com"></label>`
      : `<div class="modal-file"><strong>${e(draft.folio)}</strong><br>${e(draft.equipment)}</div><p>Destino: <strong>Área de Reparación</strong><br>${e(REPAIR_EMAIL)}</p><p style="margin-top:16px">Se enviará:<br>✓ Requisición de servicio técnico${evidence.map((b, i) => (b ? `<br>✓ Evidencia del cliente ${i + 1}` : "")).join("")}</p>`;
  $("#send-status").textContent = DEMO_MODE
    ? "Modo demo: se simulará el envío; no se mandará ningún correo."
    : "";
  $("#confirm-send").textContent =
    next === "ticket" ? "Enviar ticket" : "Enviar requisición";
  $("#confirm-send").hidden = false;
  $("#cancel-send").textContent = "Cancelar";
  $("#send-dialog").showModal();
}
$("#send-ticket").addEventListener("click", () => openSend("ticket"));
$("#cancel-send").addEventListener("click", () => {
  if (!sending) $("#send-dialog").close();
});
$("#send-dialog").addEventListener("cancel", (event) => {
  if (sending) event.preventDefault();
});
$("#send-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sending) return;
  const correo = $("#customer-email")?.value.trim();
  if (pendingKind === "ticket" && !validEmail(correo)) {
    $("#send-status").textContent = "Ingresa un correo válido.";
    return;
  }
  sending = true;
  $("#confirm-send").disabled = true;
  $("#cancel-send").disabled = true;
  try {
    $("#send-status").textContent =
      pendingKind === "ticket" ? "Generando ticket…" : "Generando requisición…";
    const blob = await generatePDF(snapshot, pendingKind, pendingImages);
    $("#send-status").textContent = "Enviando…";
    const result = await sendDocument(snapshot, pendingKind, blob, correo);
    $("#send-status").textContent = result.demo
      ? "Simulación exitosa. El documento se generó; no se envió correo real."
      : pendingKind === "ticket"
        ? "Ticket enviado correctamente."
        : "Requisición enviada correctamente.";
    $("#confirm-send").hidden = true;
    $("#cancel-send").textContent = "Cerrar";
  } catch (error) {
    $("#send-status").textContent = `Error al enviar. ${error.message}`;
  } finally {
    sending = false;
    $("#confirm-send").disabled = false;
    $("#cancel-send").disabled = false;
  }
});

// Expose the workspace only after restoring the draft and binding its events.
await initializeWorkspace(() => {
  if (evidenceBusy.size)
    throw new Error("Espera a que termine de guardarse la imagen.");
  return { draft: structuredClone(draft), evidence: [...evidence] };
});

// The navigation opens over the workspace, preserving room for the intake.
const sidebar = document.querySelector(".sidebar");
const menuToggle = document.getElementById("sidebar-toggle");
function setMenu(open) {
  sidebar.classList.toggle("expanded", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute(
    "aria-label",
    open ? "Contraer menú" : "Expandir menú",
  );
}
sidebar.addEventListener("mouseenter", () => setMenu(true));
sidebar.addEventListener("mouseleave", () => {
  setMenu(false);
});
sidebar.addEventListener("focusin", () => setMenu(true));
sidebar.addEventListener("focusout", (event) => {
  if (!sidebar.contains(event.relatedTarget)) setMenu(false);
});
menuToggle.addEventListener("click", () =>
  setMenu(!sidebar.classList.contains("expanded")),
);
sidebar.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenu(false);
    menuToggle.focus();
    setMenu(false);
  }
});
sidebar.querySelectorAll("[data-route]").forEach((button) => {
  button.title = button.textContent.trim();
  button.addEventListener("click", () => setMenu(false));
});

import { initializeUpdater } from "./updater.js";
initializeUpdater();
