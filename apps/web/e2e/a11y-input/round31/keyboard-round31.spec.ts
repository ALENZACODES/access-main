import { expect, test } from "@playwright/test";
import {
  inspectActiveGeometry, inspectComposite, inspectSwitchAlternatives,
  walkFixtureTabOrder, reverseFixtureTabOrder,
} from "./browser";
import {
  auditComposite, auditFocusGeometry, auditForwardWalk, auditReverseWalk,
  auditSwitchPath, expectedCompositeTarget,
} from "./focus.mjs";

const fixture = (inner: string) => `<!doctype html><html lang="en"><head><title>Keyboard fixture</title>
<style>body{margin:0;padding:16px;font:16px system-ui}main{max-width:100%}
button,input,a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:4px}
:focus-visible{outline:3px solid black;outline-offset:3px}</style></head>
<body><main><h1>Keyboard fixture</h1>${inner}</main></body></html>`;
const codes = (entries: readonly { code: string }[]) => entries.map((entry) => entry.code);

test.describe("P16 Round 31: browser focus and switch pathways", () => {
  test("three native buttons preserve sequential focus order", async ({ page }) => {
    await page.setContent(fixture('<button id="one">One</button><button id="two">Two</button><button id="three">Three</button>'));
    const forward = await walkFixtureTabOrder(page, 10);
    expect(forward.map((item) => item.id)).toEqual(["one", "two", "three"]);
    expect(auditForwardWalk(forward)).toEqual([]);
    expect(auditReverseWalk(forward, await reverseFixtureTabOrder(page, forward))).toEqual([]);
  });

  test("a single button does not require a reverse traversal", async ({ page }) => {
    await page.setContent(fixture('<button id="only">Only</button>'));
    const forward = await walkFixtureTabOrder(page, 6);
    expect(forward.map((item) => item.id)).toEqual(["only"]);
    expect(auditReverseWalk(forward, [])).toEqual([]);
  });

  test("visible native control has meaningful focus geometry", async ({ page }) => {
    await page.setContent(fixture('<button id="target">Target</button>'));
    await page.locator("#target").focus();
    const geometry = await inspectActiveGeometry(page);
    expect(geometry).not.toBeNull();
    expect(auditFocusGeometry([geometry])).toEqual([]);
  });

  test("undersized button is reported", async ({ page }) => {
    await page.setContent(fixture('<button id="small" style="width:18px;height:18px;min-width:0;min-height:0">+</button>'));
    await page.locator("#small").focus();
    expect(codes(auditFocusGeometry([await inspectActiveGeometry(page)]))).toContain("geometry.small-target");
  });

  test("hidden focusable region is detected in sequential traversal", async ({ page }) => {
    await page.setContent(fixture('<button id="first">First</button><button id="second" style="opacity:0">Second</button>'));
    const forward = await walkFixtureTabOrder(page, 5);
    expect(forward.map((item) => item.id)).toContain("second");
  });

  test("roving tablist exposes one tab stop", async ({ page }) => {
    await page.setContent(fixture(`<div role="tablist" aria-label="Sections">
      <button role="tab" id="tab-a" aria-selected="true" tabindex="0">One</button>
      <button role="tab" id="tab-b" aria-selected="false" tabindex="-1">Two</button>
      </div>`));
    const snapshot = await inspectComposite(page, "[role=tablist]");
    expect(auditComposite(snapshot)).toEqual([]);
  });

  test("two roving tab stops are a regression", async ({ page }) => {
    await page.setContent(fixture(`<div role="tablist" aria-label="Sections">
      <button role="tab" id="tab-a" aria-selected="true" tabindex="0">One</button>
      <button role="tab" id="tab-b" aria-selected="false" tabindex="0">Two</button>
      </div>`));
    const snapshot = await inspectComposite(page, "[role=tablist]");
    expect(codes(auditComposite(snapshot))).toContain("composite.roving-count");
  });

  test("arrow navigation expectation skips disabled options", async ({ page }) => {
    await page.setContent(fixture(`<div role="listbox" aria-label="Stops">
      <div role="option" id="a" tabindex="0">A</div>
      <div role="option" id="b" tabindex="-1" aria-disabled="true">B</div>
      <div role="option" id="c" tabindex="-1">C</div>
      </div>`));
    const snapshot = await inspectComposite(page, "[role=listbox]");
    expect(expectedCompositeTarget({ ...snapshot, activeId: "a" }, "ArrowDown")).toBe("c");
  });

  test("active descendant requires a focusable owner", async ({ page }) => {
    await page.setContent(fixture(`<div role="listbox" id="list" aria-label="Stops" aria-activedescendant="a">
      <div role="option" id="a" tabindex="-1">A</div></div>`));
    const snapshot = await inspectComposite(page, "#list");
    expect(codes(auditComposite(snapshot))).toContain("composite.owner-unfocusable");
  });

  test("active descendant with focusable owner is accepted", async ({ page }) => {
    await page.setContent(fixture(`<div role="listbox" id="list" tabindex="0" aria-label="Stops" aria-activedescendant="a">
      <div role="option" id="a" tabindex="-1">A</div></div>`));
    expect(auditComposite(await inspectComposite(page, "#list"))).toEqual([]);
  });

  test("switch alternatives protect multi-pointer controls", async ({ page }) => {
    await page.setContent(fixture('<button id="pinch" data-a11y-multipointer-required>Pinch</button>'));
    expect(codes(auditSwitchPath(await inspectSwitchAlternatives(page)))).toContain("switch.no-single-pointer");
  });

  test("switch alternatives protect device-motion controls", async ({ page }) => {
    await page.setContent(fixture('<button id="tilt" data-a11y-motion-required>Tilt</button>'));
    expect(codes(auditSwitchPath(await inspectSwitchAlternatives(page)))).toContain("switch.no-motion-alternative");
  });

  test("switch alternative allows ordinary button activation", async ({ page }) => {
    await page.setContent(fixture('<button id="tilt" data-a11y-motion-required data-a11y-alternative="button">Tilt alternative</button>'));
    expect(auditSwitchPath(await inspectSwitchAlternatives(page))).toEqual([]);
  });
});
