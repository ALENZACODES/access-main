import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { observeDialog, pressTabAndObserve, activeFocusSnapshot } from "./p20ag-browser-focus.ts";
import { disclosureGroupIssues } from "./p20ag-disclosure-keyboard.ts";
import { disclosureIssues, type FocusNode } from "./p20ag-focus-contracts.ts";
import { rovingFocusIssues } from "./p20ag-focus-contracts.ts";

const widgets = `<!doctype html><html lang="en"><head><title>Keyboard widgets</title>
<style>*{box-sizing:border-box}body{font:16px/1.5 sans-serif;padding:20px}button,[role=tab]{min-width:44px;min-height:44px;padding:8px}:focus-visible{outline:3px solid #174ea6;outline-offset:2px}</style>
</head><body><main><h1>Keyboard widgets</h1>
<section aria-labelledby="accordion-title"><h2 id="accordion-title">Frequently asked questions</h2>
<button id="faq-one" aria-expanded="false" aria-controls="faq-one-panel">First question</button>
<div id="faq-one-panel" hidden>First answer</div>
<button id="faq-two" aria-expanded="false" aria-controls="faq-two-panel">Second question</button>
<div id="faq-two-panel" hidden>Second answer</div></section>
<section aria-labelledby="tabs-title"><h2 id="tabs-title">Preferences</h2>
<div role="tablist" aria-label="Preference categories" id="tablist">
<button role="tab" id="tab-general" aria-selected="true" aria-controls="panel-general" tabindex="0">General</button>
<button role="tab" id="tab-access" aria-selected="false" aria-controls="panel-access" tabindex="-1">Access</button>
<button role="tab" id="tab-language" aria-selected="false" aria-controls="panel-language" tabindex="-1">Language</button>
</div>
<section role="tabpanel" id="panel-general" aria-labelledby="tab-general">General settings</section>
<section role="tabpanel" id="panel-access" aria-labelledby="tab-access" hidden>Access settings</section>
<section role="tabpanel" id="panel-language" aria-labelledby="tab-language" hidden>Language settings</section>
</section></main>
<script>
for(const id of ["one","two"]){
 const button=document.querySelector("#faq-"+id);
 const panel=document.querySelector("#faq-"+id+"-panel");
 button.addEventListener("click",()=>{
  const expanded=button.getAttribute("aria-expanded")==="true";
  button.setAttribute("aria-expanded",String(!expanded));
  panel.hidden=expanded;
 });
}
const tabs=Array.from(document.querySelectorAll("[role=tab]"));
function selectTab(tab){
 for(const item of tabs){
  const selected=item===tab;
  item.setAttribute("aria-selected",String(selected));
  item.tabIndex=selected?0:-1;
  document.querySelector("#"+item.getAttribute("aria-controls")).hidden=!selected;
 }
 tab.focus();
}
document.querySelector("#tablist").addEventListener("keydown",(event)=>{
 const current=tabs.indexOf(document.activeElement);
 if(current<0)return;
 let next=null;
 if(event.key==="ArrowRight")next=tabs[(current+1)%tabs.length];
 if(event.key==="ArrowLeft")next=tabs[(current-1+tabs.length)%tabs.length];
 if(event.key==="Home")next=tabs[0];
 if(event.key==="End")next=tabs[tabs.length-1];
 if(next){event.preventDefault();selectTab(next);}
});
tabs.forEach((tab)=>tab.addEventListener("click",()=>selectTab(tab)));
</script></body></html>`;

