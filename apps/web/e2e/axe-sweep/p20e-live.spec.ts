/** P20E live e2e entrypoint, discovered by the existing Playwright runner. */
import AxeBuilder from "@axe-core/playwright";
import { collectTextColours, contrastProblems } from "./p20e-contrast";
import { expect, test, type Page } from "@playwright/test";
import {
  collectBrowserSnapshot, collectOfflineState, captureNetwork, routeResponse,
  traceKeyboard, waitForServiceWorker,
} from "./p20e-browser";
import {
  documentProblems, evidenceProblems, focusProblems, formProblems,
  formatProblems, linkProblems, liveProblems, mediaProblems, offlineProblems,
  overlappingTargets, resourceProblems, routeLocale, targetProblems,
  type Locale, type Problem,
} from "./p20e-policy";
import {
  assertJourneyStep, dialogProblems, inspectDialog,
  inspectNavigation, historyProblems,
} from "./p20e-journeys";
import { scanRoutes, scanSettings, startingPoints } from "./p20d-navigation";
import { copyFindings, collectVisibleCopy } from "./p20d-copy";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const MAX_PAGES = 100;
const FOCUS_STEPS = 20;
function assertClean(problems: readonly Problem[]): void {
  expect(problems, formatProblems(problems)).toEqual([]);
}
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
async function entries(page: Page, baseURL: string): Promise<Map<Locale, string>> {
  const result = new Map<Locale, string>();
  for (const candidate of startingPoints(scanSettings(baseURL))) {
    const response = await routeResponse(page, candidate);
    if (response.error || !response.status || response.status >= 400) continue;
    const lang = await page.locator("html").getAttribute("lang");
    const locale = lang?.toLowerCase().startsWith("fr") ? "fr" :
      lang?.toLowerCase().startsWith("en") ? "en" : null;
    if (locale && !result.has(locale)) result.set(locale, response.url);
    if (result.size === 2) break;
  }
  return result;
}
async function requireEntries(page: Page, baseURL: string): Promise<Map<Locale, string>> {
  const result = await entries(page, baseURL);
  expect(result.has("en"), "An English route is required for the e2e audit").toBe(true);
  expect(result.has("fr"), "A French route is required for the e2e audit").toBe(true);
  return result;
}
async function open(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(response?.ok(), `${url} did not return a successful document`).toBe(true);
}
function mappedCopyProblems(
  findings: readonly { rule: string; url: string; detail: string }[], locale: Locale,
): Problem[] {
  return findings.map((item) => ({ rule: `copy-${item.rule}`, page: item.url,
    target: locale, explanation: item.detail, importance: "error" }));
}
test.describe("P20E live route, journey and evidence audit", () => {
  test("checks all reachable documents for DOM structure, targets, forms, media, evidence and text", async ({ page, baseURL }) => {
    expect(baseURL, "Configure the local development origin in Playwright use.baseURL").toBeTruthy();
    test.setTimeout(12 * 60 * 1000);
    const scanned = await scanRoutes(page, scanSettings(baseURL!));
    expect(scanned.pages.length, "The route sweep did not find an HTML page").toBeGreaterThan(0);
    expect(scanned.pages.length, "The route sweep exceeded its intentional cap").toBeLessThanOrEqual(MAX_PAGES);
    const found = new Set<Locale>();
    const problems: Problem[] = [];
    for (const route of scanned.pages) {
      const locale = routeLocale(route.url) ??
        (route.language === "fr" ? "fr" : "en");
      found.add(locale);
      await open(page, route.url);
      const snapshot = await collectBrowserSnapshot(page, locale);
      problems.push(...documentProblems(snapshot.metadata, snapshot.context));
      problems.push(...targetProblems(snapshot.controls, snapshot.context));
      problems.push(...contrastProblems(await collectTextColours(page), snapshot.context));
      problems.push(...overlappingTargets(snapshot.controls, snapshot.context));
      problems.push(...formProblems(snapshot.forms, snapshot.context));
      problems.push(...mediaProblems(snapshot.media, snapshot.context));
      problems.push(...liveProblems(snapshot.regions, snapshot.context));
      problems.push(...linkProblems(snapshot.links, snapshot.context, baseURL!));
      problems.push(...evidenceProblems(snapshot.evidence, snapshot.context, todayUtc()));
      problems.push(...mappedCopyProblems(copyFindings(await collectVisibleCopy(page)), locale));
    }
    expect(found.has("en"), "No English document was inspected").toBe(true);
    expect(found.has("fr"), "No French document was inspected").toBe(true);
    assertClean(problems);
  });

  test("runs axe and 320px reflow on each locale with reduced motion", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(6 * 60 * 1000);
    const locales = await requireEntries(page, baseURL!);
    const problems: Problem[] = [];
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [locale, url] of locales) {
      await open(page, url);
      const snapshot = await collectBrowserSnapshot(page, locale);
      problems.push(...documentProblems(snapshot.metadata, snapshot.context));
      problems.push(...targetProblems(snapshot.controls, snapshot.context));
      const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      for (const violation of axe.violations) {
        for (const node of violation.nodes) {
          problems.push({ rule: `axe-${violation.id}`, page: url,
            target: node.target.join(" "), explanation: violation.help,
            importance: "error" });
        }
      }
    }
    assertClean(problems);
  });

  test("keyboard traversal retains a visible, named, operable focus target", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(5 * 60 * 1000);
    const locales = await requireEntries(page, baseURL!);
    const problems: Problem[] = [];
    for (const [locale, url] of locales) {
      await open(page, url);
      const steps = await traceKeyboard(page, FOCUS_STEPS);
      expect(steps.length, `${locale} has no keyboard-reachable control`).toBeGreaterThan(0);
      problems.push(...focusProblems(steps, { page: url, locale }));
      const modal = await inspectDialog(page);
      problems.push(...dialogProblems(modal, { page: url, locale }));
    }
    assertClean(problems);
  });

  test("navigation to a local linked page retains title, language and main content", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(5 * 60 * 1000);
    const locales = await requireEntries(page, baseURL!);
    const problems: Problem[] = [];
    for (const [locale, entry] of locales) {
      await open(page, entry);
      const snapshot = await collectBrowserSnapshot(page, locale);
      const candidates = snapshot.links.filter((link) => !link.hidden && link.href.startsWith(new URL(baseURL!).origin) &&
        link.href !== entry && /\/(?:en|fr)(?:\/|$)/.test(new URL(link.href).pathname));
      if (candidates.length === 0) continue;
      const target = candidates.find((link) => routeLocale(link.href) === locale);
      if (!target) continue;
      const transition = await inspectNavigation(page, "internal-link", async () => {
        const response = await page.goto(target.href, { waitUntil: "domcontentloaded" });
        expect(response?.ok(), `${target.href} must load`).toBe(true);
      });
      problems.push(...assertJourneyStep(transition, { page: entry, locale }));
      const restored = await page.goBack({ waitUntil: "domcontentloaded" });
      expect(restored?.ok(), "Back navigation must be successful").toBe(true);
      const history = { original: entry, destination: transition.pageAfter, returned: page.url(),
        title: await page.title(), language: await page.locator("html").getAttribute("lang") ?? "" };
      problems.push(...historyProblems(history, { page: entry, locale }));
    }
    assertClean(problems);
  });

  test("network traces contain no third-party map-tile requests", async ({ page, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(5 * 60 * 1000);
    const locales = await requireEntries(page, baseURL!);
    const problems: Problem[] = [];
    for (const [locale, url] of locales) {
      const trace = captureNetwork(page);
      try {
        await open(page, url);
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      } finally {
        trace.stop();
      }
      problems.push(...resourceProblems(trace.resources, { page: url, locale }, baseURL!));
    }
    assertClean(problems);
  });

  test("offline reload retains locale, main content and source attribution", async ({ page, context, baseURL }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(6 * 60 * 1000);
    const locales = await requireEntries(page, baseURL!);
    const problems: Problem[] = [];
    for (const [locale, url] of locales) {
      await context.setOffline(false);
      await open(page, url);
      const controlled = await waitForServiceWorker(page);
      expect(controlled, `${url} must be controlled for offline navigation`).toBe(true);
      await context.setOffline(true);
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
        const state = await collectOfflineState(page, locale);
        problems.push(...offlineProblems(state, { page: url, locale }));
        problems.push(...evidenceProblems(state.statuses, { page: url, locale }, todayUtc()));
      } catch (error) {
        problems.push({ rule: "offline-reload", page: url, target: "document",
          explanation: error instanceof Error ? error.message : String(error), importance: "error" });
      } finally {
        await context.setOffline(false);
      }
    }
    assertClean(problems);
  });
});
