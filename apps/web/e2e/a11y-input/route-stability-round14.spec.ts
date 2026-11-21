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
      const candidate = page.locator("nav a[href]").first();
      if (await candidate.count() === 0) test.skip(true, "This shell route has no navigation link");
      const selector = await candidate.evaluate((node) => node.id ? `#${CSS.escape(node.id)}` : `a[href="${node.getAttribute("href")}"]`);
      await assertFocusDoesNotNavigate(page, selector);
    });
    test("skip-link references resolve", async ({ page }) => {
      expect(await inspectSkipLinks(page)).toEqual([]);
    });
  });
}
