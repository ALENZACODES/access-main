import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS } from "../a11y-input/helpers";
import {
  assertCompleteMatrix, controlFindings, detailFindings, dialogFindings, fieldFindings,
  focusFindings, landmarkFindings, languageTransitionFindings, linkFindings,
  liveRegionFindings, matrixKey, navigationFindings, report, searchFindings, mediaFindings, tableFindings,
  type Context, type Finding, type Language,
} from "./p20g-contracts";
import {
  discoverDetailLink, exerciseNavigation, exerciseSearch, inspectControls, inspectDetail,
  inspectDialog, inspectFields, inspectLandmarks, inspectLanguageTransition, inspectMedia, inspectTables,
  inspectLinks, inspectLiveRegions, probeFocus, settleRoute,
} from "./p20g-browser";

const ALL_ROUTES = appRoutes();
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function context(route: string, language: Language, viewport: number): Context {
  return { route, language, viewport };
}
function expectClean(findings: readonly Finding[]): void {
  expect(findings, report(findings)).toEqual([]);
}

async function assertAxe(page: Page, ctx: Context): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const failures = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      rule: `axe-${violation.id}`,
      route: `${ctx.route} [${ctx.language}, ${ctx.viewport}px]`,
      detail: `${violation.help}: ${node.target.join(" ")}`,
    })),
  );
  expectClean(failures);
}

async function startLanguage(page: Page, language: Language): Promise<void> {
  // The route language is chosen through the real header button, never URL
  // rewriting, preloaded localStorage, or a locale-only pseudo-route.
  await chooseLanguage(page, language);
  await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${language}(?:-|$)`));
}

async function auditDocument(page: Page, ctx: Context): Promise<void> {
  const findings: Finding[] = [];
  findings.push(...landmarkFindings(await inspectLandmarks(page), ctx));
  findings.push(...controlFindings(await inspectControls(page), ctx));
  findings.push(...fieldFindings(await inspectFields(page), ctx));
  findings.push(...liveRegionFindings(await inspectLiveRegions(page), ctx));
  findings.push(...linkFindings(await inspectLinks(page), ctx, new URL(page.url()).origin));
  findings.push(...dialogFindings(await inspectDialog(page), ctx));
  findings.push(...mediaFindings(await inspectMedia(page), ctx));
  findings.push(...tableFindings(await inspectTables(page), ctx));
  expectClean(findings);
  await assertAxe(page, ctx);
}

/** The full matrix is created at declaration time, not inferred from a crawl. */
test("P20G route and viewport inventory", () => {
  expect(ALL_ROUTES.length).toBeGreaterThan(8);
  expect(ALL_ROUTES).toContain("/places");
  expect(ALL_ROUTES).toContain("/help");
  expect(ALL_ROUTES).toContain("/finders");
  expect(ALL_ROUTES).toContain("/more");
  expect(LANGUAGES).toEqual(["en", "fr"]);
  expect(VIEWPORTS.map((item) => item.width)).toEqual([320, 1280]);
  const expected = ALL_ROUTES.flatMap((route) =>
    LANGUAGES.flatMap((language) => VIEWPORTS.map((item) => matrixKey(route, language, item.width))));
  expectClean(assertCompleteMatrix(ALL_ROUTES, LANGUAGES, VIEWPORTS.map((item) => item.width), expected));
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20G ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of ALL_ROUTES) {
        test(`full DOM and axe policies: ${route}`, async ({ page }) => {
          test.setTimeout(110_000);
          const ctx = context(route, language, viewport.width);
          await startLanguage(page, language);
          await settleRoute(page, route, language);
          await auditDocument(page, ctx);
        });
      }

      test("/finders measures its actual 48px labelled controls", async ({ page }) => {
        test.setTimeout(75_000);
        await startLanguage(page, language);
        await settleRoute(page, "/finders", language);
        const ctx = context("/finders", language, viewport.width);
        const controls = await inspectControls(page);
        expect(controls.some((item) => item.role === "radio" || item.tag === "input"),
          "The finder form must expose an interactive control").toBe(true);
        expectClean(controlFindings(controls, ctx));
        const fields = await inspectFields(page);
        expect(fields.some((item) => item.visible && item.type !== "hidden")).toBe(true);
        expectClean(fieldFindings(fields, ctx));
        await assertAxe(page, ctx);
      });

      test("place details come from a real visible list link", async ({ page }) => {
        test.setTimeout(100_000);
        await startLanguage(page, language);
        await settleRoute(page, "/places", language);
        const href = await discoverDetailLink(page, "places");
        expect(href, "The places list must expose an actual detail link").not.toBeNull();
        const before = page.url();
        const transition = await exerciseNavigation(page, href!);
        expectClean(navigationFindings(transition, context("/places", language, viewport.width)));
        expect(page.url(), "Back must restore the list").toBe(before);
        await page.locator(`main a[href="${href!.replaceAll('"', '\\"')}"]`).first().click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        const detail = await inspectDetail(page, "places", true);
        expectClean(detailFindings(detail, "places", context("/places/:id", language, viewport.width)));
        await auditDocument(page, context("/places/:id", language, viewport.width));
      });

      test("help details come from a real article link", async ({ page }) => {
        test.setTimeout(100_000);
        await startLanguage(page, language);
        await settleRoute(page, "/help", language);
        const href = await discoverDetailLink(page, "help");
        expect(href, "The help index must expose a real article link").not.toBeNull();
        await page.locator(`main a[href="${href!.replaceAll('"', '\\"')}"]`).first().click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        const detail = await inspectDetail(page, "help", true);
        expectClean(detailFindings(detail, "help", context("/help/:id", language, viewport.width)));
        await auditDocument(page, context("/help/:id", language, viewport.width));
      });

      test("keyboard and reverse focus remain operable", async ({ page }) => {
        test.setTimeout(100_000);
        await startLanguage(page, language);
        for (const route of ["/", "/finders", "/places", "/help", "/more"]) {
          await settleRoute(page, route, language);
          const focus = await probeFocus(page);
          expectClean(focusFindings(focus, context(route, language, viewport.width)));
        }
      });

      test("search results announce a finished state", async ({ page }) => {
        test.setTimeout(90_000);
        await startLanguage(page, language);
        for (const route of ["/places", "/finders", "/help"]) {
          await settleRoute(page, route, language);
          const before = await exerciseSearch(page, "access");
          expectClean(searchFindings(before, context(route, language, viewport.width)));
          await auditDocument(page, context(route, language, viewport.width));
        }
      });

      if (language === "en") {
        test("the French button changes the rendered page without navigation", async ({ page }) => {
          test.setTimeout(80_000);
          await settleRoute(page, "/", "en");
          const transition = await inspectLanguageTransition(page);
          expectClean(languageTransitionFindings(transition, context("/", "en", viewport.width)));
          await auditDocument(page, context("/", "fr", viewport.width));
        });
      }
    });
  }
}

// Discovered automatically by the web Playwright runner under e2e/.
