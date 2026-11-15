import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://localhost:4179" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --config vitest.config.ts --port 4179 --strictPort",
    url: "http://localhost:4179",
    reuseExistingServer: !process.env.CI,
  },
});
