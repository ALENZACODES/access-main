import { expect, test, type Page } from "@playwright/test";
import { auditFocusSurfaces, probeCurrentFocus } from "./focus-surface-round10";
import { auditNameRelations } from "./name-relations-round10";
import { auditFeedback } from "./feedback-round10";
import { auditReflowInteractions } from "./reflow-interaction-round10";

async function fixture(page: Page, markup: string, styles = ""): Promise<void> {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.setContent(`<!doctype html><html lang="en"><head><title>Cross contract</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;padding:0}body{font:18px/1.5 sans-serif;padding:16px}
    button,input,a,select,textarea{min-height:44px;min-width:44px}
    :focus-visible{outline:3px solid #56340b;outline-offset:3px}${styles}</style>
    </head><body><main><h1>Cross contract</h1>${markup}</main></body></html>`);
}

test.describe("P16 round 10: integrated input contracts", () => {
  test("labelled, usable control with a status update passes all four audits", async ({ page }) => {
    await fixture(page, `<label for="query">Search</label><input id="query">
      <button id="submit">Search</button><p role="status" id="result">UNKNOWN</p>`);
    expect((await auditFocusSurfaces(page)).issues).toEqual([]);
    expect((await auditNameRelations(page)).issues).toEqual([]);
    expect((await auditFeedback(page)).issues).toEqual([]);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
  });

  test("small and unnamed button produces findings from two independent audits", async ({ page }) => {
    await fixture(page, `<button id="broken" style="min-width:0;min-height:0;width:25px;height:25px"></button>`);
    expect((await auditFocusSurfaces(page)).issues.map((issue) => issue.code)).toContain("interactive-target-too-small");
    expect((await auditNameRelations(page)).issues.map((issue) => issue.code)).toContain("unnamed-button");
    expect((await auditReflowInteractions(page)).issues.map((issue) => issue.code)).toContain("touch-target-undersized");
  });

  test("invalid field with broken error reference is detected in two audits", async ({ page }) => {
    await fixture(page, `<label for="name">Name</label><input id="name" aria-invalid="true"
      aria-errormessage="absent">`);
    expect((await auditNameRelations(page)).issues.map((issue) => issue.code)).toContain("invalid-error-reference");
    expect((await auditFeedback(page)).issues.map((issue) => issue.code)).toContain("invalid-error-target");
  });

  test("valid error text and input label pass both name and status audits", async ({ page }) => {
    await fixture(page, `<label for="name">Name</label><input id="name" aria-invalid="true"
      aria-errormessage="error"><p id="error" role="alert">Enter a name.</p>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
    expect((await auditFeedback(page)).issues).toEqual([]);
  });

  test("accessible name is independent of touch target size", async ({ page }) => {
    await fixture(page, `<button id="small" aria-label="Close" style="min-width:0;min-height:0;width:20px;height:20px"></button>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
    expect((await auditFocusSurfaces(page)).issues.some((issue) => issue.code === "interactive-target-too-small")).toBe(true);
  });

  test("44px target does not excuse missing accessible name", async ({ page }) => {
    await fixture(page, `<button id="blank" style="width:44px;height:44px"></button>`);
    expect((await auditFocusSurfaces(page)).issues).toEqual([]);
    expect((await auditNameRelations(page)).issues.some((issue) => issue.code === "unnamed-button")).toBe(true);
  });

  test("focus outline is evaluated on the actual active element", async ({ page }) => {
    await fixture(page, `<button id="one">One</button><button id="two">Two</button>`);
    await page.locator("#two").focus();
    const result = await probeCurrentFocus(page);
    expect(result?.id).toBe("two");
    expect(result?.focusVisible).toBe(true);
  });

  test("focus probe can distinguish focus appearance from name semantics", async ({ page }) => {
    await fixture(page, `<button id="unnamed"></button>`);
    await page.locator("#unnamed").focus();
    expect((await probeCurrentFocus(page))?.focusVisible).toBe(true);
    expect((await auditNameRelations(page)).issues.map((issue) => issue.code)).toContain("unnamed-button");
  });

  test("button action does not happen during read-only audits", async ({ page }) => {
    await fixture(page, `<button id="action" onclick="document.body.dataset.changed='true'">Continue</button>`);
    await auditNameRelations(page);
    await auditFocusSurfaces(page);
    await auditFeedback(page);
    await auditReflowInteractions(page);
    expect(await page.locator("body").getAttribute("data-changed")).toBeNull();
  });

  test("no audit changes currently focused control", async ({ page }) => {
    await fixture(page, `<button id="one">One</button><button id="two">Two</button>`);
    await page.locator("#one").focus();
    await auditFocusSurfaces(page);
    await auditNameRelations(page);
    await auditFeedback(page);
    await auditReflowInteractions(page);
    await expect(page.locator("#one")).toBeFocused();
  });

  test("multiple legitimate live regions remain separate", async ({ page }) => {
    await fixture(page, `<p id="status" role="status">Ready</p><p id="warning" role="alert">Check</p>`);
    const feedback = await auditFeedback(page);
    expect(feedback.regions).toBe(2);
    expect(feedback.issues).toEqual([]);
  });

  test("read-only audits do not change a live-region message", async ({ page }) => {
    await fixture(page, `<p id="result" role="status">UNKNOWN</p>`);
    await auditFeedback(page);
    await auditNameRelations(page);
    await auditFocusSurfaces(page);
    await auditReflowInteractions(page);
    await expect(page.locator("#result")).toHaveText("UNKNOWN");
  });

  test("unsupported status value is reported even alongside a valid form", async ({ page }) => {
    await fixture(page, `<label for="query">Search</label><input id="query">
      <p role="status" aria-live="immediate">UNKNOWN</p>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
    expect((await auditFeedback(page)).issues.map((issue) => issue.code)).toContain("invalid-live-mode");
  });

  test("switch with an accessible name also requires an adequate target", async ({ page }) => {
    await fixture(page, `<div id="switch" role="switch" aria-label="Dark mode" aria-checked="false"
      tabindex="0" style="width:20px;height:20px"> </div>`);
    expect((await auditNameRelations(page)).issues).toEqual([]);
    expect((await auditReflowInteractions(page)).issues.map((issue) => issue.code)).toContain("touch-target-undersized");
  });

  test("switch with a 44px target but no accessible name is reported", async ({ page }) => {
    await fixture(page, `<div role="switch" aria-checked="false" tabindex="0"
      style="width:44px;height:44px"></div>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
    expect((await auditNameRelations(page)).issues.map((issue) => issue.code)).toContain("unnamed-custom-control");
  });

  test("a keyboard accessible scroller retains content without page overflow", async ({ page }) => {
    await fixture(page, `<div id="list" tabindex="0" aria-label="Options" data-a11y-keyboard-scroller
      style="overflow:auto;width:100px;height:60px"><div style="width:500px">One Two Three</div></div>`);
    const report = await auditReflowInteractions(page);
    expect(report.scrollableRegions).toBeGreaterThan(0);
    expect(report.documentWidth).toBeLessThanOrEqual(322);
    expect(report.issues).toEqual([]);
  });

  test("keyboard navigable fallback works for pointer gesture", async ({ page }) => {
    await fixture(page, `<div data-a11y-multipoint-gesture data-a11y-single-pointer="zoom">Map</div>
      <button id="zoom" type="button">Zoom in</button>`);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
    await page.locator("#zoom").focus();
    expect((await probeCurrentFocus(page))?.focusVisible).toBe(true);
  });

  test("an inaccessible drag fallback remains a hard failure", async ({ page }) => {
    await fixture(page, `<div data-a11y-drag-operation data-a11y-drag-alternative="move">Drag</div>
      <button id="move" disabled>Move item</button>`);
    expect((await auditReflowInteractions(page)).issues.map((issue) => issue.code))
      .toContain("drag-alternative-not-operable");
  });

  test("French names and UNKNOWN content remain unchanged by all audits", async ({ page }) => {
    await fixture(page, `<label for="query">Rechercher</label><input id="query">
      <button id="action">Afficher</button><p role="status" id="result">UNKNOWN</p>`);
    await page.locator("html").evaluate((element) => element.setAttribute("lang", "fr"));
    expect((await auditFocusSurfaces(page)).issues).toEqual([]);
    expect((await auditNameRelations(page)).issues).toEqual([]);
    expect((await auditFeedback(page)).issues).toEqual([]);
    expect((await auditReflowInteractions(page)).issues).toEqual([]);
    await expect(page.locator("#result")).toHaveText("UNKNOWN");
  });

  test("no issue report substitutes assumptions for an unknown accessibility result", async ({ page }) => {
    await fixture(page, `<p id="record" data-accessibility-status="UNKNOWN">UNKNOWN</p>`);
    await auditFeedback(page);
    await auditFocusSurfaces(page);
    await auditNameRelations(page);
    await auditReflowInteractions(page);
    await expect(page.locator("#record")).toHaveAttribute("data-accessibility-status", "UNKNOWN");
    await expect(page.locator("#record")).toHaveText("UNKNOWN");
  });

  test("an invalid progress state is visible in the combined audit", async ({ page }) => {
    await fixture(page, `<div role="progressbar" aria-label="Loading" aria-valuemin="0"
      aria-valuemax="100" aria-valuenow="200"></div>`);
    expect((await auditFeedback(page)).issues.map((issue) => issue.code)).toContain("invalid-progress-value");
  });

  test("an invalid aria-errormessage is caught despite other valid relationships", async ({ page }) => {
    await fixture(page, `<label for="q">Name</label><input id="q" aria-invalid="true"
      aria-errormessage="missing"><p role="status">Ready</p>`);
    expect((await auditNameRelations(page)).issues.map((issue) => issue.code)).toContain("invalid-error-reference");
    expect((await auditFeedback(page)).issues.map((issue) => issue.code)).toContain("invalid-error-target");
  });

  test("overall audit results are JSON serializable for CI reporting", async ({ page }) => {
    await fixture(page, `<button id="save">Save</button><p role="status">Ready</p>`);
    const results = {
      focus: await auditFocusSurfaces(page),
      names: await auditNameRelations(page),
      feedback: await auditFeedback(page),
      reflow: await auditReflowInteractions(page),
    };
    const serialized = JSON.stringify(results);
    const parsed: unknown = JSON.parse(serialized);
    expect(parsed).toBeTruthy();
    expect(serialized).toContain('"issues"');
  });
});
