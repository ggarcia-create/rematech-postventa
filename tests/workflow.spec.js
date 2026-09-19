import { test, expect } from "@playwright/test";
import { setup, login, ADMIN, fillIntake } from "./helpers.js";

test("login, sidebar, administration and bad password", async ({ page }) => {
  await setup(page);
  await expect(page.locator("[data-route]")).toHaveCount(4);
  await page.locator('[data-route="dashboard"]').click();
  await expect(page.locator("#view-dashboard")).toContainText("próxima etapa");
  await page.locator("#manage-users").click();
  await page.locator('#user-form [name="name"]').fill("Técnico de prueba");
  await page.locator('#user-form [name="email"]').fill("tecnico@rematech.test");
  await page.locator('#user-form [name="role"]').selectOption("reparacion");
  await page.locator('#user-form [name="password"]').fill("Tecnico-Test-2026");
  await page.locator('#user-form button[type="submit"]').click();
  await expect(page.locator("#user-message")).toHaveText(/Usuario creado/);
  await page.locator("#close-users").click();
  await page.locator("#logout").click();
  await page.locator("#login-email").fill(ADMIN.email);
  await page.locator("#login-password").fill("incorrecta");
  await page.locator("#login-submit").click();
  await expect(page.locator("#login-error")).toContainText("incorrectos");
  await expect(page.locator("#application")).toBeHidden();
  await page.locator("#login-email").fill("tecnico@rematech.test");
  await page.locator("#login-password").fill("Tecnico-Test-2026");
  await page.locator("#login-submit").click();
  await expect(page.locator("#application")).toBeHidden();
  await page.locator("#new-account-password").fill("Tecnico-Personal-2026");
  await page.locator("#confirm-account-password").fill("Tecnico-Personal-2026");
  await page.locator('#password-change-form button[type="submit"]').click();
  await expect(page.locator("#application")).toBeVisible();
  await expect(page.locator("#view-recepciones")).toBeVisible();
  await expect(page.locator('[data-route="ingresos"]')).toBeDisabled();
  await expect(page.locator("#manage-users")).toBeHidden();
});

test("intake to repair to quality to completed, search and persistent history", async ({
  page,
}) => {
  await setup(page);
  await fillIntake(page);
  const folio = await page.locator("#folio").inputValue();
  // Independent local identities for the two receiving departments.
  await page.evaluate(async () => {
    const { auth } = await import("/js/auth.js");
    await auth.create({
      name: "Técnico Luis",
      email: "repair@rematech.test",
      password: "Repair-Test-2026",
      role: "reparacion",
    });
    await auth.create({
      name: "Calidad Ana",
      email: "quality@rematech.test",
      password: "Quality-Test-2026",
      role: "calidad",
    });
  });
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText(
    "ya está registrado",
  );
  // Clearing the intake must never delete the registered case.
  await page.locator("#clear").click();
  await page.locator("#confirm-clear").click();
  await page.locator("#logout").click();
  await login(page, "repair@rematech.test", "Repair-Test-2026");
  for (const query of [folio, "ped-200-abc", "sn-500-xyz"]) {
    await page.locator("#repair-search").fill(query);
    await expect(page.locator("#repair-list tbody tr")).toHaveCount(1);
  }
  await page.locator("#repair-search").fill("no-existe");
  await expect(page.locator("#repair-list")).toContainText("Sin coincidencias");
  await page.locator("#repair-search").fill(folio);
  await page.locator("[data-open-case]").first().click();
  await expect(page.locator("#case-title")).toHaveText(folio);
  await expect(page.locator("#technical-form")).toHaveCount(0);
  await page.locator('[data-case-action="receive"]').click();
  await expect(page.locator("#case-message")).toContainText(
    "Recepción registrada",
  );
  await page
    .locator('#technical-form [name="result"]')
    .selectOption("Reparado");
  await page.locator('[data-case-action="send-quality"]').click();
  await expect(page.locator("#case-message")).toContainText("diagnóstico");
  const data = {
    diagnosis: "Prueba de carga: batería sin capacidad.",
    fault: "Batería agotada.",
    actions: "Se reemplaza batería y se ejecutan pruebas de carga.",
    result: "Reparado",
  };
  for (const [name, value] of Object.entries(data)) {
    const field = page.locator(`#technical-form [name="${name}"]`);
    if (name === "result") await field.selectOption(value);
    else await field.fill(value);
  }
  await page
    .locator('[name="faultLocations"][value="Batería / Carga"]')
    .check();
  await expect(page.locator('[name="technician"]')).toBeDisabled();
  await expect(page.locator('[name="technician"]')).toHaveValue("Técnico Luis");
  await page.locator('[data-case-action="save-technical"]').click();
  await expect(page.locator("#case-message")).toContainText(
    "Información técnica guardada",
  );
  await page.locator("#close-case").click();
  await page.reload();
  await login(page, "repair@rematech.test", "Repair-Test-2026");
  await page.locator("[data-open-case]").first().click();
  await expect(page.locator('#technical-form [name="diagnosis"]')).toHaveValue(
    data.diagnosis,
  );
  await page.locator('[data-case-action="send-quality"]').click();
  await expect(page.locator("#case-message")).toContainText(
    "Calidad notificada",
  );
  await expect(
    page.locator('#technical-form [name="diagnosis"]'),
  ).toBeDisabled();
  await expect(page.locator('[data-case-action="finish"]')).toHaveCount(0);
  await page.locator("#close-case").click();
  await page.locator("#logout").click();
  await login(page, "quality@rematech.test", "Quality-Test-2026");
  await expect(page.locator("#quality-list")).toContainText(folio);
  await page.locator("#quality-list [data-open-case]").click();
  await expect(page.locator('[data-case-action="finish"]')).toBeHidden();
  await page.locator('#quality-form [value="approved"]').check();
  await page.locator('[data-case-action="finish"]').click();
  await expect(page.locator("#case-message")).toContainText(
    "Proceso finalizado",
  );
  await expect(page.locator("#case-dialog .status-badge")).toHaveText(
    "Proceso finalizado",
  );
  await expect(page.locator(".case-history")).toContainText("Técnico Luis");
  await expect(page.locator(".case-history")).toContainText("Calidad Ana");
  await expect(page.locator('[data-case-action="finish"]')).toHaveCount(0);
  const pdfText = await page.evaluate(async () => {
    const { cases } = await import("/js/case-storage.js");
    const { generatePDF } = await import("/js/pdf.js");
    const r = (await cases.list())[0];
    return new TextDecoder("latin1").decode(
      await (
        await generatePDF(
          { ...r.intake, technical: r.technical, quality: r.quality },
          "repair",
          r.evidence,
        )
      ).arrayBuffer(),
    );
  });
  expect(pdfText).toContain("PROCESO FINALIZADO");
  expect(pdfText).toContain("Luis");
  expect(pdfText).not.toContain("conformidad");
  await page.locator("#close-case").click();
  await expect(page.locator("#quality-list")).not.toContainText(folio);
  await page.locator("#quality-filter").selectOption("finalizado");
  await expect(page.locator("#quality-list")).toContainText(folio);
});

