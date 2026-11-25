import { expect, test } from "@playwright/test";
import { fixture, preferenceSnapshot, expectNoHorizontalOverflow } from "./visual-harness";

test.describe("P16 round 16 combined user display settings",()=>{
  test("forced colors plus reduced motion both report active",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce"});const s=await preferenceSnapshot(page);expect(s.forcedColors).toBe(true);expect(s.reducedMotion).toBe(true);
  });
  test("dark scheme plus increased contrast both report active",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({colorScheme:"dark",contrast:"more"});const s=await preferenceSnapshot(page);expect(s.colorScheme).toBe("dark");expect(s.contrast).toBe("more");
  });
  test("reduced motion plus 400 percent text keeps page in viewport",async({page})=>{
    await fixture(page,`<p>Content</p><button>Continue</button>`);await page.emulateMedia({reducedMotion:"reduce"});await page.addStyleTag({content:"html{font-size:400%!important}"});await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("forced colors plus 400 percent text keeps action visible",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.emulateMedia({forcedColors:"active"});await page.addStyleTag({content:"html{font-size:400%!important}"});await page.setViewportSize({width:320,height:720});await expect(page.locator("#action")).toBeVisible();
  });
  test("dark scheme plus 320 width keeps page readable",async({page})=>{
    await fixture(page,`<h2>Details</h2><p>Text</p>`);await page.emulateMedia({colorScheme:"dark"});await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);await expect(page.getByRole("heading",{name:"Details"})).toBeVisible();
  });
  test("increased contrast plus 320 width keeps action available",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({contrast:"more"});await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button",{name:"Continue"})).toBeVisible();
  });
  test("all display preferences preserve document language",async({page})=>{
    await fixture(page,`<p>Content</p>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more",colorScheme:"dark"});await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("all display preferences preserve the document title",async({page})=>{
    await fixture(page,`<p>Content</p>`);const title=await page.title();await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more",colorScheme:"dark"});await expect(page).toHaveTitle(title);
  });
  test("all display preferences preserve heading count",async({page})=>{
    await fixture(page,`<h2>Details</h2>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more",colorScheme:"dark"});await expect(page.getByRole("heading",{level:1})).toHaveCount(1);await expect(page.getByRole("heading",{level:2})).toHaveCount(1);
  });
  test("all display preferences preserve keyboard activation",async({page})=>{
    await fixture(page,`<button id="action">Continue</button><output id="result">No</output><script>document.querySelector('#action').onclick=()=>document.querySelector('#result').textContent='Yes'</script>`);
    await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more",colorScheme:"dark"});await page.locator("#action").focus();await page.keyboard.press("Enter");await expect(page.locator("#result")).toHaveText("Yes");
  });
  test("display preference changes do not create focus loss",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more",colorScheme:"dark"});await expect(page.locator("#action")).toBeFocused();
  });
  test("display preference changes do not alter action name",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more",colorScheme:"dark"});await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("display preference changes do not navigate",async({page})=>{
    await fixture(page,`<a href="#details">Details</a><p id="details">Content</p>`);const before=page.url();await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more",colorScheme:"dark"});expect(page.url()).toBe(before);
  });
  test("display preference changes can be reset",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more",colorScheme:"dark"});await page.emulateMedia({forcedColors:"none",reducedMotion:"no-preference",contrast:"no-preference",colorScheme:"light"});const s=await preferenceSnapshot(page);expect(s.forcedColors).toBe(false);expect(s.reducedMotion).toBe(false);expect(s.colorScheme).toBe("light");
  });
});
