import { test, expect } from "@playwright/test";
import { setup, login } from "./helpers.js";

test("intake is grouped, customer email persists, and both documents use the logo", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator("#dashboard-summary")).not.toContainText(".map(");
  await expect(page.locator("#intake-form .form-section h2")).toHaveText([
    "01 Datos del pedido y equipo",
    "02 Datos del cliente",
    "03 Falla reportada",
    "04 Clasificación técnica y evidencia MANUAL",
  ]);
  await page.locator("#client-email").fill("cliente@ejemplo.mx");
  await page.locator("#tab-ticket").click();
  await expect(page.locator(".ticket .document-logo")).toBeVisible();
  await expect(page.locator(".ticket")).toContainText("cliente@ejemplo.mx");
  await expect(page.locator(".ticket")).not.toContainText("FIRMA DEL CLIENTE");
  await page.locator("#tab-repair").click();
  await expect(page.locator(".repair .document-logo")).toBeVisible();
  await expect(page.locator("#selected-document")).toHaveText(
    "Requisición de Reparación",
  );
  await page.reload();
  await login(page);
  await expect(page.locator("#client-email")).toHaveValue("cliente@ejemplo.mx");
});

test("manual sales are separated by channel and month in administrator settings", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator("#view-dashboard")).not.toContainText(
    "Ventas manuales",
  );
  await page.locator("#manage-users").click();
  await expect(page.locator("#manual-sales-grid input")).toHaveCount(4);
  await page.locator("#sales-year").fill("2026");
  await page.locator("#sales-month").selectOption("Septiembre");
  await page.locator('[data-sales-channel="Mercado Libre"]').fill("100");
  await page.locator('[data-sales-channel="Shopify"]').fill("25");
  await page.locator("#save-manual-sales").click();
  await expect(page.locator("#sales-status")).toContainText("guardadas");
  await expect(page.locator("#manual-sales-total")).toContainText("125.00");
  await page.locator("#sales-month").selectOption("Octubre");
  await expect(page.locator('[data-sales-channel="Shopify"]')).toHaveValue("");
  await page.locator("#sales-month").selectOption("Septiembre");
  await expect(page.locator('[data-sales-channel="Shopify"]')).toHaveValue(
    "25",
  );
  await page.reload();
  await login(page);
  await page.locator("#manage-users").click();
  await page.locator("#sales-month").selectOption("Septiembre");
  await expect(
    page.locator('[data-sales-channel="Mercado Libre"]'),
  ).toHaveValue("100");
});
