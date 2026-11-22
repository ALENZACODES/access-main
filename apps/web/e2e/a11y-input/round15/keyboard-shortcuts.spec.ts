import { expect, test } from "@playwright/test";
import { fixture, expectFocus } from "./harness";

async function shortcuts(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<nav aria-label="Sections">
    <a id="alpha" href="#alpha-panel">Alpha</a>
    <a id="beta" href="#beta-panel">Beta</a>
    <a id="gamma" href="#gamma-panel">Gamma</a>
  </nav>
  <section id="alpha-panel"><h2>Alpha</h2><button id="alpha-action">Alpha action</button></section>
  <section id="beta-panel"><h2>Beta</h2><button id="beta-action">Beta action</button></section>
  <section id="gamma-panel"><h2>Gamma</h2><button id="gamma-action">Gamma action</button></section>
  <button id="escape-target">Escape target</button>
  <p id="result" role="status" aria-live="polite">Ready</p>`);
}
test.describe("P16 round 15 keyboard navigation shortcuts",()=>{
  test.beforeEach(async({page})=>shortcuts(page));
  test("Home key in a text field moves caret to beginning",async({page})=>{
    await fixture(page,`<label for="text">Text</label><input id="text" value="abcdef">`);
    await page.locator("#text").focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Home");
    await page.keyboard.type("X");
    await expect(page.locator("#text")).toHaveValue("Xabcdef");
  });
  test("End key in a text field moves caret to end",async({page})=>{
    await fixture(page,`<label for="text">Text</label><input id="text" value="abcdef">`);
    await page.locator("#text").focus();
    await page.keyboard.press("End");
    await page.keyboard.type("X");
    await expect(page.locator("#text")).toHaveValue("abcdefX");
  });
  test("Control Home in document moves to first page content",async({page})=>{
    await page.addStyleTag({content: "#alpha-panel{min-height:180vh}"});
    await page.locator("#gamma-action").focus();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.keyboard.press("Control+Home");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
  test("Control End in document does not activate a control",async({page})=>{
    await page.locator("#alpha").focus();
    const before=page.url();
    await page.keyboard.press("Control+End");
    expect(page.url()).toBe(before);
  });
  test("Escape without popup does not navigate",async({page})=>{
    const before=page.url();
    await page.keyboard.press("Escape");
    expect(page.url()).toBe(before);
  });
  test("Escape without popup preserves current heading",async({page})=>{
    const heading=await page.locator("h1").textContent();
    await page.keyboard.press("Escape");
    await expect(page.locator("h1")).toHaveText(heading??"");
  });
  test("Tab moves from navigation to page content",async({page})=>{
    await page.locator("#gamma").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"alpha-action");
  });
  test("Shift Tab moves from content back to navigation",async({page})=>{
    await page.locator("#alpha-action").focus();
    await page.keyboard.press("Shift+Tab");
    await expectFocus(page,"gamma");
  });
  test("Enter on fragment link changes fragment",async({page})=>{
    await page.locator("#beta").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#beta-panel$/);
  });
  test("Space on fragment link does not activate link",async({page})=>{
    await page.locator("#beta").focus();
    const before=page.url();
    await page.keyboard.press("Space");
    expect(page.url()).toBe(before);
  });
  test("Arrow keys do not activate a normal link",async({page})=>{
    await page.locator("#alpha").focus();
    const before=page.url();
    await page.keyboard.press("ArrowDown");
    expect(page.url()).toBe(before);
  });
  test("focus remains visible after keyboard navigation",async({page})=>{
    await page.locator("#alpha").focus();
    const outline=await page.locator("#alpha").evaluate(node=>getComputedStyle(node).outlineStyle);
    expect(outline).not.toBe("none");
  });
  test("focus remains in document after moving across multiple controls",async({page})=>{
    await page.locator("#alpha").focus();
    for(let index=0;index<5;index++)await page.keyboard.press("Tab");
    expect(await page.evaluate(()=>document.activeElement!==document.body)).toBe(true);
  });
  test("navigation links remain named after fragment navigation",async({page})=>{
    await page.locator("#alpha").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#alpha")).toHaveText("Alpha");
  });
  test("navigation links remain keyboard reachable after fragment navigation",async({page})=>{
    await page.locator("#alpha").click();
    await page.locator("#beta").focus();
    await expectFocus(page,"beta");
  });
  test("repeated Tab does not change document language",async({page})=>{
    const lang=await page.locator("html").getAttribute("lang");
    await page.locator("#alpha").focus();
    for(let index=0;index<8;index++)await page.keyboard.press("Tab");
    await expect(page.locator("html")).toHaveAttribute("lang",lang??"en");
  });
  test("navigation links have stable destinations",async({page})=>{
    await expect(page.locator("#alpha")).toHaveAttribute("href","#alpha-panel");
    await expect(page.locator("#beta")).toHaveAttribute("href","#beta-panel");
    await expect(page.locator("#gamma")).toHaveAttribute("href","#gamma-panel");
  });
  test("keyboard focus does not fire click handlers",async({page})=>{
    await page.locator("#escape-target").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#result")).toHaveText("Ready");
  });
  test("Enter on button is the activation key",async({page})=>{
    await page.locator("#escape-target").evaluate(node=>node.addEventListener("click",()=>document.querySelector("#result")!.textContent="Activated"));
    await page.locator("#escape-target").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#result")).toHaveText("Activated");
  });
  test("Space on button is the activation key",async({page})=>{
    await page.locator("#escape-target").evaluate(node=>node.addEventListener("click",()=>document.querySelector("#result")!.textContent="Activated"));
    await page.locator("#escape-target").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#result")).toHaveText("Activated");
  });
});
