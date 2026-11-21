import { expect, type Page } from "@playwright/test";

export interface LocaleIssue {
  readonly code: string;
  readonly selector: string;
  readonly detail: string;
}
const FRENCH_NARROW = "\u202f";
const FRENCH_NBSP = "\u00a0";
export async function inspectLocaleContract(page: Page): Promise<LocaleIssue[]> {
  return page.evaluate(({ narrow, nbsp }) => {
    const issues: LocaleIssue[] = [];
    const language = document.documentElement.lang.toLowerCase();
    if (!/^(en|fr)(-|$)/.test(language)) issues.push({ code: "document-language-invalid", selector: "html", detail: `Unsupported document language ${language || "empty"}` });
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script,style,code,pre,[aria-hidden='true']")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let current = walker.nextNode();
    while (current) { textNodes.push(current as Text); current = walker.nextNode(); }
    if (language.startsWith("fr")) {
      textNodes.forEach((node, index) => {
        const value = node.textContent ?? "";
        if (/[a-zA-Z]'[a-zA-Z]/u.test(value)) {
          issues.push({ code: "french-apostrophe", selector: `text[${index}]`, detail: "Use the typographic apostrophe in French copy" });
        }
        if (/[^\u00a0]:/u.test(value) && /[a-zA-Z]\s*:/u.test(value)) {
          issues.push({ code: "french-colon-spacing", selector: `text[${index}]`, detail: "Use a non-breaking space before a colon" });
        }
        if (/[^\u202f][;!?]/u.test(value)) {
          issues.push({ code: "french-narrow-spacing", selector: `text[${index}]`, detail: "Use a narrow no-break space before ; ! ?" });
        }
        if (/«[^\u202f]/u.test(value) || /[^\u202f]»/u.test(value)) {
          issues.push({ code: "french-guillemet-spacing", selector: `text[${index}]`, detail: "Use narrow no-break spaces inside French guillemets" });
        }
        if (value.includes("  ")) issues.push({ code: "french-double-space", selector: `text[${index}]`, detail: "Avoid repeated ordinary spaces" });
      });
    }
    // Keep the constants in the evaluated payload so source tests can assert
    // the exact Unicode code points without inserting invisible characters.
    if (narrow.codePointAt(0) !== 0x202f || nbsp.codePointAt(0) !== 0x00a0) {
      issues.push({ code: "locale-spacing-constants", selector: "audit", detail: "Locale spacing constants are malformed" });
    }
    return issues;
  }, { narrow: FRENCH_NARROW, nbsp: FRENCH_NBSP });
}
export async function assertLocaleContract(page: Page, language: "en" | "fr"): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  expect(await inspectLocaleContract(page), `${language} locale contract`).toEqual([]);
}
export async function assertLanguageToggle(page: Page): Promise<void> {
  const html = page.locator("html");
  const initial = (await html.getAttribute("lang"))?.toLowerCase() ?? "";
  const button = page.getByRole("button", { name: initial.startsWith("fr") ? "English" : "Français" }).first();
  await expect(button).toBeVisible();
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(html).toHaveAttribute("lang", initial.startsWith("fr") ? "en" : "fr");
  const reverse = page.getByRole("button", { name: initial.startsWith("fr") ? "Français" : "English" }).first();
  await reverse.focus();
  await page.keyboard.press("Enter");
  await expect(html).toHaveAttribute("lang", initial.startsWith("fr") ? "fr" : "en");
}
