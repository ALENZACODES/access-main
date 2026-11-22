import { expect, test } from "@playwright/test";
import { assertTarget, assertWidgetSemantics, expectFocus, fixture, inspectWidgets } from "./harness";
import { expectRoving, expectSelected, pressKeys } from "./patterns";

async function mountTabs(page: import("@playwright/test").Page, vertical = false): Promise<void> {
  await fixture(page, `<div id="tabset" role="tablist" aria-label="Workspace" aria-orientation="${vertical ? "vertical" : "horizontal"}">
    <button id="tab-home" role="tab" aria-selected="true" aria-controls="panel-home" tabindex="0">Home</button>
    <button id="tab-details" role="tab" aria-selected="false" aria-controls="panel-details" tabindex="-1">Details</button>
    <button id="tab-history" role="tab" aria-selected="false" aria-controls="panel-history" tabindex="-1">History</button>
  </div>
  <section id="panel-home" role="tabpanel" aria-labelledby="tab-home" tabindex="0">Home content</section>
  <section id="panel-details" role="tabpanel" aria-labelledby="tab-details" tabindex="0" hidden>Details content</section>
  <section id="panel-history" role="tabpanel" aria-labelledby="tab-history" tabindex="0" hidden>History content</section>
  <script>
    const root=document.querySelector('#tabset');
    const tabs=[...root.querySelectorAll('[role=tab]')];
    const activate=(tab,focus=true)=>{
      tabs.forEach(item=>{const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;});
      document.querySelectorAll('[role=tabpanel]').forEach(panel=>{panel.hidden=panel.id!==tab.getAttribute('aria-controls');});
      if(focus)tab.focus();
    };
    root.addEventListener('keydown',event=>{
      const current=tabs.indexOf(document.activeElement);if(current<0)return;
      const vertical=root.getAttribute('aria-orientation')==='vertical';
      let next=current;
      if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      else if((!vertical&&event.key==='ArrowRight')||(vertical&&event.key==='ArrowDown'))next=(current+1)%tabs.length;
      else if((!vertical&&event.key==='ArrowLeft')||(vertical&&event.key==='ArrowUp'))next=(current+tabs.length-1)%tabs.length;
      else return;
      event.preventDefault();activate(tabs[next]);
    });
    root.addEventListener('click',event=>{const tab=event.target.closest('[role=tab]');if(tab)activate(tab);});
  </script>`);
}
test.describe("P16 round 15 tabs: keyboard contract", () => {
  test.beforeEach(async ({ page }) => mountTabs(page));
  test("has a named tablist, selected tab and roving stop", async ({ page }) => {
    await assertWidgetSemantics(page);
    await page.keyboard.press("Tab");
    await expectRoving(page, "#tabset [role=tab]", "tab-home");
  });
  test("right arrow moves to next tab and panel", async ({ page }) => {
    await page.locator("#tab-home").focus();
    await page.keyboard.press("ArrowRight");
    await expectFocus(page, "tab-details");
    await expectSelected(page, "#tabset [role=tab]", "tab-details");
    await expect(page.locator("#panel-details")).toBeVisible();
    await expect(page.locator("#panel-home")).toBeHidden();
  });
  test("left arrow wraps to final tab", async ({ page }) => {
    await page.locator("#tab-home").focus();
    await page.keyboard.press("ArrowLeft");
    await expectFocus(page, "tab-history");
    await expectSelected(page, "#tabset [role=tab]", "tab-history");
  });
  test("right arrow wraps to first tab", async ({ page }) => {
    await page.locator("#tab-history").focus();
    await page.keyboard.press("ArrowRight");
    await expectFocus(page, "tab-home");
  });
  test("Home selects first tab", async ({ page }) => {
    await page.locator("#tab-history").focus();
    await page.keyboard.press("Home");
    await expectFocus(page, "tab-home");
    await expectSelected(page, "#tabset [role=tab]", "tab-home");
  });
  test("End selects final tab", async ({ page }) => {
    await page.locator("#tab-home").focus();
    await page.keyboard.press("End");
    await expectFocus(page, "tab-history");
  });
  test("all tabs expose 44 pixel targets", async ({ page }) => {
    for (const id of ["tab-home","tab-details","tab-history"]) await assertTarget(page, `#${id}`);
  });
  test("vertical tabs use Down and Up", async ({ page }) => {
    await mountTabs(page, true);
    await page.locator("#tab-home").focus();
    await page.keyboard.press("ArrowDown");
    await expectFocus(page, "tab-details");
    await page.keyboard.press("ArrowUp");
    await expectFocus(page, "tab-home");
  });
  test("vertical tabs ignore horizontal arrows", async ({ page }) => {
    await mountTabs(page, true);
    await page.locator("#tab-home").focus();
    await page.keyboard.press("ArrowRight");
    await expectFocus(page, "tab-home");
  });
  test("horizontal tabs ignore vertical arrows", async ({ page }) => {
    await page.locator("#tab-home").focus();
    await page.keyboard.press("ArrowDown");
    await expectFocus(page, "tab-home");
  });
  test("Tab leaves tablist for the active panel", async ({ page }) => {
    await page.locator("#tab-home").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page, "panel-home");
  });
  test("Shift Tab returns from panel to active tab", async ({ page }) => {
    await page.locator("#panel-home").focus();
    await page.keyboard.press("Shift+Tab");
    await expectFocus(page, "tab-home");
  });
  test("Tab does not change active selection", async ({ page }) => {
    await page.locator("#tab-home").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#tab-home")).toHaveAttribute("aria-selected","true");
  });
  test("selection and roving tabindex remain synchronized after repeated movement", async ({ page }) => {
    await page.locator("#tab-home").focus();
    await pressKeys(page, ["ArrowRight","ArrowRight","ArrowRight","ArrowLeft","ArrowRight","ArrowRight"]);
    await expect(page.locator("#tabset [aria-selected=true]")).toHaveCount(1);
    const selected = await page.locator("#tabset [aria-selected=true]").getAttribute("id");
    expect(selected).toBe("tab-details");
    await expectRoving(page, "#tabset [role=tab]", "tab-details");
  });
  test("clicking a tab selects it and reveals its panel", async ({ page }) => {
    await page.locator("#tab-history").click();
    await expect(page.locator("#tab-history")).toHaveAttribute("aria-selected","true");
    await expect(page.locator("#panel-history")).toBeVisible();
  });
  test("a second selection hides the former panel", async ({ page }) => {
    await page.locator("#tab-details").click();
    await page.locator("#tab-history").click();
    await expect(page.locator("#panel-details")).toBeHidden();
    await expect(page.locator("#panel-history")).toBeVisible();
  });
  test("missing panel reference is reported", async ({ page }) => {
    await page.locator("#tab-details").evaluate(node => node.removeAttribute("aria-controls"));
    const result = await inspectWidgets(page);
    expect(result.issues.map(issue=>issue.code)).toContain("tab-panel-reference");
  });
  test("two selected tabs are reported", async ({ page }) => {
    await page.locator("#tab-details").evaluate(node => node.setAttribute("aria-selected","true"));
    const result = await inspectWidgets(page);
    expect(result.issues.map(issue=>issue.code)).toContain("tab-selection-count");
  });
  test("two tab stops are reported", async ({ page }) => {
    await page.locator("#tab-details").evaluate(node=>{(node as HTMLElement).tabIndex=0;});
    const result = await inspectWidgets(page);
    expect(result.issues.map(issue=>issue.code)).toContain("tab-roving-focus");
  });
  test("unnamed tablist is reported", async ({ page }) => {
    await page.locator("#tabset").evaluate(node => node.removeAttribute("aria-label"));
    const result = await inspectWidgets(page);
    expect(result.issues.map(issue=>issue.code)).toContain("tablist-name");
  });
  test("missing tabpanel is reported", async ({ page }) => {
    await page.locator("#panel-history").evaluate(node=>node.remove());
    const result = await inspectWidgets(page);
    expect(result.issues.map(issue=>issue.code)).toContain("tab-panel-reference");
  });
  test("inactive tabs remain outside sequential focus order", async ({ page }) => {
    await page.locator("#tab-home").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#tab-details")).not.toBeFocused();
    await expect(page.locator("#panel-home")).toBeFocused();
  });
  test("selected tab exposes its panel label", async ({ page }) => {
    await page.locator("#tab-details").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#panel-history")).toHaveAttribute("aria-labelledby","tab-history");
  });
  test("disabled state is exposed without silently removing tab", async ({ page }) => {
    await page.locator("#tab-details").evaluate(node => node.setAttribute("aria-disabled","true"));
    await page.locator("#tab-home").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tab-details")).toBeFocused();
    await expect(page.locator("#tab-details")).toHaveAttribute("aria-disabled","true");
  });
});
