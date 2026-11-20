import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { observeOfflineRoute, navigationFindings } from "./p20ad-offline-browser";
import {
  requiredRouteCells, routeMatrixProblems, screenProblems, safePath,
  summarizeAudit, offlineFallbackProblems,
} from "./p20ad-offline-contracts";
import { allCopyProblems, copyPairsAreComplete, languageNameProblem } from "./p20ad-offline-copy";

/**
 * The full-route WCAG axe sweep already exists. This suite checks a distinct
 * dimension: offline-capable observations, document language and stable
 * route coverage. It does not seed fictitious real-place accessibility data.
 */
const ROUTES = appRoutes();
const REQUIRED = ["/", "/journey", "/places", "/finders", "/help"] as const;
const MATRIX = requiredRouteCells(ROUTES);

test("P20AD offline route inventory follows the live appRoutes helper", () => {
  expect(ROUTES.length).toBeGreaterThan(0);
  expect(new Set(ROUTES).size).toBe(ROUTES.length);
  for (const route of ROUTES) expect(safePath(route), route).toBe(true);
  for (const route of REQUIRED) expect(ROUTES, route).toContain(route);
  expect(routeMatrixProblems(MATRIX, MATRIX)).toEqual([]);
  expect(MATRIX.length).toBe(ROUTES.length * 8);
});

test("P20AD required bilingual messages satisfy French typography", () => {
  expect(copyPairsAreComplete()).toBe(true);
  expect(allCopyProblems()).toEqual([]);
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AD ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test("home DOM preserves a single main, a heading and document language", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        const captured = await observeOfflineRoute(page, { path: "/", expectedLocale: language });
        expect(languageNameProblem(captured.documentLanguage, language)).toBeNull();
        expect(captured.route.locale).toBe(language);
        expect(captured.route.mainCount).toBe(1);
        expect(captured.route.heading?.trim()).toBeTruthy();
        expect(captured.route.title?.trim()).toBeTruthy();
        expect(captured.route.evidence).toEqual([]);
        expect(captured.capturedAfterLoad).toBe(true);
        const structuralCodes = new Set([
          "route-unsafe", "main-count", "title-unknown", "heading-unknown",
          "horizontal-overflow", "viewport-invalid",
        ]);
        const structural = screenProblems(captured.route).filter((item) => structuralCodes.has(item.code));
        expect(structural, summarizeAudit(structural)).toEqual([]);
      });

      test("network disconnection is recorded without inventing cache or place facts", async ({ page, context }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        const before = await observeOfflineRoute(page, { path: "/", expectedLocale: language });
        await context.setOffline(true);
        try {
          const after = await observeOfflineRoute(page, {
            path: "/", expectedLocale: language, connection: "offline",
            cache: "unknown", outcome: "idle",
          });
          expect(before.route.path).toBe(after.route.path);
          expect(after.route.connection).toBe("offline");
          expect(after.route.cache).toBe("unknown");
          expect(after.route.evidence).toEqual([]);
          expect(offlineFallbackProblems(after.route)).toEqual([]);
        } finally {
          await context.setOffline(false);
        }
      });

      test("online route navigation exposes a localized heading and valid HTTP response", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        const route = "/help";
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(response?.ok()).toBe(true);
        await visit(page, route, language);
        const item = {
          from: "/", to: new URL(page.url()).pathname,
          responseStatus: response?.status() ?? null,
          title: await page.title(),
          heading: await page.locator("h1").first().textContent(),
          locale: await page.locator("html").getAttribute("lang"),
          mainCount: await page.locator("main,[role='main']").count(),
        };
        expect(navigationFindings(item, route, language)).toEqual([]);
      });
    });
  }
}
