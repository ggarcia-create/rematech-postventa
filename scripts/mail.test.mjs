import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMessage,
  deliverMail,
  MAIL_ACCOUNT,
  ticketSubject,
} from "../supabase/functions/rematech/mail.js";
const input = {
  destination: "cliente@example.com",
  folio: "RT-260920-001",
  pdf: Buffer.from("%PDF-1.4\nprueba").toString("base64"),
  kind: "ticket",
};
const env = {
  GMAIL_ACCOUNT: MAIL_ACCOUNT,
  GMAIL_CLIENT_ID: "test-client",
  GMAIL_CLIENT_SECRET: "test-secret",
  GMAIL_REFRESH_TOKEN: "test-refresh",
};
test("exact subject, fixed sender and intact PDF attachment", () => {
  const m = buildMessage(input),
    raw = Buffer.from(m.raw, "base64url").toString();
  assert.equal(m.subject, "Ticket de seguimiento - RT-260920-001");
  const encoded = raw.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1];
  assert.equal(Buffer.from(encoded, "base64").toString(), m.subject);
  assert(raw.includes("From: Rematech <g.garcia@rematech.mx>"));
  assert(raw.includes(input.pdf));
  assert(raw.includes('filename="Ticket.pdf"'));
  assert.throws(() => ticketSubject("folio\r\nBcc: attacker@example.com"));
  assert.throws(() =>
    buildMessage({
      ...input,
      destination: "a@example.com\r\nBcc: b@example.com",
    }),
  );
  assert.throws(() => buildMessage({ ...input, pdf: "JVBER\r\nmalformed" }));
});
test("uses refresh grant and sends once; no SMTP password or client-selected sender", async () => {
  const calls = [];
  const result = await deliverMail(input, env, async (url, options) => {
    calls.push({ url, options });
    return Response.json(
      calls.length === 1
        ? { access_token: "test-access" }
        : { id: "message-id" },
    );
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.body.get("grant_type"), "refresh_token");
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-access");
  assert.equal(result.messageId, "message-id");
  assert.equal(result.sender, MAIL_ACCOUNT);
});
test("rejects missing configuration, expired grant and uncertain send without retry", async () => {
  await assert.rejects(deliverMail(input, {}), /Falta conectar/);
  await assert.rejects(
    deliverMail(input, { ...env, GMAIL_ACCOUNT: "other@example.com" }),
    /Falta conectar/,
  );
  await assert.rejects(
    deliverMail(input, env, async () => new Response("", { status: 400 })),
    /volver a conectar/,
  );
  let count = 0;
  await assert.rejects(
    deliverMail(input, env, async () => {
      if (++count === 1) return Response.json({ access_token: "test" });
      throw Error("network");
    }),
    /Revisa Enviados/,
  );
  assert.equal(count, 2);
});
