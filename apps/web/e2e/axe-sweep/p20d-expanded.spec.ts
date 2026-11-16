import AxeBuilder from "@axe-core/playwright";
import { collectVisibleCopy, copyFindings } from "./p20d-copy";
import { expect, test, type Page } from "@playwright/test";
import {
  externalTileFindings,
  languageOf,
  localeParity,
  logicalRoute,
  report,
  finding,
  type Finding,
  type Language,
} from "./p20d-contracts";
import {
  documentFindings,
  exerciseDialogEscape,
  keyboardFindings,
  reducedMotionSnapshot,
  collectMotionProblems,
  skipLinkFindings,
  snapshotDocument,
  assertNoInaccessibleLoading,
} from "./p20d-page-audit";
import {
  followLanguageAlternate,
  routeDuplicates,
  scanRoutes,
  scanSettings,
  startingPoints,
} from "./p20d-navigation";
import {
  checkOfflineEvidence,
  offlineFindings,
  runOfflineTrial,
} from "./p20d-offline";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function loadPage(page: Page, url: string): Promise<boolean> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (!response || response.status() === 404) return false;
  expect(response.ok(), `${url}: ${response.status()}`).toBe(true);
  return true;
}

function confirmedEntries(baseURL: string): string[] {
  return startingPoints(scanSettings(baseURL));
}

async function onePagePerLanguage(page: Page, baseURL: string): Promise<Map<Language, string>> {
  const found = new Map<Language, string>();
  for (const entry of confirmedEntries(baseURL)) {
    if (!(await loadPage(page, entry))) continue;
    const lang = languageOf(await page.locator("html").getAttribute("lang"));
    if (lang && !found.has(lang)) found.set(lang, page.url());
    if (found.size === 2) break;
  }
  return found;
}

function assertClean(problems: readonly Finding[]): void {
  expect(problems, report(problems)).toEqual([]);
}

test.describe("P20D: extensive accessibility gates in the e2e runner", () => {
  test("crawls EN and FR routes and fails on structural, evidence and external tile issues", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL, "Configure Playwright use.baseURL for the local App").toBeTruthy();
    test.setTimeout(12 * 60 * 1000);
    const result = await scanRoutes(page, scanSettings(baseURL!));
    const errors: Finding[] = [...result.findings];
    for (const snapshot of result.pages) {
      errors.push(...documentFindings(snapshot));
      await loadPage(page, snapshot.url);
      errors.push(...copyFindings(await collectVisibleCopy(page)));
    }
    errors.push(...routeDuplicates(result.routes));
    errors.push(...localeParity(result.routes));
    errors.push(...externalTileFindings(result.attempts, new URL(baseURL!).origin));
    expect(result.pages.length, "No HTML route was crawled").toBeGreaterThan(0);
    assertClean(errors);
  });

  test("runs axe WCAG 2.2 AA and form audits on both language entrypoints", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(5 * 60 * 1000);
    const entries = await onePagePerLanguage(page, baseURL!);
    const errors: Finding[] = [];
    for (const [language, url] of entries) {
      await loadPage(page, url);
      const snapshot = await snapshotDocument(page);
      errors.push(...documentFindings(snapshot));
      const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      for (const violation of axe.violations) {
        const locations = violation.nodes.slice(0, 5)
          .map((node) => node.target.join(" ")).join(", ");
        errors.push(finding(`axe-${violation.id}`, url,
          `${language}: ${violation.impact ?? "unknown"}: ${locations}`));
      }
      errors.push(...await assertNoInaccessibleLoading(page));
    }
    expect(entries.has("en"), "English entrypoint must exist").toBe(true);
    expect(entries.has("fr"), "French entrypoint must exist").toBe(true);
    assertClean(errors);
  });

  test("operates tab sequence, skip navigation and Escape in both languages", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(4 * 60 * 1000);
    const entries = await onePagePerLanguage(page, baseURL!);
    const errors: Finding[] = [];
    for (const url of entries.values()) {
      await loadPage(page, url);
      errors.push(...await keyboardFindings(page, url));
      await loadPage(page, url);
      errors.push(...await skipLinkFindings(page));
      errors.push(...await exerciseDialogEscape(page));
    }
    expect(entries.size, "Both EN and FR are required").toBe(2);
    assertClean(errors);
  });

  test("checks reduced-motion controls and 320px reflow in EN and FR", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(4 * 60 * 1000);
    const entries = await onePagePerLanguage(page, baseURL!);
    const errors: Finding[] = [];
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 720 });
    for (const url of entries.values()) {
      await loadPage(page, url);
      const snapshot = await snapshotDocument(page);
      if (snapshot.bodyWidth > snapshot.viewportWidth + 2) {
        errors.push(finding("horizontal-reflow", url,
          `${snapshot.bodyWidth} > ${snapshot.viewportWidth}`));
      }
      errors.push(...collectMotionProblems(await reducedMotionSnapshot(page), url));
      errors.push(...documentFindings(snapshot));
    }
    expect(entries.size).toBe(2);
    assertClean(errors);
  });

  test("opens language alternates and checks destination language and route", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(4 * 60 * 1000);
    const entries = await onePagePerLanguage(page, baseURL!);
    const errors: Finding[] = [];
    for (const [language, url] of entries) {
      await loadPage(page, url);
      const snapshot = await snapshotDocument(page);
      const desired: Language = language === "en" ? "fr" : "en";
      const explicit = snapshot.alternates.filter((link) => languageOf(link.hreflang) === desired);
      if (explicit.length === 0) {
        errors.push(finding("language-alternate-not-advertised", url, desired));
        continue;
      }
      const target = explicit[0];
      if (!target) continue;
      errors.push(...await followLanguageAlternate(page, url, target.href, desired));
      if (logicalRoute(url) !== logicalRoute(page.url())) {
        errors.push(finding("translated-route-mismatch", url, page.url()));
      }
    }
    expect(entries.size).toBe(2);
    assertClean(errors);
  });

  test("uses a real offline browser context and keeps source metadata attached", async ({
    page,
    context,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();
    test.setTimeout(5 * 60 * 1000);
    const entries = await onePagePerLanguage(page, baseURL!);
    const errors: Finding[] = [];
    for (const url of entries.values()) {
      const trial = await runOfflineTrial(context, page, url);
      errors.push(...offlineFindings(trial));
      if (trial.after) {
        errors.push(...await checkOfflineEvidence(page));
      }
    }
    expect(entries.size).toBe(2);
    assertClean(errors);
  });
});
