import { assertNoForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { collectSemanticSnapshot } from "./semantic-integrity-browser";
import { assertUniqueMatrix, reportIssues, routeInventoryIssues, snapshotIssues } from "./semantic-integrity";

const REQUIRED = [
  "/", "/about", "/places", "/help", "/finders",
  "/more/housing", "/more/diary", "/more/auditors",
] as const;
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

// One browser context per locale/viewport instead of one context per route.
// Route assertions still fail independently through labelled test steps.
for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`semantic integrity ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test("all required live routes retain semantic and language integrity", async ({ page }) => {
        test.setTimeout(180_000);
        const response = await page.goto("/", { waitUntil: "domcontentloaded" });
        expect(response?.ok(), "The application entrypoint must load").toBe(true);
        await chooseLanguage(page, language);
        for (const route of REQUIRED) {
          await test.step(`${route} ${language} ${viewport.width}px`, async () => {
            await visit(page, route, language);
            const snapshot = await collectSemanticSnapshot(page, route);
            assertNoForbiddenOrg(await page.locator("body").innerText(), `${route} ${language}`);
            const issues = snapshotIssues(snapshot, language, viewport.width);
            expect(issues, reportIssues(issues)).toEqual([]);
          });
        }
      });
    });
  }
}
