import { expect, test } from "@playwright/test";
import { assertTarget, fixture, expectFocus } from "./harness";

async function switchFixture(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<button id="switch" role="switch" aria-checked="false">High contrast</button>
  <button id="check" role="checkbox" aria-checked="false">Include archived</button>
  <div role="radiogroup" aria-label="Display mode" id="radio-group">
    <button id="compact" role="radio" aria-checked="true" tabindex="0">Compact</button>
    <button id="comfortable" role="radio" aria-checked="false" tabindex="-1">Comfortable</button>
    <button id="expanded" role="radio" aria-checked="false" tabindex="-1">Expanded</button>
  </div>
  <label for="volume">Volume</label><input id="volume" type="range" min="0" max="10" value="4">
  <button id="disclosure" aria-expanded="false" aria-controls="details">Show details</button><section id="details" hidden>Details</section>
  <p id="announcement" role="status" aria-live="polite" aria-atomic="true">Ready</p>
  <script>
    const toggle=(node)=>{const value=node.getAttribute('aria-checked')!=='true';node.setAttribute('aria-checked',String(value));document.querySelector('#announcement').textContent=node.textContent+' '+(value?'on':'off');};
    for(const id of ['switch','check']){const node=document.querySelector('#'+id);node.addEventListener('click',()=>toggle(node));node.addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();toggle(node);}});}
    const group=document.querySelector('#radio-group'),radios=[...group.querySelectorAll('[role=radio]')];
    const select=index=>{radios.forEach((node,i)=>{node.setAttribute('aria-checked',String(i===index));node.tabIndex=i===index?0:-1;});radios[index].focus();document.querySelector('#announcement').textContent=radios[index].textContent+' selected';};
    group.addEventListener('keydown',event=>{const index=radios.indexOf(document.activeElement);if(index<0)return;let next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%radios.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index+radios.length-1)%radios.length;else if(event.key===' '||event.key==='Enter'){event.preventDefault();select(index);return;}else return;event.preventDefault();select(next);});
    radios.forEach((node,index)=>node.addEventListener('click',()=>select(index)));
    const disclosure=document.querySelector('#disclosure'),panel=document.querySelector('#details');
    disclosure.addEventListener('click',()=>{const open=disclosure.getAttribute('aria-expanded')!=='true';disclosure.setAttribute('aria-expanded',String(open));panel.hidden=!open;disclosure.textContent=open?'Hide details':'Show details';});
  </script>`);
}
test.describe("P16 round 15 switch and toggle keyboard contract",()=>{
  test.beforeEach(async({page})=>switchFixture(page));
  test("switch exposes a Boolean checked state",async({page})=>{await expect(page.locator("#switch")).toHaveAttribute("aria-checked","false");});
  test("Space toggles switch on",async({page})=>{await page.locator("#switch").focus();await page.keyboard.press("Space");await expect(page.locator("#switch")).toHaveAttribute("aria-checked","true");});
  test("Space toggles switch off",async({page})=>{await page.locator("#switch").focus();await page.keyboard.press("Space");await page.keyboard.press("Space");await expect(page.locator("#switch")).toHaveAttribute("aria-checked","false");});
  test("Enter activates a switch backed by a native button",async({page})=>{await page.locator("#switch").focus();await page.keyboard.press("Enter");await expect(page.locator("#switch")).toHaveAttribute("aria-checked","true");});
  test("switch retains focus after toggling",async({page})=>{await page.locator("#switch").focus();await page.keyboard.press("Space");await expectFocus(page,"switch");});
  test("checkbox Space toggles checked state",async({page})=>{await page.locator("#check").focus();await page.keyboard.press("Space");await expect(page.locator("#check")).toHaveAttribute("aria-checked","true");});
  test("checkbox can be toggled back with Space",async({page})=>{await page.locator("#check").focus();await page.keyboard.press("Space");await page.keyboard.press("Space");await expect(page.locator("#check")).toHaveAttribute("aria-checked","false");});
  test("radio group has one checked radio",async({page})=>{await expect(page.locator("#radio-group [aria-checked=true]")).toHaveCount(1);});
  test("radio group has one sequential stop",async({page})=>{await expect(page.locator("#radio-group [tabindex='0']")).toHaveCount(1);});
  test("ArrowRight selects next radio",async({page})=>{await page.locator("#compact").focus();await page.keyboard.press("ArrowRight");await expect(page.locator("#comfortable")).toHaveAttribute("aria-checked","true");});
  test("ArrowDown selects next radio",async({page})=>{await page.locator("#compact").focus();await page.keyboard.press("ArrowDown");await expect(page.locator("#comfortable")).toHaveAttribute("aria-checked","true");});
  test("ArrowLeft selects previous radio",async({page})=>{await page.locator("#comfortable").focus();await page.keyboard.press("ArrowLeft");await expect(page.locator("#compact")).toHaveAttribute("aria-checked","true");});
  test("ArrowUp selects previous radio",async({page})=>{await page.locator("#comfortable").focus();await page.keyboard.press("ArrowUp");await expect(page.locator("#compact")).toHaveAttribute("aria-checked","true");});
  test("radio navigation wraps after final option",async({page})=>{await page.locator("#expanded").focus();await page.keyboard.press("ArrowRight");await expectFocus(page,"compact");});
  test("radio navigation wraps before first option",async({page})=>{await page.locator("#compact").focus();await page.keyboard.press("ArrowLeft");await expectFocus(page,"expanded");});
  test("radio activation by Space selects focused option",async({page})=>{await page.locator("#comfortable").focus();await page.keyboard.press("Space");await expect(page.locator("#comfortable")).toHaveAttribute("aria-checked","true");});
  test("radio activation by Enter selects focused option",async({page})=>{await page.locator("#expanded").focus();await page.keyboard.press("Enter");await expect(page.locator("#expanded")).toHaveAttribute("aria-checked","true");});
  test("radio selection is exclusive after repeated keys",async({page})=>{await page.locator("#compact").focus();for(let i=0;i<18;i++)await page.keyboard.press(i%2?"ArrowLeft":"ArrowRight");await expect(page.locator("#radio-group [aria-checked=true]")).toHaveCount(1);});
  test("native range responds to ArrowRight",async({page})=>{await page.locator("#volume").focus();await page.keyboard.press("ArrowRight");await expect(page.locator("#volume")).toHaveValue("5");});
  test("native range responds to ArrowLeft",async({page})=>{await page.locator("#volume").focus();await page.keyboard.press("ArrowLeft");await expect(page.locator("#volume")).toHaveValue("3");});
  test("native range Home selects minimum",async({page})=>{await page.locator("#volume").focus();await page.keyboard.press("Home");await expect(page.locator("#volume")).toHaveValue("0");});
  test("native range End selects maximum",async({page})=>{await page.locator("#volume").focus();await page.keyboard.press("End");await expect(page.locator("#volume")).toHaveValue("10");});
  test("native range remains labelled",async({page})=>{await expect(page.getByLabel("Volume")).toHaveCount(1);});
  test("range meets 44px target height",async({page})=>{await assertTarget(page,"#volume");});
  test("disclosure opens with Enter",async({page})=>{await page.locator("#disclosure").focus();await page.keyboard.press("Enter");await expect(page.locator("#details")).toBeVisible();await expect(page.locator("#disclosure")).toHaveAttribute("aria-expanded","true");});
  test("disclosure opens with Space",async({page})=>{await page.locator("#disclosure").focus();await page.keyboard.press("Space");await expect(page.locator("#details")).toBeVisible();});
  test("disclosure closes with Enter",async({page})=>{await page.locator("#disclosure").click();await page.locator("#disclosure").focus();await page.keyboard.press("Enter");await expect(page.locator("#details")).toBeHidden();});
  test("disclosure keeps focus on trigger",async({page})=>{await page.locator("#disclosure").focus();await page.keyboard.press("Enter");await expectFocus(page,"disclosure");});
  test("status announcement updates after switch action",async({page})=>{await page.locator("#switch").focus();await page.keyboard.press("Space");await expect(page.locator("#announcement")).toHaveText("High contrast on");});
  test("status announcement updates after radio change",async({page})=>{await page.locator("#compact").focus();await page.keyboard.press("ArrowRight");await expect(page.locator("#announcement")).toHaveText("Comfortable selected");});
  test("switch target is at least 44 pixels",async({page})=>{await assertTarget(page,"#switch");});
  test("checkbox target is at least 44 pixels",async({page})=>{await assertTarget(page,"#check");});
  test("radio options are at least 44 pixels",async({page})=>{for(const id of ["compact","comfortable","expanded"])await assertTarget(page,`#${id}`);});
});
