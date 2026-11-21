import { expect, test } from "@playwright/test";
import { fixture, expectFocus } from "./harness";

async function recoveryFixture(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<button id="start">Start</button>
  <section id="step-one" aria-labelledby="one-title">
    <h2 id="one-title">Step one</h2><label for="first">First value</label><input id="first">
    <button id="continue">Continue</button>
  </section>
  <section id="step-two" aria-labelledby="two-title" hidden>
    <h2 id="two-title">Step two</h2><label for="second">Second value</label><input id="second">
    <button id="finish">Finish</button>
  </section>
  <p id="message" role="status" aria-live="polite">Ready</p>
  <script>
    const first=document.querySelector('#first'),second=document.querySelector('#second');
    document.querySelector('#continue').onclick=()=>{
      if(!first.value){document.querySelector('#message').textContent='Enter the first value';first.setAttribute('aria-invalid','true');first.focus();return;}
      document.querySelector('#step-one').hidden=true;document.querySelector('#step-two').hidden=false;second.focus();
    };
    document.querySelector('#finish').onclick=()=>{
      if(!second.value){document.querySelector('#message').textContent='Enter the second value';second.setAttribute('aria-invalid','true');second.focus();return;}
      document.querySelector('#message').textContent='Complete';document.querySelector('#start').focus();
    };
    first.addEventListener('input',()=>first.removeAttribute('aria-invalid'));
    second.addEventListener('input',()=>second.removeAttribute('aria-invalid'));
  </script>`);
}
test.describe("P16 round 15 multi-step focus recovery",()=>{
  test.beforeEach(async({page})=>recoveryFixture(page));
  test("start action receives initial focus on request",async({page})=>{
    await page.locator("#start").focus();
    await expectFocus(page,"start");
  });
  test("continue with empty required value focuses field",async({page})=>{
    await page.locator("#continue").click();
    await expectFocus(page,"first");
  });
  test("empty required value exposes invalid state",async({page})=>{
    await page.locator("#continue").click();
    await expect(page.locator("#first")).toHaveAttribute("aria-invalid","true");
  });
  test("empty required value announces correction",async({page})=>{
    await page.locator("#continue").click();
    await expect(page.locator("#message")).toHaveText("Enter the first value");
  });
  test("typing clears invalid state",async({page})=>{
    await page.locator("#continue").click();
    await page.locator("#first").fill("Value");
    await expect(page.locator("#first")).not.toHaveAttribute("aria-invalid","true");
  });
  test("valid first value moves to next step",async({page})=>{
    await page.locator("#first").fill("Value");
    await page.locator("#continue").click();
    await expect(page.locator("#step-two")).toBeVisible();
    await expectFocus(page,"second");
  });
  test("completed first step is hidden from focus",async({page})=>{
    await page.locator("#first").fill("Value");
    await page.locator("#continue").click();
    await expect(page.locator("#step-one")).toBeHidden();
    await page.locator("#second").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#step-one")).not.toContainText("Step one");
  });
  test("second step validation focuses second field",async({page})=>{
    await page.locator("#first").fill("Value");
    await page.locator("#continue").click();
    await page.locator("#finish").click();
    await expectFocus(page,"second");
  });
  test("second step validation announces correction",async({page})=>{
    await page.locator("#first").fill("Value");
    await page.locator("#continue").click();
    await page.locator("#finish").click();
    await expect(page.locator("#message")).toHaveText("Enter the second value");
  });
  test("successful completion announces result",async({page})=>{
    await page.locator("#first").fill("One");
    await page.locator("#continue").click();
    await page.locator("#second").fill("Two");
    await page.locator("#finish").click();
    await expect(page.locator("#message")).toHaveText("Complete");
  });
  test("successful completion restores focus to start",async({page})=>{
    await page.locator("#first").fill("One");
    await page.locator("#continue").click();
    await page.locator("#second").fill("Two");
    await page.locator("#finish").click();
    await expectFocus(page,"start");
  });
  test("first step is not left focusable while hidden",async({page})=>{
    await page.locator("#first").fill("One");
    await page.locator("#continue").click();
    await page.locator("#first").focus();
    expect(await page.locator("#step-one").evaluate(node=>node.contains(document.activeElement))).toBe(false);
  });
  test("second step stays visible until completion",async({page})=>{
    await page.locator("#first").fill("One");
    await page.locator("#continue").click();
    await expect(page.locator("#step-two")).toBeVisible();
  });
  test("message region remains available during validation",async({page})=>{
    await page.locator("#continue").click();
    await expect(page.locator("#message")).toHaveAttribute("role","status");
    await expect(page.locator("#message")).toHaveAttribute("aria-live","polite");
  });
  test("message update does not steal focus from invalid field",async({page})=>{
    await page.locator("#continue").click();
    await expectFocus(page,"first");
  });
  test("keyboard Enter can advance after correction",async({page})=>{
    await page.locator("#first").fill("One");
    await page.locator("#continue").focus();
    await page.keyboard.press("Enter");
    await expectFocus(page,"second");
  });
  test("keyboard Enter can complete after correction",async({page})=>{
    await page.locator("#first").fill("One");
    await page.locator("#continue").click();
    await page.locator("#second").fill("Two");
    await page.locator("#finish").focus();
    await page.keyboard.press("Enter");
    await expectFocus(page,"start");
  });
  test("hidden step two is skipped before first step completion",async({page})=>{
    await page.locator("#continue").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#second")).not.toBeFocused();
  });
  test("language can be changed without losing field value",async({page})=>{
    await page.locator("#first").fill("Saved value");
    await page.locator("html").evaluate(node=>node.setAttribute("lang","fr"));
    await expect(page.locator("#first")).toHaveValue("Saved value");
  });
  test("route remains unchanged throughout step transition",async({page})=>{
    const before=page.url();
    await page.locator("#first").fill("One");
    await page.locator("#continue").click();
    expect(page.url()).toBe(before);
  });
});
