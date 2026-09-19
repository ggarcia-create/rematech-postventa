import { expect } from "@playwright/test";
export const ADMIN = {
  email: "admin@rematech.test",
  password: "Rematech-Test-2026",
};
export async function login(
  page,
  email = ADMIN.email,
  password = ADMIN.password,
) {
  await expect(page.locator("#login-submit")).toBeVisible();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator("#login-submit").click();
  await expect(page.locator("#application")).toBeVisible();
}
export async function setup(page) {
  await page.goto("/");
  await expect(page.locator("#login-name")).toBeVisible();
  await page.locator("#login-name").fill("Administración de prueba");
  await login(page);
}
export async function fillIntake(page) {
  await page.locator("#client").fill("Cliente de prueba");
  await page.locator("#equipment").fill("Lenovo T480");
  await page.locator("#serial").fill("SN-500-XYZ");
  await page.locator("#order").fill("PED-200-ABC");
  await page.locator("#description").fill("La batería no carga.");
  await page.locator(".component-select").selectOption("Batería / Carga");
  await page.locator(".fault-dropdown summary").click();
  await page.getByLabel("No carga", { exact: true }).check();
}
