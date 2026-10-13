import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "zh-CN",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "pnpm --filter @isb/web build && pnpm --filter @isb/web exec vite preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/isb-knowledge-bot/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
