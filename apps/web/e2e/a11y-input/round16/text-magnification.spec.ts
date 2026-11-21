import { expect, test } from "@playwright/test";
import { fixture, setFontScale, expectNoHorizontalOverflow, noClippedText, box } from "./visual-harness";

async function zoomPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<article id="article"><h2 id="heading">Accessible information</h2>
  <p id="paragraph">People can increase text size and still read instructions without losing information.</p>
  <label for="name">Name</label><input id="name"><button id="continue">Continue</button>
  <a id="help" href="#details">Read more</a><section id="details"><h3>More details</h3><p>Additional information remains available.</p></section></article>`);
}
test.describe("P16 round 16 text magnification resilience",()=>{
  test.beforeEach(async({page})=>zoomPage(page));
  test("100 percent root text has a readable base size",async({page})=>{
    const size=await page.locator("body").evaluate(node=>parseFloat(getComputedStyle(node).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
  test("150 percent text scale keeps content in viewport",async({page})=>{
    await setFontScale(page,150);await expectNoHorizontalOverflow(page);
  });
  test("200 percent text scale keeps content in viewport",async({page})=>{
    await setFontScale(page,200);await expectNoHorizontalOverflow(page);
  });
  test("250 percent text scale keeps content in viewport",async({page})=>{
    await setFontScale(page,250);await expectNoHorizontalOverflow(page);
  });
  test("300 percent text scale keeps content in viewport",async({page})=>{
    await setFontScale(page,300);await expectNoHorizontalOverflow(page);
  });
  test("400 percent text scale keeps content in viewport",async({page})=>{
    await setFontScale(page,400);await expectNoHorizontalOverflow(page);
  });
  test("heading height expands to fit magnified text",async({page})=>{
    const before=await box(page,"#heading");await setFontScale(page,200);const after=await box(page,"#heading");
    expect(after.height).toBeGreaterThanOrEqual(before.height);
  });
  test("paragraph text is not clipped at 200 percent",async({page})=>{
    await setFontScale(page,200);await noClippedText(page,"#paragraph");
  });
  test("paragraph text is not clipped at 400 percent",async({page})=>{
    await setFontScale(page,400);await noClippedText(page,"#paragraph");
  });
  test("form label remains visible at 200 percent",async({page})=>{
    await setFontScale(page,200);await expect(page.getByText("Name",{exact:true})).toBeVisible();
  });
  test("form field remains reachable at 200 percent",async({page})=>{
    await setFontScale(page,200);await page.locator("#name").focus();await expect(page.locator("#name")).toBeFocused();
  });
  test("form field remains reachable at 400 percent",async({page})=>{
    await setFontScale(page,400);await page.locator("#name").focus();await expect(page.locator("#name")).toBeFocused();
  });
  test("button remains visible at 400 percent",async({page})=>{
    await setFontScale(page,400);await expect(page.locator("#continue")).toBeVisible();
  });
  test("button does not clip its label at 200 percent",async({page})=>{
    await setFontScale(page,200);await noClippedText(page,"#continue");
  });
  test("link remains visible at 400 percent",async({page})=>{
    await setFontScale(page,400);await expect(page.locator("#help")).toBeVisible();
  });
  test("link remains keyboard reachable at 400 percent",async({page})=>{
    await setFontScale(page,400);await page.locator("#help").focus();await expect(page.locator("#help")).toBeFocused();
  });
  test("content order remains unchanged after scaling",async({page})=>{
    await setFontScale(page,300);
    const ids=await page.locator("#article > *").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).id||node.tagName.toLowerCase()));
    expect(ids.slice(0,4)).toEqual(["heading","paragraph","label","name"]);
  });
  test("magnified text does not cover the primary action",async({page})=>{
    await setFontScale(page,250);
    const heading=await box(page,"#heading"),button=await box(page,"#continue");
    expect(button.top).toBeGreaterThanOrEqual(heading.bottom);
  });
  test("magnified text does not cover the help link",async({page})=>{
    await setFontScale(page,250);
    const input=await box(page,"#name"),link=await box(page,"#help");
    expect(link.top).toBeGreaterThanOrEqual(input.bottom);
  });
  test("viewport can be narrowed after text scaling",async({page})=>{
    await setFontScale(page,200);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("text scaling and narrow viewport can be reversed",async({page})=>{
    await setFontScale(page,300);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
    await setFontScale(page,100);await page.setViewportSize({width:1280,height:900});await expectNoHorizontalOverflow(page);
  });
  test("content remains available after zoom and scroll",async({page})=>{
    await setFontScale(page,400);await page.locator("#continue").scrollIntoViewIfNeeded();await expect(page.locator("#continue")).toBeInViewport();
  });
  test("zoom does not change accessible name of the action",async({page})=>{
    await setFontScale(page,300);await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("zoom does not change form label association",async({page})=>{
    await setFontScale(page,300);await expect(page.getByLabel("Name")).toHaveCount(1);
  });
});
