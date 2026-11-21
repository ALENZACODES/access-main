import { expect, test } from "@playwright/test";
import { routes, visit } from "./helpers";
import { assertFocusDoesNotNavigate, captureRouteState, inspectSkipLinks } from "./route-stability-round14";

for (const route of routes()) {
  test.describe(`P16 round 14 route stability ${route}`, () => {
    test.beforeEach(async ({ page }) => visit(page, route, "en"));
    test("route state contains a heading and one main landmark", async ({ page }) => {
      const state = await captureRouteState(page);
      expect(state.title.length).toBeGreaterThan(0);
      expect(state.heading.length).toBeGreaterThan(0);
      expect(state.mainCount).toBe(1);
    });
    test("focus does not navigate away from the current route", async ({ page }) => {
      const candidate = page.locator("nav a[href]:not([href='/'])").first();
      if (await candidate.count() === 0) {
        const fallback = page.locator("nav a[href]").first();
        if (await fallback.count() === 0) test.skip(true, "This shell route has no navigation link");
        await fallback.evaluate((node) => node.setAttribute("data-p16-route-focus-candidate", "true"));
      } else {
        await candidate.evaluate((node) => node.setAttribute("data-p16-route-focus-candidate", "true"));
      }
      await assertFocusDoesNotNavigate(page, "[data-p16-route-focus-candidate='true']");
    });
    test("skip-link references resolve", async ({ page }) => {
      expect(await inspectSkipLinks(page)).toEqual([]);
    });
  });
}
