import { expect, test } from "@playwright/test";

function isIgnorableRequestFailure(url) {
  return /google-analytics\.com\/g\/collect|region1\.google-analytics\.com|analytics\.google\.com\/g\/collect/.test(url);
}

test("legacy host redirects into live board", async ({ page }) => {
  await page.goto("https://capital.markets", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/consensusmarket\.com/);
  await expect(page.locator("h2.board-title")).toHaveText("Market scanner");
});

test("board opens a market without console or request failures", async ({ page }) => {
  const consoleErrors = [];
  const requestFailures = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("requestfailed", (req) => {
    if (isIgnorableRequestFailure(req.url())) return;
    requestFailures.push({
      url: req.url(),
      failure: req.failure()?.errorText || "unknown",
    });
  });

  await page.goto("https://consensusmarket.com", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /open market/i }).first().click();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".consensus-card")).toBeVisible();
  await expect(page.locator(".history-card")).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
});
