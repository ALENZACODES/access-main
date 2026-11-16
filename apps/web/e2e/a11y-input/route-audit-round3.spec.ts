import { expect, test } from "@playwright/test";

import { routes, visit } from "./helpers";
import {
  assertWalk, inspectFocusOrder, inspectTargetSizes,
  observeFocus, resetSequentialFocus, walkSequentialFocus,
} from "./navigation-audit";
import {
  activeDialog, assertDialogContract, declaredDialogIssues,
  declaredDialogOpeners, exerciseDialogEscape, inspectOpenDialogs,
} from "./dialog-audit";
import {
  assertDocumentLanguage, assertOfflineObservation,
  configuredLocalePairs, configuredOfflineRoutes,
  inspectEvidenceLabels, inspectFrenchPunctuation, observeOfflineShell,
} from "./locale-offline-audit";

// These specifications run against the served application, not an inert DOM
// fixture. Every configured route is required to return a successful response.
for (const path of routes()) {
  test.describe(`P16C live route input audit: ${path}`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await visit(page, path, baseURL);
    });

    test("reverse Tab traversal mirrors forward navigation", async ({ page }) => {
      const walk = await walkSequentialFocus(page);
      assertWalk(walk);
    });

    test("focus order avoids positive tabindex and hidden content", async ({ page }) => {
      const issues = await inspectFocusOrder(page);
      expect(issues, "Sequential keyboard order issues").toEqual([]);
    });

    test("keyboard focus lands on a visible, enabled target", async ({ page }) => {
      await resetSequentialFocus(page);
      await page.keyboard.press("Tab");
      const first = await observeFocus(page);
      expect(first, "At least one keyboard target is expected").not.toBeNull();
      expect(first?.rendered).toBe(true);
      expect(first?.ariaHidden).toBe(false);
      expect(first?.disabled).toBe(false);
    });

    test("buttons, tabs and navigation targets meet the 44px minimum", async ({ page }) => {
      const issues = await inspectTargetSizes(page);
      expect(issues, "Target-size failures").toEqual([]);
    });

    test("declared dialog openers are keyboard discoverable", async ({ page }) => {
      const issues = await declaredDialogIssues(page);
      expect(issues, "Dialog trigger semantics").toEqual([]);
    });

    test("visible dialogs have names and contain modal focus", async ({ page }) => {
      const issues = await inspectOpenDialogs(page);
      expect(issues, "Dialog structural issues").toEqual([]);
    });

    test("Escape closes the first declared dialog and returns focus", async ({ page }) => {
      const opener = declaredDialogOpeners(page).first();
      if (await opener.count() === 0) {
        test.skip(true, "No explicitly declared dialog trigger on this route");
      }
      const result = await exerciseDialogEscape(page, opener);
      assertDialogContract(result);
      expect(await activeDialog(page).count(), "No dialog should remain open").toBe(0);
    });

    test("displayed evidence preserves source, licence, date and UNKNOWN", async ({ page }) => {
      const issues = await inspectEvidenceLabels(page);
      expect(issues, "Evidence metadata or UNKNOWN-state issues").toEqual([]);
    });

    test("French opt-in copy follows typography rules", async ({ page }) => {
      const lang = await page.locator("html").getAttribute("lang");
      if (!lang?.toLowerCase().startsWith("fr")) {
        test.skip(true, "French typography check applies to French routes");
      }
      const issues = await inspectFrenchPunctuation(page);
      expect(issues, "French punctuation issues").toEqual([]);
    });
  });
}

// Configure real English/French pairs; no path patterns are invented here.
for (const [english, french] of configuredLocalePairs()) {
  test.describe(`Locale parity: ${english.path} / ${french.path}`, () => {
    test("both routes expose correct document language and structure", async ({ page, baseURL }) => {
      await visit(page, english.path, baseURL);
      await assertDocumentLanguage(page, "en");
      await visit(page, french.path, baseURL);
      await assertDocumentLanguage(page, "fr");
    });

    test("both routes preserve keyboard navigation", async ({ page, baseURL }) => {
      for (const locale of [english, french]) {
        await visit(page, locale.path, baseURL);
        const walk = await walkSequentialFocus(page);
        assertWalk(walk);
      }
    });

    test("both routes expose targets sized for switch input", async ({ page, baseURL }) => {
      for (const locale of [english, french]) {
        await visit(page, locale.path, baseURL);
        expect(await inspectTargetSizes(page), `${locale.language} target sizes`).toEqual([]);
      }
    });

    test("both languages retain explicit evidence details", async ({ page, baseURL }) => {
      for (const locale of [english, french]) {
        await visit(page, locale.path, baseURL);
        expect(await inspectEvidenceLabels(page), `${locale.language} evidence details`)
          .toEqual([]);
      }
    });
  });
}

// Offline opt-in is explicit: do not claim that every app route or dataset
// works without connectivity simply because the browser has cached a shell.
for (const path of configuredOfflineRoutes()) {
  test.describe(`Offline route: ${path}`, () => {
    test("main shell remains available after a warm visit", async ({ page, context, baseURL }) => {
      await visit(page, path, baseURL);
      const url = page.url();
      const observation = await observeOfflineShell(context, page, url);
      assertOfflineObservation(observation, false);
    });

    test("an offline route restores connectivity after the check", async ({ page, context, baseURL }) => {
      await visit(page, path, baseURL);
      await observeOfflineShell(context, page, page.url());
      const response = await page.reload({ waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);
    });
  });
}
