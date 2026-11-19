import { assertNoForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { collectSemanticSnapshot } from "./semantic-integrity-browser";
import { assertUniqueMatrix, reportIssues, routeInventoryIssues, snapshotIssues } from "./semantic-integrity";

const REQUIRED = ["/", "/about", "/places", "/help", "/finders"] as const;
const ALL = appRoutes();
const scheduled = REQUIRED.flatMap((route) => LANGUAGES.flatMap((locale) =>
  VIEWPORTS.map((viewport) => `${route}|${locale}|${viewport.width}`)));

// The wider Day 17 / P20 axe suite covers every route. This separate suite
// checks semantic DOM integrity on the core navigation, help and search surfaces.
test("semantic audit inventory derives its routes from the application", () => {
  const problems = routeInventoryIssues(ALL, REQUIRED);
  expect(problems, reportIssues(problems)).toEqual([]);
  expect(ALL).toEqual([...new Set(ALL)]);
  const matrixProblems = assertUniqueMatrix(REQUIRED, LANGUAGES, VIEWPORTS.map((item) => item.width), scheduled);
  expect(matrixProblems, reportIssues(matrixProblems)).toEqual([]);
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`semantic integrity ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of REQUIRED) {
        test(`ARIA and DOM structure on ${route}`, async ({ page }) => {
          test.setTimeout(90_000);
          const response = await page.goto("/", { waitUntil: "domcontentloaded" });
          expect(response?.ok(), "The application entrypoint must load").toBe(true);
          await chooseLanguage(page, language);
          await visit(page, route, language);
          const snapshot = await collectSemanticSnapshot(page, route);
          assertNoForbiddenOrg(await page.locator("body").innerText(), `${route} ${language}`);
          const issues = snapshotIssues(snapshot, language, viewport.width);
          expect(issues, reportIssues(issues)).toEqual([]);
        });
      }
    });
  }
}
