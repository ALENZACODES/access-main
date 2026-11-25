import { expect, test } from "@playwright/test";
import { assertAdjacentFocusReverses, traceTabOrder } from "./focus-lifecycle-round14";

async function fixture(page: import("@playwright/test").Page, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Focus fixture</title><style>
    button,a,input{min-width:44px;min-height:44px}:focus-visible{outline:3px solid #123b5a;outline-offset:2px}
  </style></head><body><main><h1>Focus fixture</h1>${body}</main></body></html>`);
}
test.describe("P16 round 14 focus lifecycle", () => {
  test("two adjacent controls reverse and restore focus", async ({ page }) => {
    await fixture(page, `<button id="one">One</button><button id="two">Two</button>`);
    await page.locator("#one").focus();
    await assertAdjacentFocusReverses(page);
  });
  test("three-control traversal returns through the previous element", async ({ page }) => {
    await fixture(page, `<button id="one">One</button><button id="two">Two</button><button id="three">Three</button>`);
    await page.locator("#one").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#two")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#three")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#two")).toBeFocused();
  });
  test("disabled native control is skipped", async ({ page }) => {
    await fixture(page, `<button disabled>Disabled</button><button id="active">Active</button>`);
    await page.keyboard.press("Tab");
    await expect(page.locator("#active")).toBeFocused();
  });
  test("hidden native control is skipped", async ({ page }) => {
    await fixture(page, `<button hidden>Hidden</button><button id="active">Active</button>`);
    await page.keyboard.press("Tab");
    await expect(page.locator("#active")).toBeFocused();
  });
  test("inert descendants are skipped", async ({ page }) => {
    await fixture(page, `<section inert><button id="blocked">Blocked</button></section><button id="active">Active</button>`);
    await page.keyboard.press("Tab");
    await expect(page.locator("#active")).toBeFocused();
  });
  test("positive tabindex is reported in actual traversal", async ({ page }) => {
    await fixture(page, `<button tabindex="2">Two</button><button tabindex="1">One</button>`);
    const trace = await traceTabOrder(page, 12);
    expect(trace.issues.map(x => x.code)).toContain("focus-positive-tabindex");
  });
  test("unnamed native button is reported", async ({ page }) => {
    await fixture(page, `<button aria-label=""></button>`);
    const trace = await traceTabOrder(page, 8);
    expect(trace.issues.map(x => x.code)).toContain("focus-unnamed");
  });
  test("small target is reported", async ({ page }) => {
    await fixture(page, `<button style="width:20px;height:20px;min-width:0;min-height:0;padding:0">+</button>`);
    const trace = await traceTabOrder(page, 8);
    expect(trace.issues.map(x => x.code)).toContain("focus-small-target");
  });
  test("44 by 44 target passes geometry portion", async ({ page }) => {
    await fixture(page, `<button style="width:44px;height:44px;padding:0">Go</button>`);
    const trace = await traceTabOrder(page, 8);
    expect(trace.issues.filter(x => x.code === "focus-small-target")).toEqual([]);
  });
  test("focus trace cleans its temporary markers", async ({ page }) => {
    await fixture(page, `<button>One</button><button>Two</button>`);
    await traceTabOrder(page, 10);
    await expect(page.locator("[data-p16-r14-focus]")).toHaveCount(0);
  });
  test("trace is bounded and reports incomplete walk", async ({ page }) => {
    await fixture(page, `<button>One</button><button>Two</button><button>Three</button>`);
    const trace = await traceTabOrder(page, 1);
    expect(trace.complete).toBe(false);
    expect(trace.stop).toBe("limit");
  });
  test("focus on heading can move to first native control", async ({ page }) => {
    await fixture(page, `<h2 id="heading" tabindex="-1">Section</h2><button id="first">First</button>`);
    await page.locator("#heading").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#first")).toBeFocused();
  });
});
