import { expect, test } from "@playwright/test";
import { auditRouteContinuityRound11 } from "./route-continuity-round11";
import { auditDisclosureContractsRound11, exerciseOptInDialogRound11 } from "./disclosure-contract-round11";
import { auditDataViewsRound11 } from "./data-view-round11";
import { auditKeyboardGuidanceRound11 } from "./keyboard-guidance-round11";
import { observeHandoffFocusRound11, assertNoRouteFocusStealRound11 } from "./focus-handoff-round11";
import { round11Routes, formatRound11Findings } from "./route-catalog-round11";

for (const route of round11Routes()) {
  test.describe(`Round 11 keyboard contracts on ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.ok(), `${route} must load`).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator("main [role='status']").filter({ hasText: /^(Loading|Chargement)/ })).toHaveCount(0);
    });

    test("navigation and skip targets expose usable destinations", async ({ page }) => {
      const result = await auditRouteContinuityRound11(page);
      expect(result.findings, formatRound11Findings(result.findings)).toEqual([]);
    });

    test("disclosures, native details and visible dialogs have coherent state", async ({ page }) => {
      const result = await auditDisclosureContractsRound11(page);
      expect(result.findings, formatRound11Findings(result.findings)).toEqual([]);
    });

    test("tables, grids and selection widgets expose keyboard semantics", async ({ page }) => {
      const result = await auditDataViewsRound11(page);
      expect(result.findings, formatRound11Findings(result.findings)).toEqual([]);
    });

    test("shortcuts, descriptions and gesture alternatives have input contracts", async ({ page }) => {
      const result = await auditKeyboardGuidanceRound11(page);
      expect(result.findings, formatRound11Findings(result.findings)).toEqual([]);
    });

    test("preloading by keyboard focus does not navigate or steal focus", async ({ page }) => {
      const nav = page.getByRole("navigation").first();
      const links = nav.getByRole("link");
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
      const link = links.first();
      await link.focus();
      await expect(link).toBeFocused();
      const startingRoute = new URL(page.url()).pathname;
      const starting = await observeHandoffFocusRound11(page);
      await assertNoRouteFocusStealRound11(page);
      const after = await observeHandoffFocusRound11(page);
      expect(after.target).toBe(starting.target);
      expect(new URL(page.url()).pathname).toBe(startingRoute);
    });

    test("declared non-destructive dialog openers close on Escape", async ({ page }) => {
      const safe = page.locator('[data-a11y-safe-dialog-trigger="true"]:visible').first();
      if (!(await safe.count())) {
        test.skip(true, "This route has no opted-in dialog activation");
        return;
      }
      const observation = await exerciseOptInDialogRound11(page, safe);
      expect(observation).toEqual({
        opened: true,
        initiallyInside: true,
        trapped: true,
        closedByEscape: true,
        focusRestored: true,
      });
    });
  });
}

for (const route of round11Routes()) {
  test.describe(`Round 11 French keyboard semantics on ${route}`, () => {
    test("language switch retains navigation and input structure", async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const control = page.getByRole("button", { name: "Français" }).first();
      await expect(control).toBeVisible();
      await control.click();
      await expect(page.locator("html")).toHaveAttribute("lang", /^fr/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const navigation = await auditRouteContinuityRound11(page);
      const guidance = await auditKeyboardGuidanceRound11(page);
      const disclosures = await auditDisclosureContractsRound11(page);
      const dataViews = await auditDataViewsRound11(page);
      expect(navigation.findings, formatRound11Findings(navigation.findings)).toEqual([]);
      expect(guidance.findings, formatRound11Findings(guidance.findings)).toEqual([]);
      expect(disclosures.findings, formatRound11Findings(disclosures.findings)).toEqual([]);
      expect(dataViews.findings, formatRound11Findings(dataViews.findings)).toEqual([]);
    });
  });
}
