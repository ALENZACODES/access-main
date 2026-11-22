import { expect, test } from "@playwright/test";
import { routes, visit } from "./helpers";
import { inspectSemanticSurface } from "./semantic-surface-round14";
import { traceTabOrder } from "./focus-lifecycle-round14";
import { inspectFormFeedback } from "./form-feedback-round14";
import { inspectDialogFocus } from "./dialog-focus-round14";
import { inspectAnnouncements } from "./announcement-round14";
import { inspectLocaleContract } from "./locale-contract-round14";
import { captureRouteState, inspectSkipLinks } from "./route-stability-round14";

for (const route of routes()) {
  test.describe(`P16 round 14 live route ${route}`, () => {
    test.beforeEach(async ({ page }) => visit(page, route, "en"));
    test("route renders stable document structure", async ({ page }) => {
      const state = await captureRouteState(page);
      expect(state.title.length).toBeGreaterThan(0);
      expect(state.heading.length).toBeGreaterThan(0);
      expect(state.mainCount).toBe(1);
    });
    test("route exposes document language and semantic snapshot", async ({ page }) => {
      const snapshot = await inspectSemanticSurface(page);
      expect(snapshot.language.toLowerCase()).toMatch(/^en(?:-|$)/);
      expect(snapshot.title.length).toBeGreaterThan(0);
      expect(snapshot.mains).toBe(1);
    });
    test("route Tab sequence terminates without hidden or disabled stops", async ({ page }) => {
      const trace = await traceTabOrder(page, 140);
      expect(trace.complete, `Tab trace stopped at ${trace.stop}`).toBe(true);
      expect(trace.issues.filter(issue => ["focus-hidden","focus-disabled","focus-positive-tabindex","focus-unnamed","focus-small-target","focus-indicator"].includes(issue.code))).toEqual([]);
    });
    test("route form fields have names and connected errors", async ({ page }) => {
      expect((await inspectFormFeedback(page)).issues).toEqual([]);
    });
    test("route dialog triggers and visible dialogs are coherent", async ({ page }) => {
      expect((await inspectDialogFocus(page)).issues).toEqual([]);
    });
    test("route announcements use valid live priorities", async ({ page }) => {
      expect((await inspectAnnouncements(page)).issues).toEqual([]);
    });
    test("route skip links resolve to existing targets", async ({ page }) => {
      expect(await inspectSkipLinks(page)).toEqual([]);
    });
    test("route locale text is structurally valid", async ({ page }) => {
      expect(await inspectLocaleContract(page)).toEqual([]);
    });
  });
}
