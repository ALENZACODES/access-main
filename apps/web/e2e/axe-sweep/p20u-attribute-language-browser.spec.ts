import { expect, test } from "@playwright/test";
import { collectAttributeCopy, inspectAttributeLanguage } from "./p20u-attribute-language-browser";

const pageMarkup = (body: string, lang = "fr") => `<!doctype html><html lang="${lang}"><head><title>Fixture</title></head><body>
<main><h1>Fixture</h1>${body}</main></body></html>`;

for (const width of [320, 1280]) {
  test.describe(`attribute copy collector ${width}px`, () => {
    test.use({ viewport: { width, height: 760 } });

    test("flags visible English instructions in attributes on a French page", async ({ page }) => {
      await page.setContent(pageMarkup(`
        <button id="actions" aria-label="Open the details for this record">Détails</button>
        <input id="lookup" aria-label="Recherche" placeholder="Search for places on this page">
        <img id="graphic" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3C/svg%3E" alt="Select a category">
      `));
      const report = await inspectAttributeLanguage(page);
      expect(report.findings.map((item) => item.attribute)).toEqual(["aria-label", "placeholder", "alt"]);
    });

    test("accepts explicit foreign-language span and ancestor", async ({ page }) => {
      await page.setContent(pageMarkup(`
        <section lang="en"><button aria-label="Open the details for this record">Details</button></section>
        <button lang="en" aria-label="Clear these filters">Reset</button>
      `));
      expect((await inspectAttributeLanguage(page)).findings).toEqual([]);
    });

    test("keeps invisible controls out of the audit", async ({ page }) => {
      await page.setContent(pageMarkup(`
        <button hidden aria-label="Clear these filters">Reset</button>
        <div style="display:none"><button aria-label="Choose the coordinator role">Role</button></div>
        <button aria-hidden="true" aria-label="Open the details for this record">Hidden from assistive technology</button>
      `));
      expect((await inspectAttributeLanguage(page)).findings).toEqual([]);
    });

    test("collects updated React-like attributes on the next read", async ({ page }) => {
      await page.setContent(pageMarkup(`<button id="change" aria-label="Rechercher">Recherche</button>`));
      expect((await inspectAttributeLanguage(page)).findings).toEqual([]);
      await page.locator("#change").evaluate((element) => {
        element.setAttribute("aria-label", "Go back to the previous page");
      });
      expect((await inspectAttributeLanguage(page)).findings).toHaveLength(1);
      await page.locator("#change").evaluate((element) => element.setAttribute("lang", "en"));
      expect((await inspectAttributeLanguage(page)).findings).toEqual([]);
    });

    test("collector reports element identity and actual inherited locale", async ({ page }) => {
      await page.setContent(pageMarkup(`<section lang="en"><input id="note" placeholder="Enter a number"></section>`));
      const result = await collectAttributeCopy(page);
      const item = result.items.find((entry) => entry.element === "#note");
      expect(item).toMatchObject({ inheritedLanguage: "en", explicitlyMarkedLanguage: null, attribute: "placeholder" });
    });
  });
}