test("repository blocks wrong roles, duplicate transitions, and stale writes", async ({
  page,
}) => {
  await setup(page);
  await fillIntake(page);
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  const result = await page.evaluate(async () => {
    const { cases } = await import("/js/case-storage.js");
    const { auth } = await import("/js/auth.js");
    const user = auth.user();
    const record = (await cases.list())[0];
    const errors = [];
    for (const [action, role] of [
      ["receive", "ingresos"],
      ["finish", "calidad"],
    ]) {
      try {
        await cases.act(
          record.id,
          record.revision,
          action,
          {},
          { ...user, role },
        );
      } catch (e) {
        errors.push(e.message);
      }
    }
    const next = await cases.act(
      record.id,
      record.revision,
      "receive",
      {},
      user,
    );
    try {
      await cases.act(record.id, record.revision, "receive", {}, user);
    } catch (e) {
      errors.push(e.message);
    }
    try {
      await cases.act(record.id, next.revision, "receive", {}, user);
    } catch (e) {
      errors.push(e.message);
    }
    return errors;
  });
  expect(result).toHaveLength(4);
  expect(result[0]).toContain("permiso");
  expect(result[1]).toContain("Solo Calidad");
  expect(result[2]).toContain("actualizó");
  expect(result[3]).toContain("ya fue recibido");
});

test("recovery keeps the account and cases, rejects wrong codes, accepts the new password", async ({
  page,
}) => {
  // Only the native authorization boundary is mocked in this browser test.
  await page.route("**/js/recovery.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `let used=false; export async function authorizeRecovery(email,code){ if(used||code!=='qa-single-use')throw new Error('Código incorrecto o consumido.');used=true; }`,
    }),
  );
  await setup(page);
  await fillIntake(page);
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  await page.locator("#logout").click();
  await expect(page.locator("#account-guidance")).toContainText(
    "cuentas registradas",
  );
  await page.locator("#open-recovery").click();
  await page.locator("#recovery-email").fill(ADMIN.email);
  await page.locator("#recovery-code").fill("wrong-code");
  await page.locator("#recovery-password").fill("New-Test-Password-2026");
  await page.locator("#recovery-confirmation").fill("Does-Not-Match-2026");
  await page.locator("#submit-recovery").click();
  await expect(page.locator("#recovery-message")).toContainText("no coinciden");
  await page.locator("#recovery-confirmation").fill("New-Test-Password-2026");
  await page.locator("#submit-recovery").click();
  await expect(page.locator("#recovery-message")).toContainText(
    "Código incorrecto",
  );
  await page.locator("#recovery-code").fill("qa-single-use");
  await page.locator("#submit-recovery").click();
  await expect(page.locator("#recovery-dialog")).not.toBeVisible();
  await expect(page.locator("#login-error")).toContainText(
    "Contraseña actualizada",
  );
  await page.locator("#login-password").fill(ADMIN.password);
  await page.locator("#login-submit").click();
  await expect(page.locator("#login-error")).toContainText("incorrectos");
  await login(page, ADMIN.email, "New-Test-Password-2026");
  await expect(page.locator("#manage-users")).toBeVisible();
  await page.locator('[data-route="recepciones"]').click();
  await expect(page.locator("#repair-list tbody tr")).toHaveCount(1);
  await page.locator("#logout").click();
  await page.locator("#open-recovery").click();
  await page.locator("#recovery-email").fill(ADMIN.email);
  await page.locator("#recovery-code").fill("qa-single-use");
  await page.locator("#recovery-password").fill("Other-Password-2026");
  await page.locator("#recovery-confirmation").fill("Other-Password-2026");
  await page.locator("#submit-recovery").click();
  await expect(page.locator("#recovery-message")).toContainText("consumido");
});
