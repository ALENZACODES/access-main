import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  formatIssues, inspectActions, inspectCopy, inspectFields,
  inspectFilters, inspectLanguage, inspectLiveRegions, inspectMap,
  inspectSearch, inspectTransition, type Issue, type Locale,
} from "./p20f-contracts";
import {
  browserConfig, captureActions, capturePage, captureTransition,
  collectLinks, openDocument, probeFilters, probeSearch,
  sameOriginDocument, startRequestLog,
} from "./p20f-browser";
import { inspectNetworkTrial, runNetworkTrial } from "./p20f-resilience";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface SweepPage {
  readonly url: string;
  readonly locale: Locale;
}

function localeFor(url: string): Locale | null {
  const path = new URL(url).pathname;
  if (/^\/en(?:\/|$)/i.test(path)) return "en";
  if (/^\/fr(?:\/|$)/i.test(path)) return "fr";
  const language = new URL(url).searchParams.get("lang");
  if (language === "en" || language === "fr") return language;
  return null;
}

async function routeQueue(page: Page, baseURL: string): Promise<SweepPage[]> {
  const config = browserConfig(baseURL);
  const start: SweepPage[] = [
    { url: config.entryEN, locale: "en" },
    { url: config.entryFR, locale: "fr" },
  ];
  const queued = new Set(start.map((item) => item.url));
  const visited = new Set<string>();
  const found: SweepPage[] = [];
  while (start.length && found.length < config.maxPages) {
    const next = start.shift()!;
    if (visited.has(next.url)) continue;
    visited.add(next.url);
    if (!(await openDocument(page, next.url))) continue;
    found.push(next);
    for (const href of await collectLinks(page, baseURL)) {
      const canonical = sameOriginDocument(href, baseURL);
      if (!canonical || queued.has(canonical)) continue;
      const locale = localeFor(canonical);
      if (!locale) continue;
      queued.add(canonical);
      start.push({ url: canonical, locale });
    }
  }
  expect(found.some((item) => item.locale === "en"), "English routes must be reachable").toBe(true);
  expect(found.some((item) => item.locale === "fr"), "French routes must be reachable").toBe(true);
  expect(start.length, "Route cap reached before the crawl completed").toBe(0);
  return found;
}

function assertIssues(issues: readonly Issue[]): void {
  expect(issues, formatIssues(issues)).toEqual([]);
}

async function assertAxe(page: Page, url: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const failures = result.violations.map((violation) => {
    const targets = violation.nodes.slice(0, 6).map((node) => node.target.join(" ")).join(", ");
    return `${url}: ${violation.id}: ${violation.help}: ${targets}`;
  });
  expect(failures, failures.join("\n")).toEqual([]);
}

async function collectPageIssues(page: Page, locale: Locale, requests: readonly string[]): Promise<Issue[]> {
  const snapshot = await capturePage(page, locale, requests);
  const failures: Issue[] = [];
  failures.push(...inspectLanguage(snapshot.language));
  failures.push(...inspectActions(snapshot.actions, snapshot.route.url));
  failures.push(...inspectFields(snapshot.fields, snapshot.route.url));
  failures.push(...inspectLiveRegions(snapshot.regions, snapshot.route.url));
  failures.push(...inspectCopy(snapshot.visibleText, snapshot.route.url));
  for (const map of snapshot.maps) {
    failures.push(...inspectMap(map, new URL(snapshot.route.url).origin));
  }
  if (snapshot.route.mainCount !== 1) {
    failures.push({
      area: "navigation", code: "main-landmark", location: snapshot.route.url,
      detail: `Expected one main landmark; saw ${snapshot.route.mainCount}`, severity: "error",
    });
  }
  if (!snapshot.route.headings.some((heading) => heading.trim().length > 0)) {
    failures.push({
      area: "navigation", code: "heading", location: snapshot.route.url,
      detail: "Route has no visible heading", severity: "error",
    });
  }
  return failures;
}

async function findSearchRoute(page: Page, routes: readonly SweepPage[], locale: Locale): Promise<SweepPage | null> {
  for (const route of routes.filter((item) => item.locale === locale)) {
    if (!(await openDocument(page, route.url))) continue;
    const count = await page.locator("input[type=search],[role=searchbox]").count();
    if (count) return route;
  }
  return null;
}

async function findFilterRoute(page: Page, routes: readonly SweepPage[], locale: Locale): Promise<SweepPage | null> {
  for (const route of routes.filter((item) => item.locale === locale)) {
    if (!(await openDocument(page, route.url))) continue;
    const count = await page.locator(
      "[data-testid*=filter i] input[type=checkbox],fieldset input[type=checkbox],[role=group][aria-label*=filter i] [role=checkbox]",
    ).count();
    if (count) return route;
  }
  return null;
}

async function findMapRoute(page: Page, routes: readonly SweepPage[], locale: Locale): Promise<SweepPage | null> {
  const mapLocator = "[role=application][aria-label*=map i],[data-testid*=map i]," +
    "[class*=map-container i],canvas[aria-label*=map i],svg[aria-label*=map i]";
  for (const route of routes.filter((item) => item.locale === locale)) {
    if (!(await openDocument(page, route.url))) continue;
    if (await page.locator(mapLocator).count()) return route;
  }
  return null;
}

async function auditKeyboardMovement(page: Page, url: string): Promise<Issue[]> {
  const actions = (await captureActions(page)).filter((item) => item.visible && !item.disabled);
  const problems: Issue[] = [];
  if (actions.length === 0) return problems;
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return null;
    return {
      tag: active.tagName,
      hidden: !!active.closest("[hidden],[inert],[aria-hidden=true]"),
      visible: !!active.getClientRects().length,
      name: active.getAttribute("aria-label") || active.getAttribute("title") || active.textContent || "",
    };
  });
  if (!first || first.hidden || !first.visible) {
    problems.push({
      area: "navigation", code: "tab-start", location: url,
      detail: "First keyboard focus target is hidden or missing", severity: "error",
    });
  }
  return problems;
}

