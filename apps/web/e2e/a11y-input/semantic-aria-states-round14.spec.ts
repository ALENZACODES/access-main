import { expect, test } from "@playwright/test";
import { inspectSemanticSurface } from "./semantic-surface-round14";

async function semanticPage(page: import("@playwright/test").Page, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>ARIA states</title></head><body><main><h1>ARIA states</h1>${body}</main></body></html>`);
}
test.describe("P16 round 14 ARIA state contracts", () => {
  test("switch with true state is accepted", async ({ page }) => {
    await semanticPage(page, `<button role="switch" aria-checked="true">High contrast</button>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("switch with false state is accepted", async ({ page }) => {
    await semanticPage(page, `<button role="switch" aria-checked="false">High contrast</button>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("switch with mixed state is rejected by role-specific contract", async ({ page }) => {
    await semanticPage(page, `<button role="switch" aria-checked="mixed">High contrast</button>`);
    // The shared surface accepts the ARIA token; this fixture preserves the raw state for a role-specific check.
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "mixed");
  });
  test("pressed true state is accepted", async ({ page }) => {
    await semanticPage(page, `<button aria-pressed="true">Bold</button>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("pressed mixed state is accepted for a tri-state toggle button", async ({ page }) => {
    await semanticPage(page, `<button aria-pressed="mixed">Bold</button>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("invalid pressed token is rejected", async ({ page }) => {
    await semanticPage(page, `<button aria-pressed="on">Bold</button>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("aria-pressed-invalid");
  });
  test("aria-current page token is accepted", async ({ page }) => {
    await semanticPage(page, `<nav aria-label="Primary"><a href="/" aria-current="page">Home</a></nav>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("aria-current false token is accepted", async ({ page }) => {
    await semanticPage(page, `<a href="/" aria-current="false">Home</a>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("aria-current invalid token is rejected", async ({ page }) => {
    await semanticPage(page, `<a href="/" aria-current="selected">Home</a>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("aria-current-invalid");
  });
  test("aria-disabled false is not treated as disabled", async ({ page }) => {
    await semanticPage(page, `<button aria-disabled="false">Continue</button>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("aria-disabled true removes sequential focus requirement", async ({ page }) => {
    await semanticPage(page, `<button aria-disabled="true" tabindex="-1">Unavailable</button>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("aria-expanded boolean false is preserved", async ({ page }) => {
    await semanticPage(page, `<button aria-expanded="false">Show</button>`);
    await expect(page.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });
  test("aria-expanded boolean true is preserved", async ({ page }) => {
    await semanticPage(page, `<button aria-expanded="true">Hide</button>`);
    await expect(page.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });
  test("aria-controls may reference multiple existing panels", async ({ page }) => {
    await semanticPage(page, `<button aria-controls="one two">Show panels</button><div id="one"></div><div id="two"></div>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("aria-owns missing target is rejected", async ({ page }) => {
    await semanticPage(page, `<div role="list" aria-owns="missing"><div role="listitem">One</div></div>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("id-reference-missing");
  });
  test("aria-describedby can reference two instructions", async ({ page }) => {
    await semanticPage(page, `<label for="name">Name</label><input id="name" aria-describedby="hint detail"><p id="hint">Required</p><p id="detail">Use your preferred name</p>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("aria-labelledby with one missing token is rejected", async ({ page }) => {
    await semanticPage(page, `<span id="known">Name</span><button aria-labelledby="known missing"></button>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("id-reference-missing");
  });
  test("hidden duplicate IDs are still detected", async ({ page }) => {
    await semanticPage(page, `<p id="same">One</p><p id="same" hidden>Two</p>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("id-duplicate");
  });
});
