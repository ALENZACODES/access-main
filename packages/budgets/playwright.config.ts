import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5177", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -w @access-main/budgets",
    url: "http://127.0.0.1:5177",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
