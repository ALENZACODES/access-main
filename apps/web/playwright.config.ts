import { defineConfig, devices } from "@playwright/test";

const port = 4173;
/** Set VITE_BUILD_ID to the build under audit. The default e2e is a test placeholder, not gate evidence. */
const buildId = process.env.VITE_BUILD_ID || "e2e";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["release/**"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [[process.env.CI ? "github" : "list"], ["./e2e/regression-reporter.ts", { repository: "access-main", buildId }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "en-CA",
    trace: "on-first-retry",
  },
  projects: [
    {
      // Day 22 first-result gates need the runner to themselves. Other e2e
      // files running in parallel push the medians over the 1,500 ms gate.
      name: "perf",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "perf.spec.ts",
      fullyParallel: false,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["release/**", "perf.spec.ts"],
      dependencies: ["perf"],
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_BUILD_ID: buildId,
    },
  },
});
