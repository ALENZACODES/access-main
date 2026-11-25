import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, visibleState } from "./visual-harness";

test.describe("P16 round 16 viewport focus continuity",()=>{
  test("focus survives transition from desktop to portrait",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.setViewportSize({width:320,height:720});await expect(page.locator("#action")).toBeFocused();
  });
  test("focus survives transition from portrait to landscape",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.setViewportSize({width:320,height:720});await page.locator("#action").focus();await page.setViewportSize({width:720,height:320});await expect(page.locator("#action")).toBeFocused();
  });
  test("focused control remains in viewport after resize",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.setViewportSize({width:320,height:720});expect((await visibleState(page,"#action")).visible).toBe(true);
  });
  test("focused control remains in viewport after landscape resize",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.setViewportSize({width:720,height:320});expect((await visibleState(page,"#action")).visible).toBe(true);
  });
  test("focused control remains reachable after font scale",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.addStyleTag({content:"html{font-size:400%!important}"});await expect(page.locator("#action")).toBeFocused();
  });
  test("focused control remains reachable after text spacing",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.addStyleTag({content:"button{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}"});await expect(page.locator("#action")).toBeFocused();
  });
  test("focused control remains reachable with forced colors",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.emulateMedia({forcedColors:"active"});await page.locator("#action").focus();await expect(page.locator("#action")).toBeFocused();
  });
  test("focused control remains reachable with reduced motion",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.emulateMedia({reducedMotion:"reduce"});await page.locator("#action").focus();await expect(page.locator("#action")).toBeFocused();
  });
  test("focus and page reflow do not change language",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.setViewportSize({width:320,height:720});await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("focus and page reflow do not change title",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);const title=await page.title();await page.locator("#action").focus();await page.setViewportSize({width:320,height:720});await expect(page).toHaveTitle(title);
  });
  test("focus and page reflow do not navigate",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);const url=page.url();await page.locator("#action").focus();await page.setViewportSize({width:320,height:720});expect(page.url()).toBe(url);
  });
  test("focus and page reflow preserve control role",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("focus and page reflow preserve keyboard activation",async({page})=>{
    await fixture(page,`<button id="action">Continue</button><output id="result">No</output><script>document.querySelector('#action').onclick=()=>document.querySelector('#result').textContent='Yes'</script>`);await page.setViewportSize({width:320,height:720});await page.locator("#action").focus();await page.keyboard.press("Enter");await expect(page.locator("#result")).toHaveText("Yes");
  });
  test("focus and page reflow do not create horizontal overflow",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
});
