import { test, expect } from "@playwright/test";
import { setup, fillIntake, login } from "./helpers.js";

test("registration notice expires and new intakes clear stale repair filters", async ({
  page,
}) => {
  await setup(page);
  await fillIntake(page);
  await page.locator('[data-route="recepciones"]').click();
  await page.locator("#repair-search").fill("OLD-NOT-FOUND");
  await page.locator("#repair-filter").selectOption("finalizado");
  await page.locator('[data-route="ingresos"]').click();
  const first = await page.locator("#folio").inputValue();
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  await expect(page.locator("#notification")).toBeHidden({ timeout: 7000 });
  await page.locator("#generate-folio").click();
  const second = await page.locator("#folio").inputValue();
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText(second);
  await page.locator('[data-route="recepciones"]').click();
  await expect(page.locator("#notification")).toBeHidden();
  await expect(page.locator("#repair-list")).toContainText(first);
  await expect(page.locator("#repair-list")).toContainText(second);
  await expect(page.locator("#repair-search")).toHaveValue("");
  await expect(page.locator("#repair-filter")).toHaveValue("");
  await page.locator("#repair-search").fill("OLD-NOT-FOUND");
  await page.locator("#logout").click();
  await login(page);
  await page.locator('[data-route="recepciones"]').click();
  await expect(page.locator("#repair-list .case-card")).toHaveCount(2);
});

test("open repair tray receives new cases without navigation", async ({
  page,
}) => {
  await setup(page);
  await fillIntake(page);
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  await page.locator('[data-route="recepciones"]').click();
  await page.evaluate(async () => {
    const { cases } = await import("/js/case-storage.js");
    const { auth } = await import("/js/auth.js");
    const r = (await cases.list())[0];
    await cases.register(
      { ...r.intake, folio: "RT-EXTERNAL-NEW" },
      r.evidence,
      auth.user(),
    );
  });
  await expect(page.locator("#repair-list")).toContainText("RT-EXTERNAL-NEW", {
    timeout: 12000,
  });
});
