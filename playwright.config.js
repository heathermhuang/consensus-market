import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./qa-evidence/tests",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? "github" : "line",
  timeout: 30_000,

  projects: [
    {
      name: "live",
      testMatch: /live-.*\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "local",
      testMatch: /local-.*\.spec\.js/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
      },
    },
  ],
});
