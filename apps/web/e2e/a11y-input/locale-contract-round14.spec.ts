import { expect, test } from "@playwright/test";
import { assertLocaleContract, inspectLocaleContract } from "./locale-contract-round14";

test.describe("P16 round 14 locale contract", () => {
  test("English document language is accepted", async ({ page }) => {
    await page.setContent(`<html lang="en"><head><title>Page</title></head><body><main><h1>Page</h1><p>Continue to the next step.</p></main></body></html>`);
    await assertLocaleContract(page, "en");
  });
  test("French typographic apostrophe is accepted", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Page</title></head><body><main><h1>Page</h1><p>Ouvrir l’élément.</p></main></body></html>`);
    await assertLocaleContract(page, "fr");
  });
  test("French straight apostrophe is rejected", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Page</title></head><body><main><h1>Page</h1><p>Ouvrir l'élément.</p></main></body></html>`);
    expect((await inspectLocaleContract(page)).map(x => x.code)).toContain("french-apostrophe");
  });
  test("French colon requires nonbreaking space", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Page</title></head><body><main><h1>Page</h1><p>Attention: texte.</p></main></body></html>`);
    expect((await inspectLocaleContract(page)).map(x => x.code)).toContain("french-colon-spacing");
  });
  test("French nonbreaking space before question mark is accepted", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Page</title></head><body><main><h1>Page</h1><p>Comment faire\u00a0?</p></main></body></html>`);
    expect(await inspectLocaleContract(page)).toEqual([]);
  });
  test("French ordinary space before exclamation is rejected", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Page</title></head><body><main><h1>Page</h1><p>Attention !</p></main></body></html>`);
    expect((await inspectLocaleContract(page)).map(x => x.code)).toContain("french-punctuation-spacing");
  });
  test("French guillemets use no-break spaces", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Page</title></head><body><main><h1>Page</h1><p>Lire «\u00a0ce texte\u00a0».</p></main></body></html>`);
    expect(await inspectLocaleContract(page)).toEqual([]);
  });
  test("French guillemets without inner spacing are rejected", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Page</title></head><body><main><h1>Page</h1><p>Lire «ce texte».</p></main></body></html>`);
    expect((await inspectLocaleContract(page)).map(x => x.code)).toContain("french-guillemet-spacing");
  });
  test("script and code contents are excluded from typography audit", async ({ page }) => {
    await page.setContent(`<html lang="fr"><head><title>Page</title></head><body><main><h1>Page</h1><code>don't alter code: ;</code><p>l’élément\u00a0: «\u00a0texte\u00a0».</p></main></body></html>`);
    expect(await inspectLocaleContract(page)).toEqual([]);
  });
  test("unsupported document language is rejected", async ({ page }) => {
    await page.setContent(`<html lang=""><head><title>Page</title></head><body><main><h1>Page</h1></main></body></html>`);
    expect((await inspectLocaleContract(page)).map(x => x.code)).toContain("document-language-invalid");
  });
});
