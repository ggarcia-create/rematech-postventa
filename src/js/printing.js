import { invoke, isTauri } from "@tauri-apps/api/core";
export async function printDocument(kind, width) {
  await document.fonts.ready;
  const ticket = document.querySelector(".ticket");
  const height = ticket
    ? Math.ceil((ticket.getBoundingClientRect().height * 25.4) / 96) + 2
    : 300;
  let style = document.getElementById("print-page-size");
  if (!style) {
    style = document.createElement("style");
    style.id = "print-page-size";
    document.head.append(style);
  }
  style.textContent = `@media print { @page { size: ${kind === "ticket" ? `${width}mm ${height}mm` : "letter portrait"}; margin:0; } }`;
  document.documentElement.style.setProperty("--ticket-width", `${width}mm`);
  if (isTauri()) await invoke("print_document");
  else window.print();
}
