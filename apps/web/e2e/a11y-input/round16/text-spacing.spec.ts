import { expect, test } from "@playwright/test";
import { fixture, applyTextSpacing, spacing as inspectSpacing, expectNoHorizontalOverflow, noClippedText } from "./visual-harness";

async function spacingPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<article id="content"><h2>Information</h2><p id="first">This paragraph contains a meaningful instruction that should remain readable when users increase spacing.</p>
  <p id="second">A second paragraph gives additional context and must remain separate from the first.</p>
  <ul id="list"><li>First item</li><li>Second item</li><li>Third item</li></ul>
  <label for="name">Name</label><input id="name"><button id="save">Save changes</button></article>`);
}
test.describe("P16 round 16 user text-spacing overrides",()=>{
  test.beforeEach(async({page})=>spacingPage(page));
  test("default paragraph line height is measurable",async({page})=>{
    const value=await inspectSpacing(page,"#first");expect(value.lineHeight).toBeGreaterThan(value.fontSize);
  });
  test("increased line height is applied",async({page})=>{
    await applyTextSpacing(page,"#content");const value=await inspectSpacing(page,"#first");expect(value.lineHeight).toBeGreaterThanOrEqual(value.fontSize*1.5);
  });
  test("increased letter spacing is applied",async({page})=>{
    await applyTextSpacing(page,"#content");const value=await inspectSpacing(page,"#first");expect(value.letterSpacing).toBeGreaterThan(0);
  });
  test("increased word spacing is applied",async({page})=>{
    await applyTextSpacing(page,"#content");const value=await inspectSpacing(page,"#first");expect(value.wordSpacing).toBeGreaterThan(0);
  });
  test("paragraph spacing increases after override",async({page})=>{
    await applyTextSpacing(page,"#content");const gap=await page.locator("#first").evaluate(node=>{
      const a=node.getBoundingClientRect(),b=node.nextElementSibling?.getBoundingClientRect();return b?b.top-a.bottom:0;
    });expect(gap).toBeGreaterThanOrEqual(20);
  });
  test("paragraphs do not overlap under text spacing",async({page})=>{
    await applyTextSpacing(page,"#content");const a=await page.locator("#first").boundingBox(),b=await page.locator("#second").boundingBox();
    expect(b?.y).toBeGreaterThanOrEqual((a?.y??0)+(a?.height??0));
  });
  test("list items remain separated under text spacing",async({page})=>{
    await applyTextSpacing(page,"#content");const a=await page.locator("#list li").nth(0).boundingBox(),b=await page.locator("#list li").nth(1).boundingBox();
    expect(b?.y).toBeGreaterThanOrEqual((a?.y??0)+(a?.height??0));
  });
  test("text spacing does not create horizontal page overflow",async({page})=>{
    await applyTextSpacing(page,"#content");await expectNoHorizontalOverflow(page);
  });
  test("text spacing does not clip paragraph content",async({page})=>{
    await applyTextSpacing(page,"#content");await noClippedText(page,"#content p");
  });
  test("text spacing does not clip list items",async({page})=>{
    await applyTextSpacing(page,"#content");await noClippedText(page,"#list li");
  });
  test("text spacing does not hide the heading",async({page})=>{
    await applyTextSpacing(page,"#content");await expect(page.getByRole("heading",{name:"Information"})).toBeVisible();
  });
  test("text spacing does not hide the field label",async({page})=>{
    await applyTextSpacing(page,"#content");await expect(page.getByText("Name",{exact:true})).toBeVisible();
  });
  test("text spacing does not hide the save action",async({page})=>{
    await applyTextSpacing(page,"#content");await expect(page.getByRole("button",{name:"Save changes"})).toBeVisible();
  });
  test("field remains editable under text spacing",async({page})=>{
    await applyTextSpacing(page,"#content");await page.getByLabel("Name").fill("Alex");await expect(page.getByLabel("Name")).toHaveValue("Alex");
  });
  test("button remains keyboard reachable under text spacing",async({page})=>{
    await applyTextSpacing(page,"#content");await page.locator("#save").focus();await expect(page.locator("#save")).toBeFocused();
  });
  test("text spacing can be applied at 320 pixels",async({page})=>{
    await page.setViewportSize({width:320,height:720});await applyTextSpacing(page,"#content");await expectNoHorizontalOverflow(page);
  });
  test("text spacing can be applied at 400 pixels",async({page})=>{
    await page.setViewportSize({width:400,height:800});await applyTextSpacing(page,"#content");await expectNoHorizontalOverflow(page);
  });
  test("text spacing can be applied at desktop width",async({page})=>{
    await page.setViewportSize({width:1280,height:900});await applyTextSpacing(page,"#content");await expectNoHorizontalOverflow(page);
  });
  test("text spacing override is applied after font magnification",async({page})=>{
    await page.addStyleTag({content:"html{font-size:200%!important}"});await applyTextSpacing(page,"#content");await expectNoHorizontalOverflow(page);
  });
  test("spacing override preserves text order",async({page})=>{
    await applyTextSpacing(page,"#content");const text=await page.locator("#content").innerText();
    expect(text.indexOf("First paragraph")).toBe(-1);
    expect(text.indexOf("This paragraph")).toBeLessThan(text.indexOf("A second paragraph"));
  });
  test("spacing override preserves list semantics",async({page})=>{
    await applyTextSpacing(page,"#content");await expect(page.getByRole("listitem")).toHaveCount(3);
  });
  test("spacing override preserves form association",async({page})=>{
    await applyTextSpacing(page,"#content");await expect(page.getByLabel("Name")).toHaveCount(1);
  });
  test("spacing override does not alter document language",async({page})=>{
    await applyTextSpacing(page,"#content");await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
});
