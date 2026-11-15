import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", retries: 0, workers: 1,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4178" },
  webServer: { command: "npm exec -- vite --config vite.config.ts", url: "http://127.0.0.1:4178", reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