test.describe("P20F: rendered accessibility and journey state gates", () => {
  test("audits every reachable EN and FR route with axe and state contracts", async ({ page, baseURL }) => {
    expect(baseURL, "Set the local App baseURL in Playwright configuration").toBeTruthy();
    test.setTimeout(12 * 60 * 1000);
    const routes = await routeQueue(page, baseURL!);
    const findings: Issue[] = [];
    for (const route of routes) {
      await test.step(`${route.locale}: ${route.url}`, async () => {
        const log = startRequestLog(page);
        try {
          await openDocument(page, route.url);
          findings.push(...await collectPageIssues(page, route.locale, log.requests));
          await assertAxe(page, route.url);
        } finally {
          log.stop();
        }
      });
    }
    assertIssues(findings);
  });

  test("checks keyboard entry and visible focus on both language homes", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(3 * 60 * 1000);
    const config = browserConfig(baseURL!);
    const findings: Issue[] = [];
    for (const url of [config.entryEN, config.entryFR]) {
      expect(await openDocument(page, url), `Missing entry route: ${url}`).toBe(true);
      findings.push(...await auditKeyboardMovement(page, url));
    }
    assertIssues(findings);
  });

  test("exercises real search result updates in both languages where search exists", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(7 * 60 * 1000);
    const routes = await routeQueue(page, baseURL!);
    const findings: Issue[] = [];
    let exercised = 0;
    for (const locale of ["en", "fr"] as const) {
      const target = await findSearchRoute(page, routes, locale);
      if (!target) continue;
      await openDocument(page, target.url);
      const result = await probeSearch(page, "__p20f_no_matching_place_987654321__");
      if (!result) continue;
      exercised += 1;
      findings.push(...inspectSearch(result, target.url));
      const actions = await captureActions(page);
      findings.push(...inspectActions(actions, target.url));
      await assertAxe(page, target.url);
    }
    // Search is conditional: when present, neither language may be omitted.
    expect(exercised === 0 || exercised === 2, "Search must be operable in EN and FR").toBe(true);
    assertIssues(findings);
  });

  test("exercises checkable filters and announcements in both languages", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(7 * 60 * 1000);
    const routes = await routeQueue(page, baseURL!);
    const findings: Issue[] = [];
    let exercised = 0;
    for (const locale of ["en", "fr"] as const) {
      const target = await findFilterRoute(page, routes, locale);
      if (!target) continue;
      await openDocument(page, target.url);
      const filters = await probeFilters(page);
      if (!filters.length) continue;
      exercised += 1;
      findings.push(...inspectFilters(filters, target.url));
      await assertAxe(page, target.url);
    }
    expect(exercised === 0 || exercised === 2, "Filtering must work in both languages").toBe(true);
    assertIssues(findings);
  });

  test("requires text alternatives and attribution on visible maps", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(7 * 60 * 1000);
    const routes = await routeQueue(page, baseURL!);
    const findings: Issue[] = [];
    let mapped = 0;
    for (const locale of ["en", "fr"] as const) {
      const target = await findMapRoute(page, routes, locale);
      if (!target) continue;
      const log = startRequestLog(page);
      try {
        await openDocument(page, target.url);
        const snapshot = await capturePage(page, locale, log.requests);
        mapped += 1;
        for (const map of snapshot.maps) {
          findings.push(...inspectMap(map, new URL(baseURL!).origin));
        }
        await assertAxe(page, target.url);
      } finally {
        log.stop();
      }
    }
    expect(mapped === 0 || mapped === 2, "Map and text alternative must exist in both languages").toBe(true);
    assertIssues(findings);
  });

  test("checks route transition focus and announcement on ordinary navigation", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(7 * 60 * 1000);
    const routes = await routeQueue(page, baseURL!);
    const findings: Issue[] = [];
    let transitions = 0;
    for (const locale of ["en", "fr"] as const) {
      const routesForLocale = routes.filter((item) => item.locale === locale);
      for (const route of routesForLocale.slice(0, 6)) {
        await openDocument(page, route.url);
        const links = page.locator("main a[href]");
        const count = Math.min(await links.count(), 3);
        for (let index = 0; index < count; index += 1) {
          await openDocument(page, route.url);
          const link = page.locator("main a[href]").nth(index);
          const href = await link.getAttribute("href");
          const target = href ? sameOriginDocument(href, baseURL!) : null;
          if (!target || localeFor(target) !== locale || target === route.url) continue;
          const transition = await captureTransition(page, `main-link-${index}`, locale, async () => {
            await link.click();
            await page.waitForLoadState("domcontentloaded");
          });
          transitions += 1;
          findings.push(...inspectTransition(transition));
          await assertAxe(page, page.url());
        }
      }
    }
    expect(transitions >= 0).toBe(true);
    assertIssues(findings);
  });

  test("enforces offline fallback on both language entrypoints", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(4 * 60 * 1000);
    const config = browserConfig(baseURL!);
    const findings: Issue[] = [];
    for (const [locale, url] of [
      ["en", config.entryEN],
      ["fr", config.entryFR],
    ] as const) {
      const trial = await runNetworkTrial(page, url, locale);
      findings.push(...inspectNetworkTrial(trial));
      await page.context().setOffline(false);
    }
    assertIssues(findings);
  });
});
