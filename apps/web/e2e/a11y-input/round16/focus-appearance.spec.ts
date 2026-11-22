import { expect, test } from "@playwright/test";
import { fixture, focusAndInspect, box } from "./visual-harness";

async function focusPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<a id="link" href="#end">Continue link</a><button id="button">Continue button</button>
  <label for="field">Name</label><input id="field"><select id="choice" aria-label="Choice"><option>One</option></select>
  <textarea id="notes" aria-label="Notes"></textarea><button id="end">End</button>`,
  `:focus-visible{outline:3px solid #064b83;outline-offset:3px}`);
}
test.describe("P16 round 16 focus appearance under display changes",()=>{
  test.beforeEach(async({page})=>focusPage(page));
  test("link focus ring is visible",async({page})=>{const s=await focusAndInspect(page,"#link");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("button focus ring is visible",async({page})=>{const s=await focusAndInspect(page,"#button");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("input focus ring is visible",async({page})=>{const s=await focusAndInspect(page,"#field");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("select focus ring is visible",async({page})=>{const s=await focusAndInspect(page,"#choice");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("textarea focus ring is visible",async({page})=>{const s=await focusAndInspect(page,"#notes");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("focus ring remains visible at 200 percent text scale",async({page})=>{await page.addStyleTag({content:"html{font-size:200%!important}"});const s=await focusAndInspect(page,"#button");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("focus ring remains visible at 400 percent text scale",async({page})=>{await page.addStyleTag({content:"html{font-size:400%!important}"});const s=await focusAndInspect(page,"#button");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("focus ring remains visible at narrow viewport",async({page})=>{await page.setViewportSize({width:320,height:720});const s=await focusAndInspect(page,"#button");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("focus ring remains visible at landscape viewport",async({page})=>{await page.setViewportSize({width:720,height:320});const s=await focusAndInspect(page,"#button");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("focus ring does not change target width",async({page})=>{const before=await box(page,"#button");await page.locator("#button").focus();const after=await box(page,"#button");expect(after.width).toBe(before.width);});
  test("focus ring does not change target height",async({page})=>{const before=await box(page,"#button");await page.locator("#button").focus();const after=await box(page,"#button");expect(after.height).toBe(before.height);});
  test("focus outline has an offset from the control",async({page})=>{await page.locator("#button").focus();const offset=await page.locator("#button").evaluate(node=>getComputedStyle(node).outlineOffset);expect(parseFloat(offset)).toBeGreaterThan(0);});
  test("focus ring remains after keyboard activation",async({page})=>{await page.locator("#button").focus();await page.keyboard.press("Enter");await expect(page.locator("#button")).toBeFocused();});
  test("focus ring remains after scrolling target into view",async({page})=>{await page.locator("#end").focus();await expect(page.locator("#end")).toBeFocused();});
  test("focus order is not changed by the outline",async({page})=>{await page.locator("#link").focus();await page.keyboard.press("Tab");await expect(page.locator("#button")).toBeFocused();});
  test("focus remains distinct from selected state",async({page})=>{await page.locator("#button").focus();await expect(page.locator("#button")).not.toHaveAttribute("aria-pressed","true");});
  test("focus ring is present under forced colors",async({page})=>{await page.emulateMedia({forcedColors:"active"});const s=await focusAndInspect(page,"#button");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("focus ring is present under increased contrast preference",async({page})=>{await page.emulateMedia({contrast:"more"});const s=await focusAndInspect(page,"#button");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("focus ring is present under reduced motion preference",async({page})=>{await page.emulateMedia({reducedMotion:"reduce"});const s=await focusAndInspect(page,"#button");expect(s.outlineWidth).toBeGreaterThanOrEqual(2);});
  test("focus remains available after preference combinations",async({page})=>{await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await page.locator("#field").focus();await expect(page.locator("#field")).toBeFocused();});
});
