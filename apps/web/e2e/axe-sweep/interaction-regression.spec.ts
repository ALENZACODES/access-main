import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  auditKeyboard,
  collectLanguageSwitches,
  collectPageSnapshot,
  languageSwitchIssues,
} from "./browser-audits";
import {
  CrawlQueue,
  compactIssues,
  normalizeCrawlLinks,
  routeRecordIssues,
  seedRoutes,
  targetIssues,
  type Issue,
  type RouteRecord,
} from "./sweep-contracts";

const MAX_PAGES = 80;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * These Playwright specs are discovered by the existing e2e runner.
 * Read-only scans cover actual linked pages, not invented route names.
 */
async function visit(page: Page, url: string): Promise<boolean> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (response === null) return false;
  if (response.status() === 404) return false;
  expect(response.ok(), `${url}: unexpected HTTP ${response.status()}`).toBe(true);
  await page.locator("body").waitFor();
  return true;
}

function configuredLocales(): { en?: string; fr?: string } {
  return {
    ...(process.env.AXE_SWEEP_EN_URL ? { en: process.env.AXE_SWEEP_EN_URL } : {}),
    ...(process.env.AXE_SWEEP_FR_URL ? { fr: process.env.AXE_SWEEP_FR_URL } : {}),
  };
}

function diagnostic(rule: string, location: string, detail: string): Issue {
  return { code: rule, location, detail };
}

test.describe("P20C: route-wide EN/FR interaction audit", () => {
  test("inspects landmarks, page language, 44px targets and axe issues", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL, "Configure use.baseURL for the local web app").toBeTruthy();
    const origin = new URL(baseURL!).origin;
    const queue = new CrawlQueue(MAX_PAGES);
    queue.add(seedRoutes(baseURL!, configuredLocales()));
    const records: RouteRecord[] = [];
    const issues: Issue[] = [];
    const reachable = new Set<string>();
    const failedRoutes = new Set<string>();
    test.setTimeout(12 * 60 * 1000);

    let url: string | null;
    while ((url = queue.next()) !== null) {
      const current = url;
      await test.step(`Inspect ${current}`, async () => {
        if (!(await visit(page, current))) {
          queue.markUnavailable(current);
          return;
        }
        reachable.add(current);
        const snapshot = await collectPageSnapshot(page, origin);
        issues.push(...snapshot.issues);
        if (snapshot.record) records.push(snapshot.record);
        issues.push(...targetIssues(snapshot.targets, current));
        const switches = await collectLanguageSwitches(page);
        issues.push(...languageSwitchIssues(switches, origin, current));
        queue.add(normalizeCrawlLinks(snapshot.links, current, origin));

        const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        for (const violation of axe.violations) {
          failedRoutes.add(current);
          issues.push(diagnostic(
            `axe-${violation.id}`,
            current,
            `${violation.impact ?? "unknown"}: ${violation.nodes.slice(0, 3)
              .map((node) => node.target.join(" ")).join(", ")}`,
          ));
        }
      });
    }

    const result = queue.summary();
    expect(result.exceeded,
      `Route cap ${MAX_PAGES} reached; coverage must not truncate silently`,
    ).toBe(false);
    expect(reachable.size, "No reachable app documents were inspected").toBeGreaterThan(0);
    issues.push(...routeRecordIssues(records));
    expect(issues, compactIssues(issues)).toEqual([]);
    expect(failedRoutes.size).toBe(0);
  });

  test("keyboard focus remains visible on both localized entry points", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();
    const entries = seedRoutes(baseURL!, configuredLocales());
    const visitedLocales = new Set<string>();
    const issues: Issue[] = [];
    test.setTimeout(3 * 60 * 1000);

    for (const entry of entries) {
      if (!(await visit(page, entry))) continue;
      const lang = await page.locator("html").getAttribute("lang");
      const locale = lang?.trim().toLowerCase().split("-")[0];
      if (locale !== "en" && locale !== "fr") continue;
      if (visitedLocales.has(locale)) continue;
      visitedLocales.add(locale);
      const result = await auditKeyboard(page);
      if (result.steps.length === 0) {
        issues.push(diagnostic("no-keyboard-targets", entry,
          "Tab did not reach a focusable element"));
      }
      issues.push(...result.issues);
    }
    expect(visitedLocales.has("en"), "An English entry page is required").toBe(true);
    expect(visitedLocales.has("fr"), "A French entry page is required").toBe(true);
    expect(issues, compactIssues(issues)).toEqual([]);
  });

  test("320px reflow and zoom retain document semantics", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    const entries = seedRoutes(baseURL!, configuredLocales());
    const problems: Issue[] = [];
    const seen = new Set<string>();
    test.setTimeout(3 * 60 * 1000);

    for (const entry of entries) {
      await page.setViewportSize({ width: 320, height: 720 });
      if (!(await visit(page, entry))) continue;
      const snapshot = await collectPageSnapshot(page, new URL(baseURL!).origin);
      if (!snapshot.record || seen.has(snapshot.record.locale)) continue;
      seen.add(snapshot.record.locale);
      problems.push(...snapshot.issues);
      // A narrow viewport must not cause the application to remove its
      // page title or all first-level headings.
      if (snapshot.record.headingCount === 0) {
        problems.push(diagnostic("mobile-heading", entry, "No visible h1 at 320px"));
      }
      if (snapshot.record.mainCount !== 1) {
        problems.push(diagnostic("mobile-main", entry,
          `Expected one main landmark, got ${snapshot.record.mainCount}`));
      }
    }
    expect(seen.has("en")).toBe(true);
    expect(seen.has("fr")).toBe(true);
    expect(problems, compactIssues(problems)).toEqual([]);
  });
});
