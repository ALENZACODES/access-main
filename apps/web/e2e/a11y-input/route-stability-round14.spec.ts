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
      await assertFocusDoesNotNavigate(page, candidate);
    });
    test("skip-link references resolve", async ({ page }) => {
      expect(await inspectSkipLinks(page)).toEqual([]);
    });
  });
}
