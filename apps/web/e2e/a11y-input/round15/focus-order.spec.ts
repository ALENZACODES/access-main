import { expect, test } from "@playwright/test";
import { fixture, expectFocus } from "./harness";

async function orderPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<a id="first" href="#one">First link</a>
  <button id="second">Second button</button>
  <label for="third">Third input</label><input id="third">
  <label for="fourth">Fourth select</label><select id="fourth"><option>One</option><option>Two</option></select>
  <button id="fifth">Fifth button</button>
  <p id="one">Destination</p>`);
}
test.describe("P16 round 15 sequential focus order",()=>{
  test.beforeEach(async({page})=>orderPage(page));
  test("Tab starts at first sequential target",async({page})=>{
    await page.keyboard.press("Tab");
    await expectFocus(page,"first");
  });
  test("Tab advances in DOM order",async({page})=>{
    await page.locator("#first").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"second");
  });
  test("third Tab reaches labelled input",async({page})=>{
    await page.locator("#first").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expectFocus(page,"third");
  });
  test("fourth Tab reaches select",async({page})=>{
    await page.locator("#third").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"fourth");
  });
  test("fifth Tab reaches final button",async({page})=>{
    await page.locator("#fourth").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"fifth");
  });
  test("Shift Tab reverses adjacent focus",async({page})=>{
    await page.locator("#fifth").focus();
    await page.keyboard.press("Shift+Tab");
    await expectFocus(page,"fourth");
  });
  test("Shift Tab reverses two adjacent transitions",async({page})=>{
    await page.locator("#fifth").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expectFocus(page,"third");
  });
  test("Tab after reverse restores original next target",async({page})=>{
    await page.locator("#fourth").focus();
    await page.keyboard.press("Shift+Tab");
    await expectFocus(page,"third");
    await page.keyboard.press("Tab");
    await expectFocus(page,"fourth");
  });
  test("positive tabindex is never introduced by the fixture",async({page})=>{
    const values=await page.locator("[tabindex]").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).tabIndex));
    expect(values.filter(value=>value>0)).toEqual([]);
  });
  test("programmatic negative tabindex does not join sequential order",async({page})=>{
    await page.locator("#second").evaluate(node=>node.setAttribute("tabindex","-1"));
    await page.locator("#first").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"third");
  });
  test("disabled control is skipped",async({page})=>{
    await page.locator("#second").evaluate(node=>node.setAttribute("disabled",""));
    await page.locator("#first").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"third");
  });
  test("hidden control is skipped",async({page})=>{
    await page.locator("#second").evaluate(node=>node.setAttribute("hidden",""));
    await page.locator("#first").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"third");
  });
  test("inert region is skipped",async({page})=>{
    await page.locator("#second").evaluate(node=>{
      const wrapper=document.createElement("div");
      node.replaceWith(wrapper);
      wrapper.setAttribute("inert","");
      wrapper.append(node);
    });
    await page.locator("#first").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"third");
  });
  test("aria-hidden content is not sequentially focusable",async({page})=>{
    await page.locator("#second").evaluate(node=>node.setAttribute("aria-hidden","true"));
    await page.locator("#first").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"second");
    expect(await page.locator("#second").evaluate(node=>node.closest("[aria-hidden=true]")!==null)).toBe(true);
  });
  test("focus is not moved by unrelated text changes",async({page})=>{
    await page.locator("#second").focus();
    await page.locator("#one").evaluate(node=>node.textContent="Updated destination");
    await expectFocus(page,"second");
  });
  test("focus is not moved by live status changes",async({page})=>{
    await page.locator("#second").focus();
    await page.locator("#one").evaluate(node => node.setAttribute("role","status"));
    await page.locator("#one").evaluate(node => node.setAttribute("aria-live","polite"));
    await expectFocus(page,"second");
  });
  test("removing focused element does not leave a detached active node",async({page})=>{
    await page.locator("#second").focus();
    await page.locator("#second").evaluate(node=>node.remove());
    const active=await page.evaluate(()=>document.activeElement?.id??"");
    expect(active).not.toBe("second");
  });
  test("replacing focused element moves focus only when explicitly requested",async({page})=>{
    await page.locator("#second").focus();
    await page.locator("#second").evaluate(node=>node.replaceWith(document.createElement("button")));
    expect(await page.evaluate(()=>document.activeElement?.id??"")).not.toBe("second");
    await page.locator("#third").focus();
    await expectFocus(page,"third");
  });
  test("focus indicator is detectable on button",async({page})=>{
    await page.locator("#second").focus();
    const outline=await page.locator("#second").evaluate(node=>getComputedStyle(node).outlineStyle);
    expect(outline).not.toBe("none");
  });
  test("focus indicator is detectable on link",async({page})=>{
    await page.locator("#first").focus();
    const outline=await page.locator("#first").evaluate(node=>getComputedStyle(node).outlineStyle);
    expect(outline).not.toBe("none");
  });
  test("focus indicator is detectable on input",async({page})=>{
    await page.locator("#third").focus();
    const outline=await page.locator("#third").evaluate(node=>getComputedStyle(node).outlineStyle);
    expect(outline).not.toBe("none");
  });
  test("focus indicator is detectable on select",async({page})=>{
    await page.locator("#fourth").focus();
    const outline=await page.locator("#fourth").evaluate(node=>getComputedStyle(node).outlineStyle);
    expect(outline).not.toBe("none");
  });
  test("Tab does not activate a link",async({page})=>{
    const before=page.url();
    await page.locator("#first").focus();
    expect(page.url()).toBe(before);
  });
  test("focus order remains stable after input edit",async({page})=>{
    await page.locator("#third").fill("Changed");
    await page.locator("#third").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"fourth");
  });
  test("focus order remains stable after select change",async({page})=>{
    await page.locator("#fourth").selectOption({label:"Two"});
    await page.locator("#fourth").focus();
    await page.keyboard.press("Tab");
    await expectFocus(page,"fifth");
  });
});
