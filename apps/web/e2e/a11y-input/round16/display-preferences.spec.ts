import { expect, test } from "@playwright/test";
import { fixture, preferenceSnapshot, contrast } from "./visual-harness";

async function preferencePage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<article id="panel"><h2>Preferences</h2><p id="copy">Readable instructions remain visible.</p>
  <button id="action">Save preferences</button><a id="link" href="#next">Next section</a>
  <section id="next"><h3>Next section</h3></section></article>`,
  `#panel{color:#18232d;background:#fff;padding:16px}#copy{color:#18232d;background:#fff}
   #action{color:#fff;background:#064b83;border:2px solid #064b83}
   #link{color:#064b83;text-decoration:underline}`);
}
test.describe("P16 round 16 user display preferences",()=>{
  test.beforeEach(async({page})=>preferencePage(page));
  test("default color scheme is readable",async({page})=>{
    const state=await preferenceSnapshot(page);expect(["light","dark"]).toContain(state.colorScheme);
  });
  test("dark color preference is exposed",async({page})=>{
    await page.emulateMedia({colorScheme:"dark"});expect((await preferenceSnapshot(page)).colorScheme).toBe("dark");
  });
  test("light color preference is exposed",async({page})=>{
    await page.emulateMedia({colorScheme:"light"});expect((await preferenceSnapshot(page)).colorScheme).toBe("light");
  });
  test("dark preference does not remove the heading",async({page})=>{
    await page.emulateMedia({colorScheme:"dark"});await expect(page.getByRole("heading",{name:"Preferences"})).toBeVisible();
  });
  test("dark preference does not remove the action",async({page})=>{
    await page.emulateMedia({colorScheme:"dark"});await expect(page.getByRole("button",{name:"Save preferences"})).toBeVisible();
  });
  test("dark preference does not change link destination",async({page})=>{
    await page.emulateMedia({colorScheme:"dark"});await expect(page.locator("#link")).toHaveAttribute("href","#next");
  });
  test("dark preference preserves accessible name",async({page})=>{
    await page.emulateMedia({colorScheme:"dark"});await expect(page.getByRole("link",{name:"Next section"})).toHaveCount(1);
  });
  test("more contrast preference is exposed",async({page})=>{
    await page.emulateMedia({contrast:"more"});expect((await preferenceSnapshot(page)).contrast).toBe("more");
  });
  test("no-preference contrast is exposed",async({page})=>{
    await page.emulateMedia({contrast:"no-preference"});expect((await preferenceSnapshot(page)).contrast).toBe("no-preference");
  });
  test("contrast preference does not disable action",async({page})=>{
    await page.emulateMedia({contrast:"more"});await expect(page.locator("#action")).toBeEnabled();
  });
  test("contrast preference does not remove link underline",async({page})=>{
    await page.emulateMedia({contrast:"more"});await expect(page.locator("#link")).toHaveCSS("text-decoration-line",/underline/);
  });
  test("contrast preference leaves body text available",async({page})=>{
    await page.emulateMedia({contrast:"more"});await expect(page.locator("#copy")).toHaveText("Readable instructions remain visible.");
  });
  test("contrast preference does not change document language",async({page})=>{
    await page.emulateMedia({contrast:"more"});await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("dark preference does not change document title",async({page})=>{
    const title=await page.title();await page.emulateMedia({colorScheme:"dark"});await expect(page).toHaveTitle(title);
  });
  test("switching dark to light preserves user input",async({page})=>{
    await page.locator("#action").focus();await page.emulateMedia({colorScheme:"dark"});await page.emulateMedia({colorScheme:"light"});await expect(page.locator("#action")).toBeFocused();
  });
  test("contrast can be increased while dark scheme is active",async({page})=>{
    await page.emulateMedia({colorScheme:"dark",contrast:"more"});const state=await preferenceSnapshot(page);expect(state.colorScheme).toBe("dark");expect(state.contrast).toBe("more");
  });
  test("forced colors can coexist with reduced motion",async({page})=>{
    await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce"});const state=await preferenceSnapshot(page);expect(state.forcedColors).toBe(true);expect(state.reducedMotion).toBe(true);
  });
  test("display preferences do not change content order",async({page})=>{
    await page.emulateMedia({colorScheme:"dark",contrast:"more"});const text=await page.locator("#panel").innerText();expect(text.indexOf("Preferences")).toBeLessThan(text.indexOf("Readable instructions"));
  });
  test("button contrast is measurable under default theme",async({page})=>{
    const result=await contrast(page,"#action");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("link contrast is measurable under default theme",async({page})=>{
    const result=await contrast(page,"#link");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("display preference changes do not navigate",async({page})=>{
    const before=page.url();await page.emulateMedia({colorScheme:"dark",contrast:"more"});expect(page.url()).toBe(before);
  });
});
