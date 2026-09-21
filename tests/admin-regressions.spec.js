import { test, expect } from "@playwright/test";
import { setup, fillIntake, login } from "./helpers.js";

test("permission selections survive saving, a failed request, and reopening", async ({
  page,
}, info) => {
  await setup(page);
  await page.evaluate(async () => {
    const { auth } = await import("/js/auth.js");
    for (const name of ["Uno", "Dos"])
      await auth.create({
        name,
        email: `${name}@rematech.test`,
        password: "Testing-Permissions-2026",
        role: "reparacion",
      });
    const save = auth.setPermissions.bind(auth);
    let fail = true;
    auth.setPermissions = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (fail) {
        fail = false;
        throw new Error("Prueba de conexión");
      }
      return save(...args);
    };
  });
  await page.locator("#manage-users").click();
  const row = page
    .locator(".user-row")
    .filter({ has: page.getByText("Uno", { exact: true }) });
  const other = page
    .locator(".user-row")
    .filter({ has: page.getByText("Dos", { exact: true }) });
  await row.getByLabel("Ingresos", { exact: true }).check();
  await row.getByLabel("Calidad", { exact: true }).check();
  await other.getByLabel("Calidad", { exact: true }).check();
  await row.getByRole("button", { name: "Guardar permisos" }).click();
  await expect(row.locator('[role="status"]')).toContainText(
    "Conservamos tu selección",
  );
  await expect(row.getByLabel("Ingresos", { exact: true })).toBeChecked();
  await expect(row.getByLabel("Calidad", { exact: true })).toBeChecked();
  await row.getByRole("button", { name: "Guardar permisos" }).click();
  await expect(row.locator('[role="status"]')).toContainText(
    "Permisos guardados",
  );
  await expect(other.getByLabel("Calidad", { exact: true })).toBeChecked();
  await other.getByRole("button", { name: "Guardar permisos" }).click();
  await expect(other.locator('[role="status"]')).toContainText(
    "Permisos guardados",
  );
  const box = await row.boundingBox();
  expect(box.height).toBeLessThan(245);
  await page
    .locator("#users-dialog")
    .screenshot({ path: `/tmp/rematech-permissions-${info.project.name}.png` });
  await page.locator("#close-users").click();
  await page.locator("#manage-users").click();
  await expect(row.getByLabel("Ingresos", { exact: true })).toBeChecked();
  await expect(row.getByLabel("Calidad", { exact: true })).toBeChecked();
  await row.getByLabel("Ingresos", { exact: true }).uncheck();
  await row.getByRole("button", { name: "Guardar permisos" }).click();
  await expect(row.locator('[role="status"]')).toContainText(
    "Permisos guardados",
  );
  await page.locator("#close-users").click();
  await page.locator("#logout").click();
  await login(page, "Uno@rematech.test", "Testing-Permissions-2026");
  await expect(page.locator('[data-route="ingresos"]')).toBeDisabled();
  await expect(page.locator('[data-route="calidad"]')).toBeEnabled();
});

test("admin updates a return without an initial serial, other users see saved values", async ({
  page,
}) => {
  await setup(page);
  await fillIntake(page);
  await page.locator("#intake-type").selectOption("Devolución");
  await page.locator("#serial").fill("");
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  await page.evaluate(async () => {
    const { auth } = await import("/js/auth.js");
    await auth.create({
      name: "Técnico",
      email: "tech@rematech.test",
      password: "Testing-Cases-2026",
      role: "reparacion",
    });
  });
  await page.locator('[data-route="recepciones"]').click();
  await page.locator("[data-open-case]").first().click();
  const form = page.locator("#admin-intake-form");
  await form.locator('[name="serial"]').fill("SN-LLEGADA-123");
  await form
    .locator('[name="resolution"]')
    .selectOption("Cerrado a favor de Rematech");
  await form.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator("#case-message")).toContainText("actualizados");
  await expect(page.locator(".case-history")).toContainText(
    "Administrador actualizó",
  );
  await expect(
    page
      .locator(".case-history li")
      .filter({ hasText: "Administrador actualizó" }),
  ).toHaveCount(1);
  await page.locator("#close-case").click();
  await page.locator("#logout").click();
  await login(page, "tech@rematech.test", "Testing-Cases-2026");
  await page.locator("#repair-search").fill("SN-LLEGADA-123");
  await page.locator("[data-open-case]").first().click();
  await expect(page.locator("#admin-intake-form")).toHaveCount(0);
  await expect(page.locator(".case-overview")).toContainText("SN-LLEGADA-123");
  await expect(page.locator('#return-form [name="resolution"]')).toHaveValue(
    "Cerrado a favor de Rematech",
  );
});
