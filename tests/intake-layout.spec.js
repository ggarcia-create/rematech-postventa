import { test, expect } from "@playwright/test";
import { setup, login, fillIntake } from "./helpers.js";

test("intake is grouped, customer email persists, and both documents use the logo", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator("#dashboard-summary")).not.toContainText(".map(");
  await expect(page.locator("#intake-form .form-section h2")).toHaveText([
    "Información del pedido y equipo",
    "Falla técnica",
    "Información del cliente",
  ]);
  await page.locator("#client-email").fill("cliente@ejemplo.mx");
  await page.locator("#tab-ticket").click();
  await expect(page.locator(".ticket .document-logo")).toBeVisible();
  await expect(page.locator(".ticket")).toContainText("cliente@ejemplo.mx");
  await expect(page.locator(".ticket")).not.toContainText("FIRMA DEL CLIENTE");
  await page.locator("#close-preview").click();
  await expect(page.locator("#intake-documents")).toBeHidden();
  await page.locator("#tab-repair").click();
  await expect(page.locator(".repair .document-logo")).toBeVisible();
  await expect(page.locator("#selected-document")).toHaveText(
    "Requisición de Reparación",
  );
  await page.reload();
  await login(page);
  await expect(page.locator("#client-email")).toHaveValue("cliente@ejemplo.mx");
});

test("quantity and partial refunds calculate, persist, and register the correct amount", async ({
  page,
}) => {
  await setup(page);
  await fillIntake(page);
  await page.locator("#quantity").fill("2");
  await page.locator("#sale-price").fill("5672.11");
  await expect(page.locator("#total")).toHaveValue("11344.22");
  await expect(page.locator("#partial-refund-field")).toBeHidden();
  await page
    .locator("#resolution")
    .selectOption("Cerrado con reembolso parcial");
  await expect(page.locator("#partial-refund-field")).toBeVisible();
  await expect(page.locator("#total")).toHaveValue("");
  await page.locator("#partial-refund-percent").selectOption("25");
  await expect(page.locator("#total")).toHaveValue("2836.06");
  await page.reload();
  await login(page);
  await expect(page.locator("#quantity")).toHaveValue("2");
  await expect(page.locator("#partial-refund-percent")).toHaveValue("25");
  await expect(page.locator("#total")).toHaveValue("2836.06");
  await page.locator("#resolution").selectOption("Cerrado a favor de Rematech");
  await expect(page.locator("#partial-refund-field")).toBeHidden();
  await expect(page.locator("#total")).toHaveValue("11344.22");
  await page
    .locator("#resolution")
    .selectOption("Cerrado con reembolso parcial");
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText("registrado");
  const saved = await page.evaluate(async () => {
    const { localCases } = await import("/js/case-storage.js");
    return (await localCases.list())[0].intake;
  });
  expect(saved.quantity).toBe(2);
  expect(saved.total).toBe("2836.06");
  await page
    .locator("#intake-form")
    .screenshot({ path: "/tmp/rematech-intake-165.png" });
  await page.setViewportSize({ width: 1024, height: 900 });
  expect(
    await page.evaluate(
      () =>
        document.querySelector(".view-area").scrollWidth <=
        document.querySelector(".view-area").clientWidth,
    ),
  ).toBe(true);
});

test("invalid amounts are rejected and old captures keep quantity one", async ({
  page,
}) => {
  await setup(page);
  const results = await page.evaluate(async () => {
    const { newDraft, intakeTotal, validate } = await import("/js/utils.js");
    const { createCase } = await import("/js/workflow.js");
    const { storage } = await import("/js/storage.js");
    const draft = {
      ...newDraft(),
      client: "Prueba",
      equipment: "Equipo",
      serial: "SER-1",
      description: "Falla",
      salePrice: "100.01",
      quantity: 3,
      components: [
        { component: "Batería / Carga", faults: ["No carga"], other: "" },
      ],
    };
    const record = createCase({ ...draft, total: "999999" }, [], {
      role: "admin",
      id: "test",
      name: "Admin",
    });
    const invalid = validate(
      {
        ...draft,
        quantity: 0,
        resolution: "Cerrado con reembolso parcial",
        partialRefundPercent: "",
        salePrice: "",
      },
      "repair",
    );
    delete draft.quantity;
    storage.saveDraft(draft);
    return {
      serverTotal: record.intake.total,
      legacyTotal: intakeTotal(draft),
      legacyQuantity: storage.loadDraft().quantity,
      invalid,
    };
  });
  expect(results.serverTotal).toBe("300.03");
  expect(results.legacyTotal).toBe("100.01");
  expect(results.legacyQuantity).toBe(1);
  expect(results.invalid.join(" ")).toContain("cantidad entera");
  expect(results.invalid.join(" ")).toContain("precio de venta");
  expect(results.invalid.join(" ")).toContain("porcentaje");
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
