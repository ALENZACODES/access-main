import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { observePage, browserFindings } from "./p20al-browser.ts";
import { routeInventoryFindings, selectCriticalCells, cellKey } from "./p20al-matrix.ts";
import { safePath, type Locale } from "./p20al-contract.ts";

/** Read-only route inventory is built from currently mounted application routes. */
const CURRENT_ROUTES = appRoutes();
const REQUIRED = ["/", "/journey", "/places", "/help"];

test("P20AL: live route matrix has unique safe routes and both locales", () => {
  expect(routeInventoryFindings(CURRENT_ROUTES, REQUIRED)).toEqual([]);
  expect(CURRENT_ROUTES.every(safePath)).toBe(true);
  const cells = selectCriticalCells(CURRENT_ROUTES);
  expect(new Set(cells.map(cellKey)).size).toBe(cells.length);
  expect(cells.some((cell) => cell.locale === "en" && cell.network === "offline")).toBe(true);
  expect(cells.some((cell) => cell.locale === "fr" && cell.network === "online")).toBe(true);
});

/** Existing P20 axe sweeps already crawl every route; this checks a physical cutover. */
for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AL passive network transition ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("keeps a readable document when connection state changes", async ({ page, context }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        const online = await observePage(page, { route: "/", locale: language as Locale, network: "online" });
        expect(online.documentLanguage.toLowerCase().startsWith(language)).toBe(true);
        expect(online.screen.records).toEqual([]);
        expect(online.screen.mainCount).toBe(1);
        expect(online.screen.heading.trim().length).toBeGreaterThan(0);
        expect(online.screen.outcome).toBe("UNKNOWN");
        await context.setOffline(true);
        try {
          const offline = await observePage(page, { route: "/", locale: language as Locale, network: "offline" });
          expect(offline.screen.network).toBe("offline");
          expect(offline.screen.cache).toBe("UNKNOWN");
          expect(offline.screen.records).toEqual([]);
          expect(offline.screen.route).toBe("/");
          expect(browserFindings(offline, language as Locale).some((issue) => issue.code === "browser-language-mismatch")).toBe(false);
        } finally {
          await context.setOffline(false);
        }
        const restored = await observePage(page, { route: "/", locale: language as Locale, network: "online" });
        expect(restored.screen.network).toBe("online");
        expect(restored.screen.outcome).toBe("UNKNOWN");
        expect(restored.screen.locale).toBe(language);
      });
    });
  }
}
