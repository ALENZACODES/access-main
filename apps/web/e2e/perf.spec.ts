import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser } from "@playwright/test";

/**
 * Day 22 performance record (P11). Measured in CI on every run.
 *
 * Method: Playwright Chromium on the production build served locally, a
 * 390 by 844 phone viewport, and Chrome's CPU slowdown at 4x as a mid-range
 * phone profile. No network throttling: the build is local, so this measures
 * parsing, rendering and the modules, not a mobile network. Three cold runs
 * per measure, each in a new browser context, and the median is reported.
 *
 * - Home LCP: largest-contentful-paint on "/".
 * - Time to first result: from navigation start until the route's status
 *   line reports a result count, for a place search, a journey plan and a
 *   washroom finder query (the three Day 12 / Day 22 core flows). The count
 *   may be 0 where a module has no records in this build; the time is still
 *   the time until the person learns the answer.
 *
 * The record is written to test-results/perf/day22-performance.json. The
 * gates are LCP 1,200 ms and first result 1,500 ms: about twice the CI
 * medians recorded on this branch (LCP 312–352 ms, first results 388–605 ms),
 * so runner noise does not flake but a real regression fails. A CI runner is not a
 * real phone; the record says so.
 */

const RUNS = 3;
const CPU_SLOWDOWN = 4;
const LCP_GATE_MS = 1_200;
const FIRST_RESULT_GATE_MS = 1_500;
const FLOWS = [
  { name: "place search", route: "/places" },
  { name: "journey plan", route: "/journey" },
  { name: "washroom finder", route: "/finders" },
] as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] ?? Number.NaN);
}

async function coldRun(browser: Browser, baseURL: string, route: string): Promise<{ lcp: number | null; firstResult: number | null }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: "en-CA" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  await page.addInitScript(() => {
    const win = window as unknown as { perfLcp?: number; perfFirstResult?: number };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) win.perfLcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    const check = () => {
      if (win.perfFirstResult !== undefined) return;
      for (const status of document.querySelectorAll("main [role='status']")) {
        if (/^\d+ results?$/.test((status.textContent ?? "").trim())) {
          win.perfFirstResult = performance.now();
          return;
        }
      }
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto(route, { waitUntil: "load" });
  if (route !== "/") {
    await page.waitForFunction(() => (window as unknown as { perfFirstResult?: number }).perfFirstResult !== undefined, undefined, { timeout: 15_000 });
  } else {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // LCP is final once the page is interacted with or hidden; a short settle is enough for a static home.
    await page.waitForTimeout(500);
  }
  const values = await page.evaluate(() => {
    const win = window as unknown as { perfLcp?: number; perfFirstResult?: number };
    return { lcp: win.perfLcp ?? null, firstResult: win.perfFirstResult ?? null };
  });
  await context.close();
  return values;
}

test("Day 22: home LCP and core-flow time to first result on a mid-range profile", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const base = baseURL ?? "http://127.0.0.1:4173";

  const lcpRuns: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const { lcp } = await coldRun(browser, base, "/");
    expect(lcp, "LCP was recorded on /").not.toBeNull();
    lcpRuns.push(lcp as number);
  }

  const flows = [];
  for (const flow of FLOWS) {
    const runs: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const { firstResult } = await coldRun(browser, base, flow.route);
      expect(firstResult, `${flow.route} reported a result count`).not.toBeNull();
      runs.push(Math.round(firstResult as number));
    }
    flows.push({ ...flow, runsMs: runs, medianMs: median(runs) });
  }

  const record = {
    schemaVersion: "perf-record-1.0.0",
    ranAt: new Date().toISOString(),
    method: `Playwright Chromium, production build served locally, 390x844 viewport, CPU slowdown ${CPU_SLOWDOWN}x (mid-range phone profile), no network throttling, ${RUNS} cold runs per measure, median reported. A CI runner is not a real phone.`,
    homeLcp: { runsMs: lcpRuns.map(Math.round), medianMs: median(lcpRuns), gateMs: LCP_GATE_MS },
    timeToFirstResult: flows.map((flow) => ({ ...flow, gateMs: FIRST_RESULT_GATE_MS })),
  };
  const dir = resolve(import.meta.dirname, "../test-results/perf");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "day22-performance.json");
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  await testInfo.attach("day22-performance.json", { path: file, contentType: "application/json" });
  console.log(JSON.stringify(record));

  expect(record.homeLcp.medianMs, "Home LCP median").toBeLessThanOrEqual(LCP_GATE_MS);
  for (const flow of record.timeToFirstResult) {
    expect(flow.medianMs, `${flow.name} time to first result median`).toBeLessThanOrEqual(FIRST_RESULT_GATE_MS);
  }
});

test("start-up loads no on-demand chunk; focusing a nav link preloads only that page", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith(".js")) requested.push(url.pathname);
  });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(requested.filter((path) => /\/assets\/(ajv|fflate|maplibre)-/.test(path)), "on-demand chunks at start-up").toEqual([]);
  expect(requested.filter((path) => /\/assets\/DataStatusPage-/.test(path))).toEqual([]);
  expect(requested.filter((path) => /\/assets\/featureScreens-/.test(path)), "settings feature screens at start-up").toEqual([]);

  await page.getByRole("navigation").getByRole("link", { name: "Data status", exact: true }).focus();
  await expect.poll(() => requested.some((path) => /\/assets\/DataStatusPage-/.test(path))).toBe(true);
  await page.getByRole("navigation").getByRole("link", { name: "Settings", exact: true }).focus();
  await expect.poll(() => requested.some((path) => /\/assets\/featureScreens-/.test(path))).toBe(true);
  expect(requested.filter((path) => /\/assets\/maplibre-/.test(path)), "MapLibre is never preloaded").toEqual([]);
});

test("preloading on focus or pointer keeps focus and the current route", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith(".js")) requested.push(new URL(request.url()).pathname); });
  await page.goto("/", { waitUntil: "networkidle" });
  const nav = page.getByRole("navigation");
  for (const [name, chunk] of [["Data status", /\/assets\/DataStatusPage-/], ["Settings", /\/assets\/featureScreens-/]] as const) {
    const link = nav.getByRole("link", { name, exact: true });
    await link.focus();
    await expect.poll(() => requested.some((path) => chunk.test(path))).toBe(true);
    // The preload must not move focus, navigate or announce anything.
    await page.waitForLoadState("networkidle");
    await expect(link).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
  }
  const help = nav.getByRole("link", { name: "Help", exact: true });
  const focused = nav.getByRole("link", { name: "Settings", exact: true });
  await help.hover();
  await page.waitForLoadState("networkidle");
  await expect(focused).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
});
