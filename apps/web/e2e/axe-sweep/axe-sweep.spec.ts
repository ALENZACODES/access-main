import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";

import { parameterizedRouteCases } from "./parameterized-routes.ts";

const DETAIL_ROUTES = parameterizedRouteCases();
const ROUTES = appRoutes();
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const REQUIRED = ["/", "/dev/narrow", "/places", "/journey", "/help", "/more/housing", "/more/diary", "/more/auditors"];

test("P20 route inventory is unique and includes required routes", () => {
  expect(ROUTES.length).toBeGreaterThan(0);
  expect(new Set(ROUTES).size).toBe(ROUTES.length);
  expect(ROUTES.every((route) => route.startsWith("/") && !route.startsWith("//") && !/[?#\\]/.test(route))).toBe(true);
  for (const route of REQUIRED) expect(ROUTES, `${route} must be registered`).toContain(route);
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      for (const { route, title } of [...ROUTES.map((route) => ({ route, title: null })), ...DETAIL_ROUTES]) {
        test(`axe route ${route}`, async ({ page }) => {
          test.setTimeout(90_000);
          const response = await page.goto("/", { waitUntil: "domcontentloaded" });
          expect(response?.ok()).toBe(true);
          await chooseLanguage(page, language);
          await visit(page, route, language);
          if (title) {
            await expect(page.getByRole("heading", { level: 1, name: title[language], exact: true })).toBeVisible();
          }
          const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          const violations = result.violations.flatMap((entry) => entry.nodes.map((node) =>
            `${route} ${language} ${viewport.width}px ${entry.id} ${node.target.join(" ")}`));
          expect(violations, violations.join("\n")).toEqual([]);
        });
      }
    });
  }
}
