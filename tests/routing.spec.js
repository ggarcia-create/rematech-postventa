import { test, expect } from "@playwright/test";
import { setup, fillIntake } from "./helpers.js";

test("result routing, immutable reviews, notifications and identity guards", async ({
  page,
}) => {
  await setup(page);
  await fillIntake(page);
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  const out = await page.evaluate(async () => {
    const { cases } = await import("/js/case-storage.js");
    const { auth } = await import("/js/auth.js");
    const { applyAction, normalizeRecord } = await import("/js/workflow.js");
    const admin = auth.user(),
      repair = { id: "repair-test", name: "Técnico real", role: "reparacion" },
      quality = { id: "quality-test", name: "Calidad real", role: "calidad" };
    let r = (await cases.list())[0];
    const act = async (action, payload, user) =>
      (r = await cases.act(r.id, r.revision, action, payload, user));
    await act("receive", {}, repair);
    const t = {
      diagnosis: "Diagnóstico probado",
      fault: "Batería dañada",
      actions: "Prueba y reemplazo",
      faultLocations: ["Batería / Carga"],
      date: "2026-09-17",
      technician: "Nombre falsificado",
      result: "Reparado",
    };
    const blocked = [];
    for (const result of [
      "Cambio de equipo",
      "Se requiere pieza",
      "No procede garantía",
      "Requiere pruebas",
    ]) {
      try {
        await act("send-quality", { ...t, result }, repair);
      } catch (e) {
        blocked.push(e.message);
      }
    }
    const unchanged = (await cases.list())[0].revision === r.revision;
    await act(
      "notify-admin",
      { ...t, result: "Se requiere pieza", adminComment: "Solicito batería" },
      repair,
    );
    const adminNotes = await cases.notifications(admin);
    const rev = r.revision;
    await cases.markNotificationRead(r.id, adminNotes[0].id, admin);
    const read = (await cases.notifications(admin))[0].unread;
    await act("add-comment", { body: "Pieza autorizada" }, admin);
    const repairNotes = await cases.notifications(repair);
    await act("send-quality", t, repair);
    const technician = r.technical.technician;
    let locked = false;
    try {
      await act("save-technical", t, repair);
    } catch {
      locked = true;
    }
    let missingNotes = false;
    try {
      await act(
        "return-repair",
        { decision: "rejected", date: "2026-09-17" },
        quality,
      );
    } catch {
      missingNotes = true;
    }
    await act(
      "return-repair",
      {
        decision: "rejected",
        date: "2026-09-17",
        notes: "No supera prueba de autonomía",
      },
      quality,
    );
    const targets = r.notifications.at(-1).targets;
    await act(
      "send-quality",
      { ...t, diagnosis: "Diagnóstico corregido" },
      repair,
    );
    await act(
      "finish",
      { decision: "approved", date: "2026-09-17", reviewer: "Falso" },
      quality,
    );
    const noFault = applyAction(
      { ...r, status: "reparacion" },
      "send-quality",
      {
        ...t,
        result: "Sin falla detectada",
        faultLocations: ["Sin falla detectada"],
      },
      repair,
    );
    const legacy = normalizeRecord({
      ...r,
      technical: { result: "Pendiente de pieza" },
      quality: { approved: true },
      comments: undefined,
      notifications: undefined,
      qualityReviews: undefined,
    });
    return {
      noFaultStatus: noFault.status,
      blocked,
      unchanged,
      adminCount: adminNotes.length,
      read,
      repairCount: repairNotes.length,
      technician,
      locked,
      missingNotes,
      targets,
      status: r.status,
      reviews: r.qualityReviews,
      comments: r.comments,
      legacy: legacy.technical.result,
      legacyDecision: legacy.quality.decision,
    };
  });
  expect(out.noFaultStatus).toBe("calidad");
  expect(out.blocked).toHaveLength(4);
  expect(out.unchanged).toBe(true);
  expect(out.adminCount).toBe(1);
  expect(out.read).toBe(false);
  expect(out.repairCount).toBe(1);
  expect(out.technician).toBe("Técnico real");
  expect(out.locked).toBe(true);
  expect(out.missingNotes).toBe(true);
  expect(out.targets).toEqual(["reparacion", "admin"]);
  expect(out.status).toBe("finalizado");
  expect(out.reviews).toHaveLength(2);
  expect(out.reviews[0].technical.diagnosis).toBe("Diagnóstico probado");
  expect(out.reviews[1].reviewer).toBe("Calidad real");
  expect(out.comments).toHaveLength(3);
  expect(out.legacy).toBe("Se requiere pieza");
  expect(out.legacyDecision).toBe("approved");
});

