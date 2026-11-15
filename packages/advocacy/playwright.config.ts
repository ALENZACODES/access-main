import { defineConfig } from "@playwright/test";

const port = 4175;

export default defineConfig({
  testDir: "e2e",
  webServer: {
    command: `npx vite --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
