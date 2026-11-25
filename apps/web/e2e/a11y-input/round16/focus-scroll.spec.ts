import { expect, test } from "@playwright/test";
import { fixture, visibleState, scrollTo } from "./visual-harness";

async function longPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<button id="top">Top action</button><div style="height:1000px"></div>
  <section><h2 id="middle-heading">Middle</h2><button id="middle">Middle action</button></section>
  <div style="height:1000px"></div><section><h2 id="bottom-heading">Bottom</h2><button id="bottom">Bottom action</button></section>`);
}
test.describe("P16 round 16 keyboard focus and scroll position",()=>{
  test.beforeEach(async({page})=>longPage(page));
  test("Tab from top action reaches middle action",async({page})=>{
    await page.locator("#top").focus();await page.keyboard.press("Tab");await expect(page.locator("#middle")).toBeFocused();
  });
  test("Tab from middle action reaches bottom action",async({page})=>{
    await page.locator("#middle").focus();await page.keyboard.press("Tab");await expect(page.locator("#bottom")).toBeFocused();
  });
  test("Shift Tab from bottom action returns to middle action",async({page})=>{
    await page.locator("#bottom").focus();await page.keyboard.press("Shift+Tab");await expect(page.locator("#middle")).toBeFocused();
  });
  test("focus scrolls middle action into view",async({page})=>{
    await page.locator("#middle").focus();const state=await visibleState(page,"#middle");expect(state.visible).toBe(true);expect(state.box.bottom).toBeGreaterThan(0);
  });
  test("focus scrolls bottom action into view",async({page})=>{
    await page.locator("#bottom").focus();const state=await visibleState(page,"#bottom");expect(state.visible).toBe(true);expect(state.box.bottom).toBeGreaterThan(0);
  });
  test("scrolling to heading keeps heading visible",async({page})=>{
    await scrollTo(page,"#middle-heading");await expect(page.locator("#middle-heading")).toBeInViewport();
  });
  test("scrolling to bottom heading keeps heading visible",async({page})=>{
    await scrollTo(page,"#bottom-heading");await expect(page.locator("#bottom-heading")).toBeInViewport();
  });
  test("focus does not get lost during a programmatic scroll",async({page})=>{
    await page.locator("#middle").focus();await page.evaluate(()=>window.scrollTo(0,0));await expect(page.locator("#middle")).toBeFocused();
  });
  test("focus can move from bottom back to top",async({page})=>{
    await page.locator("#bottom").focus();await page.locator("#top").focus();await expect(page.locator("#top")).toBeFocused();
  });
  test("focus at bottom is not clipped by viewport edge",async({page})=>{
    await page.locator("#bottom").focus();const state=await visibleState(page,"#bottom");const height=await page.evaluate(()=>innerHeight);expect(state.box.top).toBeLessThan(height);
  });
  test("focus at middle is not clipped by viewport edge",async({page})=>{
    await page.locator("#middle").focus();const state=await visibleState(page,"#middle");const height=await page.evaluate(()=>innerHeight);expect(state.box.top).toBeLessThan(height);
  });
  test("scrolling does not alter button name",async({page})=>{
    await page.locator("#bottom").focus();await expect(page.getByRole("button",{name:"Bottom action"})).toHaveCount(1);
  });
  test("scrolling does not alter page language",async({page})=>{
    await page.locator("#bottom").focus();await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("scrolling does not alter document title",async({page})=>{
    const title=await page.title();await page.locator("#bottom").focus();await expect(page).toHaveTitle(title);
  });
  test("focus remains on target when viewport is resized",async({page})=>{
    await page.locator("#middle").focus();await page.setViewportSize({width:320,height:720});await expect(page.locator("#middle")).toBeFocused();
  });
  test("focus remains on target after orientation change",async({page})=>{
    await page.locator("#middle").focus();await page.setViewportSize({width:720,height:320});await expect(page.locator("#middle")).toBeFocused();
  });
  test("target is scrolled into view after viewport resize",async({page})=>{
    await page.locator("#bottom").focus();await page.setViewportSize({width:320,height:720});await page.locator("#bottom").scrollIntoViewIfNeeded();await expect(page.locator("#bottom")).toBeInViewport();
  });
  test("Tab order remains stable after scrolling",async({page})=>{
    await page.locator("#middle").focus();await page.evaluate(()=>window.scrollTo(0,0));await page.keyboard.press("Tab");await expect(page.locator("#bottom")).toBeFocused();
  });
  test("Shift Tab order remains stable after scrolling",async({page})=>{
    await page.locator("#bottom").focus();await page.evaluate(()=>window.scrollTo(0,0));await page.keyboard.press("Shift+Tab");await expect(page.locator("#middle")).toBeFocused();
  });
  test("focus is not moved by content text update elsewhere",async({page})=>{
    await page.locator("#middle").focus();await page.locator("#top").evaluate(node=>node.textContent="Updated top action");await expect(page.locator("#middle")).toBeFocused();
  });
});
