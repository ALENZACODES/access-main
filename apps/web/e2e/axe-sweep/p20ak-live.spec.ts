import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { observePage, browserSnapshotFindings } from "./p20ak-browser";
import { matrixFindings, routeInventoryFindings, routeMatrix } from "./p20ak-replay";

/** A bounded smoke check. Existing P20 axe suites own exhaustive route scans. */
const ROUTES = appRoutes();
const REQUIRED = ["/", "/places", "/journey", "/help"];

test("P20AK live inventory follows appRoutes rather than a fixed count", () => {
  expect(routeInventoryFindings(ROUTES)).toEqual([]);
  for (const route of REQUIRED) expect(ROUTES, `Missing route ${route}`).toContain(route);
  const matrix = routeMatrix(ROUTES);
  expect(matrix).toHaveLength(ROUTES.length * 8);
  expect(matrixFindings(matrix, matrix)).toEqual([]);
});
for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AK ${language} ${viewport.width}px read-only offline observations`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("document identity and UNKNOWN cache remain intact across connectivity changes", async ({ page, context }) => {
        test.setTimeout(90_000);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await chooseLanguage(page, language);
        await visit(page, "/", language);
        const connected = await observePage(page, { route: "/", connectivity: "online" });
        expect(browserSnapshotFindings(connected, language)).toEqual([]);
        expect(connected.snapshot.resources).toEqual([]);
        expect(connected.snapshot.evidence).toEqual([]);
        await context.setOffline(true);
        try {
          const offline = await observePage(page, { route: "/", connectivity: "offline" });
          expect(offline.snapshot.connectivity).toBe("offline");
          expect(offline.snapshot.route).toBe("/");
          expect(offline.snapshot.language).toBe(language);
          expect(offline.snapshot.resources).toEqual([]);
          expect(offline.snapshot.evidence).toEqual([]);
          expect(offline.snapshot.phase).toBe("UNKNOWN");
        } finally {
          await context.setOffline(false);
        }
      });
    });
  }
}