test("administrative comments and rejected inspection controls", async ({
  page,
  browserName,
}) => {
  await setup(page);
  await fillIntake(page);
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  await page.locator('[data-route="recepciones"]').click();
  await page.locator("[data-open-case]").first().click();
  await page.locator('[data-case-action="receive"]').click();
  for (const [name, value] of Object.entries({
    diagnosis: "Diagnóstico inicial",
    fault: "Falla batería",
    actions: "Cambio batería",
  }))
    await page.locator(`#technical-form [name="${name}"]`).fill(value);
  await page
    .locator('[name="faultLocations"][value="Batería / Carga"]')
    .check();
  for (const result of [
    "Cambio de equipo",
    "Se requiere pieza",
    "No procede garantía",
    "Requiere pruebas",
  ]) {
    await page.locator('[name="result"]').selectOption(result);
    await expect(
      page.locator('[data-case-action="send-quality"]'),
    ).toBeHidden();
    await expect(
      page.locator('[data-case-action="notify-admin"]'),
    ).toBeVisible();
  }
  await page.locator('[data-case-action="notify-admin"]').click();
  await expect(page.locator("#case-message")).toContainText("comentario");
  await page
    .locator('[name="adminComment"]')
    .fill("Necesitamos pruebas adicionales");
  await page.locator('[data-case-action="notify-admin"]').click();
  await expect(page.locator(".case-comments")).toContainText(
    "Necesitamos pruebas adicionales",
  );
  await page.locator('[name="diagnosis"]').fill("Texto todavía sin guardar");
  await page
    .locator('#comment-form [name="body"]')
    .fill("Respuesta de seguimiento");
  await page.locator('[data-case-action="add-comment"]').click();
  await expect(page.locator(".case-comments")).toContainText(
    "Respuesta de seguimiento",
  );
  await expect(page.locator('[name="diagnosis"]')).toHaveValue(
    "Texto todavía sin guardar",
  );
  await page.locator('[name="result"]').selectOption("Reparado");
  await page
    .locator("#technical-form")
    .screenshot({ path: `/tmp/rematech-repair-${browserName}.png` });
  await page.locator('[data-case-action="send-quality"]').click();
  await page.locator('#quality-form [value="rejected"]').check();
  await expect(page.locator('[data-case-action="finish"]')).toBeHidden();
  await page
    .locator("#quality-form")
    .screenshot({ path: `/tmp/rematech-quality-${browserName}.png` });
  await page.locator('[data-case-action="return-repair"]').click();
  await expect(page.locator("#case-message")).toContainText("observaciones");
  await page.locator('#quality-form [name="notes"]').fill("Revisar autonomía");
  await page.locator('[data-case-action="return-repair"]').click();
  await expect(
    page.locator('#technical-form [name="diagnosis"]'),
  ).toBeEnabled();
  await expect(page.locator(".quality-review")).toContainText(
    "Revisar autonomía",
  );
  await page.locator("#close-case").click();
  await page.locator("#open-notifications").click();
  await expect(page.locator("#notifications-list")).toContainText(
    "no aprobada",
  );
  await page.locator("#notifications-list button").first().click();
  await expect(page.locator("#case-dialog")).toBeVisible();
});
