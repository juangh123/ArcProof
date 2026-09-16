import { expect, test } from "@playwright/test";

test("completes the paid quote flow and opens a public receipt", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(page.getByText("ArcProof", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Turn quotation documents",
  );

  await page
    .getByRole("button", { name: "Use sample quotation" })
    .click();
  await expect(page.getByText("0.10 USDC").first()).toBeVisible({
    timeout: 30_000,
  });

  await page
    .getByRole("button", { name: "Verify fixture payment" })
    .click();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText("Aluminum plate, 6 mm, mill finish"),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^AP-[A-F0-9]{8}\.csv$/);

  const receiptLink = page.getByRole("link", { name: "Public receipt" });
  await expect(receiptLink).toBeVisible();

  const [receipt] = await Promise.all([
    page.waitForEvent("popup"),
    receiptLink.click(),
  ]);

  await expect(receipt.getByText("Canonical payment verified")).toBeVisible();
  await expect(receipt.getByText("Native event")).toBeVisible();
  await expect(receipt.getByText("ERC-20 event")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("arcproof-completed.png"),
    fullPage: true,
  });
});

test("rejects a file with a PDF extension but invalid content", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a real pdf"),
  });
  await page.getByRole("button", { name: "Create order" }).click();

  await expect(page.getByText("not a valid PDF document")).toBeVisible();
});

test("health endpoint exposes the configured network and security headers", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  const payload = await response.json();

  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(payload.expectedChainId).toBe(5_042_002);
  expect(payload.paymentMode).toBe("fixture");
  expect(payload.configured).toBe(true);
  expect(payload.writable).toBe(true);
});
