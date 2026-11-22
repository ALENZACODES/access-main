import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, preferenceSnapshot } from "./visual-harness";

test.describe("P16 round 16 preference and reflow regression cases",()=>{
  test("dark scheme at 320 pixels keeps text visible",async({page})=>{
    await fixture(page,`<p id="copy">Instructions remain available.</p>`);await page.emulateMedia({colorScheme:"dark"});await page.setViewportSize({width:320,height:720});await expect(page.locator("#copy")).toBeVisible();await expectNoHorizontalOverflow(page);
  });
  test("forced colors at 320 pixels keeps controls visible",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({forcedColors:"active"});await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button")).toBeVisible();await expectNoHorizontalOverflow(page);
  });
  test("reduced motion at 320 pixels keeps controls visible",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({reducedMotion:"reduce"});await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button")).toBeVisible();await expectNoHorizontalOverflow(page);
  });
  test("increased contrast at 320 pixels keeps controls visible",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({contrast:"more"});await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button")).toBeVisible();await expectNoHorizontalOverflow(page);
  });
  test("combined preferences remain detectable after resizing",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await page.setViewportSize({width:320,height:720});const state=await preferenceSnapshot(page);expect(state.forcedColors).toBe(true);expect(state.reducedMotion).toBe(true);expect(state.contrast).toBe("more");
  });
  test("combined preferences remain detectable after rotation",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await page.setViewportSize({width:720,height:320});const state=await preferenceSnapshot(page);expect(state.forcedColors).toBe(true);expect(state.reducedMotion).toBe(true);
  });
  test("preference changes do not alter accessible button count",async({page})=>{
    await fixture(page,`<button>One</button><button>Two</button>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await expect(page.getByRole("button")).toHaveCount(2);
  });
  test("preference changes do not alter landmark count",async({page})=>{
    await fixture(page,`<nav aria-label="Primary"><a href="#one">One</a></nav><section id="one">Content</section>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await expect(page.getByRole("navigation",{name:"Primary"})).toHaveCount(1);
  });
  test("preference changes do not alter heading count",async({page})=>{
    await fixture(page,`<h2>Details</h2>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await expect(page.getByRole("heading",{level:1})).toHaveCount(1);await expect(page.getByRole("heading",{level:2})).toHaveCount(1);
  });
  test("preference changes do not alter input values",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name" value="Alex">`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await expect(page.locator("#name")).toHaveValue("Alex");
  });
});
