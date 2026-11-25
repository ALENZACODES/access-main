import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow } from "./visual-harness";

test.describe("P16 round 16 final responsive checks",()=>{
  test("320 pixel viewport keeps primary content visible",async({page})=>{
    await fixture(page,`<main><h2>Details</h2><p>Readable content.</p><button>Continue</button></main>`);await page.setViewportSize({width:320,height:720});await expect(page.getByRole("heading",{name:"Details"})).toBeVisible();
  });
  test("320 pixel viewport keeps primary action visible",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button",{name:"Continue"})).toBeVisible();
  });
  test("400 percent text keeps primary content visible",async({page})=>{
    await fixture(page,`<main><h2>Details</h2><p>Readable content.</p></main>`);await page.addStyleTag({content:"html{font-size:400%!important}"});await page.setViewportSize({width:320,height:720});await expect(page.getByRole("heading",{name:"Details"})).toBeVisible();
  });
  test("400 percent text keeps primary action visible",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.addStyleTag({content:"html{font-size:400%!important}"});await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button",{name:"Continue"})).toBeVisible();
  });
  test("reduced motion and forced colors preserve action label",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.emulateMedia({reducedMotion:"reduce",forcedColors:"active"});await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("reduced motion and forced colors preserve no-overflow layout",async({page})=>{
    await fixture(page,`<div class="row"><button>One</button><button>Two</button></div>`);await page.emulateMedia({reducedMotion:"reduce",forcedColors:"active"});await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("orientation and text scale preserve content order",async({page})=>{
    await fixture(page,`<h2>First</h2><h2>Second</h2>`);await page.addStyleTag({content:"html{font-size:300%!important}"});await page.setViewportSize({width:720,height:320});const titles=await page.locator("h2").allTextContents();expect(titles).toEqual(["First","Second"]);
  });
  test("orientation and forced colors preserve the main landmark",async({page})=>{
    await fixture(page,`<p>Text</p>`);await page.emulateMedia({forcedColors:"active"});await page.setViewportSize({width:720,height:320});await expect(page.getByRole("main")).toHaveCount(1);
  });
  test("orientation and reduced motion preserve page heading",async({page})=>{
    await fixture(page,`<p>Text</p>`);await page.emulateMedia({reducedMotion:"reduce"});await page.setViewportSize({width:720,height:320});await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
  });
  test("orientation and high contrast preserve document language",async({page})=>{
    await fixture(page,`<p>Text</p>`);await page.emulateMedia({contrast:"more"});await page.setViewportSize({width:720,height:320});await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
});
