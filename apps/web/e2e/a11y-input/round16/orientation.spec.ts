import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, setViewport, box } from "./visual-harness";

async function responsivePage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<header><h2>Access options</h2></header>
  <nav aria-label="Primary" class="row"><a href="#one">One</a><a href="#two">Two</a><a href="#three">Three</a></nav>
  <div id="layout" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px">
    <section id="one" class="card"><h3>One</h3><p>First content</p><button>Open one</button></section>
    <section id="two" class="card"><h3>Two</h3><p>Second content</p><button>Open two</button></section>
  </div>
  <form><label for="name">Name</label><input id="name"><button>Save</button></form>`);
}
test.describe("P16 round 16 orientation and viewport adaptation",()=>{
  test.beforeEach(async({page})=>responsivePage(page));
  test("portrait phone viewport is supported",async({page})=>{
    await setViewport(page,320,720);await expectNoHorizontalOverflow(page);await expect(page.locator("h1")).toBeVisible();
  });
  test("landscape phone viewport is supported",async({page})=>{
    await setViewport(page,720,320);await expectNoHorizontalOverflow(page);await expect(page.locator("h1")).toBeVisible();
  });
  test("portrait tablet viewport is supported",async({page})=>{
    await setViewport(page,768,1024);await expectNoHorizontalOverflow(page);
  });
  test("landscape tablet viewport is supported",async({page})=>{
    await setViewport(page,1024,768);await expectNoHorizontalOverflow(page);
  });
  test("desktop landscape viewport is supported",async({page})=>{
    await setViewport(page,1440,900);await expectNoHorizontalOverflow(page);
  });
  test("portrait layout stacks cards",async({page})=>{
    await setViewport(page,320,720);const a=await box(page,"#one"),b=await box(page,"#two");expect(b.y).toBeGreaterThan(a.y);
  });
  test("wide layout can place cards side by side",async({page})=>{
    await setViewport(page,1280,900);const a=await box(page,"#one"),b=await box(page,"#two");expect(b.x).toBeGreaterThan(a.x);
  });
  test("rotating from portrait to landscape preserves the form value",async({page})=>{
    await page.locator("#name").fill("Alex");await setViewport(page,720,320);await expect(page.locator("#name")).toHaveValue("Alex");
  });
  test("rotating from landscape to portrait preserves the form value",async({page})=>{
    await setViewport(page,720,320);await page.locator("#name").fill("Alex");await setViewport(page,320,720);await expect(page.locator("#name")).toHaveValue("Alex");
  });
  test("rotation preserves the active element",async({page})=>{
    await page.locator("#name").focus();await setViewport(page,720,320);await expect(page.locator("#name")).toBeFocused();
  });
  test("rotation preserves heading structure",async({page})=>{
    await setViewport(page,720,320);await expect(page.getByRole("heading",{level:1})).toHaveCount(1);await expect(page.getByRole("heading",{level:2})).toHaveCount(1);
  });
  test("rotation preserves navigation landmark",async({page})=>{
    await setViewport(page,720,320);await expect(page.getByRole("navigation",{name:"Primary"})).toHaveCount(1);
  });
  test("navigation links wrap at portrait width",async({page})=>{
    await setViewport(page,320,720);await expectNoHorizontalOverflow(page,"nav");
  });
  test("form controls remain visible in landscape",async({page})=>{
    await setViewport(page,720,320);await expect(page.getByLabel("Name")).toBeVisible();
  });
  test("form controls remain reachable in portrait",async({page})=>{
    await setViewport(page,320,720);await page.getByLabel("Name").focus();await expect(page.getByLabel("Name")).toBeFocused();
  });
  test("button row wraps instead of clipping in portrait",async({page})=>{
    await setViewport(page,320,720);await expectNoHorizontalOverflow(page);
  });
  test("viewport resizing does not duplicate controls",async({page})=>{
    for(const [width,height] of [[320,720],[720,320],[768,1024],[1280,900]]){await setViewport(page,width,height);await expect(page.getByRole("button")).toHaveCount(3);}
  });
  test("viewport resizing does not change page language",async({page})=>{
    await setViewport(page,320,720);await setViewport(page,720,320);await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("orientation change does not navigate",async({page})=>{
    const before=page.url();await setViewport(page,720,320);expect(page.url()).toBe(before);
  });
  test("orientation change does not change document title",async({page})=>{
    const title=await page.title();await setViewport(page,720,320);await expect(page).toHaveTitle(title);
  });
  test("orientation change preserves link destinations",async({page})=>{
    await setViewport(page,320,720);await expect(page.locator("nav a").nth(1)).toHaveAttribute("href","#two");
  });
  test("narrow portrait does not hide content behind horizontal clipping",async({page})=>{
    await setViewport(page,320,720);const record=await page.locator("#two").evaluate(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right}));
    expect(record.left).toBeGreaterThanOrEqual(0);expect(record.right).toBeLessThanOrEqual(320);
  });
  test("small landscape does not hide content behind horizontal clipping",async({page})=>{
    await setViewport(page,568,320);const record=await page.locator("#two").evaluate(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right}));
    expect(record.left).toBeGreaterThanOrEqual(0);expect(record.right).toBeLessThanOrEqual(568);
  });
});
