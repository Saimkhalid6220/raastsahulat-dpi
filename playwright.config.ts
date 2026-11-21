import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "e2e.smoke.spec.ts",
  workers: 1,
  timeout: 160000,
  expect: { timeout: 20000 },
  use: {
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
    screenshot: "only-on-failure",
  },
});
