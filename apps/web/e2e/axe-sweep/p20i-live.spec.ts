import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { captureBrowser } from "./p20i-browser";
import {
  AXE_TAGS, disclosureIssues, dialogIssues, documentIssues, evidenceIssues,
  fieldIssues, formIssues, issueText, linkIssues, liveIssues, matrixIssues,
  matrixKeys, mediaIssues, tableIssues, targetIssues,
  type Context, type Issue, type Locale, type Width,
} from "./p20i-contracts";

/**
 * This suite complements the existing route-wide axe test. It inspects the
 * browser's rendered semantics and target rectangles without a crawler,
 * hardcoded accessibility facts, allowlists, or invented place IDs.
 * All tests are discovered by apps/web/playwright.config.ts.
 */
const routes = appRoutes();
const routeSet = [...new Set(routes)];
const dimensions = routeSet.flatMap((route) =>
  LANGUAGES.flatMap((locale) => VIEWPORTS.map((viewport) => ({ route, locale, viewport }))));

async function startLanguage(page: Page, locale: Locale): Promise<void> {
  // A new page is about:blank before the first navigation. Day 17's helper
  // intentionally returns immediately for English, so first load the shell.
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.ok(), "The application entry point must load").toBe(true);
  await chooseLanguage(page, locale);
  await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${locale}(?:-|$)`, "i"));
}

async function settle(page: Page, route: string, locale: Locale): Promise<void> {
  await visit(page, route, locale);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

async function audit(page: Page, context: Context): Promise<Issue[]> {
  const snapshot = await captureBrowser(page);
  const origin = new URL(page.url()).origin;
  return [
    ...documentIssues(snapshot.document, context),
    ...targetIssues(snapshot.targets, context),
    ...fieldIssues(snapshot.fields, context),
    ...linkIssues(snapshot.links, context, origin),
    ...mediaIssues(snapshot.media, context),
    ...tableIssues(snapshot.tables, context),
    ...disclosureIssues(snapshot.disclosures, context),
    ...dialogIssues(snapshot.dialogs, context),
    ...liveIssues(snapshot.live, context),
    ...formIssues(snapshot.forms, context),
    ...evidenceIssues(snapshot.evidence, context),
  ];
}

function context(route: string, locale: Locale, width: number): Context {
  if (width !== 320 && width !== 1280) throw new Error("Unsupported audit width");
  return { route, locale, width: width as Width };
}

test("P20I inventory covers every live route in both locales and widths", () => {
  expect(routeSet.length).toBeGreaterThan(10);
  expect(routeSet).toContain("/places");
  expect(routeSet).toContain("/help");
  expect(routeSet).toContain("/finders");
  expect(routeSet).toContain("/more");
  expect(LANGUAGES).toEqual(["en", "fr"]);
  expect(VIEWPORTS.map((item) => item.width)).toEqual([320, 1280]);
  const seen = dimensions.map((item) => `${item.route}|${item.locale}|${item.viewport.width}`);
  expect(matrixIssues(routeSet, seen)).toEqual([]);
  expect(seen).toEqual(expect.arrayContaining(matrixKeys(routeSet)));
});

for (const locale of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20I ${locale} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of routeSet) {
        test(`rendered DOM contract: ${route}`, async ({ page }) => {
          test.setTimeout(100_000);
          await startLanguage(page, locale);
          await settle(page, route, locale);
          const findings = await audit(page, context(route, locale, viewport.width));
          expect(findings, issueText(findings)).toEqual([]);
        });
      }

      test("finders clickable choices have the correct hit surface", async ({ page }) => {
        test.setTimeout(80_000);
        await startLanguage(page, locale);
        await settle(page, "/finders", locale);
        const snapshot = await captureBrowser(page);
        const choices = snapshot.targets.filter((item) => item.kind === "choice" && item.visible);
        expect(choices.length, "A finder category choice is expected").toBeGreaterThan(0);
        const findings = targetIssues(choices, context("/finders", locale, viewport.width));
        expect(findings, issueText(findings)).toEqual([]);
        const fields = snapshot.fields.filter((item) => item.visible);
        expect(fields.length).toBeGreaterThan(0);
        const fieldFindings = fieldIssues(fields, context("/finders", locale, viewport.width));
        expect(fieldFindings, issueText(fieldFindings)).toEqual([]);
      });

      test("the first screen has real HTML semantics after language selection", async ({ page }) => {
        test.setTimeout(80_000);
        await startLanguage(page, locale);
        await settle(page, "/", locale);
        const snapshot = await captureBrowser(page);
        expect(snapshot.document.h1).toHaveLength(1);
        expect(snapshot.document.mainCount).toBe(1);
        expect(snapshot.document.lang).toMatch(new RegExp(`^${locale}(?:-|$)`, "i"));
        expect(snapshot.document.mainText.trim()).not.toBe("");
        expect(snapshot.document.skipTargetExists).toBe(true);
        const result = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
        const failures = result.violations.flatMap((violation) =>
          violation.nodes.map((node) => `${violation.id}: ${node.target.join(" ")}`));
        expect(failures, failures.join("\n")).toEqual([]);
      });

      test("navigation links maintain 44px targets", async ({ page }) => {
        test.setTimeout(80_000);
        await startLanguage(page, locale);
        await settle(page, "/", locale);
        const snapshot = await captureBrowser(page);
        const links = snapshot.links.filter((item) => item.visible);
        expect(links.length).toBeGreaterThan(0);
        const findings = linkIssues(links, context("/", locale, viewport.width), new URL(page.url()).origin);
        expect(findings, issueText(findings)).toEqual([]);
      });

      test("language button preserves URL and updates visible document", async ({ page }) => {
        test.setTimeout(80_000);
        await startLanguage(page, locale);
        await settle(page, "/", locale);
        const before = new URL(page.url()).pathname;
        const other: Locale = locale === "en" ? "fr" : "en";
        const name = other === "fr" ? "Français" : "English";
        const button = page.getByRole("button", { name, exact: true }).first();
        await expect(button).toBeVisible();
        await button.click();
        await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${other}(?:-|$)`, "i"));
        expect(new URL(page.url()).pathname).toBe(before);
        const snapshot = await captureBrowser(page);
        const findings = documentIssues(snapshot.document, context("/", other, viewport.width));
        expect(findings, issueText(findings)).toEqual([]);
      });
    });
  }
}
