import { expect, test } from "@playwright/test";
import { fixture, expectFocus } from "./harness";

async function statusPage(page: import("@playwright/test").Page): Promise<void> {
  await fixture(page, `<button id="save">Save</button>
  <p id="status" role="status" aria-live="polite" aria-atomic="true">Waiting</p>
  <p id="alert" role="alert" aria-live="assertive" aria-atomic="true" hidden></p>
  <ul id="log" role="log" aria-live="polite" aria-relevant="additions text"></ul>
  <script>
    document.querySelector('#save').addEventListener('click',()=>{
      document.querySelector('#status').textContent='Saved';
      document.querySelector('#log').insertAdjacentHTML('beforeend','<li>Saved</li>');
    });
  </script>`);
}
test.describe("P16 round 15 screen-reader announcement lifecycle",()=>{
  test.beforeEach(async({page})=>statusPage(page));
  test("status region has polite priority",async({page})=>{
    await expect(page.locator("#status")).toHaveAttribute("aria-live","polite");
  });
  test("status region is atomic",async({page})=>{
    await expect(page.locator("#status")).toHaveAttribute("aria-atomic","true");
  });
  test("alert region has assertive priority",async({page})=>{
    await expect(page.locator("#alert")).toHaveAttribute("aria-live","assertive");
  });
  test("alert region is initially hidden",async({page})=>{
    await expect(page.locator("#alert")).toBeHidden();
  });
  test("status update changes text without moving focus",async({page})=>{
    await page.locator("#save").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#status")).toHaveText("Saved");
    await expectFocus(page,"save");
  });
  test("status update does not hide the status region",async({page})=>{
    await page.locator("#save").click();
    await expect(page.locator("#status")).toBeVisible();
  });
  test("log receives a new item",async({page})=>{
    await page.locator("#save").click();
    await expect(page.locator("#log li")).toHaveCount(1);
  });
  test("log does not receive duplicate items from one activation",async({page})=>{
    await page.locator("#save").click();
    await expect(page.locator("#log li")).toHaveCount(1);
  });
  test("alert can announce a validation problem",async({page})=>{
    await page.locator("#alert").evaluate(node=>{node.textContent="Name is required";node.removeAttribute("hidden");});
    await expect(page.locator("#alert")).toHaveText("Name is required");
  });
  test("alert update does not steal focus",async({page})=>{
    await page.locator("#save").focus();
    await page.locator("#alert").evaluate(node=>{node.textContent="Problem";node.removeAttribute("hidden");});
    await expectFocus(page,"save");
  });
  test("status role remains present after update",async({page})=>{
    await page.locator("#save").click();
    await expect(page.locator("#status")).toHaveAttribute("role","status");
  });
  test("live region priority remains stable after repeated updates",async({page})=>{
    await page.locator("#status").evaluate(node=>{node.textContent="One";node.textContent="Two";node.textContent="Three";});
    await expect(page.locator("#status")).toHaveAttribute("aria-live","polite");
    await expect(page.locator("#status")).toHaveText("Three");
  });
  test("empty live region may receive its first message",async({page})=>{
    await page.locator("#status").evaluate(node=>node.textContent="Ready");
    await expect(page.locator("#status")).toHaveText("Ready");
  });
  test("live message does not alter the primary heading",async({page})=>{
    const heading=await page.locator("h1").textContent();
    await page.locator("#save").click();
    await expect(page.locator("h1")).toHaveText(heading??"");
  });
  test("status text is not a keyboard tab stop",async({page})=>{
    await page.keyboard.press("Tab");
    await expectFocus(page,"save");
    await page.keyboard.press("Tab");
    await expect(page.locator("#status")).not.toBeFocused();
  });
  test("log is not a keyboard tab stop",async({page})=>{
    await page.locator("#log").focus();
    await expect(page.locator("#log")).not.toBeFocused();
  });
  test("alert remains hidden until content is ready",async({page})=>{
    await expect(page.locator("#alert")).toBeHidden();
    await expect(page.locator("#status")).toBeVisible();
  });
  test("French status copy is preserved under French document language",async({page})=>{
    await page.locator("html").evaluate(node=>node.setAttribute("lang","fr"));
    await page.locator("#status").evaluate(node=>node.textContent="Enregistré");
    await expect(page.locator("#status")).toHaveText("Enregistré");
    await expect(page.locator("html")).toHaveAttribute("lang","fr");
  });
  test("French alert copy is preserved under French document language",async({page})=>{
    await page.locator("html").evaluate(node=>node.setAttribute("lang","fr"));
    await page.locator("#alert").evaluate(node=>{node.textContent="Une erreur est survenue";node.removeAttribute("hidden");});
    await expect(page.locator("#alert")).toHaveText("Une erreur est survenue");
  });
  test("language changes do not remove live region semantics",async({page})=>{
    await page.locator("html").evaluate(node=>node.setAttribute("lang","fr"));
    await expect(page.locator("#status")).toHaveAttribute("aria-live","polite");
    await expect(page.locator("#alert")).toHaveAttribute("aria-live","assertive");
  });
});
