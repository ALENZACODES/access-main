import { expect, test } from "@playwright/test";
import { assertNoForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { appRoutes, chooseLanguage, LANGUAGES, visit } from "../a11y-input/helpers";
import { attributeLanguageReport, summarizeAttributeLanguageFindings } from "./p20u-attribute-language";
import { collectRouteAttributeSnapshot } from "./p20w-attribute-browser";
import { formatRouteFindings, inventoryFindings, requiredAuditRoutes } from "./p20w-route-coverage";

/**
 * Live WCAG 3.1.2 coverage for every static application route.
 * The existing axe suite already covers both widths. This spec reuses one
 * browser per language to avoid creating another four-way slow route sweep.
 * It never changes local data or inserts a language marker into app content.
 */
const ALL_ROUTES = appRoutes();

test("P20W live language audit has a complete current route inventory", () => {
  const findings = inventoryFindings(ALL_ROUTES, requiredAuditRoutes());
  expect(findings, formatRouteFindings(findings)).toEqual([]);
  expect(new Set(ALL_ROUTES).size).toBe(ALL_ROUTES.length);
});

for (const language of LANGUAGES) {
  test.describe(`P20W attribute language live routes ${language}`, () => {
    test.use({ viewport: { width: 320, height: 800 } });

    test("every registered route exposes correctly marked accessibility attributes", async ({ page }) => {
      // The elapsed budget is shared, rather than a 90-second timeout for
      // every route. Individual labelled steps retain useful CI diagnostics.
      test.setTimeout(Math.max(180_000, ALL_ROUTES.length * 10_000));
      const initial = await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(initial?.ok()).toBe(true);
      await chooseLanguage(page, language);
      for (const route of ALL_ROUTES) {
        await test.step(`${route} ${language} attribute language`, async () => {
          await visit(page, route, language);
          const snapshot = await collectRouteAttributeSnapshot(page, route);
          const report = attributeLanguageReport(snapshot.attributes, snapshot.documentLanguage);
          assertNoForbiddenOrg(await page.locator("body").innerText(), `${route} ${language}`);
          expect(report.findings, summarizeAttributeLanguageFindings(report.findings)).toEqual([]);
        });
      }
    });
  });
}
