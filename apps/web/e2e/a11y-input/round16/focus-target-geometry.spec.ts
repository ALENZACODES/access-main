import { expect, test } from "@playwright/test";
import { fixture, box, assertTarget } from "./visual-harness";

test.describe("P16 round 16 focus target geometry matrix",()=>{
  test("button width is at least 44 pixels",async({page})=>{
    await fixture(page,`<button id="action">Go</button>`);await assertTarget(page,"#action");
  });
  test("button height is at least 44 pixels",async({page})=>{
    await fixture(page,`<button id="action">Go</button>`);await assertTarget(page,"#action");
  });
  test("link width is at least 44 pixels",async({page})=>{
    await fixture(page,`<a id="link" href="#end">Go</a><p id="end">End</p>`);await assertTarget(page,"#link");
  });
  test("link height is at least 44 pixels",async({page})=>{
    await fixture(page,`<a id="link" href="#end">Go</a><p id="end">End</p>`);await assertTarget(page,"#link");
  });
  test("input width is at least 44 pixels",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name">`);await assertTarget(page,"#name");
  });
  test("input height is at least 44 pixels",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name">`);await assertTarget(page,"#name");
  });
  test("target size is measured after viewport change",async({page})=>{
    await fixture(page,`<button id="action">Go</button>`);await page.setViewportSize({width:320,height:720});await assertTarget(page,"#action");
  });
  test("target size is measured after font scaling",async({page})=>{
    await fixture(page,`<button id="action">Go</button>`);await page.addStyleTag({content:"html{font-size:200%!important}"});await assertTarget(page,"#action");
  });
  test("target size remains stable after focus",async({page})=>{
    await fixture(page,`<button id="action">Go</button>`);const before=await box(page,"#action");await page.locator("#action").focus();const after=await box(page,"#action");expect(after.width).toBe(before.width);expect(after.height).toBe(before.height);
  });
  test("target size remains stable after focus outline",async({page})=>{
    await fixture(page,`<button id="action">Go</button>`);const before=await box(page,"#action");await page.locator("#action").focus();const after=await box(page,"#action");expect(after.x).toBe(before.x);expect(after.y).toBe(before.y);
  });
  test("target remains operable after resizing",async({page})=>{
    await fixture(page,`<button id="action">Go</button><output id="result">No</output><script>document.querySelector('#action').onclick=()=>document.querySelector('#result').textContent='Yes'</script>`);await page.setViewportSize({width:320,height:720});await page.locator("#action").click();await expect(page.locator("#result")).toHaveText("Yes");
  });
  test("target remains operable after font scaling",async({page})=>{
    await fixture(page,`<button id="action">Go</button><output id="result">No</output><script>document.querySelector('#action').onclick=()=>document.querySelector('#result').textContent='Yes'</script>`);await page.addStyleTag({content:"html{font-size:300%!important}"});await page.locator("#action").click();await expect(page.locator("#result")).toHaveText("Yes");
  });
  test("target remains in reading order after resizing",async({page})=>{
    await fixture(page,`<button id="first">First</button><button id="second">Second</button>`);await page.setViewportSize({width:320,height:720});await page.locator("#first").focus();await page.keyboard.press("Tab");await expect(page.locator("#second")).toBeFocused();
  });
  test("target remains in reading order after magnification",async({page})=>{
    await fixture(page,`<button id="first">First</button><button id="second">Second</button>`);await page.addStyleTag({content:"html{font-size:400%!important}"});await page.locator("#first").focus();await page.keyboard.press("Tab");await expect(page.locator("#second")).toBeFocused();
  });
});
