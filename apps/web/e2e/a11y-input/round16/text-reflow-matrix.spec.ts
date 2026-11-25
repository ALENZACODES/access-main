import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, setFontScale, noClippedText } from "./visual-harness";

test.describe("P16 round 16 text reflow content matrix",()=>{
  test("paragraph reflows at 320 pixels",async({page})=>{
    await fixture(page,`<p id="copy">The instructions explain how to continue through the next section without losing information.</p>`);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);await noClippedText(page,"#copy");
  });
  test("paragraph reflows at 400 pixels",async({page})=>{
    await fixture(page,`<p id="copy">The instructions explain how to continue through the next section without losing information.</p>`);await page.setViewportSize({width:400,height:720});await expectNoHorizontalOverflow(page);await noClippedText(page,"#copy");
  });
  test("heading reflows at 320 pixels",async({page})=>{
    await fixture(page,`<h2 id="heading">Instructions for the next stage of the process</h2>`);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);await noClippedText(page,"#heading");
  });
  test("heading reflows at 400 pixels",async({page})=>{
    await fixture(page,`<h2 id="heading">Instructions for the next stage of the process</h2>`);await page.setViewportSize({width:400,height:720});await expectNoHorizontalOverflow(page);await noClippedText(page,"#heading");
  });
  test("list items reflow at 320 pixels",async({page})=>{
    await fixture(page,`<ul><li>First item with additional explanatory words</li><li>Second item with additional explanatory words</li></ul>`);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("list items reflow at 400 percent text",async({page})=>{
    await fixture(page,`<ul><li>First item with additional explanatory words</li><li>Second item with additional explanatory words</li></ul>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("label text reflows at 400 percent",async({page})=>{
    await fixture(page,`<label for="name" id="label">Please enter your preferred display name</label><input id="name">`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await noClippedText(page,"#label");
  });
  test("button text reflows at 400 percent",async({page})=>{
    await fixture(page,`<button id="action" style="white-space:normal">Continue to the next section</button>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await noClippedText(page,"#action");
  });
  test("error text reflows at 400 percent",async({page})=>{
    await fixture(page,`<p id="error" role="alert">Please correct the information in the highlighted field before continuing.</p>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await noClippedText(page,"#error");
  });
  test("status text reflows at 400 percent",async({page})=>{
    await fixture(page,`<p id="status" role="status" aria-live="polite">Your changes have been saved in this session.</p>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await noClippedText(page,"#status");
  });
  test("reflow keeps heading before paragraph",async({page})=>{
    await fixture(page,`<h2 id="heading">Details</h2><p id="copy">Information</p>`);await setFontScale(page,400);const h=await page.locator("#heading").boundingBox(),p=await page.locator("#copy").boundingBox();expect(p?.y).toBeGreaterThanOrEqual((h?.y??0)+(h?.height??0));
  });
  test("reflow keeps paragraph before action",async({page})=>{
    await fixture(page,`<p id="copy">Information</p><button id="action">Continue</button>`);await setFontScale(page,400);const p=await page.locator("#copy").boundingBox(),b=await page.locator("#action").boundingBox();expect(b?.y).toBeGreaterThanOrEqual((p?.y??0)+(p?.height??0));
  });
});
