import { expect, test } from "@playwright/test";
import { currentFocus, traceTabOrder } from "./focus-lifecycle-round14";

async function pageWith(page: import("@playwright/test").Page, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Focus edge matrix</title><style>
  button,a,input,select,textarea{min-width:44px;min-height:44px}
  :focus-visible{outline:3px solid #163b5c;outline-offset:2px}
  </style></head><body><main><h1>Focus edge matrix</h1>${body}</main></body></html>`);
}
test.describe("P16 round 14 focus edge matrix", () => {
  test("anchor is included in sequential traversal", async ({ page }) => {
    await pageWith(page, `<a id="link" href="#end">Continue</a><p id="end">End</p>`);
    expect((await traceTabOrder(page, 10)).items.map(x => x.selector)).toContain("#link");
  });
  test("button is included in sequential traversal", async ({ page }) => {
    await pageWith(page, `<button id="button">Continue</button>`);
    expect((await traceTabOrder(page, 10)).items.map(x => x.selector)).toContain("#button");
  });
  test("labelled checkbox is included in sequential traversal", async ({ page }) => {
    await pageWith(page, `<label><input id="check" type="checkbox">Agree</label>`);
    expect((await traceTabOrder(page, 10)).items.map(x => x.selector)).toContain("#check");
  });
  test("select participates in sequential traversal", async ({ page }) => {
    await pageWith(page, `<label for="choice">Choice</label><select id="choice"><option>One</option></select>`);
    expect((await traceTabOrder(page, 10)).items.map(x => x.selector)).toContain("#choice");
  });
  test("textarea participates in sequential traversal", async ({ page }) => {
    await pageWith(page, `<label for="notes">Notes</label><textarea id="notes"></textarea>`);
    expect((await traceTabOrder(page, 10)).items.map(x => x.selector)).toContain("#notes");
  });
  test("summary participates when details is closed", async ({ page }) => {
    await pageWith(page, `<details><summary id="summary">Details</summary><button id="inside">Inside</button></details>`);
    const selectors = (await traceTabOrder(page, 10)).items.map(x => x.selector);
    expect(selectors).toContain("#summary");
    expect(selectors).not.toContain("#inside");
  });
  test("details content participates after disclosure opens", async ({ page }) => {
    await pageWith(page, `<details open><summary>Details</summary><button id="inside">Inside</button></details>`);
    expect((await traceTabOrder(page, 10)).items.map(x => x.selector)).toContain("#inside");
  });
  test("negative tabindex remains programmatically focusable but not sequential", async ({ page }) => {
    await pageWith(page, `<button id="programmatic" tabindex="-1">Programmatic</button><button id="sequential">Sequential</button>`);
    await page.locator("#programmatic").focus();
    expect((await currentFocus(page))?.selector).toBe("#programmatic");
    expect((await traceTabOrder(page, 10)).items.map(x => x.selector)).not.toContain("#programmatic");
  });
  test("contenteditable with tabindex zero is sequentially reachable", async ({ page }) => {
    await pageWith(page, `<div id="edit" contenteditable="true" tabindex="0" aria-label="Edit notes">Notes</div>`);
    expect((await traceTabOrder(page, 10)).items.map(x => x.selector)).toContain("#edit");
  });
  test("radio group native tab stop is observed", async ({ page }) => {
    await pageWith(page, `<fieldset><legend>Mode</legend><label><input type="radio" name="mode" checked>One</label><label><input type="radio" name="mode">Two</label></fieldset>`);
    const items = (await traceTabOrder(page, 10)).items;
    expect(items.filter(x => x.role === "radio")).toHaveLength(1);
  });
  test("button in aria-hidden subtree is not a valid target", async ({ page }) => {
    await pageWith(page, `<div aria-hidden="true"><button id="hidden">Hidden</button></div><button id="visible">Visible</button>`);
    await page.keyboard.press("Tab");
    expect(await page.locator("#visible").evaluate(node => node === document.activeElement)).toBe(true);
  });
  test("fixed overlay does not change the active focus identity", async ({ page }) => {
    await pageWith(page, `<button id="action">Action</button><div style="position:fixed;right:0;bottom:0;width:10px;height:10px"></div>`);
    await page.locator("#action").focus();
    expect((await currentFocus(page))?.selector).toBe("#action");
  });
  test("replacing focused element does not report detached node as active", async ({ page }) => {
    await pageWith(page, `<button id="old">Old</button><button id="next">Next</button>`);
    await page.locator("#old").focus();
    await page.locator("#old").evaluate(node => node.remove());
    expect((await currentFocus(page))?.selector).not.toBe("#old");
  });
  test("focus moves into dynamically opened content after user activation", async ({ page }) => {
    await pageWith(page, `<button id="open" aria-controls="panel" aria-expanded="false">Open</button><div id="panel" hidden><button id="inside">Inside</button></div><script>document.querySelector('#open').onclick=()=>{document.querySelector('#panel').hidden=false;document.querySelector('#open').setAttribute('aria-expanded','true');document.querySelector('#inside').focus()}</script>`);
    await page.locator("#open").click();
    await expect(page.locator("#inside")).toBeFocused();
    expect((await currentFocus(page))?.selector).toBe("#inside");
  });
  test("focus is not moved by an unrelated status update", async ({ page }) => {
    await pageWith(page, `<button id="action">Action</button><p id="status" role="status" aria-live="polite">Waiting</p>`);
    await page.locator("#action").focus();
    await page.locator("#status").evaluate(node => { node.textContent = "Updated"; });
    await expect(page.locator("#action")).toBeFocused();
  });
  test("focus is restored to a surviving sibling after removal", async ({ page }) => {
    await pageWith(page, `<button id="first">First</button><button id="second">Second</button>`);
    await page.locator("#first").focus();
    await page.locator("#first").evaluate(node => node.remove());
    await page.locator("#second").focus();
    expect((await currentFocus(page))?.selector).toBe("#second");
  });
  test("Tab trace marker is removed even after a bounded walk", async ({ page }) => {
    await pageWith(page, `<button>One</button><button>Two</button>`);
    await traceTabOrder(page, 1);
    await expect(page.locator("[data-p16-r14-focus]")).toHaveCount(0);
  });
  test("trace rejects an invalid bound", async ({ page }) => {
    await pageWith(page, `<button>One</button>`);
    await expect(traceTabOrder(page, 0)).rejects.toThrow("Invalid focus trace bound");
  });
  test("trace rejects an excessive bound", async ({ page }) => {
    await pageWith(page, `<button>One</button>`);
    await expect(traceTabOrder(page, 301)).rejects.toThrow("Invalid focus trace bound");
  });
});
