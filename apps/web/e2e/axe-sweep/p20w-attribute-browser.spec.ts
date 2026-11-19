import { expect, test } from "@playwright/test";
import {
  attributeDistribution, attributesForPath, attributesInLanguage,
  attributesWithExplicitLanguage, collectRouteAttributeSnapshot,
  compactAttributeCopy, distinctAttributePaths, invisibleAttributeCount,
  routeHasAttribute, snapshotLabel,
} from "./p20w-attribute-browser";
import { attributeLanguageReport, likelyCopyLanguage } from "./p20u-attribute-language";
import { auditFrenchFragments } from "./p20w-french-typography";

const stylesheet = `<style>
  html { font: 16px system-ui; }
  body { margin: 0; }
  main { padding: 1rem; }
  label { display: block; }
  button, input { min-height: 44px; }
  .off { display: none; }
</style>`;
const fixture = (body: string, language = "fr") =>
  `<!doctype html><html lang="${language}"><head><title>Fixture</title>${stylesheet}</head><body><main><h1>Exemple</h1>${body}</main></body></html>`;

for (const width of [320, 1280] as const) {
  test.describe(`P20W attribute browser collection ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("reads a visible accessible label without modifying the DOM", async ({ page }) => {
      await page.setContent(fixture(`<button id="sample" aria-label="Search for places on this page">Chercher</button>`));
      const before = await page.locator("#sample").getAttribute("aria-label");
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      expect(snapshot.documentLanguage).toBe("fr");
      expect(snapshot.attributes.some((item) => item.attribute === "aria-label" && item.value === before)).toBe(true);
      expect(await page.locator("#sample").getAttribute("aria-label")).toBe(before);
    });

    test("English text in a French accessible label remains an audit failure", async ({ page }) => {
      await page.setContent(fixture(`<button id="sample" aria-label="Search for places on this page">Chercher</button>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      const report = attributeLanguageReport(snapshot.attributes, snapshot.documentLanguage);
      expect(report.findings.some((finding) => finding.element === "#sample" && finding.attribute === "aria-label")).toBe(true);
    });

    test("explicitly marked English text passes even when the document is French", async ({ page }) => {
      await page.setContent(fixture(`<button id="sample" lang="en" aria-label="Search for places on this page">Search</button>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      expect(attributeLanguageReport(snapshot.attributes, snapshot.documentLanguage).findings).toEqual([]);
      expect(attributesWithExplicitLanguage(snapshot.attributes).some((item) => item.element === "#sample")).toBe(true);
    });

    test("nearest language ancestor is inherited by a descendant", async ({ page }) => {
      await page.setContent(fixture(`<section lang="en"><button id="sample" aria-label="Search for places on this page">Search</button></section>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      const entry = snapshot.attributes.find((item) => item.element === "#sample");
      expect(entry?.inheritedLanguage).toBe("en");
      expect(entry?.explicitlyMarkedLanguage).toBeNull();
      expect(attributeLanguageReport(snapshot.attributes, snapshot.documentLanguage).findings).toEqual([]);
    });

    test("a hidden copy attribute does not contribute to the visible audit", async ({ page }) => {
      await page.setContent(fixture(`<div class="off"><button id="sample" aria-label="Search for places on this page">Search</button></div>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      expect(invisibleAttributeCount(snapshot.attributes)).toBeGreaterThan(0);
      expect(attributeLanguageReport(snapshot.attributes, snapshot.documentLanguage).findings).toEqual([]);
    });

    test("a nested aria-hidden element is excluded", async ({ page }) => {
      await page.setContent(fixture(`<div aria-hidden="true"><button id="sample" aria-label="Search for places on this page">Search</button></div>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      const item = snapshot.attributes.find((entry) => entry.element === "#sample");
      expect(item?.visible).toBe(false);
    });

    test("text from a non-rendered script is not inspected as displayed copy", async ({ page }) => {
      await page.setContent(fixture(`<script>const bad = "L'information!";</script><p>L’information</p>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      expect(snapshot.typography.some((item) => item.text.includes("const bad"))).toBe(false);
      expect(auditFrenchFragments(snapshot.typography)).toEqual([]);
    });

    test("French typography audit operates on leaf text nodes", async ({ page }) => {
      await page.setContent(fixture(`<p id="copy">L'information!</p>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      const finding = auditFrenchFragments(snapshot.typography);
      expect(finding.map((item) => item.code)).toContain("straight-apostrophe");
      expect(finding.map((item) => item.code)).toContain("narrow-space");
    });

    test("multiple attributes on one element retain distinct identities", async ({ page }) => {
      await page.setContent(fixture(`<input id="search" title="Recherche" placeholder="Rechercher" aria-label="Chercher"/>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      const values = attributesForPath(snapshot, "#search");
      expect(values.map((item) => item.attribute)).toEqual(expect.arrayContaining(["title", "placeholder", "aria-label"]));
      expect(attributeDistribution(snapshot.attributes)["aria-label"]).toBeGreaterThan(0);
    });

    test("image alt text contributes a distinct attribute", async ({ page }) => {
      await page.setContent(fixture(`<img id="picture" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'/%3E" alt="Image d’exemple"/>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      expect(routeHasAttribute(snapshot, "alt")).toBe(true);
      expect(distinctAttributePaths(snapshot)).toContain("#picture");
    });

    test("the diagnostic label identifies route and language", async ({ page }) => {
      await page.setContent(fixture(`<button aria-label="Chercher">Chercher</button>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/more/diary");
      expect(snapshotLabel(snapshot)).toContain("/more/diary (fr)");
    });

    test("locale filter respects nearest marking", async ({ page }) => {
      await page.setContent(fixture(`<button id="fr" aria-label="Chercher">Chercher</button><button id="en" lang="en" aria-label="Search for places on this page">Search</button>`));
      const snapshot = await collectRouteAttributeSnapshot(page, "/sample");
      const english = attributesInLanguage(snapshot.attributes, "en");
      const french = attributesInLanguage(snapshot.attributes, "fr");
      expect(english.some((item) => item.element === "#en")).toBe(true);
      expect(french.some((item) => item.element === "#fr")).toBe(true);
    });

    test("updates after client-side DOM mutation are read on the next snapshot", async ({ page }) => {
      await page.setContent(fixture(`<button id="sample" aria-label="Chercher">Chercher</button>`));
      const before = await collectRouteAttributeSnapshot(page, "/sample");
      expect(before.attributes.some((item) => item.value === "Search for places on this page")).toBe(false);
      await page.locator("#sample").evaluate((element: Element) => element.setAttribute("aria-label", "Search for places on this page"));
      const after = await collectRouteAttributeSnapshot(page, "/sample");
      expect(after.attributes.some((item) => likelyCopyLanguage(item.value) === "en")).toBe(true);
    });
  });
}

test("P20W copy collection compacts duplicate observations", () => {
  const a = { element: "#x", attribute: "title" as const, value: "Example", inheritedLanguage: "en", explicitlyMarkedLanguage: null, visible: true };
  const distinct = compactAttributeCopy([a, a, { ...a, value: "Changed" }]);
  expect(distinct).toHaveLength(2);
  expect(distinct[1]?.value).toBe("Changed");
});
