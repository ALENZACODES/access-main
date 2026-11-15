import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4179" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
