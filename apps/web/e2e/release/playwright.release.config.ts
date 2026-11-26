// Release gate configuration. Run from apps/web:
//   npm exec -w @access/web -- playwright test -c e2e/release/playwright.release.config.ts
// Environment:
//   ACCESS_MAPS_DIR           access-maps checkout holding data/, pack/, tiles/ (default .cache/access-maps)
//   There is no third-party basemap host (B4). Any off-origin request fails origin.spec.ts.
//   RELEASE_SKIP_SERVER=1     use a server that is already running at RELEASE_ORIGIN
import { defineConfig, devices } from "@playwright/test";
import { BASE, ORIGIN } from "./support";

process.env.RELEASE_E2E = "1";
const port = new URL(ORIGIN).port || "4174";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `${ORIGIN}${BASE}`,
    serviceWorkers: "allow",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.RELEASE_SKIP_SERVER
    ? undefined
    : {
        command:
          // Playwright runs this from the config folder (apps/web/e2e/release); go up to the repository root.
          `cd ../../../.. && npm run build && node scripts/stage-pages.mjs --base ${BASE} && ` +
          `cd apps/web && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
        url: `${ORIGIN}${BASE}`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: { ...(process.env as Record<string, string>), VITE_BASE: BASE, VITE_BUILD_ID: "release" },
      },
});
