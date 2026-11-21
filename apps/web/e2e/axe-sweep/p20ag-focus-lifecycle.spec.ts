import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { observeDialog, activeFocusSnapshot, pressTabAndObserve, dialogIsOpen } from "./p20ag-browser-focus.ts";
import { focusIssues, disclosureIssues, dialogTabOrder, nextFocusId } from "./p20ag-focus-contracts.ts";

const nativeFixture = `<!doctype html><html lang="en"><head><title>Dialog focus fixture</title>
<style>
*{box-sizing:border-box}body{font:16px/1.5 sans-serif;margin:0;padding:24px}
button,input{min-height:44px;min-width:44px;padding:8px}
:focus-visible{outline:3px solid #174ea6;outline-offset:2px}
dialog{max-width:min(90vw,520px);border:2px solid #333;padding:24px}
dialog::backdrop{background:rgb(0 0 0 / .45)}
</style></head><body>
<main id="background"><h1>Focus ownership</h1><p>The page remains behind the modal.</p>
<button id="open-dialog" type="button">Open dialog</button></main>
<dialog id="modal" aria-labelledby="modal-title" aria-describedby="modal-description" data-trigger-id="open-dialog">
<h2 id="modal-title">Edit your note</h2><p id="modal-description">This is a local example dialog.</p>
<label for="first">Note</label><input id="first" value="Example note">
<button id="close-dialog" type="button" onclick="document.querySelector('#modal').close()">Close dialog</button>
</dialog>
<script>
const dialog=document.querySelector("#modal");
document.querySelector("#open-dialog").addEventListener("click",()=>{dialog.showModal();document.querySelector("#first").focus();});
dialog.addEventListener("close",()=>document.querySelector("#open-dialog").focus());
</script></body></html>`;

const customFixture = `<!doctype html><html lang="en"><head><title>Custom modal focus fixture</title>
<style>*{box-sizing:border-box}body{font:16px/1.5 sans-serif;padding:20px}button{min-width:44px;min-height:44px}:focus-visible{outline:3px solid #174ea6;outline-offset:2px}</style>
</head><body><main id="background" inert aria-hidden="true"><h1>Background content</h1><button>Unavailable behind modal</button></main>
<section id="custom-modal" role="dialog" aria-modal="true" aria-labelledby="custom-title" data-trigger-id="open-custom">
<h2 id="custom-title">Confirm choice</h2><p>Review this local example.</p><button id="custom-action">Continue</button></section></body></html>`;

test.describe("P20AG native dialog focus lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(nativeFixture);
  });

  test("P20AG opening a native modal moves focus into its labelled dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog", { name: "Edit your note" })).toBeVisible();
    await expect(page.locator("#first")).toBeFocused();
    const observed = await observeDialog(page, { dialogId: "modal" });
    expect(observed.open).toBe(true);
    expect(observed.modal).toBe(true);
    expect(observed.activeId).toBe("first");
    expect(focusIssues(observed)).toEqual([]);
  });

  test("P20AG Tab advances through the dialog and wraps to its first control", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.locator("#first")).toBeFocused();
    const first = await pressTabAndObserve(page);
    expect(first.after).toBe("close-dialog");
    const wrap = await pressTabAndObserve(page);
    expect(wrap.after).toBe("first");
  });

  test("P20AG Shift Tab wraps from the first dialog control to the last", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.locator("#first")).toBeFocused();
    const movement = await pressTabAndObserve(page, true);
    expect(movement.after).toBe("close-dialog");
  });

  test("P20AG Escape closes the native dialog and restores focus to its trigger", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator("#open-dialog")).toBeFocused();
    expect(await dialogIsOpen(page, "modal")).toBe(false);
    const focus = await activeFocusSnapshot(page);
    expect(focus.id).toBe("open-dialog");
  });

  test("P20AG explicit close restores focus to the invoking control", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator("#open-dialog")).toBeFocused();
  });

  test("P20AG dialog descendants expose their actual sequential focus order", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click();
    const observed = await observeDialog(page, { dialogId: "modal" });
    expect(dialogTabOrder(observed).map((node) => node.id)).toEqual(["first", "close-dialog"]);
    expect(nextFocusId(dialogTabOrder(observed), "close-dialog")).toBe("first");
  });

  test("P20AG native dialog has no axe violations while open", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });

  test("P20AG native dialog has no axe violations after close", async ({ page }) => {
    await page.getByRole("button", { name: "Open dialog" }).click();
    await page.keyboard.press("Escape");
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });

  test("P20AG keyboard-only dialog opening and closing does not lose focus", async ({ page }) => {
    await page.locator("#open-dialog").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#first")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#close-dialog")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#open-dialog")).toBeFocused();
  });

  test("P20AG focus indicator is visible on the active control", async ({ page }) => {
    await page.locator("#open-dialog").focus();
    const style = await page.locator("#open-dialog").evaluate((element) => {
      const css = getComputedStyle(element);
      return { outlineStyle: css.outlineStyle, outlineWidth: css.outlineWidth };
    });
    expect(style.outlineStyle).not.toBe("none");
    expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThan(0);
  });
});

