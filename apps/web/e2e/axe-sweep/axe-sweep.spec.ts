import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { formatFindings, routeInventoryFindings } from "./p20l-provenance";

const ROUTES = appRoutes();
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const REQUIRED_ROUTES = ["/", "/places", "/journey", "/help", "/finders", "/offline", "/more", "/settings"];

test("P20 route inventory includes required routes and has no duplicates", () => {
  const issues = routeInventoryFindings(ROUTES, REQUIRED_ROUTES);
  expect(issues, formatFindings(issues)).toEqual([]);
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      for (const route of ROUTES) {
        test(`axe route ${route}`, async ({ page }) => {
          test.setTimeout(90_000);
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
