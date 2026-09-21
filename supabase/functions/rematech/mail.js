export const MAIL_ACCOUNT = "g.garcia@rematech.mx";
export function mailConfigured(env) {
  return Boolean(
    env.GMAIL_CLIENT_ID &&
    env.GMAIL_CLIENT_SECRET &&
    env.GMAIL_REFRESH_TOKEN &&
    env.GMAIL_ACCOUNT === MAIL_ACCOUNT,
  );
}
function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function encodedHeader(text) {
  const parts = [];
  let part = "";
  for (const char of text) {
    if (new TextEncoder().encode(part + char).length > 42) {
      parts.push(part);
      part = "";
    }
    part += char;
  }
  if (part) parts.push(part);
  return parts.map((p) => `=?UTF-8?B?${base64(p)}?=`).join("\r\n ");
}
export function ticketSubject(folio) {
  if (
    typeof folio !== "string" ||
    !folio.trim() ||
    folio.length > 120 ||
    /[\r\n]/.test(folio)
  )
    throw new Error("Folio de correo no válido.");
  return `Ticket de seguimiento - ${folio.trim()}`;
}
export function buildMessage({ destination, folio, pdf, kind }) {
  if (
    typeof destination !== "string" ||
    !/^[^\s@<>,;:\r\n"]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(destination)
  )
    throw new Error("Correo de destino no válido.");
  if (
    !["ticket", "repair"].includes(kind) ||
    typeof pdf !== "string" ||
    !pdf.startsWith("JVBER") ||
    pdf.length > 4000000 ||
    pdf.length % 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(pdf)
  )
    throw new Error("Documento PDF no válido.");
  const subject = ticketSubject(folio);
  const boundary = `rematech_${crypto.randomUUID()}`;
  const lines = [
    `From: Rematech <${MAIL_ACCOUNT}>`,
    `To: ${destination}`,
    `Reply-To: ${MAIL_ACCOUNT}`,
    `Subject: ${encodedHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@rematech.mx>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64(
      `Hola,\n\nAdjuntamos el documento de seguimiento del folio ${folio.trim()}.\n\nRematech · Servicio postventa`,
    ),
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${kind === "repair" ? "Requisicion" : "Ticket"}.pdf"`,
    "",
    pdf.match(/.{1,76}/g).join("\r\n"),
    `--${boundary}--`,
    "",
  ];
  return {
    subject,
    raw: base64(lines.join("\r\n"))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  };
}
export async function deliverMail(input, env, request = fetch) {
  if (!mailConfigured(env))
    throw new Error("Falta conectar la cuenta de Gmail de Rematech.");
  const message = buildMessage(input);
  const tokenResponse = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!tokenResponse.ok)
    throw new Error(
      "Google no pudo renovar la autorización. El administrador debe volver a conectar Gmail.",
    );
  const token = await tokenResponse.json();
  if (!token.access_token)
    throw new Error("Google no devolvió una autorización válida.");
  let response;
  try {
    response = await request(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: message.raw }),
        signal: AbortSignal.timeout(30000),
      },
    );
  } catch {
    throw new Error(
      "No se pudo confirmar el envío. Revisa Enviados en Gmail antes de volver a intentarlo.",
    );
  }
  if (!response.ok)
    throw new Error(
      "Gmail no aceptó el correo. Revisa la autorización y los límites de la cuenta.",
    );
  const result = await response.json();
  if (!result.id)
    throw new Error(
      "No se confirmó el envío. Revisa Enviados en Gmail antes de repetirlo.",
    );
  return {
    demo: false,
    messageId: result.id,
    subject: message.subject,
    sender: MAIL_ACCOUNT,
  };
}