test.describe("P20AG keyboard accordion and tablist journeys", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(widgets);
  });

  test("P20AG accordion toggles with Enter and leaves focus on its control", async ({ page }) => {
    const first = page.locator("#faq-one");
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#faq-one-panel")).toBeVisible();
    await expect(first).toBeFocused();
    const state = await first.evaluate((element) => ({
      expanded: element.getAttribute("aria-expanded") === "true",
      panelVisible: !(document.querySelector("#faq-one-panel") as HTMLElement).hidden,
    }));
    expect(disclosureIssues({ id: "faq-one", expanded: state.expanded, panelVisible: state.panelVisible,
      controlsId: "faq-one-panel", panelId: "faq-one-panel", summaryFocusable: true, summaryName: "First question" })).toEqual([]);
  });

  test("P20AG accordion toggles with Space and can collapse again", async ({ page }) => {
    const first = page.locator("#faq-one");
    await first.focus();
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#faq-one-panel")).toBeHidden();
  });

  test("P20AG accordion group reports matching controls and panels", async ({ page }) => {
    const group = await page.locator("main").evaluate((element) => {
      const items = Array.from(element.querySelectorAll<HTMLButtonElement>("[aria-controls]"));
      return items.map((item, index) => {
        const panel = document.getElementById(item.getAttribute("aria-controls") ?? "");
        return {
          id: item.id, name: item.textContent ?? "",
          expanded: item.getAttribute("aria-expanded") === "true",
          panelId: panel?.id ?? null, panelVisible: panel ? !panel.hidden : false,
          disabled: item.disabled, focusable: item.tabIndex >= 0, domOrder: index,
          panelLabelledBy: item.id, panelRegion: false,
        };
      });
    });
    expect(disclosureGroupIssues({ id: "faq", items: group, exclusive: false, orientation: "vertical" })).toEqual([]);
  });

  test("P20AG tablist ArrowRight moves focus and selection together", async ({ page }) => {
    await page.locator("#tab-general").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tab-access")).toBeFocused();
    await expect(page.locator("#tab-access")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#panel-access")).toBeVisible();
    await expect(page.locator("#panel-general")).toBeHidden();
  });

  test("P20AG tablist ArrowLeft wraps from first to last tab", async ({ page }) => {
    await page.locator("#tab-general").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#tab-language")).toBeFocused();
    await expect(page.locator("#tab-language")).toHaveAttribute("aria-selected", "true");
  });

  test("P20AG tablist Home and End move to first and last tabs", async ({ page }) => {
    await page.locator("#tab-access").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#tab-language")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.locator("#tab-general")).toBeFocused();
  });

  test("P20AG tablist keeps exactly one zero tabindex", async ({ page }) => {
    const report: FocusNode[] = await page.locator("[role=tab]").evaluateAll((elements) => elements.map((element) => ({
      id: element.id, role: "tab" as const, name: element.textContent ?? "", domOrder: 0,
      tabIndex: (element as HTMLElement).tabIndex, visible: true, enabled: true,
      inert: false, ariaHidden: false, focusable: true, rect: null, scopeId: "tabs",
      outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2, boxShadow: "none",
    })));
    expect(rovingFocusIssues("tabs", report, "tab-general")).toEqual([]);
  });

  test("P20AG tablist has no axe violations", async ({ page }) => {
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });

  test("P20AG sequential keyboard traversal reaches the accordion and tab controls", async ({ page }) => {
    await page.locator("#faq-one").focus();
    const next = await pressTabAndObserve(page);
    expect(next.after).toBe("faq-two");
    const after = await pressTabAndObserve(page);
    expect(after.after).toBe("tab-general");
    expect((await activeFocusSnapshot(page)).visible).toBe(true);
  });
});

test("P20AG nested native dialogs keep focus in the topmost dialog and restore parent focus", async ({ page }) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Nested dialogs</title>
  <style>button{min-height:44px;min-width:44px}:focus-visible{outline:3px solid #174ea6}</style></head><body>
  <main><h1>Nested dialogs</h1><button id="open-parent">Open parent</button></main>
  <dialog id="parent" aria-labelledby="parent-title"><h2 id="parent-title">Parent dialog</h2>
    <button id="open-child">Open child</button><button id="close-parent">Close parent</button>
    <dialog id="child" aria-labelledby="child-title"><h3 id="child-title">Child dialog</h3>
      <button id="close-child">Close child</button></dialog>
  </dialog>
  <script>
   const parent=document.querySelector("#parent"),child=document.querySelector("#child");
   document.querySelector("#open-parent").onclick=()=>{parent.showModal();document.querySelector("#open-child").focus();};
   document.querySelector("#open-child").onclick=()=>{child.showModal();document.querySelector("#close-child").focus();};
   document.querySelector("#close-child").onclick=()=>child.close();
   document.querySelector("#close-parent").onclick=()=>parent.close();
   child.addEventListener("close",()=>document.querySelector("#open-child").focus());
   parent.addEventListener("close",()=>document.querySelector("#open-parent").focus());
  </script></body></html>`);
  await page.locator("#open-parent").click();
  await page.locator("#open-child").click();
  await expect(page.locator("#child")).toBeVisible();
  await expect(page.locator("#close-child")).toBeFocused();
  const childState = await observeDialog(page, { dialogId: "child" });
  expect(childState.activeId).toBe("close-child");
  await page.keyboard.press("Escape");
  await expect(page.locator("#child")).toBeHidden();
  await expect(page.locator("#open-child")).toBeFocused();
  await expect(page.locator("#parent")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#parent")).toBeHidden();
  await expect(page.locator("#open-parent")).toBeFocused();
});
