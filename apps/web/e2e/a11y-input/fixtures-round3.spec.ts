import { expect, test } from "@playwright/test";

import {
  assertWalk, inspectFocusOrder, inspectTargetSizes,
  resetSequentialFocus, walkSequentialFocus,
} from "./navigation-audit";
import {
  activeDialog, assertDialogContract, declaredDialogIssues,
  declaredDialogOpeners, escapeTopmostDialog, exerciseDialogEscape,
  exerciseExplicitCloseButton, inspectOpenDialogs,
} from "./dialog-audit";
import {
  inspectEvidenceLabels, inspectFrenchPunctuation,
} from "./locale-offline-audit";

const fixture = `<!doctype html>
<html lang="en"><head><title>Keyboard fixture</title>
<style>
  button, a { min-width: 44px; min-height: 44px; }
  :focus-visible { outline: 3px solid #193f72; outline-offset: 3px; }
  dialog { padding: 2rem; }
</style></head><body>
<main>
  <h1>Keyboard fixture</h1>
  <button id="first" type="button">First</button>
  <button id="open" type="button" aria-haspopup="dialog" aria-controls="modal">Open</button>
  <button id="last" type="button">Last</button>
  <dialog id="modal" aria-labelledby="dialog-title">
    <h2 id="dialog-title">Dialog</h2>
    <button id="close" type="button">Close</button>
  </dialog>
</main>
<script>
  const opener = document.querySelector('#open');
  const dialog = document.querySelector('#modal');
  opener.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', () => opener.focus());
  document.querySelector('#close').addEventListener('click', () => dialog.close());
</script>
</body></html>`;

test.describe("P16C deterministic regressions", () => {
  test("bounded Tab walk returns through the same focus sequence", async ({ page }) => {
    await page.setContent(fixture);
    const walk = await walkSequentialFocus(page);
    assertWalk(walk);
    expect(walk.forward.map((item) => item.selector)).toEqual([
      "#first", "#open", "#last",
    ]);
    expect(walk.backwards.map((item) => item.selector)).toEqual([
      "#open", "#first",
    ]);
  });

  test("focus starts outside the tab order and enters with Tab", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("#last").focus();
    await resetSequentialFocus(page);
    await page.keyboard.press("Tab");
    await expect(page.locator("#first")).toBeFocused();
  });

  test("positive tabindex is reported rather than silently reordered", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("#last").evaluate((node) => node.setAttribute("tabindex", "2"));
    const issues = await inspectFocusOrder(page);
    expect(issues.some((issue) => issue.reason.includes("Positive tabindex"))).toBe(true);
  });

  test("focusable aria-hidden controls are reported", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("#last").evaluate((node) => node.setAttribute("aria-hidden", "true"));
    const issues = await inspectFocusOrder(page);
    expect(issues.some((issue) => issue.reason.includes("hidden or inert"))).toBe(true);
  });

  test("button smaller than 44 pixels is reported", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("#first").evaluate((node) => {
      node.style.minWidth = "0";
      node.style.minHeight = "0";
      node.style.width = "30px";
      node.style.height = "30px";
    });
    const issues = await inspectTargetSizes(page);
    expect(issues.some((issue) => issue.selector === "#first")).toBe(true);
  });

  test("normal fixture has no undersized interactive targets", async ({ page }) => {
    await page.setContent(fixture);
    expect(await inspectTargetSizes(page)).toEqual([]);
  });

  test("declared modal opens by keyboard and Escape restores focus", async ({ page }) => {
    await page.setContent(fixture);
    const opener = declaredDialogOpeners(page).first();
    const contract = await exerciseDialogEscape(page, opener);
    assertDialogContract(contract);
    await expect(activeDialog(page)).toHaveCount(0);
  });

  test("dialog names and opener references are valid", async ({ page }) => {
    await page.setContent(fixture);
    expect(await declaredDialogIssues(page)).toEqual([]);
    await page.locator("#open").click();
    expect(await inspectOpenDialogs(page)).toEqual([]);
  });

  test("missing dialog label is detected", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("#modal").evaluate((node) => node.removeAttribute("aria-labelledby"));
    await page.locator("#open").click();
    const issues = await inspectOpenDialogs(page);
    expect(issues.some((item) => item.reason.includes("no accessible name"))).toBe(true);
  });

  test("missing aria-controls destination is detected", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("#open").evaluate((node) => node.setAttribute("aria-controls", "missing"));
    const issues = await declaredDialogIssues(page);
    expect(issues.some((item) => item.reason.includes("missing aria-controls"))).toBe(true);
  });

  test("modal closes via a dedicated keyboard-operated close button", async ({ page }) => {
    await page.setContent(fixture);
    await exerciseExplicitCloseButton(
      page, page.locator("#open"), (dialog) => dialog.locator("#close"),
    );
  });

  test("Escape dismisses one topmost native modal", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("#open").click();
    await escapeTopmostDialog(page);
    await expect(page.locator("#open")).toBeFocused();
  });

  test("missing evidence metadata is reported", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("main").evaluate((main) => {
      const card = document.createElement("section");
      card.setAttribute("data-a11y-evidence-record", "");
      card.setAttribute("data-accessibility-state", "UNKNOWN");
      main.appendChild(card);
    });
    const issues = await inspectEvidenceLabels(page);
    expect(issues.map((issue) => issue.reason)).toEqual([
      "Missing source", "Missing licence", "Missing or invalid source date",
    ]);
  });

  test("UNKNOWN facts with source, licence and date remain UNKNOWN", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("main").evaluate((main) => {
      const card = document.createElement("section");
      card.setAttribute("data-a11y-evidence-record", "");
      card.setAttribute("data-source", "Sample local test fixture");
      card.setAttribute("data-licence", "CC0-1.0");
      card.setAttribute("data-observed-date", "2026-11-15");
      card.setAttribute("data-accessibility-state", "UNKNOWN");
      main.appendChild(card);
    });
    expect(await inspectEvidenceLabels(page)).toEqual([]);
  });

  test("inferred UNKNOWN results are rejected", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("main").evaluate((main) => {
      const card = document.createElement("section");
      card.setAttribute("data-a11y-evidence-record", "");
      card.setAttribute("data-source", "Sample local test fixture");
      card.setAttribute("data-licence", "CC0-1.0");
      card.setAttribute("data-observed-date", "2026-11-15");
      card.setAttribute("data-accessibility-state", "UNKNOWN");
      card.setAttribute("data-inferred", "true");
      main.appendChild(card);
    });
    const issues = await inspectEvidenceLabels(page);
    expect(issues.some((item) => item.reason.includes("must not be inferred"))).toBe(true);
  });

  test("French localized punctuation is inspected only when opted in", async ({ page }) => {
    await page.setContent(fixture);
    await page.locator("main").evaluate((main) => {
      const node = document.createElement("p");
      node.setAttribute("data-a11y-localized-copy", "");
      node.textContent = "Exemple : question ?";
      main.appendChild(node);
    });
    const issues = await inspectFrenchPunctuation(page);
    expect(issues.some((issue) => issue.reason.includes("U+202F"))).toBe(true);
  });
});
