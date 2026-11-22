import { expect, test } from "@playwright/test";
import { inspectSemanticSurface } from "./semantic-surface-round14";
import { inspectAnnouncements } from "./announcement-round14";
import { inspectLocaleContract } from "./locale-contract-round14";

async function languageFixture(page: import("@playwright/test").Page, lang: string, body: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="${lang}"><head><title>Language transition</title></head><body><main><h1>Language transition</h1>${body}</main></body></html>`);
}
test.describe("P16 round 14 language and announcement interaction", () => {
  test("English status is announced politely", async ({ page }) => {
    await languageFixture(page, "en", `<p role="status" aria-live="polite">Saved</p>`);
    expect((await inspectAnnouncements(page)).issues).toEqual([]);
  });
  test("French status remains announced politely", async ({ page }) => {
    await languageFixture(page, "fr", `<p role="status" aria-live="polite">Enregistré</p>`);
    expect((await inspectAnnouncements(page)).issues).toEqual([]);
    expect(await inspectLocaleContract(page)).toEqual([]);
  });
  test("changing document language preserves the title", async ({ page }) => {
    await languageFixture(page, "en", `<p>Text</p>`);
    await page.locator("html").evaluate(node => node.setAttribute("lang", "fr"));
    await expect(page).toHaveTitle("Language transition");
    expect((await inspectSemanticSurface(page)).language).toBe("fr");
  });
  test("changing document language does not change control accessible name", async ({ page }) => {
    await languageFixture(page, "en", `<button id="continue">Continue</button>`);
    await page.locator("html").evaluate(node => node.setAttribute("lang", "fr"));
    const result = await inspectSemanticSurface(page);
    expect(result.controls.find(item => item.selector === "#continue")?.name).toBe("Continue");
  });
  test("French punctuation in hidden script is not checked", async ({ page }) => {
    await languageFixture(page, "fr", `<script>const sample = "don't parse: this;";</script><p>l’élément\u00a0: «\u00a0texte\u00a0».</p>`);
    expect(await inspectLocaleContract(page)).toEqual([]);
  });
  test("French punctuation in visible text remains checked after live update", async ({ page }) => {
    await languageFixture(page, "fr", `<p id="copy">Texte correct\u00a0!</p>`);
    await page.locator("#copy").evaluate(node => { node.textContent = "Texte incorrect !"; });
    expect((await inspectLocaleContract(page)).map(item => item.code)).toContain("french-punctuation-spacing");
  });
  test("alert priority remains assertive after text update", async ({ page }) => {
    await languageFixture(page, "fr", `<p id="alert" role="alert" aria-live="assertive">Erreur</p>`);
    await page.locator("#alert").evaluate(node => { node.textContent = "Une erreur est survenue"; });
    expect((await inspectAnnouncements(page)).issues).toEqual([]);
  });
  test("status region does not become hidden after update", async ({ page }) => {
    await languageFixture(page, "en", `<p id="status" role="status" aria-live="polite">Waiting</p>`);
    await page.locator("#status").evaluate(node => { node.textContent = "Done"; });
    expect((await inspectAnnouncements(page)).issues).toEqual([]);
  });
  test("language mutation to unsupported value is rejected", async ({ page }) => {
    await languageFixture(page, "en", `<p>Text</p>`);
    await page.locator("html").evaluate(node => node.setAttribute("lang", "xx"));
    expect((await inspectLocaleContract(page)).map(item => item.code)).toContain("document-language-invalid");
  });
  test("a language change does not silently duplicate the primary heading", async ({ page }) => {
    await languageFixture(page, "en", `<p>Text</p>`);
    await page.locator("html").evaluate(node => node.setAttribute("lang", "fr"));
    expect((await inspectSemanticSurface(page)).issues).toEqual([]);
  });
});

test("document language change does not clear an existing status announcement", async ({ page }) => {
  await languageFixture(page, "en", `<p id="status" role="status" aria-live="polite">Saved</p>`);
  await page.locator("html").evaluate(node => node.setAttribute("lang", "fr"));
  await expect(page.locator("#status")).toHaveText("Saved");
  expect((await inspectAnnouncements(page)).issues).toEqual([]);
});

test("document language attribute is case-insensitive for French locale", async ({ page }) => {
  await languageFixture(page, "FR-ca", `<p>Texte.</p>`);
  expect(await inspectLocaleContract(page)).toEqual([]);
});

test("non-French locale does not run French typography rules", async ({ page }) => {
  await languageFixture(page, "en", `<p>Don't change this: text !</p>`);
  expect(await inspectLocaleContract(page)).toEqual([]);
});

test("language value with unsupported suffix is rejected", async ({ page }) => {
  await languageFixture(page, "fr-unknown", `<p>Texte.</p>`);
  expect((await inspectLocaleContract(page)).map(item => item.code)).not.toContain("document-language-invalid");
});

test("empty lang attribute is rejected after mutation", async ({ page }) => {
  await languageFixture(page, "en", `<p>Text</p>`);
  await page.locator("html").evaluate(node => node.setAttribute("lang", ""));
  expect((await inspectLocaleContract(page)).map(item => item.code)).toContain("document-language-invalid");
});

test("French regional tag is accepted", async ({ page }) => {
  await languageFixture(page, "fr-CA", `<p>Texte.</p>`);
  expect(await inspectLocaleContract(page)).toEqual([]);
});

test("document lang en-CA is accepted", async ({ page }) => {
  await languageFixture(page, "en-CA", `<p>Text.</p>`);
  expect(await inspectLocaleContract(page)).toEqual([]);
});

test("document lang en-GB is accepted", async ({ page }) => {
  await languageFixture(page, "en-GB", `<p>Text.</p>`);
  expect(await inspectLocaleContract(page)).toEqual([]);
});
