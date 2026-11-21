import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, setFontScale, box } from "./visual-harness";

test.describe("P16 round 16 responsive layout state",()=>{
  test("layout starts in one column on phone",async({page})=>{
    await fixture(page,`<div id="layout" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px"><div id="a">A</div><div id="b">B</div></div>`);await page.setViewportSize({width:320,height:720});const a=await box(page,"#a"),b=await box(page,"#b");expect(b.y).toBeGreaterThan(a.y);
  });
  test("layout expands on desktop",async({page})=>{
    await fixture(page,`<div id="layout" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px"><div id="a">A</div><div id="b">B</div></div>`);await page.setViewportSize({width:1280,height:900});const a=await box(page,"#a"),b=await box(page,"#b");expect(b.x).toBeGreaterThan(a.x);
  });
  test("layout adapts after repeated orientation changes",async({page})=>{
    await fixture(page,`<div class="row"><button>A</button><button>B</button></div>`);for(const [width,height] of [[320,720],[720,320],[320,720]]){await page.setViewportSize({width,height});await expectNoHorizontalOverflow(page);}
  });
  test("layout remains usable with 200 percent text",async({page})=>{
    await fixture(page,`<div class="row"><button>Previous</button><button>Continue</button></div>`);await setFontScale(page,200);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("layout remains usable with 400 percent text",async({page})=>{
    await fixture(page,`<div class="row"><button>Previous</button><button>Continue</button></div>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("layout preserves section order after resizing",async({page})=>{
    await fixture(page,`<section id="a">First</section><section id="b">Second</section>`);await page.setViewportSize({width:320,height:720});const ids=await page.locator("main section").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).id));expect(ids).toEqual(["a","b"]);
  });
  test("layout preserves section order after scaling",async({page})=>{
    await fixture(page,`<section id="a">First</section><section id="b">Second</section>`);await setFontScale(page,400);const ids=await page.locator("main section").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).id));expect(ids).toEqual(["a","b"]);
  });
  test("layout does not hide page heading",async({page})=>{
    await fixture(page,`<p>Text</p>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expect(page.getByRole("heading",{level:1})).toBeVisible();
  });
  test("layout does not hide form label",async({page})=>{
    await fixture(page,`<label for="field">Name</label><input id="field">`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expect(page.getByText("Name",{exact:true})).toBeVisible();
  });
  test("layout does not hide the primary action",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expect(page.locator("#action")).toBeVisible();
  });
  test("layout does not change button accessible name",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await setFontScale(page,400);await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("layout does not change form accessible name",async({page})=>{
    await fixture(page,`<label for="field">Name</label><input id="field">`);await setFontScale(page,400);await expect(page.getByLabel("Name")).toHaveCount(1);
  });
  test("layout does not change the route",async({page})=>{
    await fixture(page,`<p>Content</p>`);const url=page.url();await page.setViewportSize({width:320,height:720});await setFontScale(page,300);expect(page.url()).toBe(url);
  });
  test("layout does not change document language",async({page})=>{
    await fixture(page,`<p>Content</p>`);await page.setViewportSize({width:320,height:720});await setFontScale(page,300);await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
});
