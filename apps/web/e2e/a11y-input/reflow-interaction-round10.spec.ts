import { expect, test, type Page } from "@playwright/test";
import {
  auditReflowInteractions, describeReflow, type ReflowCode,
} from "./reflow-interaction-round10";

async function fixture(page: Page, markup: string, css = ""): Promise<void> {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.setContent(`<!doctype html><html lang="en"><head>
    <title>Reflow fixture</title><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>*{box-sizing:border-box}body{margin:0;padding:8px;font:18px sans-serif}
    button,a,input{min-width:44px;min-height:44px}${css}</style></head><body>
    <main><h1>Reflow fixture</h1>${markup}</main></body></html>`);
}

async function expectCode(page: Page, markup: string, code: ReflowCode, css = ""): Promise<void> {
  await fixture(page, markup, css);
  const report = await auditReflowInteractions(page);
  expect(report.issues.map((issue) => issue.code), describeReflow(report)).toContain(code);
}

test.describe("P16 round 10: reflow and interaction alternatives", () => {
  test("a narrow responsive document has no horizontal overflow", async ({ page }) => {
    await fixture(page, `<p style="overflow-wrap:anywhere">Responsive content remains readable.</p>`);
    const report = await auditReflowInteractions(page);
    expect(report.documentWidth).toBeLessThanOrEqual(322);
    expect(report.issues).toEqual([]);
  });

  test("an oversized fixed-width region overflows a narrow viewport", async ({ page }) => {
    await expectCode(page, `<div style="width:700px;height:60px;background:#ddd">Oversized</div>`,
      "document-overflows-horizontally");
  });

  test("a control outside document horizontal bounds is reported", async ({ page }) => {
    await expectCode(page, `<button id="outside" style="position:absolute;left:-90px">Lost</button>`,
      "control-overflows-horizontally");
  });

  test("44px button exactly passes", async ({ page }) => {
    await fixture(page, `<button style="width:44px;height:44px;padding:0">OK</button>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("39px button is rejected", async ({ page }) => {
    await expectCode(page, `<button style="width:39px;height:44px;min-width:0;padding:0">OK</button>`,
      "touch-target-undersized");
  });

  test("39px tall button is rejected", async ({ page }) => {
    await expectCode(page, `<button style="width:44px;height:39px;min-height:0;padding:0">OK</button>`,
      "touch-target-undersized");
  });

  test("tiny action link is rejected", async ({ page }) => {
    await expectCode(page,
      `<a href="/help" style="display:inline-flex;min-width:0;min-height:0;width:35px;height:35px">Go</a>`,
      "touch-target-undersized");
  });

  test("inline sentence link uses the inline exception", async ({ page }) => {
    await fixture(page, `<p>Read the <a style="min-width:0;min-height:0" href="/help">help</a> first.</p>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("checkbox uses larger explicit label hit area", async ({ page }) => {
    await fixture(page, `<label style="display:flex;min-width:100px;min-height:48px">
      <input type="checkbox" style="min-width:0;min-height:0;width:14px;height:14px"> Agree</label>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("checkbox without label hit area is rejected", async ({ page }) => {
    await expectCode(page, `<input type="checkbox" aria-label="Agree"
      style="min-width:0;min-height:0;width:14px;height:14px">`, "touch-target-undersized");
  });

  test("radio without label hit area is rejected", async ({ page }) => {
    await expectCode(page, `<input type="radio" aria-label="Option"
      style="min-width:0;min-height:0;width:14px;height:14px">`, "touch-target-undersized");
  });

  test("drag operation without alternate control is reported", async ({ page }) => {
    await expectCode(page, `<div data-a11y-drag-operation draggable="true">Drag</div>`,
      "drag-action-without-keyboard-alternative");
  });

  test("drag operation referencing missing alternate control is reported", async ({ page }) => {
    await expectCode(page, `<div data-a11y-drag-operation data-a11y-drag-alternative="missing">Drag</div>`,
      "drag-alternative-not-found");
  });

  test("drag operation pointing to inert text is rejected", async ({ page }) => {
    await expectCode(page, `<div data-a11y-drag-operation data-a11y-drag-alternative="text">Drag</div>
      <p id="text">Move using other controls</p>`, "drag-alternative-not-operable");
  });

  test("drag operation with button alternative passes", async ({ page }) => {
    await fixture(page, `<div data-a11y-drag-operation data-a11y-drag-alternative="move">Drag</div>
      <button id="move">Move item</button>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("multipoint gesture without an alternative is reported", async ({ page }) => {
    await expectCode(page, `<div data-a11y-multipoint-gesture>Pinch</div>`,
      "gesture-without-single-pointer-alternative");
  });

  test("multipoint gesture pointing to absent control is reported", async ({ page }) => {
    await expectCode(page, `<div data-a11y-multipoint-gesture data-a11y-single-pointer="missing">Pinch</div>`,
      "gesture-alternative-not-found");
  });

  test("multipoint gesture pointing to paragraph is rejected", async ({ page }) => {
    await expectCode(page, `<div data-a11y-multipoint-gesture data-a11y-single-pointer="tip">Pinch</div>
      <p id="tip">Tap twice</p>`, "gesture-alternative-not-operable");
  });

  test("multipoint gesture with single-pointer button passes", async ({ page }) => {
    await fixture(page, `<div data-a11y-multipoint-gesture data-a11y-single-pointer="zoom">Pinch</div>
      <button id="zoom">Zoom in</button>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("motion gesture without standard control is reported", async ({ page }) => {
    await expectCode(page, `<div data-a11y-motion-gesture>Shake device</div>`,
      "motion-without-alternative");
  });

  test("motion gesture with absent fallback is reported", async ({ page }) => {
    await expectCode(page, `<div data-a11y-motion-gesture data-a11y-motion-alternative="missing">Shake</div>`,
      "motion-alternative-not-found");
  });

  test("motion gesture with non-interactive fallback is rejected", async ({ page }) => {
    await expectCode(page, `<div data-a11y-motion-gesture data-a11y-motion-alternative="tip">Shake</div>
      <div id="tip">Tap the screen</div>`, "motion-alternative-not-operable");
  });

  test("motion gesture with standard button passes", async ({ page }) => {
    await fixture(page, `<div data-a11y-motion-gesture data-a11y-motion-alternative="reset">Shake</div>
      <button id="reset">Reset position</button>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("inert alternate button is rejected", async ({ page }) => {
    await expectCode(page, `<div data-a11y-drag-operation data-a11y-drag-alternative="move">Drag</div>
      <div inert><button id="move">Move</button></div>`, "drag-alternative-not-operable");
  });

  test("disabled alternate button is rejected", async ({ page }) => {
    await expectCode(page, `<div data-a11y-motion-gesture data-a11y-motion-alternative="reset">Shake</div>
      <button id="reset" disabled>Reset</button>`, "motion-alternative-not-operable");
  });

  test("semantic link can provide a keyboard alternative", async ({ page }) => {
    await fixture(page, `<div data-a11y-drag-operation data-a11y-drag-alternative="edit">Drag</div>
      <a id="edit" href="/edit" style="display:inline-flex;min-height:44px;min-width:44px;align-items:center">Edit order</a>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("custom focusable control can provide alternate interaction", async ({ page }) => {
    await fixture(page, `<div data-a11y-multipoint-gesture data-a11y-single-pointer="zoom">Pinch</div>
      <div id="zoom" role="button" tabindex="0" style="width:90px;height:48px">Zoom in</div>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("opted-in horizontal scroller with no tabindex is reported", async ({ page }) => {
    await expectCode(page, `<div data-a11y-keyboard-scroller aria-label="Options"
      style="overflow:auto;width:100px;height:60px"><div style="width:400px">Options</div></div>`,
      "keyboard-inaccessible-scroller");
  });

  test("opted-in scroller without accessible name is reported", async ({ page }) => {
    await expectCode(page, `<div data-a11y-keyboard-scroller tabindex="0"
      style="overflow:auto;width:100px;height:60px"><div style="width:400px">Options</div></div>`,
      "scrollable-region-without-name");
  });

  test("opted-in scroller with keyboard access and name passes", async ({ page }) => {
    await fixture(page, `<div data-a11y-keyboard-scroller tabindex="0" aria-label="Options"
      style="overflow:auto;width:100px;height:60px"><div style="width:400px">Options</div></div>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("an ordinary scroll container is counted without requiring opt-in labels", async ({ page }) => {
    await fixture(page, `<div style="overflow:auto;width:100px;height:50px"><div style="width:400px">Text</div></div>`);
    const result = await auditReflowInteractions(page);
    expect(result.scrollableRegions).toBeGreaterThan(0);
    expect(result.issues).toEqual([]);
  });

  test("report tracks action and gesture counts", async ({ page }) => {
    await fixture(page, `<button id="move">Move</button>
      <div data-a11y-drag-operation data-a11y-drag-alternative="move">Drag</div>`);
    const report = await auditReflowInteractions(page);
    expect(report.actionTargets).toBe(1);
    expect(report.gestureControls).toBe(1);
  });

  test("audit does not activate fallback controls", async ({ page }) => {
    await fixture(page, `<button id="move" onclick="document.body.dataset.moved='yes'">Move</button>
      <div data-a11y-drag-operation data-a11y-drag-alternative="move">Drag</div>`);
    await auditReflowInteractions(page);
    expect(await page.locator("body").getAttribute("data-moved")).toBeNull();
  });

  test("audit does not change focus", async ({ page }) => {
    await fixture(page, `<button id="move">Move</button>`);
    await page.locator("#move").focus();
    await auditReflowInteractions(page);
    await expect(page.locator("#move")).toBeFocused();
  });

  test("diagnostic rendering retains issue code", async ({ page }) => {
    await fixture(page, `<div data-a11y-motion-gesture>Shake</div>`);
    const report = await auditReflowInteractions(page);
    expect(describeReflow(report)).toContain("motion-without-alternative");
  });

  test("French action labels do not affect structural alternatives", async ({ page }) => {
    await fixture(page, `<div data-a11y-drag-operation data-a11y-drag-alternative="deplacer">Glisser</div>
      <button id="deplacer">Déplacer</button>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });
});
