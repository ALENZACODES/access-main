import { expect, test } from "@playwright/test";
import { fixture, expectFocus } from "./harness";

async function scanFixture(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<section aria-labelledby="scan-title">
    <h2 id="scan-title">Choose an action</h2>
    <p id="scan-instruction">Press Next to move. Press Select to activate.</p>
    <p id="scan-current" role="status" aria-live="polite">Current: Save</p>
    <div id="scan-items" role="group" aria-label="Available actions">
      <button id="scan-save" aria-current="true">Save</button>
      <button id="scan-help">Help</button>
      <button id="scan-cancel">Cancel</button>
    </div>
    <div class="controls">
      <button id="scan-next">Next</button>
      <button id="scan-select">Select</button>
      <button id="scan-home">First</button>
      <button id="scan-end">Last</button>
      <button id="scan-reset">Reset</button>
    </div>
    <p id="scan-result" role="status" aria-live="polite">No action selected</p>
  </section>
  <script>
    const items=[...document.querySelectorAll('#scan-items button')];
    let index=0;
    const show=()=>{items.forEach((item,i)=>item.setAttribute('aria-current',String(i===index)));document.querySelector('#scan-current').textContent='Current: '+items[index].textContent;};
    const select=()=>{document.querySelector('#scan-result').textContent=items[index].textContent+' selected';};
    document.querySelector('#scan-next').onclick=()=>{index=(index+1)%items.length;show();};
    document.querySelector('#scan-select').onclick=select;
    document.querySelector('#scan-home').onclick=()=>{index=0;show();};
    document.querySelector('#scan-end').onclick=()=>{index=items.length-1;show();};
    document.querySelector('#scan-reset').onclick=()=>{index=0;show();document.querySelector('#scan-result').textContent='No action selected';};
  </script>`);
}
test.describe("P16 round 15 single-switch scan sequence",()=>{
  test.beforeEach(async({page})=>scanFixture(page));
  test("initial scan target is first action",async({page})=>{
    await expect(page.locator("#scan-save")).toHaveAttribute("aria-current","true");
  });
  test("Next moves to second action",async({page})=>{
    await page.locator("#scan-next").click();
    await expect(page.locator("#scan-help")).toHaveAttribute("aria-current","true");
  });
  test("Next twice moves to final action",async({page})=>{
    await page.locator("#scan-next").click();
    await page.locator("#scan-next").click();
    await expect(page.locator("#scan-cancel")).toHaveAttribute("aria-current","true");
  });
  test("Next wraps to first action",async({page})=>{
    await page.locator("#scan-next").click();
    await page.locator("#scan-next").click();
    await page.locator("#scan-next").click();
    await expect(page.locator("#scan-save")).toHaveAttribute("aria-current","true");
  });
  test("Select announces current action",async({page})=>{
    await page.locator("#scan-select").click();
    await expect(page.locator("#scan-result")).toHaveText("Save selected");
  });
  test("Next then Select announces second action",async({page})=>{
    await page.locator("#scan-next").click();
    await page.locator("#scan-select").click();
    await expect(page.locator("#scan-result")).toHaveText("Help selected");
  });
  test("Home returns scan to first action",async({page})=>{
    await page.locator("#scan-end").click();
    await page.locator("#scan-home").click();
    await expect(page.locator("#scan-save")).toHaveAttribute("aria-current","true");
  });
  test("End moves scan to final action",async({page})=>{
    await page.locator("#scan-end").click();
    await expect(page.locator("#scan-cancel")).toHaveAttribute("aria-current","true");
  });
  test("Reset returns to first action",async({page})=>{
    await page.locator("#scan-end").click();
    await page.locator("#scan-reset").click();
    await expect(page.locator("#scan-save")).toHaveAttribute("aria-current","true");
  });
  test("Reset clears prior action result",async({page})=>{
    await page.locator("#scan-select").click();
    await page.locator("#scan-reset").click();
    await expect(page.locator("#scan-result")).toHaveText("No action selected");
  });
  test("current scan item is announced",async({page})=>{
    await page.locator("#scan-next").click();
    await expect(page.locator("#scan-current")).toHaveText("Current: Help");
  });
  test("scan group has an accessible name",async({page})=>{
    await expect(page.locator("#scan-items")).toHaveAttribute("aria-label","Available actions");
  });
  test("scan controls are individually named",async({page})=>{
    for(const id of ["scan-next","scan-select","scan-home","scan-end","scan-reset"])
      await expect(page.locator(`#${id}`)).toHaveText(/.+/);
  });
  test("scan controls meet target size",async({page})=>{
    for(const id of ["scan-next","scan-select","scan-home","scan-end","scan-reset"])
      await expect(page.locator(`#${id}`)).toHaveCSS("min-height","44px");
  });
  test("scan does not change document language",async({page})=>{
    const lang=await page.locator("html").getAttribute("lang");
    await page.locator("#scan-next").click();
    await expect(page.locator("html")).toHaveAttribute("lang",lang??"en");
  });
  test("scan does not navigate away from current route",async({page})=>{
    const before=page.url();
    await page.locator("#scan-next").click();
    await page.locator("#scan-select").click();
    expect(page.url()).toBe(before);
  });
  test("scan state is not persisted in local storage",async({page})=>{
    await page.locator("#scan-next").click();
    const stored=await page.evaluate(()=>localStorage.length);
    expect(stored).toBe(0);
  });
  test("scan state is not persisted in session storage",async({page})=>{
    await page.locator("#scan-next").click();
    const stored=await page.evaluate(()=>sessionStorage.length);
    expect(stored).toBe(0);
  });
  test("scan sequence can be repeated after reset",async({page})=>{
    await page.locator("#scan-next").click();
    await page.locator("#scan-reset").click();
    await page.locator("#scan-next").click();
    await expect(page.locator("#scan-help")).toHaveAttribute("aria-current","true");
  });
  test("scan selection does not move keyboard focus",async({page})=>{
    await page.locator("#scan-select").focus();
    await page.keyboard.press("Enter");
    await expectFocus(page,"scan-select");
  });
  test("scan current state remains singular",async({page})=>{
    await page.locator("#scan-next").click();
    await page.locator("#scan-next").click();
    await expect(page.locator("#scan-items [aria-current=true]")).toHaveCount(1);
  });
  test("scan can return to first after multiple wraps",async({page})=>{
    for(let i=0;i<9;i++)await page.locator("#scan-next").click();
    await expect(page.locator("#scan-save")).toHaveAttribute("aria-current","true");
  });
  test("scan current message matches selected target",async({page})=>{
    await page.locator("#scan-end").click();
    await expect(page.locator("#scan-current")).toHaveText("Current: Cancel");
  });
  test("scan selected action does not clear current target",async({page})=>{
    await page.locator("#scan-next").click();
    await page.locator("#scan-select").click();
    await expect(page.locator("#scan-help")).toHaveAttribute("aria-current","true");
  });
});
