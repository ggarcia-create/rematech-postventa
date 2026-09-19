import { CLOUD_MODE } from "./config.js";
import { cloudCall } from "./cloud.js";
import { DEMO_MODE, API_BASE_URL, REPAIR_EMAIL } from "./config.js";
import { filename, validEmail } from "./utils.js";
export async function sendDocument(d, kind, blob, correo) {
  if (CLOUD_MODE) {
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = "";
    for(let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
    return cloudCall("email", {kind,destination:correo,folio:d.folio,pdf:btoa(binary)});
  }
  const destination = kind === "repair" ? REPAIR_EMAIL : correo;
  if (!validEmail(destination)) throw new Error("Ingresa un correo válido.");
  const form = new FormData();
  for (const [key, value] of Object.entries({
    correo: destination,
    folio: d.folio,
    cliente: d.client,
    pedido: d.order,
    equipo: d.equipment,
    ...(kind === "repair" ? { serie: d.serial } : {}),
  }))
    form.append(key, value);
  form.append("archivo", blob, filename(kind, d.folio));
  if (DEMO_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return { demo: true };
  }
  const response = await fetch(
    `${API_BASE_URL}/api/${kind === "ticket" ? "enviar-ticket" : "enviar-requisicion"}`,
    { method: "POST", body: form, signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok)
    throw new Error(
      `No se pudo enviar el documento (HTTP ${response.status}). Revisa la conexión o contacta al administrador.`,
    );
  return { demo: false };
}
