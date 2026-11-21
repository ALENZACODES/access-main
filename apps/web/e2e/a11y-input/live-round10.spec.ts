import { expect, test } from "@playwright/test";
import { round10Routes, openRound10Route } from "./route-catalog-round10";
import { auditFocusSurfaces, probeCurrentFocus } from "./focus-surface-round10";
import { auditNameRelations } from "./name-relations-round10";
import { auditFeedback } from "./feedback-round10";
import { auditReflowInteractions } from "./reflow-interaction-round10";

/**
 * Each test is discovered by apps/web/playwright.config.ts. The route list
 * comes from current-main router declarations via the existing helper.
 * No branch-specific application imports or non-public data are required.
 */
for (const route of round10Routes()) {
  test.describe(`P16 round 10: ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      await openRound10Route(page, route);
    });

    test("navigation header exposes named, usable keyboard controls", async ({ page }) => {
      const header = page.locator("header.site-header");
      await expect(header).toBeVisible();
      const controls = header.locator("a[href],button");
      expect(await controls.count()).toBeGreaterThan(0);
      const audit = await auditNameRelations(page);
      const missingNames = await controls.evaluateAll((elements) => elements.flatMap((element) => {
        const name = element.getAttribute("aria-label")?.trim() ||
          element.textContent?.trim() || element.getAttribute("title")?.trim();
        return name ? [] : [element.outerHTML.slice(0, 160)];
      }));
      expect(missingNames, `Header control names on ${route}`).toEqual([]);
      expect(audit.controls, `Document control census on ${route}`).toBeGreaterThan(0);
    });

    test("keyboard focus indicator is present on skip link", async ({ page }) => {
      await page.keyboard.press("Tab");
      const focus = await probeCurrentFocus(page);
      expect(focus, `Keyboard focus must enter ${route}`).not.toBeNull();
      expect(focus?.visible, `Keyboard focus visible on ${route}`).toBe(true);
      expect(focus?.focusVisible, `Keyboard focus appearance on ${route}`).toBe(true);
      expect(focus?.issues.filter((issue) => issue.code === "focus-in-hidden-subtree")).toEqual([]);
    });

    test("no positive tabindex or inert focus targets", async ({ page }) => {
      const report = await auditFocusSurfaces(page);
      expect(report.issues.filter((issue) => [
        "positive-tab-order", "focusable-inert-control", "focusable-hidden-control", "focusable-disabled-link",
      ].includes(issue.code)), `Keyboard sequence problems on ${route}`).toEqual([]);
    });

    test("status attributes and page navigation state are internally consistent", async ({ page }) => {
      const report = await auditFeedback(page);
      const contractIssues = report.issues.filter((issue) => [
        "invalid-live-mode", "invalid-live-atomic", "invalid-live-relevant", "invalid-live-busy",
        "silenced-alert", "silenced-status", "invalid-progress-range", "invalid-progress-value",
        "invalid-meter-range", "invalid-meter-value", "multiple-current-pages", "invalid-aria-current",
      ].includes(issue.code));
      expect(contractIssues, `Status semantic issues on ${route}`).toEqual([]);
    });

    test("non-drag alternatives remain present for explicitly authored gestures", async ({ page }) => {
      const report = await auditReflowInteractions(page);
      const gestureIssues = report.issues.filter((issue) => issue.code.startsWith("drag-") ||
        issue.code.startsWith("gesture-") || issue.code.startsWith("motion-"));
      expect(gestureIssues, `Gesture alternatives on ${route}`).toEqual([]);
    });

    test("320px view keeps opt-in gesture alternatives available", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      const report = await auditReflowInteractions(page);
      const gestureIssues = report.issues.filter((issue) => issue.code.startsWith("drag-") ||
        issue.code.startsWith("gesture-") || issue.code.startsWith("motion-"));
      expect(gestureIssues, `Narrow viewport gesture alternatives on ${route}`).toEqual([]);
    });

    test("French shell retains status semantics", async ({ page }) => {
      await page.getByRole("button", { name: "Français" }).first().click();
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      const report = await auditFeedback(page);
      expect(report.issues.filter((issue) => ["invalid-live-mode", "silenced-status", "silenced-alert"].includes(issue.code)),
        `French status semantics on ${route}`).toEqual([]);
    });
  });
}
