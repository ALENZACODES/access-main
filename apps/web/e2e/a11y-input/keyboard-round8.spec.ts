import { expect, test } from "@playwright/test";

import {
  activateOptInButton,
  assertFocusDoesNotNavigate,
  inspectActiveKeyboardTarget,
  inspectKeyboardCandidates,
  inspectKeyboardRoute,
  scanKeyboardRoute,
} from "./keyboard-path-round8";

const BASE = `<main>
  <h1>Keyboard test</h1>
  <a id="first" href="#target">First</a>
  <button id="second" type="button">Second</button>
  <input id="third" aria-label="Third" />
  <p id="target">Target</p>
</main>`;

async function fixture(page: import("@playwright/test").Page, markup = BASE): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><style>
    :focus-visible { outline: 3px solid black; }
    button,a,input { min-height:44px;min-width:44px; }
  </style></head><body>${markup}</body></html>`);
}

test.describe("P16 round eight keyboard input", () => {
  test("three sequential targets form an observable scan", async ({ page }) => {
    await fixture(page);
    const walk = await scanKeyboardRoute(page, 12);
    expect(walk.failures).toEqual([]);
    expect(walk.terminated).toBe(true);
    expect(walk.steps.map((step) => step.key)).toEqual(["#first", "#second", "#third"]);
  });

  test("a lone input is a valid bounded scan", async ({ page }) => {
    await fixture(page, `<main><input id="single" aria-label="Single" /></main>`);
    const walk = await scanKeyboardRoute(page, 8);
    expect(walk.steps.map((step) => step.key)).toEqual(["#single"]);
    expect(walk.failures).toEqual([]);
  });

  test("an invalid scan bound is rejected", async ({ page }) => {
    await fixture(page);
    await expect(scanKeyboardRoute(page, 1)).rejects.toThrow(RangeError);
    await expect(scanKeyboardRoute(page, 301)).rejects.toThrow(RangeError);
    await expect(scanKeyboardRoute(page, 2.5)).rejects.toThrow(RangeError);
  });

  test("positive tabindex is identified", async ({ page }) => {
    await fixture(page);
    await page.locator("#second").evaluate((node) => node.setAttribute("tabindex", "7"));
    const findings = await inspectKeyboardCandidates(page);
    expect(findings.some((item) => item.code === "positive-tabindex" &&
      item.target === "#second")).toBe(true);
  });

  test("noninteger tabindex is identified", async ({ page }) => {
    await fixture(page);
    await page.locator("#second").evaluate((node) => node.setAttribute("tabindex", "many"));
    const findings = await inspectKeyboardCandidates(page);
    expect(findings.map((item) => item.code)).toContain("noninteger-tabindex");
  });

  test("a focusable control within aria-hidden content fails", async ({ page }) => {
    await fixture(page, `<main><div aria-hidden="true">
      <button id="secret">Secret</button>
    </div></main>`);
    const findings = await inspectKeyboardCandidates(page);
    expect(findings.some((item) => item.code === "focusable-hidden-subtree" &&
      item.target === "#secret")).toBe(true);
  });

  test("a focusable control in an inert region fails inspection", async ({ page }) => {
    await fixture(page, `<main><section inert>
      <a id="inert-link" href="/next">Next</a>
    </section></main>`);
    const findings = await inspectKeyboardCandidates(page);
    expect(findings.map((item) => item.code)).toContain("focusable-hidden-subtree");
  });

  test("a synthetic button without tabindex fails", async ({ page }) => {
    await fixture(page, `<main><div id="fake" role="button">Run</div></main>`);
    const findings = await inspectKeyboardCandidates(page);
    expect(findings.map((item) => item.code)).toContain("synthetic-button-no-tabstop");
  });

  test("a synthetic link without tabindex fails", async ({ page }) => {
    await fixture(page, `<main><span id="fake" role="link">Read</span></main>`);
    const findings = await inspectKeyboardCandidates(page);
    expect(findings.map((item) => item.code)).toContain("synthetic-link-no-tabstop");
  });

  test("synthetic controls with tabindex zero pass keyboard candidate inspection", async ({ page }) => {
    await fixture(page, `<main>
      <div role="button" tabindex="0">Run</div>
      <span role="link" tabindex="0">Read</span>
    </main>`);
    expect(await inspectKeyboardCandidates(page)).toEqual([]);
  });

  test("disabled synthetic link is not a sequential target", async ({ page }) => {
    await fixture(page, `<main><span id="blocked" role="link" tabindex="0"
      aria-disabled="true">Blocked</span></main>`);
    const findings = await inspectKeyboardCandidates(page);
    expect(findings.map((item) => item.code)).toContain("disabled-link-in-order");
  });

  test("javascript placeholder anchor requires button semantics", async ({ page }) => {
    await fixture(page, `<main><a href="javascript:void(0)">Run</a></main>`);
    const findings = await inspectKeyboardCandidates(page);
    expect(findings.map((item) => item.code)).toContain("javascript-placeholder-link");
  });

  test("focus does not navigate merely by landing on a link", async ({ page }) => {
    await fixture(page);
    await assertFocusDoesNotNavigate(page, "#first");
    await expect(page.locator("#first")).toBeFocused();
  });

  test("visible focused button passes the active target inspection", async ({ page }) => {
    await fixture(page);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(await inspectActiveKeyboardTarget(page)).toEqual([]);
  });

  test("a disabled programmatically focused control is exposed", async ({ page }) => {
    await fixture(page, `<main><div role="button" tabindex="0" aria-disabled="true"
      id="disabled" style="min-width:44px;min-height:44px">Disabled</div></main>`);
    await page.locator("#disabled").focus();
    const failures = await inspectActiveKeyboardTarget(page);
    expect(failures.map((item) => item.code)).toContain("disabled-control-focused");
  });

  test("focus lost to the body is reported", async ({ page }) => {
    await fixture(page);
    const failures = await inspectActiveKeyboardTarget(page);
    expect(failures.map((item) => item.code)).toContain("no-active-keyboard-target");
  });

  test("safe opt-in button reacts to Enter", async ({ page }) => {
    await fixture(page, `<main><button id="action" type="button"
      data-keyboard-count="0">Activate</button></main>`);
    await page.locator("#action").evaluate((node) => node.addEventListener("click", () => {
      const count = Number(node.getAttribute("data-keyboard-count") ?? "0");
      node.setAttribute("data-keyboard-count", String(count + 1));
    }));
    await activateOptInButton(page, "#action");
    await expect(page.locator("#action")).toHaveAttribute("data-keyboard-count", "1");
  });

  test("safe opt-in helper rejects missing activation instrumentation", async ({ page }) => {
    await fixture(page, `<main><button id="plain">Activate</button></main>`);
    await expect(activateOptInButton(page, "#plain")).rejects.toThrow();
  });

  test("route audit combines candidate and tab sequence failures", async ({ page }) => {
    await fixture(page, `<main><button tabindex="6" id="priority">Priority</button></main>`);
    const findings = await inspectKeyboardRoute(page);
    expect(findings.map((item) => item.code)).toContain("positive-tabindex");
  });

  test("a normal route has no keyboard candidate or sequential failures", async ({ page }) => {
    await fixture(page);
    expect(await inspectKeyboardRoute(page)).toEqual([]);
  });
});
