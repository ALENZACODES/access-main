import { expect, test } from "@playwright/test";
import { chooseLanguage, LANGUAGES, VIEWPORTS, visit } from "../a11y-input/helpers";

const ENGLISH_ONLY = [
  /^\d+ of \d+ fields in this record are recorded; the rest are Unknown\.$/,
  /^Optional\. Fixed choices only: no name, contact details, address or free text\./,
];

for (const language of LANGUAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`housing language boundary ${language} ${viewport.width}px`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });
      test("English-only passages carry their own language after route load and filter changes", async ({ page }) => {
        const entry = await page.goto("/", { waitUntil: "domcontentloaded" });
        expect(entry?.ok()).toBe(true);
        await chooseLanguage(page, language);
        await visit(page, "/more/housing", language);
        const inspect = async () => page.locator("main p").evaluateAll((nodes) => {
          return nodes.flatMap((node) => {
            const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
            if (!/^\d+ of \d+ fields in this record are recorded; the rest are Unknown\.$/.test(text) &&
                !text.startsWith("Optional. Fixed choices only: no name, contact details, address or free text.")) return [];
            const lang = node.closest("[lang]")?.getAttribute("lang") ?? document.documentElement.lang;
            return [{ text, lang }];
          });
        });
        await expect.poll(async () => (await inspect()).length).toBeGreaterThan(0);
        const found = await inspect();
        expect(found.some(({ text }) => ENGLISH_ONLY.some((pattern) => pattern.test(text)))).toBe(true);
        expect(found.every(({ lang }) => lang === "en")).toBe(true);
        const select = page.locator("#depth-kind");
        if (await select.count() > 0 && await select.isEnabled()) {
          const values = await select.locator("option").evaluateAll((options) =>
            options.map((option) => (option as HTMLOptionElement).value));
          if (values.includes("overnight")) {
            const current = await select.inputValue();
            const alternate = current === "overnight" ? "dwelling" : "overnight";
            if (values.includes(alternate)) {
              await select.selectOption(alternate);
              await expect.poll(async () => (await inspect()).every(({ lang }) => lang === "en")).toBe(true);
            }
          }
        }
      });
    });
  }
}
