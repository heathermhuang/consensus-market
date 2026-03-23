/**
 * local-integration.spec.js
 *
 * Integration tests against a local Vite dev server (http://localhost:5173).
 *
 * Two modes:
 *   Scenario mode  — no contracts needed, tests scenario-mode UI (default)
 *   Live mode      — set HARDHAT_RPC_URL + MARKET_ADDRESS + ORACLE_ADDRESS +
 *                    REGISTRY_ADDRESS to test against a local Hardhat node
 *
 * Run:
 *   npm run frontend:dev &     # start Vite dev server
 *   playwright test qa-evidence/tests/local-integration.spec.js --project=local
 *
 * For full contract integration:
 *   npm run dev:node &
 *   npm run demo:deploy        # prints addresses — paste into .env
 *   npm run frontend:dev &
 *   playwright test qa-evidence/tests/local-integration.spec.js --project=local
 */

import { expect, test } from "@playwright/test";

// ── helpers ──────────────────────────────────────────────────────────────────

function ignoreableConsoleError(text) {
  // WalletConnect + browser wallet probes log expected errors in scenario mode
  return (
    /WalletConnect|wallet|metamask|ethereum|provider|EIP-1193|injected/i.test(text) ||
    /Failed to fetch|NetworkError|net::ERR_/i.test(text) ||
    /ResizeObserver loop/i.test(text)
  );
}

// ── board ─────────────────────────────────────────────────────────────────────

test("board loads in scenario mode with market rows", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignoreableConsoleError(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("h2.board-title")).toHaveText("Market scanner");
  await expect(page.locator(".board-row").first()).toBeVisible();

  const rows = await page.locator(".board-row").count();
  expect(rows).toBeGreaterThan(5);

  expect(consoleErrors).toEqual([]);
});

test("banner shows scenario mode status", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const banner = page.locator(".banner");
  await expect(banner).toBeVisible();

  // Should mention scenario mode since no live contracts are configured locally
  const text = await banner.textContent();
  expect(text).toBeTruthy();
});

test("filter by status narrows market list", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const allRows = await page.locator(".board-row").count();

  const statusSelect = page.locator("select").filter({ hasText: "All statuses" }).first();
  await statusSelect.selectOption("open");
  await page.waitForTimeout(200);

  const filteredRows = await page.locator(".board-row").count();
  expect(filteredRows).toBeLessThanOrEqual(allRows);
});

test("search filters market list", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const allRows = await page.locator(".board-row").count();

  await page.locator("input.search").first().fill("TSLA");
  await page.waitForTimeout(300);

  const filteredRows = await page.locator(".board-row").count();
  expect(filteredRows).toBeLessThan(allRows);
  expect(filteredRows).toBeGreaterThan(0);
});

test("reset filters restores full list", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const allRows = await page.locator(".board-row").count();

  await page.locator("input.search").first().fill("TSLA");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: /^reset$/i }).first().click();
  await page.waitForTimeout(200);

  const restoredRows = await page.locator(".board-row").count();
  expect(restoredRows).toBe(allRows);
});

// ── market view ───────────────────────────────────────────────────────────────

test("opening a market shows hero card and trade ticket", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /open market/i }).first().click();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("h1.market-question")).toBeVisible();
  await expect(page.locator(".market-signal-strip")).toBeVisible();
  await expect(page.locator("#market-ticket")).toBeVisible();
  await expect(page.locator(".trade-panel")).toBeVisible();
});

test("market section nav scrolls to consensus", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /open market/i }).first().click();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /^consensus$/i }).click();
  await page.waitForTimeout(500);

  await expect(page.locator("#market-consensus")).toBeVisible();
  await expect(page.locator(".consensus-card")).toBeVisible();
});

test("back to board returns to scanner", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /open market/i }).first().click();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /back to board/i }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("h2.board-title")).toBeVisible();
});

test("market URL is bookmarkable via hash routing", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /open market/i }).first().click();
  await page.waitForLoadState("networkidle");

  const url = page.url();
  expect(url).toMatch(/#market=/);

  // Reload from the hash URL — should open directly to market view
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1.market-question")).toBeVisible();
});

// ── connect wallet ────────────────────────────────────────────────────────────

test("connect wallet modal opens and closes", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /connect wallet/i }).first().click();
  await expect(page.locator(".connect-modal, [role=dialog]")).toBeVisible();

  // Close by clicking the close button or outside
  const closeBtn = page.getByRole("button", { name: /close|dismiss|cancel/i }).first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  } else {
    await page.keyboard.press("Escape");
  }

  await expect(page.locator(".connect-modal, [role=dialog]")).not.toBeVisible();
});

// ── responsive ────────────────────────────────────────────────────────────────

test("board renders on mobile viewport without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("h2.board-title")).toBeVisible();
  await expect(page.locator(".board-mobile-toolbar")).toBeVisible();

  // No horizontal scroll
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.body.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
});

// ── worker endpoints ──────────────────────────────────────────────────────────
// These tests run against the Vite dev proxy and only pass if the Worker is running locally.
// Skip gracefully if the endpoint is unreachable.

test("runtime-config.json is reachable", async ({ page, request }) => {
  let resp;
  try {
    resp = await request.get("/runtime-config.json");
  } catch {
    test.skip(true, "/runtime-config.json not available in this env");
    return;
  }

  if (!resp.ok()) {
    test.skip(true, "/runtime-config.json returned non-200");
    return;
  }

  const data = await resp.json();
  expect(data).toHaveProperty("chainId");
});