test.describe("P20AG custom modal and disclosure semantics", () => {
  test("P20AG custom modal records background inertness and active focus", async ({ page }) => {
    await page.setContent(customFixture);
    await page.locator("#custom-action").focus();
    const observed = await observeDialog(page, { dialogId: "custom-modal" });
    expect(observed.open).toBe(true);
    expect(observed.modal).toBe(true);
    expect(observed.backgroundInert).toBe(true);
    expect(observed.activeId).toBe("custom-action");
    expect(focusIssues(observed)).toEqual([]);
  });

  test("P20AG custom modal keeps background controls out of the sequential focus order", async ({ page }) => {
    await page.setContent(customFixture);
    const observed = await observeDialog(page, { dialogId: "custom-modal" });
    expect(dialogTabOrder(observed).map((node) => node.id)).toEqual(["custom-action"]);
  });

  test("P20AG custom modal has no axe violations", async ({ page }) => {
    await page.setContent(customFixture);
    await page.locator("#custom-action").focus();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });

  test("P20AG disclosure updates expanded state and panel visibility together", async ({ page }) => {
    await page.setContent(`<main><h1>Questions</h1><button id="toggle" aria-expanded="false" aria-controls="answer">Show answer</button><div id="answer" hidden>Answer details</div></main>`);
    await page.locator("#toggle").focus();
    await page.keyboard.press("Space");
    const state = await page.evaluate(() => ({
      expanded: document.querySelector("#toggle")?.getAttribute("aria-expanded") === "true",
      visible: !(document.querySelector("#answer") as HTMLElement).hidden,
    }));
    expect(disclosureIssues({ id: "toggle", expanded: state.expanded, panelVisible: state.visible,
      controlsId: "answer", panelId: "answer", summaryFocusable: true, summaryName: "Show answer" })).toEqual([]);
  });

  test("P20AG collapsed disclosure keeps its panel hidden", async ({ page }) => {
    await page.setContent(`<main><h1>Questions</h1><details><summary>More details</summary><p>Hidden until expanded.</p></details></main>`);
    const summary = page.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("details")).toHaveAttribute("open", "");
    await expect(page.locator("details p")).toBeVisible();
  });

  test("P20AG custom modal does not expose a focusable element behind its boundary", async ({ page }) => {
    await page.setContent(customFixture);
    const observed = await observeDialog(page, { dialogId: "custom-modal" });
    expect(observed.nodes.filter((node) => node.scopeId === null && node.focusable && node.tabIndex >= 0 && !node.inert)).toEqual([]);
  });
});


test("P20AG French native dialog announces its French title and restores its trigger", async ({ page }) => {
  await page.setContent(`<!doctype html><html lang="fr"><head><title>Dialogue</title>
  <style>button,input{min-height:44px;min-width:44px}:focus-visible{outline:3px solid #174ea6}</style></head>
  <body><main><h1>Gestion du focus</h1><button id="ouvrir">Ouvrir le dialogue</button></main>
  <dialog id="dialogue" aria-labelledby="titre" data-trigger-id="ouvrir"><h2 id="titre">Modifier la note</h2>
  <label for="champ">Note</label><input id="champ" value="Exemple"><button id="fermer" onclick="document.querySelector('#dialogue').close()">Fermer</button></dialog>
  <script>const d=document.querySelector('#dialogue');document.querySelector('#ouvrir').onclick=()=>{d.showModal();document.querySelector('#champ').focus();};d.addEventListener('close',()=>document.querySelector('#ouvrir').focus());</script>
  </body></html>`);
  await page.getByRole("button", { name: "Ouvrir le dialogue" }).click();
  await expect(page.getByRole("dialog", { name: "Modifier la note" })).toBeVisible();
  await expect(page.locator("#champ")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#ouvrir")).toBeFocused();
});

test("P20AG French custom dialog has a labelled modal boundary and axe-clean controls", async ({ page }) => {
  await page.setContent(`<!doctype html><html lang="fr"><head><title>Confirmation</title>
  <style>button{min-height:44px;min-width:44px}:focus-visible{outline:3px solid #174ea6}</style></head>
  <body><main id="fond" inert aria-hidden="true"><h1>Préférences</h1><button>Action indisponible</button></main>
  <section id="boite" role="dialog" aria-modal="true" aria-labelledby="titre"><h2 id="titre">Confirmer le choix</h2>
  <p>Exemple local de dialogue.</p><button id="continuer">Continuer</button></section></body></html>`);
  await page.keyboard.press("Tab");
  await expect(page.locator("#continuer")).toBeFocused();
  const observed = await observeDialog(page, { dialogId: "boite" });
  expect(observed.backgroundInert).toBe(true);
  expect(focusIssues(observed)).toEqual([]);
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});
