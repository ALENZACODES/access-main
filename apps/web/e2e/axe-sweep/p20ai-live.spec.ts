import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { observePage, observerProblems } from "./p20ai-browser";
import { scenarioCoverage, scenarioMatrix, boundedScenarioSample } from "./p20ai-replay";
import { localRoute } from "./p20ai-trace-model";
/** Runtime inventory is owned by appRoutes, never duplicated in a static route array. */
const ROUTES = appRoutes();
const MANDATORY = ["/", "/help", "/places", "/journey"];
test("P20AI route coverage inventory uses live appRoutes", () => {
  expect(ROUTES.length).toBeGreaterThan(0);
  expect(new Set(ROUTES).size).toBe(ROUTES.length);
  for (const route of ROUTES) expect(localRoute(route), `Unsafe current route ${route}`).toBe(true);
  for (const route of MANDATORY) expect(ROUTES).toContain(route);
  const matrix = scenarioMatrix(ROUTES);
  expect(scenarioCoverage(matrix, matrix)).toEqual([]);
  expect(matrix.length).toBe(ROUTES.length * 8);
});
/** Bounded representative smoke: the pre-existing axe sweep owns exhaustive route audit. */
for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AI read-only DOM ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("captures heading, focusables and locale without modifying persistence", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        const sample = boundedScenarioSample(scenarioMatrix(ROUTES), 1);
        expect(sample).toHaveLength(1);
        const observed = await observePage(page, { route: "/", locale: language });
        expect(observerProblems(observed, language)).toEqual([]);
        expect(observed.snapshot.route).toBe("/");
        expect(observed.snapshot.locale).toBe(language);
        expect(observed.snapshot.connection).toBe("UNKNOWN");
        expect(observed.snapshot.cache).toBe("UNKNOWN");
        expect(observed.snapshot.evidence).toEqual([]);
      });
    });
  }
}
