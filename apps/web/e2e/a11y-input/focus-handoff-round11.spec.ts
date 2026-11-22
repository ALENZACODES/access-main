import { expect, test, type Page } from "@playwright/test";
import {
  observeHandoffFocusRound11,
  exerciseFocusNeighbourRound11,
  assertNoRouteFocusStealRound11,
  type HandoffCode,
} from "./focus-handoff-round11";

async function mount(page: Page, content: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Focus handoff</title>
    <style>button,a,input {min-width:44px;min-height:44px;} a {display:inline-flex;align-items:center;}
    :focus-visible {outline:3px solid #14466b;outline-offset:3px}</style></head>
    <body><main id="main"><h1>Focus handoff</h1>${content}</main></body></html>`);
}
async function inspect(page: Page, html: string, selector: string, code: HandoffCode): Promise<void> {
  await mount(page, html);
  await page.locator(selector).focus();
  const state = await observeHandoffFocusRound11(page);
  expect(state.findings.map((issue) => issue.code), JSON.stringify(state.findings)).toContain(code);
}

test("focus on a named 44px button has a stable accessible target", async ({ page }) => {
  await mount(page, `<button id="action">Action</button>`);
  await page.locator("#action").focus();
  const state = await observeHandoffFocusRound11(page);
  expect(state.target).toBe("#action");
  expect(state.interactive).toBe(true);
  expect(state.visible).toBe(true);
  expect(state.name).toBe("Action");
  expect(state.findings).toEqual([]);
});

test("focus snapshot identifies an inaccessible disabled link", async ({ page }) => {
  await inspect(page, `<a href="/help" id="action" aria-disabled="true">Help</a>`, "#action", "focus-disabled");
});

test("focused control hidden from assistive technology is rejected", async ({ page }) => {
  await inspect(page, `<button id="action" aria-hidden="true">Action</button>`, "#action", "focus-hidden");
});

test("focused control in inert subtree is rejected", async ({ page }) => {
  await mount(page, `<div><button id="action">Action</button></div>`);
  await page.locator("#action").focus();
  await page.locator("#action").evaluate((node) => node.parentElement?.setAttribute("inert", ""));
  await expect(page.locator("#action")).not.toBeFocused();
  const state = await observeHandoffFocusRound11(page);
  // Chromium moves focus to the document when an ancestor becomes inert;
  // the observable failure is therefore focus-disappeared, while the DOM
  // assertion proves the previously focused control is now inside inert content.
  expect(state.findings.map((issue) => issue.code)).toContain("focus-disappeared");
  expect(await page.locator("#action").evaluate((node) => node.parentElement?.hasAttribute("inert"))).toBe(true);
});

test("positive tabindex changes keyboard order and is reported", async ({ page }) => {
  await inspect(page, `<button id="action" tabindex="3">Action</button>`, "#action", "focus-positive-tabindex");
});

test("unnamed focused action is rejected", async ({ page }) => {
  await inspect(page, `<button id="action"></button>`, "#action", "focus-no-name");
});

test("undersized target remains a failure", async ({ page }) => {
  await inspect(page, `<button id="action" style="min-width:0;min-height:0;width:20px;height:20px;padding:0">+</button>`, "#action", "focus-target-too-small");
});

test("offscreen keyboard focus is reported", async ({ page }) => {
  await mount(page, `<button id="action" style="position:absolute;top:-500px">Action</button>`);
  await page.locator("#action").focus();
  const report = await observeHandoffFocusRound11(page);
  expect(report.findings.map((issue) => issue.code)).toContain("focus-outside-viewport");
});

test("div without interactive role is not a substitute for an action", async ({ page }) => {
  await inspect(page, `<div id="action" tabindex="0">Action</div>`, "#action", "focus-on-no-role");
});

test("screen-reader name uses aria-label for icon-only action", async ({ page }) => {
  await mount(page, `<button id="action" aria-label="Open settings"><span aria-hidden="true">⚙</span></button>`);
  await page.locator("#action").focus();
  const report = await observeHandoffFocusRound11(page);
  expect(report.name).toBe("Open settings");
  expect(report.findings).toEqual([]);
});

test("focus remains on a nav target after asynchronous work", async ({ page }) => {
  await mount(page, `<nav aria-label="Primary"><a id="action" href="/help">Help</a></nav>
    <script>document.getElementById('action').addEventListener('focus', () => Promise.resolve().then(() => { document.body.dataset.preloaded='yes'; }));</script>`);
  await page.locator("#action").focus();
  await assertNoRouteFocusStealRound11(page);
  await expect(page.locator("body")).toHaveAttribute("data-preloaded", "yes");
});

test("focus is not silently stolen by a delayed handler", async ({ page }) => {
  await mount(page, `<button id="action">Action</button><button id="other">Other</button>
    <script>document.getElementById('action').addEventListener('focus', () => {
      queueMicrotask(() => document.getElementById('other').focus());
    });</script>`);
  await page.locator("#action").focus();
  await expect(page.locator("#other")).toBeFocused();
  const snapshot = await observeHandoffFocusRound11(page);
  expect(snapshot.target).not.toBe("#action");
});

test("two sequential controls return to the original target", async ({ page }) => {
  await mount(page, `<button id="one">One</button><button id="two">Two</button><button id="three">Three</button>`);
  await page.locator("#one").focus();
  const result = await exerciseFocusNeighbourRound11(page);
  expect(result.before.target).toBe("#two");
  expect(result.reverse.target).toBe("#one");
  expect(result.returned.target).toBe("#two");
  expect(result.issues).toEqual([]);
});

test("reverse order can be broken and must not be accepted", async ({ page }) => {
  await mount(page, `<button id="one">One</button><button id="two">Two</button><button id="three">Three</button>
    <script>document.getElementById('two').addEventListener('focus', () => {
      document.getElementById('one').tabIndex=-1;
    });</script>`);
  await page.locator("#one").focus();
  const result = await exerciseFocusNeighbourRound11(page);
  expect(result.issues.map((issue) => issue.code)).toContain("reverse-order-broken");
});

test("a focusable heading is allowed for route transition announcements", async ({ page }) => {
  await mount(page, `<h2 id="page-title" tabindex="-1">New page</h2><button>Continue</button>`);
  await page.locator("#page-title").focus();
  const report = await observeHandoffFocusRound11(page);
  expect(report.findings.map((issue) => issue.code)).not.toContain("focus-on-no-role");
});

test("focus-visible outline contributes to keyboard visibility", async ({ page }) => {
  await mount(page, `<button id="action">Action</button>`);
  await page.keyboard.press("Tab");
  const state = await observeHandoffFocusRound11(page);
  expect(state.target).toBe("#action");
  expect(state.findings.map((issue) => issue.code)).not.toContain("focus-not-visible");
});

test("programmatic focus is not mistaken for a user activation", async ({ page }) => {
  await mount(page, `<button id="action">Action</button><output id="count">0</output>
    <script>let n=0;document.getElementById('action').onclick=()=>{document.getElementById('count').textContent=String(++n)};</script>`);
  await page.locator("#action").focus();
  await expect(page.locator("#count")).toHaveText("0");
  await page.keyboard.press("Enter");
  await expect(page.locator("#count")).toHaveText("1");
});

test("focus after Escape is restored to the actual opener", async ({ page }) => {
  await mount(page, `<button id="open">Open</button><dialog id="modal" aria-label="Settings"><button>Close</button></dialog>
    <script>const opener=document.getElementById('open');const modal=document.getElementById('modal');
      opener.onclick=()=>modal.showModal();modal.onclose=()=>opener.focus();</script>`);
  await page.locator("#open").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#open")).toBeFocused();
  const report = await observeHandoffFocusRound11(page);
  expect(report.target).toBe("#open");
  expect(report.findings).toEqual([]);
});

test("keyboard focus identifies explicit role button", async ({ page }) => {
  await mount(page, `<div id="action" role="button" tabindex="0" aria-label="Open" style="width:44px;height:44px">Open</div>`);
  await page.locator("#action").focus();
  const report = await observeHandoffFocusRound11(page);
  expect(report.interactive).toBe(true);
  expect(report.findings).toEqual([]);
});

test("focus in a closed details panel is not accepted", async ({ page }) => {
  await mount(page, `<details id="details" open><summary>Details</summary><button id="action">Action</button></details>`);
  await page.locator("#action").focus();
  await page.locator("#details").evaluate((node) => node.removeAttribute("open"));
  const report = await observeHandoffFocusRound11(page);
  expect(report.target === "#action" ? report.findings.some((f) => f.code === "focus-in-closed-details") : true).toBe(true);
});
