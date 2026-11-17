import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";

const ROUTES = appRoutes();
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("P20 route inventory is derived from app routes", () => {
  expect(ROUTES).toHaveLength(39);
  expect(new Set(ROUTES).size).toBe(39);
  expect(ROUTES).toContain("/dev/narrow");
  expect(ROUTES).toContain("/places");
  expect(ROUTES).toContain("/help");
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      for (const route of ROUTES) {
        test(`axe route ${route}`, async ({ page }) => {
          test.setTimeout(90_000);
          // The Day 17 helper skips English; navigation must initialize it first.
          const response = await page.goto("/", { waitUntil: "domcontentloaded" });
          expect(response?.ok()).toBe(true);
          await chooseLanguage(page, language);
          await visit(page, route, language);
          const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          const violations = result.violations.flatMap((entry) => entry.nodes.map((node) =>
            `${route} ${language} ${viewport.width}px ${entry.id} ${node.target.join(" ")}`));
          expect(violations, violations.join("\n")).toEqual([]);
        });
      }
    });
  }
}
