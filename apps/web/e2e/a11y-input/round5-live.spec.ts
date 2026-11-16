import { expect, test } from "@playwright/test";

import { routes, visit } from "./helpers";
import { assertFormSemantics } from "./forms-round5";
import { assertCompositeSemantics } from "./composites-round5";
import { assertAnnouncements } from "./announcements-round5";
import { assertDataDisplays } from "./tables-round5";
import { assertRouteContinuity } from "./route-continuity-round5";
import { assertOperability } from "./operability-round5";
import { assertOfflineRecovery, configuredResilienceRoutes } from "./offline-resilience-round5";

/** Each test runs on the deployed application, using the existing Playwright runner. */
for (const route of routes()) {
  test.describe(`P16 round 5 input and semantics: ${route}`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await visit(page, route, baseURL);
    });

    test("fields, error messages, and groups retain programmatic names", async ({ page }) => {
      await assertFormSemantics(page);
    });

    test("tabs, listboxes, menus, trees, and disclosures expose coherent state", async ({ page }) => {
      await assertCompositeSemantics(page);
    });

    test("status messages and progress indicators remain accessible", async ({ page }) => {
      await assertAnnouncements(page);
    });

    test("data displays and list alternatives preserve text access", async ({ page }) => {
      await assertDataDisplays(page);
    });

    test("navigation landmarks, skip links, and route transitions work", async ({ page }) => {
      await assertRouteContinuity(page);
    });

    test("dragging and gesture alternatives preserve keyboard operability", async ({ page }) => {
      await assertOperability(page);
    });
  });
}

for (const route of configuredResilienceRoutes()) {
  test(`P16 round 5 offline shell: ${route}`, async ({ page, context, baseURL }) => {
    await visit(page, route, baseURL);
    const original = page.url();
    expect(new URL(original).pathname).toBe(route);
    await assertOfflineRecovery(page, context, original);
  });
}

for (const route of routes()) {
  test(`P16 round 5 focus path: ${route}`, async ({ page, baseURL }) => {
    await visit(page, route, baseURL);
    const { assertFocusPath } = await import("./focus-path-round5");
    await assertFocusPath(page);
  });
}
