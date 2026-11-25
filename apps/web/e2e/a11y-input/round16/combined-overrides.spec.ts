import { expect, test } from "@playwright/test";
import { fixture, setFontScale, expectNoHorizontalOverflow, box } from "./visual-harness";

test.describe("P16 round 16 layout resilience under combined overrides",()=>{
  test("400 percent text and narrow viewport do not overflow",async({page})=>{
    await fixture(page,`<article><h2>Accessible information</h2><p>Text content wraps at the available width.</p><button>Continue</button></article>`);
    await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("400 percent text and landscape viewport do not overflow",async({page})=>{
    await fixture(page,`<article><h2>Accessible information</h2><p>Text content wraps at the available width.</p><button>Continue</button></article>`);
    await setFontScale(page,400);await page.setViewportSize({width:720,height:320});await expectNoHorizontalOverflow(page);
  });
  test("text spacing and 200 percent scale do not overflow",async({page})=>{
    await fixture(page,`<article id="copy"><p>Text spacing and magnification remain usable.</p></article>`);
    await setFontScale(page,200);await page.addStyleTag({content:"#copy{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}"});await expectNoHorizontalOverflow(page);
  });
  test("forced colors and 400 percent text keep action visible",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.emulateMedia({forcedColors:"active"});await setFontScale(page,400);await expect(page.locator("#action")).toBeVisible();
  });
  test("reduced motion and 400 percent text keep disclosure operable",async({page})=>{
    await fixture(page,`<button id="toggle" aria-expanded="false" aria-controls="panel">Show</button><div id="panel" hidden>Details</div><script>document.querySelector('#toggle').onclick=()=>{const b=document.querySelector('#toggle'),p=document.querySelector('#panel');const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));p.hidden=!open}</script>`);
    await page.emulateMedia({reducedMotion:"reduce"});await setFontScale(page,400);await page.locator("#toggle").click();await expect(page.locator("#panel")).toBeVisible();
  });
  test("contrast preference and 320 pixel viewport preserve page structure",async({page})=>{
    await fixture(page,`<h2>Details</h2><button>Continue</button>`);await page.emulateMedia({contrast:"more"});await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);await expect(page.getByRole("heading",{name:"Details"})).toBeVisible();
  });
  test("combined preferences preserve focus",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await setFontScale(page,300);await page.locator("#action").focus();await expect(page.locator("#action")).toBeFocused();
  });
  test("combined preferences preserve accessible name",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await setFontScale(page,300);await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("combined preferences preserve heading order",async({page})=>{
    await fixture(page,`<h2>Section</h2><h3>Details</h3>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce"});await setFontScale(page,250);await expect(page.getByRole("heading",{level:2})).toHaveCount(1);await expect(page.getByRole("heading",{level:3})).toHaveCount(1);
  });
  test("layout changes do not move controls in DOM order",async({page})=>{
    await fixture(page,`<button id="one">One</button><button id="two">Two</button><button id="three">Three</button>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});
    const ids=await page.locator("button").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).id));expect(ids).toEqual(["one","two","three"]);
  });
  test("layout changes do not remove form labels",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name">`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expect(page.getByLabel("Name")).toHaveCount(1);
  });
  test("layout changes do not collapse action target",async({page})=>{
    await fixture(page,`<button id="action" style="min-width:44px;min-height:44px">Continue</button>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});const b=await box(page,"#action");expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);
  });
  test("layout changes do not clip the last action",async({page})=>{
    await fixture(page,`<div style="height:800px"></div><button id="last">Last action</button>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await page.locator("#last").scrollIntoViewIfNeeded();await expect(page.locator("#last")).toBeInViewport();
  });
  test("viewport changes do not reset the document title",async({page})=>{
    await fixture(page,`<p>Content</p>`);const title=await page.title();await page.setViewportSize({width:320,height:720});await expect(page).toHaveTitle(title);
  });
  test("viewport changes do not alter language",async({page})=>{
    await fixture(page,`<p>Content</p>`);await page.setViewportSize({width:320,height:720});await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("layout changes do not create a horizontal scrollbar",async({page})=>{
    await fixture(page,`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))"><div>One</div><div>Two</div></div>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("layout changes preserve section reading sequence",async({page})=>{
    await fixture(page,`<section><h2>First</h2></section><section><h2>Second</h2></section>`);await setFontScale(page,300);const headings=await page.locator("h2").allTextContents();expect(headings).toEqual(["First","Second"]);
  });
  test("layout changes preserve visible content text",async({page})=>{
    await fixture(page,`<p id="copy">A useful instruction remains available.</p>`);await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expect(page.locator("#copy")).toHaveText("A useful instruction remains available.");
  });
});
