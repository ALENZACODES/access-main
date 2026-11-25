import { expect, test } from "@playwright/test";
import { fixture, box, assertTarget, expectNoHorizontalOverflow } from "./visual-harness";

async function targetPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<div id="actions" class="row">
    <button id="save">Save</button><button id="cancel">Cancel</button><a id="help" href="#details">Help</a>
    <label class="row"><input id="check" type="checkbox">Include notes</label>
  </div><p id="details">Details</p>`);
}
test.describe("P16 round 16 target size and spacing resilience",()=>{
  test.beforeEach(async({page})=>targetPage(page));
  test("primary button is at least 44 by 44 CSS pixels",async({page})=>{await assertTarget(page,"#save");});
  test("secondary button is at least 44 by 44 CSS pixels",async({page})=>{await assertTarget(page,"#cancel");});
  test("link target is at least 44 by 44 CSS pixels",async({page})=>{await assertTarget(page,"#help");});
  test("checkbox label expands its effective target",async({page})=>{
    const label=await page.locator("#check").evaluate(node=>node.closest("label")!.getBoundingClientRect().height);
    expect(label).toBeGreaterThanOrEqual(44);
  });
  test("button targets do not overlap horizontally",async({page})=>{
    const a=await box(page,"#save"),b=await box(page,"#cancel");expect(b.left).toBeGreaterThanOrEqual(a.right);
  });
  test("link target does not overlap button target",async({page})=>{
    const a=await box(page,"#cancel"),b=await box(page,"#help");expect(b.left).toBeGreaterThanOrEqual(a.right);
  });
  test("touch targets remain separated after wrapping",async({page})=>{
    await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
    const a=await box(page,"#save"),b=await box(page,"#cancel");
    expect(b.top>a.bottom||b.left>=a.right).toBe(true);
  });
  test("target geometry remains stable after focus",async({page})=>{
    const before=await box(page,"#save");await page.locator("#save").focus();const after=await box(page,"#save");
    expect(after.width).toBe(before.width);expect(after.height).toBe(before.height);
  });
  test("target geometry remains stable after activation",async({page})=>{
    const before=await box(page,"#save");await page.locator("#save").click();const after=await box(page,"#save");
    expect(after.width).toBe(before.width);expect(after.height).toBe(before.height);
  });
  test("target size remains valid at narrow viewport",async({page})=>{
    await page.setViewportSize({width:320,height:720});await assertTarget(page,"#save");await assertTarget(page,"#cancel");
  });
  test("target size remains valid at 400 pixel viewport",async({page})=>{
    await page.setViewportSize({width:400,height:800});await assertTarget(page,"#save");await assertTarget(page,"#cancel");
  });
  test("target size remains valid at desktop viewport",async({page})=>{
    await page.setViewportSize({width:1280,height:900});await assertTarget(page,"#save");await assertTarget(page,"#cancel");
  });
  test("target size remains valid after text scaling",async({page})=>{
    await page.addStyleTag({content:"html{font-size:200%!important}"});await assertTarget(page,"#save");
  });
  test("target labels remain available to role queries",async({page})=>{
    await expect(page.getByRole("button",{name:"Save"})).toHaveCount(1);
    await expect(page.getByRole("link",{name:"Help"})).toHaveCount(1);
  });
  test("target spacing does not alter control order",async({page})=>{
    const ids=await page.locator("#actions > *").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).id||node.tagName.toLowerCase()));
    expect(ids.slice(0,3)).toEqual(["save","cancel","help"]);
  });
  test("target spacing does not create horizontal overflow",async({page})=>{
    await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("target spacing does not hide the final action",async({page})=>{
    await page.setViewportSize({width:320,height:720});await expect(page.locator("#help")).toBeVisible();
  });
  test("keyboard can reach each target",async({page})=>{
    for(const id of ["save","cancel","help","check"]){await page.locator(`#${id}`).focus();await expect(page.locator(`#${id}`)).toBeFocused();}
  });
  test("checkbox remains toggleable after target sizing",async({page})=>{
    await page.locator("#check").focus();await page.keyboard.press("Space");await expect(page.locator("#check")).toBeChecked();
  });
  test("targets remain visible after vertical scroll",async({page})=>{
    await page.locator("#help").scrollIntoViewIfNeeded();await expect(page.locator("#help")).toBeInViewport();
  });
  test("target spacing is not achieved by overlapping hit regions",async({page})=>{
    const a=await box(page,"#save"),b=await box(page,"#cancel");
    expect(a.right<=b.left||a.bottom<=b.top).toBe(true);
  });
});
