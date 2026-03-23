import fs from "node:fs";
import path from "node:path";
import { devices, expect, test } from "@playwright/test";

const OUT_DIR = "/Users/heatherm/Documents/Codex/PRED/qa-evidence";
const REPORT_PATH = path.join(OUT_DIR, "playwright-findings.json");
fs.mkdirSync(OUT_DIR, { recursive: true });
const findings = [];

function record(entry) {
  findings.push(entry);
}

test.afterAll(async () => {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(findings, null, 2));
});

test("desktop flow", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("requestfailed", (req) => requestFailures.push({ url: req.url(), failure: req.failure()?.errorText || "unknown" }));

  await page.goto("https://capital.markets", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-board.png"), fullPage: true });
  await page.locator("main").screenshot({ path: path.join(OUT_DIR, "desktop-board-main.png") });

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /open market/i }).first().click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-market-overview.png"), fullPage: true });

  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Admin" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-market-admin.png"), fullPage: true });

  record({
    name: "desktop",
    title: await page.title(),
    activeTab: await page.locator('[role="tab"][aria-selected="true"]').textContent(),
    detailsCount: await page.locator("details").count(),
    openDetailsCount: await page.locator("details[open]").count(),
    consoleErrors,
    requestFailures,
  });

  await context.close();
});

test("mobile flow", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("requestfailed", (req) => requestFailures.push({ url: req.url(), failure: req.failure()?.errorText || "unknown" }));

  await page.goto("https://capital.markets", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT_DIR, "mobile-board.png"), fullPage: true });
  await page.getByRole("button", { name: /open market/i }).first().click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT_DIR, "mobile-market-overview.png"), fullPage: true });

  await page.getByRole("tab", { name: "Admin" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, "mobile-market-admin.png"), fullPage: true });

  record({
    name: "mobile",
    title: await page.title(),
    activeTab: await page.locator('[role="tab"][aria-selected="true"]').textContent(),
    detailsCount: await page.locator("details").count(),
    openDetailsCount: await page.locator("details[open]").count(),
    bodyWidth: await page.evaluate(() => document.body.scrollWidth),
    viewportWidth: page.viewportSize().width,
    consoleErrors,
    requestFailures,
  });

  await context.close();
});
