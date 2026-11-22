import { expect, test } from "@playwright/test";
import { assertSliderKeyboard, inspectGestureAlternatives } from "./gesture-alternatives-round14";

async function fixture(page: import("@playwright/test").Page, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Gesture fixture</title><style>button{min-width:44px;min-height:44px}</style></head><body><main><h1>Gesture fixture</h1>${body}</main></body></html>`);
}
test.describe("P16 round 14 gesture alternatives", () => {
  test("native button is a keyboard alternative", async ({ page }) => {
    await fixture(page, `<button>Move up</button>`);
    expect((await inspectGestureAlternatives(page)).issues).toEqual([]);
  });
  test("unnamed gesture control is rejected", async ({ page }) => {
    await fixture(page, `<div data-gesture-action="drag" data-keyboard-alternative="true" style="width:44px;height:44px"></div>`);
    expect((await inspectGestureAlternatives(page)).issues.map(x => x.code)).toContain("gesture-name-empty");
  });
  test("gesture action without keyboard alternative is rejected", async ({ page }) => {
    await fixture(page, `<div role="button" tabindex="0" data-gesture-action="drag" style="width:44px;height:44px">Move</div>`);
    expect((await inspectGestureAlternatives(page)).issues.map(x => x.code)).toContain("gesture-alternative-missing");
  });
  test("gesture action with keyboard alternative is accepted", async ({ page }) => {
    await fixture(page, `<button data-gesture-action="drag" data-keyboard-alternative="true">Move</button>`);
    expect((await inspectGestureAlternatives(page)).issues).toEqual([]);
  });
  test("undersized gesture target is rejected", async ({ page }) => {
    await fixture(page, `<button style="width:20px;height:20px;min-width:0;min-height:0;padding:0">Move</button>`);
    expect((await inspectGestureAlternatives(page)).issues.map(x => x.code)).toContain("gesture-target-small");
  });
  test("custom slider exposes current and range values", async ({ page }) => {
    await fixture(page, `<div role="slider" tabindex="0" aria-label="Volume" aria-valuemin="0" aria-valuemax="10" aria-valuenow="4" aria-orientation="horizontal" style="width:100px;height:44px"></div>`);
    expect((await inspectGestureAlternatives(page)).issues).toEqual([]);
  });
  test("custom slider without value range is rejected", async ({ page }) => {
    await fixture(page, `<div role="slider" tabindex="0" aria-label="Volume" style="width:100px;height:44px"></div>`);
    expect((await inspectGestureAlternatives(page)).issues.map(x => x.code)).toContain("slider-value-missing");
  });
  test("custom slider without orientation is rejected", async ({ page }) => {
    await fixture(page, `<div role="slider" tabindex="0" aria-label="Volume" aria-valuemin="0" aria-valuemax="10" aria-valuenow="4" style="width:100px;height:44px"></div>`);
    expect((await inspectGestureAlternatives(page)).issues.map(x => x.code)).toContain("slider-orientation-missing");
  });
  test("native range responds to ArrowRight", async ({ page }) => {
    await fixture(page, `<label for="range">Volume</label><input id="range" type="range" min="0" max="10" value="4">`);
    await page.locator("#range").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#range")).toHaveValue("5");
  });
  test("custom slider keyboard helper sees value change", async ({ page }) => {
    await fixture(page, `<div id="slider" role="slider" tabindex="0" aria-label="Volume" aria-valuemin="0" aria-valuemax="10" aria-valuenow="4" aria-orientation="horizontal" style="width:100px;height:44px"></div>
      <script>const s=document.querySelector('#slider');s.addEventListener('keydown',e=>{if(e.key==='ArrowRight')s.setAttribute('aria-valuenow',String(Number(s.getAttribute('aria-valuenow'))+1))})</script>`);
    expect(await assertSliderKeyboard(page, "#slider")).toEqual({ before: 4, after: 5 });
  });
});
