import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { browserFindingCodes, coverageMatrix, inventoryFindings, observePage } from "./p20aj-index";

/** A bounded live smoke audit. The established axe sweep owns the exhaustive route crawl. */
const CURRENT_ROUTES = appRoutes();
const REQUIRED = ["/", "/journey", "/places", "/help"];

test("P20AJ live route inventory is dynamic, unique and safe", () => {
  expect(CURRENT_ROUTES.length).toBeGreaterThan(0);
  expect(inventoryFindings(CURRENT_ROUTES)).toEqual([]);
  for (const route of REQUIRED) {
    expect(CURRENT_ROUTES, `Missing shell route ${route}`).toContain(route);
  }
  const cells = coverageMatrix(CURRENT_ROUTES);
  expect(cells).toHaveLength(CURRENT_ROUTES.length * 8);
  expect(new Set(cells.map((cell) => [cell.route, cell.locale, cell.width, cell.connectivity].join("|"))).size)
    .toBe(cells.length);
});

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AJ ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test("observes a localized page without creating accessibility facts", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        const observed = await observePage(page, { route: "/", connectivity: "online" });
        expect(browserFindingCodes(observed, language)).toEqual([]);
        expect(observed.snapshot.evidence).toEqual([]);
        expect(observed.snapshot.connectivity).toBe("online");
        expect(observed.snapshot.cache).toBe("UNKNOWN");
        expect(observed.snapshot.route).toBe("/");
      });

      test("offline state is observed without inventing cache availability", async ({ page, context }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        await context.setOffline(true);
        try {
          const offline = await observePage(page, { route: "/", connectivity: "offline" });
          expect(offline.snapshot.connectivity).toBe("offline");
          expect(offline.snapshot.cache).toBe("UNKNOWN");
          expect(offline.snapshot.evidence).toEqual([]);
          expect(offline.snapshot.resources).toEqual([]);
          expect(offline.snapshot.locale).toBe(language);
        } finally {
          await context.setOffline(false);
        }
      });
    });
  }
}
