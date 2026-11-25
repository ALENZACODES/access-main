import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, setFontScale, box } from "./visual-harness";

test.describe("P16 round 16 responsive action rows",()=>{
  test("action row wraps at 320 pixels",async({page})=>{
    await fixture(page,`<div id="actions" class="row"><button>Save changes</button><button>Cancel</button><button>More options</button></div>`);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("action row wraps at 360 pixels",async({page})=>{
    await fixture(page,`<div id="actions" class="row"><button>Save changes</button><button>Cancel</button><button>More options</button></div>`);await page.setViewportSize({width:360,height:720});await expectNoHorizontalOverflow(page);
  });
  test("action row remains on one line when room allows",async({page})=>{
    await fixture(page,`<div id="actions" class="row"><button id="one">One</button><button id="two">Two</button></div>`);await page.setViewportSize({width:1280,height:900});const a=await box(page,"#one"),b=await box(page,"#two");expect(a.y).toBe(b.y);
  });
  test("action row remains operable after wrapping",async({page})=>{
    await fixture(page,`<div id="actions" class="row"><button id="one">One</button><button id="two">Two</button><button id="three">Three</button></div>`);await page.setViewportSize({width:320,height:720});await page.locator("#three").focus();await expect(page.locator("#three")).toBeFocused();
  });
  test("Tab order follows visual source order after wrapping",async({page})=>{
    await fixture(page,`<div class="row"><button id="one">One</button><button id="two">Two</button><button id="three">Three</button></div>`);await page.setViewportSize({width:320,height:720});await page.locator("#one").focus();await page.keyboard.press("Tab");await expect(page.locator("#two")).toBeFocused();
  });
  test("Shift Tab reverses source order after wrapping",async({page})=>{
    await fixture(page,`<div class="row"><button id="one">One</button><button id="two">Two</button><button id="three">Three</button></div>`);await page.setViewportSize({width:320,height:720});await page.locator("#three").focus();await page.keyboard.press("Shift+Tab");await expect(page.locator("#two")).toBeFocused();
  });
  test("400 percent text wraps action row without horizontal overflow",async({page})=>{
    await fixture(page,`<div class="row"><button>Save changes</button><button>Cancel</button><button>More options</button></div>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("action row labels remain readable after wrapping",async({page})=>{
    await fixture(page,`<div class="row"><button>Save changes</button><button>Cancel</button></div>`);await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button",{name:"Save changes"})).toBeVisible();await expect(page.getByRole("button",{name:"Cancel"})).toBeVisible();
  });
  test("action row remains in document flow",async({page})=>{
    await fixture(page,`<div class="row" id="actions"><button>One</button><button>Two</button></div><p id="following">Following</p>`);await page.setViewportSize({width:320,height:720});const row=await box(page,"#actions"),following=await box(page,"#following");expect(following.top).toBeGreaterThanOrEqual(row.bottom);
  });
  test("action row does not overlap following text at 400 percent",async({page})=>{
    await fixture(page,`<div class="row" id="actions"><button>Save changes</button><button>Cancel</button></div><p id="following">Following text</p>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});const row=await box(page,"#actions"),following=await box(page,"#following");expect(following.top).toBeGreaterThanOrEqual(row.bottom);
  });
});
