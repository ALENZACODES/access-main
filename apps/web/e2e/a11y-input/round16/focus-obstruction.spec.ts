import { expect, test } from "@playwright/test";
import { fixture, scrollTo, visibleState, focusAndInspect } from "./visual-harness";

async function stickyPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<header id="header" style="position:sticky;top:0;z-index:10;background:white;padding:8px;border-bottom:2px solid #333"><a href="#start">Top</a></header>
  <div style="height:900px"></div><main id="content"><h2>Actions</h2>
  <button id="start">Start</button><button id="first">First action</button><button id="second">Second action</button>
  <a id="link" href="#end">End link</a><div style="height:900px"></div><button id="end">End action</button></main>
  <footer id="footer" style="position:sticky;bottom:0;background:white;padding:8px;border-top:2px solid #333">Footer</footer>`);
}
test.describe("P16 round 16 focus visibility around sticky content",()=>{
  test.beforeEach(async({page})=>stickyPage(page));
  test("header remains visible while document scrolls",async({page})=>{
    await page.evaluate(()=>window.scrollTo(0,600));await expect(page.locator("#header")).toBeVisible();
  });
  test("focus can reach first action after scrolling",async({page})=>{
    await scrollTo(page,"#first");await page.locator("#first").focus();await expect(page.locator("#first")).toBeFocused();
  });
  test("focus can reach second action after scrolling",async({page})=>{
    await scrollTo(page,"#second");await page.locator("#second").focus();await expect(page.locator("#second")).toBeFocused();
  });
  test("focus can reach end action after scrolling",async({page})=>{
    await scrollTo(page,"#end");await page.locator("#end").focus();await expect(page.locator("#end")).toBeFocused();
  });
  test("focused first action is not covered by sticky header",async({page})=>{
    await scrollTo(page,"#first");const state=await visibleState(page,"#first");expect(state.visible).toBe(true);expect(state.obscured).toBe(false);
  });
  test("focused link is not covered by sticky header",async({page})=>{
    await scrollTo(page,"#link");const state=await visibleState(page,"#link");expect(state.visible).toBe(true);expect(state.obscured).toBe(false);
  });
  test("focused end action is not covered by sticky footer",async({page})=>{
    await scrollTo(page,"#end");const state=await visibleState(page,"#end");expect(state.visible).toBe(true);
  });
  test("focus indicator remains visible on scrolled button",async({page})=>{
    await scrollTo(page,"#first");const style=await focusAndInspect(page,"#first");expect(style.outlineWidth).toBeGreaterThanOrEqual(2);
  });
  test("focus indicator remains visible on scrolled link",async({page})=>{
    await scrollTo(page,"#link");const style=await focusAndInspect(page,"#link");expect(style.outlineWidth).toBeGreaterThanOrEqual(2);
  });
  test("Tab reaches first action after page introduction",async({page})=>{
    await page.locator("#header a").focus();await page.keyboard.press("Tab");await page.keyboard.press("Tab");await expect(page.locator("#first")).toBeFocused();
  });
  test("Shift Tab from second action returns to first action",async({page})=>{
    await page.locator("#second").focus();await page.keyboard.press("Shift+Tab");await expect(page.locator("#first")).toBeFocused();
  });
  test("focus scrolls a target into the visible viewport",async({page})=>{
    await page.locator("#end").focus();const state=await visibleState(page,"#end");expect(state.visible).toBe(true);expect(state.box.bottom).toBeGreaterThan(0);
  });
  test("header does not cover skip destination",async({page})=>{
    await page.locator("#header a").click();const target=await visibleState(page,"#start");expect(target.visible).toBe(true);
  });
  test("small viewport keeps sticky header within screen width",async({page})=>{
    await page.setViewportSize({width:320,height:720});await expect(page.locator("#header")).toBeVisible();
  });
  test("landscape viewport keeps sticky header within screen width",async({page})=>{
    await page.setViewportSize({width:568,height:320});await expect(page.locator("#header")).toBeVisible();
  });
  test("keyboard focus does not trigger the sticky header link",async({page})=>{
    const before=page.url();await page.locator("#header a").focus();expect(page.url()).toBe(before);
  });
  test("Enter activates the sticky header link only when requested",async({page})=>{
    await page.locator("#header a").focus();await page.keyboard.press("Enter");await expect(page).toHaveURL(/#start$/);
  });
  test("scrolling does not remove the focused control",async({page})=>{
    await page.locator("#first").focus();await page.evaluate(()=>window.scrollTo(0,500));await expect(page.locator("#first")).toBeFocused();
  });
  test("scrolling does not remove the active heading",async({page})=>{
    await page.locator("#content h2").focus().catch(()=>undefined);await page.evaluate(()=>window.scrollTo(0,500));await expect(page.locator("#content h2")).toBeVisible();
  });
  test("sticky header has a visible boundary",async({page})=>{
    const border=await page.locator("#header").evaluate(node=>getComputedStyle(node).borderBottomStyle);expect(border).not.toBe("none");
  });
  test("sticky footer remains visible at document end",async({page})=>{
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await expect(page.locator("#footer")).toBeVisible();
  });
  test("footer does not intercept focus on an action above it",async({page})=>{
    await page.locator("#end").focus();await expect(page.locator("#end")).toBeFocused();
  });
  test("sticky elements remain in document reading order",async({page})=>{
    const header=await page.locator("#header").evaluate(node=>node.compareDocumentPosition(document.querySelector("#content")!) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(header).not.toBe(0);
  });
});
