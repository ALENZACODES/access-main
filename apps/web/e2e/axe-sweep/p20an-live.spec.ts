import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers.ts";
import { inspectBrowser, inspectOffline, browserResultFindings } from "./p20an-browser.ts";
import { routeCoverage, coverageFindings } from "./p20an-interactions.ts";
import { DEFAULT_ENTRY_CAP, DEFAULT_TOTAL_CAP, resourceBudgetFindings } from "./p20an-offline.ts";

const ROUTES = appRoutes();
const CORE = ["/", "/help", "/journey", "/places"];
test("P20AN live route inventory uses the current application route table", () => {
  for (const route of CORE) expect(ROUTES).toContain(route);
  expect(new Set(ROUTES).size).toBe(ROUTES.length);
  const cells = routeCoverage(ROUTES);
  expect(coverageFindings(cells, cells)).toEqual([]);
});
for (const locale of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AN read-only ${locale} ${viewport.width}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("home screen exposes a primary heading, stable locale, and bounded layout", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, locale);
        await visit(page, "/", locale);
        const observed = await inspectBrowser(page, { route: "/", locale, connection: "UNKNOWN" });
        expect(browserResultFindings(observed, locale)).toEqual([]);
        expect(observed.screen.route).toBe("/");
        expect(observed.screen.locale).toBe(locale);
      });
      test("offline metadata inspection is read-only and does not assert cache availability", async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, locale);
        const observed = await inspectOffline(page, "/", "UNKNOWN");
        expect(observed.connection).toBe("UNKNOWN");
        expect(observed.resources).toEqual([]);
        expect(resourceBudgetFindings([], {
          maximumEntryBytes: DEFAULT_ENTRY_CAP,
          maximumTotalBytes: DEFAULT_TOTAL_CAP,
          totalBytes: null,
        }, "/").some((entry) => entry.code === "budget-total-UNKNOWN")).toBe(true);
      });
    });
  }
}
