import { expect, test } from "@playwright/test";

import { routes, visit } from "./helpers";
import { assertSemantics, auditRoleNames } from "./semantic-round4";
import { assertKeyboardGeometry, auditReflow, auditSkipLink } from "./focus-geometry-round4";
import { assertDeclaredDialog, auditDialogTree, auditDialogTriggers } from "./dialog-round4";
import { assertContentIntegrity, auditLocalizedRoutePair } from "./content-round4";
import { configuredLocalePairs } from "./locale-offline-audit";
import { assertInputPreferences } from "./preferences-round4";

// This spec is discovered automatically by Playwright. Each audit below
// executes on a served application page, not only on synthetic DOM fixtures.
for (const route of routes()) {
  test.describe(`P16D route audit: ${route}`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await visit(page, route, baseURL);
    });

    test("names, roles, references, and widget state are coherent", async ({ page }) => {
      await assertSemantics(page);
      expect(await auditRoleNames(page), "Accessible interactive role names").toEqual([]);
    });

    test("keyboard focus is visible and not fully obscured", async ({ page }) => {
      await assertKeyboardGeometry(page);
    });

    test("320px reflow does not hide primary regions", async ({ page }) => {
      expect(await auditReflow(page), "320px viewport reflow").toEqual([]);
    });

    test("skip navigation reaches its target where provided", async ({ page }) => {
      expect(await auditSkipLink(page), "Skip-link navigation").toEqual([]);
    });

    test("active dialogs and declared openers are valid", async ({ page }) => {
      expect(await auditDialogTree(page), "Dialog semantics").toEqual([]);
      expect(await auditDialogTriggers(page), "Dialog opener references").toEqual([]);
    });

    test("declared dialog openers support Enter, Tab and Escape", async ({ page }) => {
      const triggers = page.locator("[aria-haspopup='dialog'][aria-controls]");
      const count = await triggers.count();
      // Absence of a dialog is not a violation. Each existing trigger is tested.
      for (let index = 0; index < count; index += 1) {
        const trigger = triggers.nth(index);
        if (!(await trigger.isVisible()) || !(await trigger.isEnabled())) continue;
        await assertDeclaredDialog(page, trigger);
      }
    });

    test("200% text and reduced-motion preferences remain usable", async ({ page }) => {
      await assertInputPreferences(page);
    });

    test("language, evidence metadata and UNKNOWN status are intact", async ({ page }) => {
      await assertContentIntegrity(page);
    });
  });
}

for (const [english, french] of configuredLocalePairs()) {
  test(`P16D locale pairing: ${english.path} <> ${french.path}`, async ({ page, baseURL }) => {
    const root = process.env.A11Y_BASE_URL ?? baseURL ?? "http://127.0.0.1:3000";
    const issues = await auditLocalizedRoutePair(
      page,
      new URL(english.path, root).toString(),
      new URL(french.path, root).toString(),
    );
    expect(issues, "Explicitly paired English and French routes").toEqual([]);
  });
}
