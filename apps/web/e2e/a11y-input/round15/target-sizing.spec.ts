import { expect, test } from "@playwright/test";
import { assertTarget, fixture } from "./harness";

test.describe("P16 round 15 switch target sizing",()=>{
  test("primary action meets minimum target size",async({page})=>{
    await fixture(page,`<button id="primary" style="width:44px;height:44px">Go</button>`);
    await assertTarget(page,"#primary");
  });
  test("target larger than minimum is accepted",async({page})=>{
    await fixture(page,`<button id="large" style="width:64px;height:52px">Go</button>`);
    await assertTarget(page,"#large");
  });
  test("target width is not inferred from surrounding whitespace",async({page})=>{
    await fixture(page,`<div style="padding:20px"><button id="small" style="width:32px;height:44px;min-width:0">Go</button></div>`);
    const width=await page.locator("#small").evaluate(node=>node.getBoundingClientRect().width);
    expect(width).toBe(32);
  });
  test("target height is not inferred from surrounding whitespace",async({page})=>{
    await fixture(page,`<div style="padding:20px"><button id="small" style="width:44px;height:32px;min-height:0">Go</button></div>`);
    const height=await page.locator("#small").evaluate(node=>node.getBoundingClientRect().height);
    expect(height).toBe(32);
  });
  test("touch target keeps size at narrow viewport",async({page})=>{
    await fixture(page,`<button id="action" style="width:44px;height:44px">Go</button>`);
    await page.setViewportSize({width:320,height:720});
    await assertTarget(page,"#action");
  });
  test("touch target keeps size at desktop viewport",async({page})=>{
    await fixture(page,`<button id="action" style="width:44px;height:44px">Go</button>`);
    await page.setViewportSize({width:1280,height:900});
    await assertTarget(page,"#action");
  });
  test("target remains at least 44px after focus",async({page})=>{
    await fixture(page,`<button id="action" style="width:44px;height:44px">Go</button>`);
    await page.locator("#action").focus();
    await assertTarget(page,"#action");
  });
  test("target remains at least 44px after activation",async({page})=>{
    await fixture(page,`<button id="action" style="width:44px;height:44px">Go</button>`);
    await page.locator("#action").click();
    await assertTarget(page,"#action");
  });
  test("target size does not depend on label length",async({page})=>{
    await fixture(page,`<button id="short" style="width:44px;height:44px">A</button><button id="long" style="width:44px;height:44px">A longer label</button>`);
    await assertTarget(page,"#short");
    await assertTarget(page,"#long");
  });
  test("target dimensions are measured in CSS pixels",async({page})=>{
    await fixture(page,`<button id="action" style="width:44px;height:44px">Go</button>`);
    const size=await page.locator("#action").evaluate(node=>{const rect=node.getBoundingClientRect();return {width:rect.width,height:rect.height};});
    expect(size).toEqual({width:44,height:44});
  });
  test("focus ring does not reduce target dimensions",async({page})=>{
    await fixture(page,`<button id="action" style="width:44px;height:44px">Go</button>`);
    const before=await page.locator("#action").boundingBox();
    await page.locator("#action").focus();
    const after=await page.locator("#action").boundingBox();
    expect(after?.width).toBe(before?.width);
    expect(after?.height).toBe(before?.height);
  });
  test("target remains operable by keyboard",async({page})=>{
    await fixture(page,`<button id="action" style="width:44px;height:44px">Go</button><output id="result">No</output><script>document.querySelector('#action').onclick=()=>document.querySelector('#result').textContent='Yes'</script>`);
    await page.locator("#action").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#result")).toHaveText("Yes");
  });
});
