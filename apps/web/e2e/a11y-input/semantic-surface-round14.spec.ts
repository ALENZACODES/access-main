import { expect, test } from "@playwright/test";
import { inspectSemanticSurface } from "./semantic-surface-round14";

async function fixture(page: import("@playwright/test").Page, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Semantic fixture</title></head><body>${body}</body></html>`);
}
test.describe("P16 round 14 semantic surface", () => {
  test("one main and one h1 are accepted", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><p>Text</p></main>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("missing main is rejected", async ({ page }) => {
    await fixture(page, `<div><h1>Page</h1></div>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("main-count");
  });
  test("multiple main landmarks are rejected", async ({ page }) => {
    await fixture(page, `<main><h1>One</h1></main><main><h1>Two</h1></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("main-count");
  });
  test("multiple h1 headings are rejected", async ({ page }) => {
    await fixture(page, `<main><h1>One</h1><h1>Two</h1></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("h1-count");
  });
  test("empty h1 is rejected", async ({ page }) => {
    await fixture(page, `<main><h1></h1></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("heading-empty");
  });
  test("heading hierarchy skip is rejected", async ({ page }) => {
    await fixture(page, `<main><h1>One</h1><h3>Three</h3></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("heading-level-skip");
  });
  test("named navigation landmark is accepted", async ({ page }) => {
    await fixture(page, `<nav aria-label="Primary"><a href="/">Home</a></nav><main><h1>Page</h1></main>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("unnamed navigation landmark is rejected", async ({ page }) => {
    await fixture(page, `<nav><a href="/">Home</a></nav><main><h1>Page</h1></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("landmark-name-empty");
  });
  test("button text is its name", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><button id="go">Continue</button></main>`);
    const result = await inspectSemanticSurface(page);
    expect(result.controls.find(x => x.selector === "#go")?.name).toBe("Continue");
    expect(result.issues).toEqual([]);
  });
  test("aria-label names icon button", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><button aria-label="Close"><span aria-hidden="true">x</span></button></main>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("empty button is rejected", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><button></button></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("control-name-empty");
  });
  test("aria-labelledby resolves a visible name", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><span id="label">Continue</span><button aria-labelledby="label"></button></main>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("broken aria-describedby reference is rejected", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><button aria-describedby="missing">Go</button></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("id-reference-missing");
  });
  test("duplicate ids are rejected", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><p id="same">A</p><p id="same">B</p></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("id-duplicate");
  });
  test("positive tabindex is rejected", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><button tabindex="2">Go</button></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("positive-tabindex");
  });
  test("aria-disabled tab stop is rejected", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><button aria-disabled="true">Disabled</button></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("aria-disabled-tabbable");
  });
  test("invalid aria-checked value is rejected", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><button role="switch" aria-checked="yes">Toggle</button></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("aria-checked-invalid");
  });
  test("invalid aria-current value is rejected", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><a href="/" aria-current="selected">Home</a></main>`);
    expect((await inspectSemanticSurface(page)).issues.map(x => x.code)).toContain("aria-current-invalid");
  });
  test("hidden unnamed control does not fail name audit", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><button hidden></button></main>`);
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
  test("French language remains exposed", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Essai</title></head><body><main><h1>Page</h1><button>Continuer</button></main></body></html>`);
    const result = await inspectSemanticSurface(page);
    expect(result.language).toBe("fr");
    expect(result.issues).toEqual([]);
  });
});
