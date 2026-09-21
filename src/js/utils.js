export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function generateFolio(date = new Date()) {
  return `RT-${localDate(date).slice(2).replaceAll("-", "")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}
export const displayDate = (value) =>
  value ? value.split("-").reverse().join("/") : "—";
export const validEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
export const filename = (kind, folio) =>
  `${kind === "ticket" ? "Ticket" : "Requisicion"}-${folio.replace(/[^a-zA-Z0-9_-]/g, "_") || "sin-folio"}.pdf`;
export function newDraft() {
  return {
    version: 1,
    folio: generateFolio(),
    date: localDate(),
    origin: "Mercado Libre",
    intakeType: "Servicio",
    resolution: "",
    partialRefundPercent: "",
    salePrice: "",
    total: "",
    responsible: "",
    client: "",
    order: "",
    serial: "",
    equipment: "",
    reason: "No funciona",
    description: "",
    components: [{ component: "", faults: [], other: "" }],
    requests: ["Diagnóstico general", "Validación de garantía"],
    ticketWidth: 80,
  };
}
export function validate(draft, kind) {
  const labels = {
    folio: "Folio",
    client: "Nombre del cliente",
    equipment: "Equipo",
    description: "Motivo específico",
    serial: "Número de serie",
  };
  const keys = [
    "folio",
    "client",
    "equipment",
    "description",
    ...(kind === "repair" ? ["serial"] : []),
  ];
  const errors = keys
    .filter((k) => !draft[k]?.trim())
    .map((k) => `Completa ${labels[k]}.`);
  if (
    draft.intakeType !== undefined &&
    !["Servicio", "Cambio", "Devolución"].includes(draft.intakeType)
  )
    errors.push("Selecciona un tipo de ingreso válido.");
  if (draft.intakeType === "Devolución" && draft.resolution === "Cerrado con reembolso parcial") {
    const percent = Number(draft.partialRefundPercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
      errors.push("Indica un porcentaje de reembolso parcial entre 1 y 100.");
  }
  if (draft.salePrice !== "" && Number(draft.salePrice) < 0)
    errors.push("El precio de venta no puede ser negativo.");
  if (draft.description.length > 1500)
    errors.push("El motivo específico admite hasta 1500 caracteres.");
  if (kind === "repair") {
    if (!draft.components[0]?.component)
      errors.push("Selecciona el componente principal.");
    for (const [i, c] of draft.components.entries()) {
      if (!c.component || !c.faults.length)
        errors.push(
          `Selecciona componente y al menos una falla en el bloque ${i + 1}.`,
        );
      if (
        c.faults.some((f) => ["Otra falla", "Otro periférico"].includes(f)) &&
        !c.other.trim()
      )
        errors.push(`Describe la otra falla del bloque ${i + 1}.`);
    }
  }
  return [...new Set(errors)];
}
