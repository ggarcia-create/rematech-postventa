import { setup, login } from "./helpers.js";
import { test, expect } from "@playwright/test";
async function fill(page) {
  await page.locator("#client").fill("María López");
  await page.locator("#equipment").fill("Lenovo ThinkPad T480");
  await page.locator("#serial").fill("SN-12345");
  await page.locator("#order").fill("PED-100");
  await page.locator("#description").fill("No carga y la pantalla parpadea.");
}
async function battery(page) {
  await page
    .locator(".component-select")
    .first()
    .selectOption("Batería / Carga");
  await page.locator(".fault-dropdown summary").first().click();
  await page.getByLabel("No carga", { exact: true }).check();
  await page.getByLabel("Carga intermitente", { exact: true }).check();
  await page.getByLabel("Se descarga rápidamente", { exact: true }).check();
}
test.beforeEach(async ({ page }) => {
  await setup(page);
  await expect(page.locator(".ticket")).toBeVisible();
});
test("manual classification, duplicate prevention, other fault, deletion and autosave", async ({
  page,
}) => {
  await fill(page);
  await expect(page.locator(".component-select")).toHaveValue("");
  await battery(page);
  await expect(page.locator(".fault-dropdown summary")).toHaveText(
    "3 fallas seleccionadas",
  );
  await page.locator("#add-component").click();
  await page
    .locator(".component-select")
    .nth(1)
    .selectOption("Pantalla / Video");
  await expect(
    page
      .locator(".component-select")
      .nth(1)
      .locator("option", { hasText: "Batería / Carga" }),
  ).toHaveAttribute("disabled", "");
  await page.locator(".fault-dropdown summary").nth(1).click();
  await page
    .locator(".component-block")
    .nth(1)
    .getByLabel("Otra falla", { exact: true })
    .check();
  await page.locator(".other-input").nth(1).fill("Tinte verde");
  await page.locator("#tab-repair").click();
  await expect(page.locator(".diagnosis-card")).toHaveCount(2);
  await expect(page.locator(".repair")).toContainText("Tinte verde");
  await page.reload();
  await login(page);
  await expect(page.locator("#client")).toHaveValue("María López");
  await expect(page.locator(".component-select")).toHaveCount(2);
  await page.locator(".remove-component").click();
  await expect(page.locator(".component-select")).toHaveCount(1);
  await page.locator("#description").click();
  await expect(page.locator(".fault-dropdown")).not.toHaveAttribute("open", "");
});
test("ticket widths, escaped input, modal validation and demo sends", async ({
  page,
}) => {
  await page.locator("#send-ticket").click();
  await expect(page.locator("#notification")).toContainText(
    "Completa Nombre del cliente",
  );
  await fill(page);
  await page.locator("#client").fill("<img src=x onerror=alert(1)>");
  await expect(page.locator(".ticket img.document-logo")).toHaveCount(1);
  await page.locator("#client").fill("María López");
  await page.locator("#ticket-width").selectOption("58");
  await expect(page.locator(".ticket")).toHaveClass(/narrow/);
  await page.locator("#send-ticket").click();
  await expect(page.locator("#send-dialog")).toBeVisible();
  await page.locator("#customer-email").fill("invalid");
  await page.locator("#confirm-send").click();
  await expect(page.locator("#confirm-send")).toBeVisible();
  await page.locator("#customer-email").fill("cliente@example.com");
  await page.locator("#confirm-send").click();
  await expect(page.locator("#send-status")).toContainText(
    "Simulación exitosa",
  );
  await page.locator("#cancel-send").click();
  await battery(page);
  await expect(page.locator("#send-repair")).toHaveCount(0);
  await page.locator("#register-intake").click();
  await expect(page.locator("#notification")).toContainText(
    "registrado y enviado a Reparación",
  );
  await page.locator('[data-route="recepciones"]').click();
  await expect(page.locator("#repair-list")).toContainText("María López");
});
test("two compressed images persist, attach only to repair, remove and clear", async ({
  page,
}) => {
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 2000;
    c.height = 1000;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#35f29a";
    ctx.fillRect(0, 0, 2000, 1000);
    return c.toDataURL("image/png").split(",")[1];
  });
  for (let i = 0; i < 2; i++) {
    await page.locator("#image-" + i).setInputFiles({
      name: "evidence.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await expect(page.locator(".evidence-slot img")).toHaveCount(i + 1);
  }
  await expect(page.locator(".ticket img.document-logo")).toHaveCount(1);
  await page.locator("#tab-repair").click();
  await expect(page.locator(".evidence-paper figure img")).toHaveCount(2);
  const size = await page
    .locator(".evidence-paper figure img")
    .first()
    .evaluate((img) => img.naturalWidth);
  expect(size).toBe(1600);
  await page.reload();
  await login(page);
  await expect(page.locator(".evidence-slot img")).toHaveCount(2);
  await page.locator('[data-remove="0"]').click();
  await expect(page.locator(".evidence-slot img")).toHaveCount(1);
  await page.locator("#tab-repair").click();
  await expect(page.locator(".evidence-paper figure img")).toHaveCount(1);
  await page.locator("#clear").click();
  await page.locator("#confirm-clear").click();
  await expect(page.locator(".evidence-slot img")).toHaveCount(0);
  await expect(page.locator(".evidence-paper")).toHaveCount(0);
  await page.reload();
  await login(page);
  await expect(page.locator(".evidence-slot img")).toHaveCount(0);
});
test("PDF dimensions, text separation, evidence pagination and long content", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { generatePDF } = await import("/js/pdf.js");
    const { newDraft } = await import("/js/utils.js");
    const d = {
      ...newDraft(),
      client: "María López",
      equipment: "ThinkPad",
      serial: "123",
      description: "No carga",
      components: [
        {
          component: "Batería / Carga",
          faults: ["No carga", "Carga intermitente"],
          other: "",
        },
      ],
    };
    const text = async (blob) =>
      new TextDecoder("latin1").decode(await blob.arrayBuffer());
    const ticket80 = await text(await generatePDF(d, "ticket"));
    const ticket58 = await text(
      await generatePDF({ ...d, ticketWidth: 58 }, "ticket"),
    );
    const repair = await text(await generatePDF(d, "repair"));
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 300;
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg"));
    const withImages = await text(await generatePDF(d, "repair", [blob, blob]));
    const long = await text(
      await generatePDF(
        {
          ...d,
          description: "Reporte extenso. ".repeat(93),
          components: Array.from({ length: 16 }, (_, i) => ({
            component: `Componente ${i}`,
            faults: ["Falla extensa ".repeat(8)],
            other: "",
          })),
        },
        "repair",
        [blob],
      ),
    );
    return { ticket80, ticket58, repair, withImages, long };
  });
  const pages = (s) => [...s.matchAll(/\/Type \/Page\b/g)].length;
  expect(pages(result.ticket80)).toBe(1);
  expect(result.ticket80).toMatch(/\/MediaBox \[0 0 226\.77/);
  expect(result.ticket58).toMatch(/\/MediaBox \[0 0 164\.40/);
  expect(result.ticket80).not.toContain("Carga intermitente");
  expect(result.ticket80).not.toContain("FIRMA DEL CLIENTE");
  expect(result.ticket80).toContain("/Subtype /Image");
  expect(result.repair).toContain("Carga intermitente");
  expect(result.repair).toContain("/Subtype /Image");
  expect(pages(result.repair)).toBe(1);
  expect(pages(result.withImages)).toBe(2);
  expect(pages(result.long)).toBeGreaterThan(2);
  const download = page.waitForEvent("download");
  await page.locator("#pdf").click();
  expect((await download).suggestedFilename()).toMatch(/^Ticket-RT-.*\.pdf$/);
});
test("no duplicate HTML IDs or JavaScript errors, printable selected document", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fill(page);
  await battery(page);
  await page.locator("#tab-repair").click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".capture")).toBeHidden();
  await expect(page.locator(".repair")).toBeVisible();
  await expect(page.locator(".ticket")).toHaveCount(0);
  const ids = await page
    .locator("[id]")
    .evaluateAll((els) => els.map((e) => e.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(errors).toEqual([]);
});

test("print ticket requests valid physical page dimensions", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    window.print = () => {};
    const { printDocument } = await import("/js/printing.js");
    await printDocument("ticket", 80);
    return document
      .getElementById("print-page-size")
      .sheet.cssRules[0].cssRules[0].style.getPropertyValue("size");
  });
  expect(result).toMatch(/^80mm \d+mm$/);
});
