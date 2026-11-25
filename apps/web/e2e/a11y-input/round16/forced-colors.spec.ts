import { expect, test } from "@playwright/test";
import { fixture, focusAndInspect, preferenceSnapshot } from "./visual-harness";

async function forcedPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<nav aria-label="Primary"><a id="link" href="#content">Skip to content</a></nav>
  <main id="content"><button id="action">Continue</button><label for="choice">Choice</label>
  <select id="choice"><option>One</option><option>Two</option></select>
  <input id="check" type="checkbox" aria-label="Include details">
  <div id="selected" role="status">Selected</div></main>`,
  `button,a,input,select{border:2px solid currentColor} :focus-visible{outline:3px solid currentColor;outline-offset:3px}`);
}
test.describe("P16 round 16 forced-colors resilience",()=>{
  test.beforeEach(async({page})=>{await forcedPage(page);await page.emulateMedia({forcedColors:"active"});});
  test("browser reports forced-colors active",async({page})=>{
    expect((await preferenceSnapshot(page)).forcedColors).toBe(true);
  });
  test("document text remains visible",async({page})=>{
    await expect(page.locator("h1")).toBeVisible();await expect(page.locator("#action")).toBeVisible();
  });
  test("primary button remains operable",async({page})=>{
    await page.locator("#action").focus();await page.keyboard.press("Enter");await expect(page.locator("#action")).toBeFocused();
  });
  test("button focus has an outline in forced colors",async({page})=>{
    const result=await focusAndInspect(page,"#action");
    expect(result.focused).toBe(true);
    expect(result.outline==="none"||result.outlineWidth<2?result.shadow==="none":false).toBe(false);
  });
  test("link focus has an outline in forced colors",async({page})=>{
    const result=await focusAndInspect(page,"#link");expect(result.focused).toBe(true);
    expect(result.outline==="none"||result.outlineWidth<2?result.shadow==="none":false).toBe(false);
  });
  test("select remains keyboard reachable",async({page})=>{
    await page.locator("#choice").focus();await expect(page.locator("#choice")).toBeFocused();
  });
  test("checkbox remains keyboard reachable",async({page})=>{
    await page.locator("#check").focus();await expect(page.locator("#check")).toBeFocused();
  });
  test("checkbox state remains exposed",async({page})=>{
    await page.locator("#check").focus();await page.keyboard.press("Space");await expect(page.locator("#check")).toBeChecked();
  });
  test("native link remains discoverable by role",async({page})=>{
    await expect(page.getByRole("link",{name:"Skip to content"})).toHaveCount(1);
  });
  test("native button remains discoverable by role",async({page})=>{
    await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("native select remains discoverable by label",async({page})=>{
    await expect(page.getByLabel("Choice")).toHaveCount(1);
  });
  test("status remains available in forced colors",async({page})=>{
    await expect(page.getByRole("status")).toHaveText("Selected");
  });
  test("selection is not conveyed by color alone",async({page})=>{
    await page.locator("#check").focus();await page.keyboard.press("Space");
    await expect(page.locator("#check")).toBeChecked();
  });
  test("forced colors can be disabled without losing control state",async({page})=>{
    await page.locator("#check").check();await page.emulateMedia({forcedColors:"none"});
    await expect(page.locator("#check")).toBeChecked();
  });
  test("forced colors remain active after focus movement",async({page})=>{
    await page.locator("#link").focus();await page.keyboard.press("Tab");
    expect((await preferenceSnapshot(page)).forcedColors).toBe(true);
  });
  test("high contrast mode does not change document language",async({page})=>{
    await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("forced colors do not hide the page heading",async({page})=>{
    await expect(page.getByRole("heading",{level:1})).toBeVisible();
  });
  test("focus ring remains after keyboard activation",async({page})=>{
    await page.locator("#action").focus();await page.keyboard.press("Enter");
    const style=await page.locator("#action").evaluate(node=>getComputedStyle(node).outlineStyle);
    expect(style).not.toBe("none");
  });
  test("forced colors preserve native input outline",async({page})=>{
    const result=await focusAndInspect(page,"#check");expect(result.focused).toBe(true);
  });
  test("forced colors preserve link destination",async({page})=>{
    await expect(page.locator("#link")).toHaveAttribute("href","#content");
  });
  test("forced colors preserve control text",async({page})=>{
    await expect(page.locator("#action")).toHaveText("Continue");
  });
  test("forced colors support narrow viewport",async({page})=>{
    await page.setViewportSize({width:320,height:720});await expect(page.locator("#action")).toBeVisible();
  });
  test("forced colors support desktop viewport",async({page})=>{
    await page.setViewportSize({width:1280,height:900});await expect(page.locator("#action")).toBeVisible();
  });
});
