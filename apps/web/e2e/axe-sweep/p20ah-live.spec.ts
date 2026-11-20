import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";
import { browserFrameFindings, observeBrowserFrame, stateTransitionFindings } from "./p20ah-browser.ts";

const ROUTES = appRoutes();
test("P20AH live registration follows the current app route table", () => {
  expect(ROUTES).toContain("/");
  expect(ROUTES).toContain("/journey");
  expect(ROUTES).toContain("/help");
  expect(new Set(ROUTES).size).toBe(ROUTES.length);
});
for (const locale of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`P20AH ${locale} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("home remains readable during a read-only offline toggle", async ({ page, context }) => {
        test.setTimeout(90_000);
        await chooseLanguage(page, locale);
        await visit(page, "/", locale);
        const before = await observeBrowserFrame(page, "/");
        expect(before.language).toBe(locale);
        await context.setOffline(true);
        try {
          // Observe the current mounted document; do not refresh into a potentially uncached route.
          const offline = await observeBrowserFrame(page, "/");
          expect(stateTransitionFindings(before, offline, "offline")).toEqual([]);
          expect(offline.online).toBe(false);
          // The exhaustive axe suite is separate; this one checks the offline cutover's screen contract.
          expect(browserFrameFindings(offline, locale).filter((entry) =>
            ["language-mismatch", "document-title", "main-heading", "main-count", "horizontal-overflow"].includes(entry.code))).toEqual([]);
        } finally {
          await context.setOffline(false);
        }
      });
    });
  }
}
