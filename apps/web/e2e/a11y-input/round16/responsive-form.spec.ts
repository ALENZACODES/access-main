import { expect, test } from "@playwright/test";
import { fixture, setFontScale, expectNoHorizontalOverflow, box } from "./visual-harness";

async function formPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page,`<form id="form">
    <div class="field"><label for="first">First name</label><input id="first"></div>
    <div class="field"><label for="last">Last name</label><input id="last"></div>
    <div class="field"><label for="notes">Notes</label><textarea id="notes"></textarea></div>
    <div class="field"><label for="choice">Preferred contact</label><select id="choice"><option>Email</option><option>Phone</option></select></div>
    <button id="submit">Save details</button>
  </form>`,
  `.field{display:grid;gap:4px;margin-block:16px}input,textarea,select{width:100%;max-width:100%}`);
}
test.describe("P16 round 16 responsive form layout",()=>{
  test.beforeEach(async({page})=>formPage(page));
  test("form fits 320 CSS pixel viewport",async({page})=>{await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);});
  test("form fits 360 CSS pixel viewport",async({page})=>{await page.setViewportSize({width:360,height:720});await expectNoHorizontalOverflow(page);});
  test("form fits 400 CSS pixel viewport",async({page})=>{await page.setViewportSize({width:400,height:800});await expectNoHorizontalOverflow(page);});
  test("form fits landscape mobile viewport",async({page})=>{await page.setViewportSize({width:720,height:320});await expectNoHorizontalOverflow(page);});
  test("form fits desktop viewport",async({page})=>{await page.setViewportSize({width:1280,height:900});await expectNoHorizontalOverflow(page);});
  test("first field stays inside content width",async({page})=>{await page.setViewportSize({width:320,height:720});const b=await box(page,"#first");expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(320);});
  test("textarea stays inside content width",async({page})=>{await page.setViewportSize({width:320,height:720});const b=await box(page,"#notes");expect(b.right).toBeLessThanOrEqual(320);});
  test("select stays inside content width",async({page})=>{await page.setViewportSize({width:320,height:720});const b=await box(page,"#choice");expect(b.right).toBeLessThanOrEqual(320);});
  test("submit action stays inside content width",async({page})=>{await page.setViewportSize({width:320,height:720});const b=await box(page,"#submit");expect(b.right).toBeLessThanOrEqual(320);});
  test("form labels remain visible at narrow width",async({page})=>{await page.setViewportSize({width:320,height:720});for(const label of ["First name","Last name","Notes","Preferred contact"])await expect(page.getByText(label,{exact:true})).toBeVisible();});
  test("form labels remain associated after resize",async({page})=>{await page.setViewportSize({width:320,height:720});await expect(page.getByLabel("First name")).toHaveCount(1);await expect(page.getByLabel("Last name")).toHaveCount(1);});
  test("text scale 200 percent keeps form in viewport",async({page})=>{await setFontScale(page,200);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);});
  test("text scale 400 percent keeps form in viewport",async({page})=>{await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);});
  test("text scale 400 percent keeps submit action visible",async({page})=>{await setFontScale(page,400);await page.setViewportSize({width:320,height:720});await page.locator("#submit").scrollIntoViewIfNeeded();await expect(page.locator("#submit")).toBeVisible();});
  test("form field can be edited at 400 percent",async({page})=>{await setFontScale(page,400);await page.locator("#first").fill("Alex");await expect(page.locator("#first")).toHaveValue("Alex");});
  test("form field can be edited in landscape",async({page})=>{await page.setViewportSize({width:720,height:320});await page.locator("#last").fill("Khan");await expect(page.locator("#last")).toHaveValue("Khan");});
  test("Tab order follows form source order",async({page})=>{await page.locator("#first").focus();await page.keyboard.press("Tab");await expect(page.locator("#last")).toBeFocused();});
  test("Tab reaches textarea after name fields",async({page})=>{await page.locator("#last").focus();await page.keyboard.press("Tab");await expect(page.locator("#notes")).toBeFocused();});
  test("Tab reaches select after textarea",async({page})=>{await page.locator("#notes").focus();await page.keyboard.press("Tab");await expect(page.locator("#choice")).toBeFocused();});
  test("Tab reaches submit action after select",async({page})=>{await page.locator("#choice").focus();await page.keyboard.press("Tab");await expect(page.locator("#submit")).toBeFocused();});
  test("Shift Tab reverses form order",async({page})=>{await page.locator("#submit").focus();await page.keyboard.press("Shift+Tab");await expect(page.locator("#choice")).toBeFocused();});
});
