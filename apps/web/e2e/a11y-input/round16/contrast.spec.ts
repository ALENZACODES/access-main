import { expect, test } from "@playwright/test";
import { fixture, contrast, contrastRatio } from "./visual-harness";

async function contrastPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<article>
  <p id="normal" class="normal">Normal text</p>
  <p id="large" class="large">Large text</p>
  <a id="link" href="#target">A readable link</a>
  <button id="button">Continue</button>
  <input id="field" aria-label="Name" value="Alex">
  <p id="target">Target content</p>
  <p id="muted" class="muted">Secondary information</p>
  </article>`,
  `.normal{color:#18232d;background:#fff}.large{font-size:24px;color:#18232d;background:#fff}
   #link{color:#064b83;background:#fff}#button{color:#fff;background:#064b83}
   #field{color:#18232d;background:#fff;border:2px solid #52606d}
   .muted{color:#52606d;background:#fff}`);
}
test.describe("P16 round 16 text and control contrast",()=>{
  test.beforeEach(async({page})=>contrastPage(page));
  test("contrast ratio calculation handles black and white",async()=>{
    expect(contrastRatio("rgb(0, 0, 0)","rgb(255, 255, 255)")).toBeCloseTo(21,1);
  });
  test("contrast ratio calculation handles identical colors",async()=>{
    expect(contrastRatio("rgb(20, 20, 20)","rgb(20, 20, 20)")).toBeCloseTo(1,2);
  });
  test("normal text foreground is measured",async({page})=>{
    const result=await contrast(page,"#normal");expect(result.foreground).toBe("rgb(24, 35, 45)");
  });
  test("normal text contrast exceeds 4.5 to 1",async({page})=>{
    const result=await contrast(page,"#normal");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("large text contrast exceeds 3 to 1",async({page})=>{
    const result=await contrast(page,"#large");expect(result.ratio).toBeGreaterThanOrEqual(3);
  });
  test("link text contrast exceeds 4.5 to 1",async({page})=>{
    const result=await contrast(page,"#link");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("button label contrast exceeds 4.5 to 1",async({page})=>{
    const result=await contrast(page,"#button");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("input text contrast exceeds 4.5 to 1",async({page})=>{
    const result=await contrast(page,"#field");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("secondary information remains readable",async({page})=>{
    const result=await contrast(page,"#muted");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("button retains its background color",async({page})=>{
    const result=await contrast(page,"#button");expect(result.background).toBe("rgb(6, 75, 131)");
  });
  test("link remains underlined or otherwise distinguishable",async({page})=>{
    const style=await page.locator("#link").evaluate(node=>getComputedStyle(node).textDecorationLine);
    expect(style).not.toBe("none");
  });
  test("link is distinguishable from surrounding text without color",async({page})=>{
    await expect(page.locator("#link")).toHaveCSS("text-decoration-line",/underline/);
  });
  test("button has a visible boundary",async({page})=>{
    const border=await page.locator("#button").evaluate(node=>getComputedStyle(node).borderTopWidth);
    expect(parseFloat(border)).toBeGreaterThanOrEqual(1);
  });
  test("input has a visible boundary",async({page})=>{
    const border=await page.locator("#field").evaluate(node=>getComputedStyle(node).borderTopWidth);
    expect(parseFloat(border)).toBeGreaterThanOrEqual(2);
  });
  test("contrast remains measurable after focus",async({page})=>{
    await page.locator("#button").focus();const result=await contrast(page,"#button");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("contrast remains measurable after text magnification",async({page})=>{
    await page.addStyleTag({content:"html{font-size:200%!important}"});const result=await contrast(page,"#normal");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("contrast remains measurable at narrow viewport",async({page})=>{
    await page.setViewportSize({width:320,height:720});const result=await contrast(page,"#normal");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("contrast remains measurable at desktop viewport",async({page})=>{
    await page.setViewportSize({width:1280,height:900});const result=await contrast(page,"#normal");expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test("invalid low-contrast sample is detected by the ratio assertion",async({page})=>{
    await page.locator("#muted").evaluate(node=>(node as HTMLElement).style.color="#aaa");
    const result=await contrast(page,"#muted");expect(result.ratio).toBeLessThan(4.5);
  });
  test("color changes do not change accessible link name",async({page})=>{
    await page.locator("#link").evaluate(node=>(node as HTMLElement).style.color="#000");
    await expect(page.getByRole("link",{name:"A readable link"})).toHaveCount(1);
  });
  test("color changes do not change button role",async({page})=>{
    await page.locator("#button").evaluate(node=>(node as HTMLElement).style.backgroundColor="#000");
    await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("input value remains available independently of color",async({page})=>{
    await page.locator("#field").evaluate(node=>(node as HTMLInputElement).style.color="#000");
    await expect(page.locator("#field")).toHaveValue("Alex");
  });
});
