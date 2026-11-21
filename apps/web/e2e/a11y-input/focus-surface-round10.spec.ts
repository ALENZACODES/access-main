import { expect, test, type Page } from "@playwright/test";
import {
  auditFocusSurfaces, formatFocusIssues, hasFocusIssue,
  probeCurrentFocus, probeFocusSelector, type FocusSurfaceCode,
} from "./focus-surface-round10";

const BASE_CSS = `
  * {box-sizing:border-box}
  html,body {margin:0;padding:0}
  body {font:18px/1.5 sans-serif;padding:24px}
  button,a,input,select,textarea {min-width:44px;min-height:44px;font:inherit}
  :focus-visible {outline:3px solid #69390f;outline-offset:3px}
`;

async function fixture(page: Page, html: string, extraCSS = ""): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Input fixture</title>
    <style>${BASE_CSS}${extraCSS}</style></head><body><main><h1>Input fixture</h1>
    ${html}</main></body></html>`);
}

async function expectStaticCode(
  page: Page, html: string, code: FocusSurfaceCode, extraCSS = "",
): Promise<void> {
  await fixture(page, html, extraCSS);
  const report = await auditFocusSurfaces(page);
  expect(hasFocusIssue(report, code), formatFocusIssues(report)).toBe(true);
}

test.describe("P16 round 10: focus surfaces", () => {
  test("ordinary standalone buttons meet the target minimum", async ({ page }) => {
    await fixture(page, `<button id="one">Continue</button><button id="two">Cancel</button>`);
    const report = await auditFocusSurfaces(page);
    expect(report.issues).toEqual([]);
    expect(report.focusable).toBe(2);
    expect(report.inspected).toBe(2);
  });

  test("44 by 44 exactly is accepted", async ({ page }) => {
    await fixture(page, `<button id="exact" style="width:44px;height:44px;padding:0">OK</button>`);
    expect((await auditFocusSurfaces(page)).issues).toEqual([]);
  });

  test("43px wide button is detected", async ({ page }) => {
    await expectStaticCode(page, `<button id="narrow">Narrow</button>`, "interactive-target-too-small",
      `#narrow {min-width:0;width:43px}`);
  });

  test("43px high button is detected", async ({ page }) => {
    await expectStaticCode(page, `<button id="short">Short</button>`, "interactive-target-too-small",
      `#short {min-height:0;height:43px}`);
  });

  test("tiny anchor used as an action is detected", async ({ page }) => {
    await expectStaticCode(page, `<a id="action" href="/help">Help</a>`, "interactive-target-too-small",
      `#action {display:inline-flex;min-width:0;min-height:0;width:30px;height:30px}`);
  });

  test("inline link in a paragraph is exempt from the action-box minimum", async ({ page }) => {
    await fixture(page, `<p>Read the <a id="inline" href="/help">instructions</a> carefully.</p>`,
      `#inline {min-width:0;min-height:0}`);
    expect((await auditFocusSurfaces(page)).issues).toEqual([]);
  });

  test("inline link in a list item is exempt", async ({ page }) => {
    await fixture(page, `<ul><li>See <a href="/more">more</a> details.</li></ul>`,
      `li a {min-width:0;min-height:0}`);
    expect((await auditFocusSurfaces(page)).issues).toEqual([]);
  });

  test("input wrapped by a full-size label uses the label's actionable box", async ({ page }) => {
    await fixture(page, `<label id="label" style="display:flex;min-width:100px;min-height:50px">
      <input id="check" type="checkbox" style="min-width:0;min-height:0;width:16px;height:16px"> Choose
      </label>`);
    expect((await auditFocusSurfaces(page)).issues).toEqual([]);
  });

  test("checkbox without an actionable label is reported", async ({ page }) => {
    await expectStaticCode(page,
      `<input id="check" aria-label="Choose" type="checkbox" style="min-width:0;min-height:0;width:16px;height:16px">`,
      "interactive-target-too-small");
  });

  test("radio control without an actionable label is reported", async ({ page }) => {
    await expectStaticCode(page,
      `<input id="choice" aria-label="One" type="radio" style="min-width:0;min-height:0;width:16px;height:16px">`,
      "interactive-target-too-small");
  });

  test("positive tabindex changes the expected order and is detected", async ({ page }) => {
    await expectStaticCode(page, `<button tabindex="7">Later</button>`, "positive-tab-order");
  });

  test("zero tabindex is not treated as positive", async ({ page }) => {
    await fixture(page, `<div tabindex="0" role="button" aria-label="Action" style="width:80px;height:50px">Action</div>`);
    expect((await auditFocusSurfaces(page)).issues).toEqual([]);
  });

  test("negative tabindex is not a sequential target", async ({ page }) => {
    await fixture(page, `<p tabindex="-1" id="message">Message</p><button>Continue</button>`);
    const report = await auditFocusSurfaces(page);
    expect(report.focusable).toBe(1);
  });

  test("disabled native button is not a sequential target", async ({ page }) => {
    await fixture(page, `<button disabled>Unavailable</button><button>Continue</button>`);
    expect((await auditFocusSurfaces(page)).focusable).toBe(1);
  });

  test("disabled synthetic link in Tab order is detected", async ({ page }) => {
    await expectStaticCode(page,
      `<div role="link" aria-disabled="true" tabindex="0" style="width:70px;height:44px">Unavailable</div>`,
      "focusable-disabled-link");
  });

  test("inert descendants with explicit tabindex are detected", async ({ page }) => {
    await expectStaticCode(page,
      `<div inert><button id="inert-action" tabindex="0">Hidden action</button></div>`,
      "focusable-inert-control");
  });

  test("visual focus probe records a native focus outline", async ({ page }) => {
    await fixture(page, `<button id="focus">Focus</button>`);
    const probe = await probeFocusSelector(page, "#focus");
    expect(probe?.id).toBe("focus");
    expect(probe?.visible).toBe(true);
    expect(probe?.focusVisible).toBe(true);
    expect(probe?.issues).toEqual([]);
  });

  test("visual focus probe detects missing indicator", async ({ page }) => {
    await fixture(page, `<button id="focus">Focus</button>`,
      `#focus:focus-visible {outline:0;box-shadow:none;border:0}`);
    const probe = await probeFocusSelector(page, "#focus");
    expect(probe?.issues.map((issue) => issue.code)).toContain("focus-indicator-absent");
  });

  test("visual focus probe can detect focus under a fixed overlay", async ({ page }) => {
    await fixture(page, `<button id="focus">Focus</button><div id="cover" aria-hidden="true"
      style="position:fixed;inset:0;background:#fff;z-index:20"></div>`);
    const probe = await probeFocusSelector(page, "#focus");
    expect(probe?.issues.map((issue) => issue.code)).toContain("focus-obscured");
    expect(probe?.obscuredBy).toBe("#cover");
  });

  test("visual focus probe does not mistake its own descendants for obstructions", async ({ page }) => {
    await fixture(page, `<button id="focus"><span id="icon">Continue</span></button>`);
    const probe = await probeFocusSelector(page, "#focus");
    expect(probe?.obscuredBy).toBeNull();
  });

  test("visual focus probe detects an aria-hidden focused node", async ({ page }) => {
    await fixture(page, `<button id="focus" aria-hidden="true">Focus</button>`);
    const probe = await probeFocusSelector(page, "#focus");
    expect(probe?.issues.map((issue) => issue.code)).toContain("focus-in-hidden-subtree");
  });

  test("no active control produces a null probe", async ({ page }) => {
    await fixture(page, `<p>No focus</p>`);
    expect(await probeCurrentFocus(page)).toBeNull();
  });

  test("probe retains the actual focused element ID", async ({ page }) => {
    await fixture(page, `<input id="query" aria-label="Query">`);
    await page.locator("#query").focus();
    const probe = await probeCurrentFocus(page);
    expect(probe?.selector).toBe("#query");
    expect(probe?.tag).toBe("input");
  });

  test("reported viewport dimensions come from the browser", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await fixture(page, `<button>Continue</button>`);
    const report = await auditFocusSurfaces(page);
    expect(report.viewport).toEqual({ width: 320, height: 720 });
  });

  test("findings have stable diagnostics", async ({ page }) => {
    await fixture(page, `<button id="broken" tabindex="4">Broken</button>`);
    const report = await auditFocusSurfaces(page);
    expect(formatFocusIssues(report)).toContain("positive-tab-order: #broken");
  });

  test("focus probe does not activate a button", async ({ page }) => {
    await fixture(page, `<button id="button" onclick="document.body.dataset.activated='yes'">Continue</button>`);
    await probeFocusSelector(page, "#button");
    expect(await page.locator("body").getAttribute("data-activated")).toBeNull();
  });

  test("focus probe does not navigate when given a link", async ({ page }) => {
    await fixture(page, `<a id="link" href="/another">Another</a>`);
    await probeFocusSelector(page, "#link");
    expect(page.url()).toBe("about:blank");
  });

  test("focus census does not change the active element", async ({ page }) => {
    await fixture(page, `<button id="first">First</button><button id="second">Second</button>`);
    await page.locator("#first").focus();
    await auditFocusSurfaces(page);
    await expect(page.locator("#first")).toBeFocused();
  });
});
