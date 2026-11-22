import { expect, type Page } from "@playwright/test";

export interface LocaleIssue {
  readonly code: string;
  readonly selector: string;
  readonly detail: string;
}
export async function inspectLocaleContract(page: Page): Promise<LocaleIssue[]> {
  return page.evaluate(() => {
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
        if (!value.trim()) return;
        if (/\p{L}'\p{L}/u.test(value)) {
          issues.push({ code: "french-apostrophe", selector: `text[${index}]`, detail: "Use the typographic apostrophe in French copy" });
        }
        if (/[^\u00a0]:/u.test(value) && /[a-zA-Z]\s*:/u.test(value)) {
          issues.push({ code: "french-colon-spacing", selector: `text[${index}]`, detail: "Use a non-breaking space before a colon" });
        }
        if (/[^\u00a0][!?]|[^\u202f];/u.test(value)) {
          issues.push({ code: "french-punctuation-spacing", selector: `text[${index}]`, detail: "Use a no-break space before ! or ? and a narrow no-break space before ;" });
        }
        if (/«[^\u00a0]/u.test(value) || /[^\u00a0]»/u.test(value)) {
          issues.push({ code: "french-guillemet-spacing", selector: `text[${index}]`, detail: "Use no-break spaces inside French guillemets" });
        }
        if (value.includes("  ")) issues.push({ code: "french-double-space", selector: `text[${index}]`, detail: "Avoid repeated ordinary spaces" });
      });
    }
    return issues;
  });
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
