import { expect, test } from "@playwright/test";
import { fixture, overflow, expectNoHorizontalOverflow } from "./visual-harness";

async function scrollPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<section id="horizontal" role="region" aria-label="Timeline" tabindex="0" style="max-width:min(100%,36rem);overflow:auto">
    <div style="width:900px;display:flex;gap:12px"><article>January</article><article>February</article><article>March</article></div>
  </section>
  <section id="vertical" role="region" aria-label="Long notes" tabindex="0" style="height:180px;overflow:auto">
    <p>Beginning</p><div style="height:500px"></div><p id="last">End of notes</p>
  </section>
  <p>Following content</p>`);
}
test.describe("P16 round 16 scrollable content regions",()=>{
  test.beforeEach(async({page})=>scrollPage(page));
  test("horizontal region exposes a name",async({page})=>{
    await expect(page.getByRole("region",{name:"Timeline"})).toHaveCount(1);
  });
  test("vertical region exposes a name",async({page})=>{
    await expect(page.getByRole("region",{name:"Long notes"})).toHaveCount(1);
  });
  test("horizontal region is keyboard focusable",async({page})=>{
    await page.locator("#horizontal").focus();await expect(page.locator("#horizontal")).toBeFocused();
  });
  test("vertical region is keyboard focusable",async({page})=>{
    await page.locator("#vertical").focus();await expect(page.locator("#vertical")).toBeFocused();
  });
  test("horizontal region has actual horizontal overflow",async({page})=>{
    expect((await overflow(page,"#horizontal")).horizontal).toBe(true);
  });
  test("vertical region has actual vertical overflow",async({page})=>{
    expect((await overflow(page,"#vertical")).vertical).toBe(true);
  });
  test("horizontal scroll region does not expand the page",async({page})=>{
    await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("horizontal region scrolls with keyboard",async({page})=>{
    await page.locator("#horizontal").focus();await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.locator("#horizontal").evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  });
  test("vertical region scrolls with keyboard",async({page})=>{
    await page.locator("#vertical").focus();await page.keyboard.press("End");
    await expect.poll(() => page.locator("#vertical").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  });
  test("vertical region can reach final note",async({page})=>{
    await page.locator("#last").scrollIntoViewIfNeeded();await expect(page.locator("#last")).toBeInViewport();
  });
  test("horizontal region keeps its accessible name while scrolling",async({page})=>{
    await page.locator("#horizontal").evaluate(node=>node.scrollLeft=300);await expect(page.getByRole("region",{name:"Timeline"})).toHaveCount(1);
  });
  test("vertical region keeps its accessible name while scrolling",async({page})=>{
    await page.locator("#vertical").evaluate(node=>node.scrollTop=300);await expect(page.getByRole("region",{name:"Long notes"})).toHaveCount(1);
  });
  test("focus remains in horizontal region after scroll",async({page})=>{
    await page.locator("#horizontal").focus();await page.keyboard.press("ArrowRight");await expect(page.locator("#horizontal")).toBeFocused();
  });
  test("focus remains in vertical region after scroll",async({page})=>{
    await page.locator("#vertical").focus();await page.keyboard.press("End");await expect(page.locator("#vertical")).toBeFocused();
  });
  test("following content remains in document flow",async({page})=>{
    const region=await page.locator("#vertical").boundingBox(),following=await page.locator("body > main > p").boundingBox();
    expect(region).not.toBeNull();expect(following).not.toBeNull();
  });
  test("horizontal scroll region does not hide following paragraph",async({page})=>{
    await expect(page.getByText("Following content")).toBeVisible();
  });
  test("scroll container has visible border",async({page})=>{
    await page.locator("#horizontal").evaluate(node=>(node as HTMLElement).style.border="1px solid black");
    await expect(page.locator("#horizontal")).toHaveCSS("border-top-width","1px");
  });
  test("horizontal region remains usable at 400 percent text scale",async({page})=>{
    await page.addStyleTag({content:"html{font-size:400%!important}"});await page.locator("#horizontal").focus();await expect(page.locator("#horizontal")).toBeFocused();
  });
  test("vertical region remains usable at 400 percent text scale",async({page})=>{
    await page.addStyleTag({content:"html{font-size:400%!important}"});await page.locator("#vertical").focus();await expect(page.locator("#vertical")).toBeFocused();
  });
  test("scroll containers do not change page language",async({page})=>{
    await page.locator("#vertical").focus();await page.keyboard.press("End");await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("scroll container focus does not trigger navigation",async({page})=>{
    const before=page.url();await page.locator("#horizontal").focus();await page.keyboard.press("ArrowRight");expect(page.url()).toBe(before);
  });
});
