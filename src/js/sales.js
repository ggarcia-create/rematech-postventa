import { CLOUD_MODE } from "./config.js";
import { cloudCall } from "./cloud.js";

const channels = ["Mercado Libre", "Shopify", "Coppel", "Amazon"];
const months = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const storageKey = "rematech-manual-sales-v2";
const legacyKey = "rematech-manual-sales";
const $ = (selector) => document.querySelector(selector);
let rows = {};
let savedRows = {};

function period() {
  return `${$("#sales-year").value}-${String(months.indexOf($("#sales-month").value) + 1).padStart(2, "0")}`;
}
function values() {
  return Object.fromEntries(
    channels.map((channel) => {
      const value = Number(
        document.querySelector(`[data-sales-channel="${channel}"]`).value || 0,
      );
      return [channel, value];
    }),
  );
}
function showPeriod() {
  const current = rows[period()] || {};
  document.querySelectorAll("[data-sales-channel]").forEach((input) => {
    input.value = current[input.dataset.salesChannel] ?? "";
  });
  renderTotal();
  $("#sales-status").textContent = "";
  $("#save-manual-sales").disabled =
    JSON.stringify(current) === JSON.stringify(savedRows[period()] || {});
}
function renderTotal() {
  const total = Object.values(values()).reduce((sum, value) => sum + value, 0);
  $("#manual-sales-total").textContent =
    `Total: ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(total)}`;
}
async function save(periodKey, channelValues) {
  if (CLOUD_MODE)
    await cloudCall("sales-save", { period: periodKey, values: channelValues });
  else
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ...rows, [periodKey]: channelValues }),
    );
}
export async function openSales() {
  $("#sales-year").value ||= String(new Date().getFullYear());
  $("#sales-month").value = months[new Date().getMonth()];
  rows = CLOUD_MODE
    ? (await cloudCall("sales-get")).rows
    : JSON.parse(localStorage.getItem(storageKey) || "{}");
  // Carry over manual figures saved by older local versions when the shared ledger is empty.
  if (!Object.keys(rows).length) {
    const legacy = JSON.parse(localStorage.getItem(legacyKey) || "{}");
    for (const [month, amounts] of Object.entries(legacy)) {
      const index = months.indexOf(month);
      if (index < 0) continue;
      const key = `${$("#sales-year").value}-${String(index + 1).padStart(2, "0")}`;
      const normalized = Object.fromEntries(
        channels.map((channel) => [channel, Number(amounts[channel]) || 0]),
      );
      await save(key, normalized);
      rows[key] = normalized;
    }
  }
  savedRows = structuredClone(rows);
  showPeriod();
}

$("#sales-month").addEventListener("change", showPeriod);
$("#sales-year").addEventListener("change", showPeriod);
$("#manual-sales-grid").addEventListener("input", () => {
  rows[period()] = values();
  renderTotal();
  $("#sales-status").textContent = "Cambios sin guardar";
  $("#save-manual-sales").disabled = false;
});
$("#save-manual-sales").addEventListener("click", async () => {
  const key = period();
  const current = values();
  if (
    channels.some(
      (channel) =>
        !Number.isFinite(current[channel]) ||
        current[channel] < 0 ||
        current[channel] > 1e12,
    )
  ) {
    $("#sales-status").textContent = "Revisa los importes de los canales.";
    return;
  }
  const button = $("#save-manual-sales");
  button.disabled = true;
  $("#sales-status").textContent = "Guardando…";
  try {
    await save(key, current);
    savedRows[key] = structuredClone(current);
    $("#sales-status").textContent =
      "Ventas guardadas y disponibles en las demás computadoras.";
  } catch (error) {
    button.disabled = false;
    $("#sales-status").textContent = `No se guardaron: ${error.message}`;
  }
});
