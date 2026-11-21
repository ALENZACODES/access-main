import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, visibleState } from "./visual-harness";

async function navPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<header id="header" style="position:sticky;top:0;z-index:5;background:white;padding:8px">
    <nav aria-label="Primary" class="row"><a id="home" href="#home-section">Home</a><a id="places" href="#places-section">Places</a><a id="help" href="#help-section">Help</a></nav>
  </header>
  <section id="home-section" style="height:500px"><h2>Home</h2><button>Home action</button></section>
  <section id="places-section" style="height:500px"><h2>Places</h2><button>Places action</button></section>
  <section id="help-section" style="height:500px"><h2>Help</h2><button>Help action</button></section>`);
}
test.describe("P16 round 16 responsive sticky navigation",()=>{
  test.beforeEach(async({page})=>navPage(page));
  test("primary navigation is exposed as a named landmark",async({page})=>{await expect(page.getByRole("navigation",{name:"Primary"})).toHaveCount(1);});
  test("navigation has three named links",async({page})=>{await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(3);});
  test("first navigation link is keyboard reachable",async({page})=>{await page.locator("#home").focus();await expect(page.locator("#home")).toBeFocused();});
  test("second navigation link is keyboard reachable",async({page})=>{await page.locator("#places").focus();await expect(page.locator("#places")).toBeFocused();});
  test("third navigation link is keyboard reachable",async({page})=>{await page.locator("#help").focus();await expect(page.locator("#help")).toBeFocused();});
  test("navigation wraps at narrow width",async({page})=>{await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);});
  test("navigation wraps at 360 width",async({page})=>{await page.setViewportSize({width:360,height:720});await expectNoHorizontalOverflow(page);});
  test("navigation remains visible while scrolling",async({page})=>{await page.evaluate(()=>window.scrollTo(0,600));await expect(page.locator("#header")).toBeVisible();});
  test("navigation links remain visible after scroll",async({page})=>{await page.evaluate(()=>window.scrollTo(0,600));await expect(page.locator("#places")).toBeVisible();});
  test("focused navigation link is not hidden by header",async({page})=>{await page.locator("#places").focus();const state=await visibleState(page,"#places");expect(state.visible).toBe(true);});
  test("navigation focus does not change the route",async({page})=>{const before=page.url();await page.locator("#places").focus();expect(page.url()).toBe(before);});
  test("navigation link activation changes fragment",async({page})=>{await page.locator("#places").focus();await page.keyboard.press("Enter");await expect(page).toHaveURL(/#places-section$/);});
  test("navigation retains order after resize",async({page})=>{await page.setViewportSize({width:320,height:720});const ids=await page.locator("nav a").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).id));expect(ids).toEqual(["home","places","help"]);});
  test("navigation remains labelled after resize",async({page})=>{await page.setViewportSize({width:320,height:720});await expect(page.getByRole("navigation",{name:"Primary"})).toHaveCount(1);});
  test("navigation remains labelled after orientation change",async({page})=>{await page.setViewportSize({width:720,height:320});await expect(page.getByRole("navigation",{name:"Primary"})).toHaveCount(1);});
  test("navigation does not obscure main heading after fragment jump",async({page})=>{await page.locator("#places").click();await expect(page.locator("#places-section h2")).toBeVisible();});
  test("navigation works with reduced motion preference",async({page})=>{await page.emulateMedia({reducedMotion:"reduce"});await page.locator("#help").focus();await page.keyboard.press("Enter");await expect(page).toHaveURL(/#help-section$/);});
  test("navigation works with forced colors",async({page})=>{await page.emulateMedia({forcedColors:"active"});await page.locator("#home").focus();await expect(page.locator("#home")).toBeFocused();});
  test("navigation works with text magnification",async({page})=>{await page.addStyleTag({content:"html{font-size:300%!important}"});await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);});
});
