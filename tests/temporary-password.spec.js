import { test, expect } from "@playwright/test";
import { setup, login, fillIntake } from "./helpers.js";
test("temporary account cannot access app until different password is saved, change persists", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const { auth } = await import("/js/auth.js");
    await auth.create({
      name: "Laura",
      email: "laura@test.mx",
      role: "reparacion",
      password: "Temporal-2026",
      temporary: true,
    });
  });
  await page.locator("#logout").click();
  await page.locator("#login-email").fill("laura@test.mx");
  await page.locator("#login-password").fill("Temporal-2026");
  await page.locator("#login-submit").click();
  await expect(page.locator("#password-change-dialog")).toBeVisible();
  expect(
    await page.evaluate(async () => (await import("/js/auth.js")).auth.user()),
  ).toBeNull();
  await page.keyboard.press("Escape");
  await expect(page.locator("#password-change-dialog")).toBeVisible();
  await page.locator("#new-account-password").fill("Temporal-2026");
  await page.locator("#confirm-account-password").fill("Temporal-2026");
  await page.locator('#password-change-form button[type="submit"]').click();
  await expect(page.locator("#password-change-error")).toContainText(
    "diferente",
  );
  await page.locator("#new-account-password").fill("Personal-2026");
  await page.locator("#confirm-account-password").fill("Distinta-2026");
  await page.locator('#password-change-form button[type="submit"]').click();
  await expect(page.locator("#password-change-error")).toContainText(
    "no coinciden",
  );
  await page.locator("#confirm-account-password").fill("Personal-2026");
  await page.locator('#password-change-form button[type="submit"]').click();
  await expect(page.locator("#application")).toBeVisible();
  await page.locator("#logout").click();
  await page.reload();
  await page.locator("#login-email").fill("laura@test.mx");
  await page.locator("#login-password").fill("Temporal-2026");
  await page.locator("#login-submit").click();
  await expect(page.locator("#login-error")).toContainText("incorrectos");
  await login(page, "laura@test.mx", "Personal-2026");
  await expect(page.locator("#password-change-dialog")).toBeHidden();
  await expect(page.locator("#manage-users")).toBeHidden();
});
test("settings role assignment and registered intake remain after reload", async ({
  page,
}) => {
  await setup(page);
  await fillIntake(page);
  const folio = await page.locator("#folio").inputValue();
  await page.locator("#intake-type").selectOption("Cambio");
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  await expect(page.locator("#client")).toHaveValue("Cliente de prueba");
  await page.reload();
  await login(page);
  await expect(page.locator("#folio")).toHaveValue(folio);
  await expect(page.locator("#intake-type")).toHaveValue("Cambio");
  await expect(page.locator("#client")).toHaveValue("Cliente de prueba");
  await page.evaluate(async () => {
    const { auth } = await import("/js/auth.js");
    await auth.create({
      name: "Laura",
      email: "laura@test.mx",
      role: "reparacion",
      password: "Temporal-2026",
      temporary: true,
    });
  });
  await page.locator("#manage-users").click();
  await page
    .getByLabel("Rol de Laura", { exact: true })
    .selectOption("calidad");
  await expect(page.locator("#user-message")).toContainText("Rol actualizado");
  const role = await page.evaluate(async () => {
    const { auth } = await import("/js/auth.js");
    return (await auth.users()).find((u) => u.name === "Laura").role;
  });
  expect(role).toBe("calidad");
});
