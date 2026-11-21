import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { observeBrowser, browserObservationFindings } from "./p20aa-browser-observer";
import { coverageFindings, coverageMatrix, reportFindings, validRoute } from "./p20aa-journey-model";

/** The active route table drives the matrix. No route count is pinned. */
const ROUTES = appRoutes();
const REQUIRED = ["/", "/help", "/places", "/journey", "/finders"];

test("P20AA: all current routes have distinct safe paths and complete language/width coverage", () => {
  expect(ROUTES.length).toBeGreaterThan(0);
  expect(new Set(ROUTES).size).toBe(ROUTES.length);
  for (const route of ROUTES) expect(validRoute(route), `Invalid appRoutes() entry: ${route}`).toBe(true);
  for (const route of REQUIRED) expect(ROUTES, `Missing required route ${route}`).toContain(route);
  const matrix = coverageMatrix(ROUTES);
  const findings = coverageFindings(ROUTES, matrix);
  expect(findings, reportFindings(findings)).toEqual([]);
});

/**
 * One representative route per language and width. The existing P20G axe suite
 * performs the exhaustive crawl; these assertions exercise the new DOM observer
 * without introducing a second expensive full-route crawl.
 */
for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AA live observer ${language} ${viewport.width}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("observes the home screen without changing persistent app data", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        const observation = await observeBrowser(page, { route: "/", locale: language });
        const findings = browserObservationFindings(observation, language);
        expect(findings).toEqual([]);
        expect(observation.screen.locale).toBe(language);
        expect(observation.screen.route).toBe("/");
        expect(observation.targets).toBeInstanceOf(Array);
        expect(observation.screen.evidence).toEqual([]);
      });
    });
  }
}
