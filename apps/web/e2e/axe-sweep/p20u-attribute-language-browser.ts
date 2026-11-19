import type { Page } from "@playwright/test";
import {
  attributeLanguageReport,
  type AttributeCopy,
  type AttributeLanguageReport,
  type AttributeName,
} from "./p20u-attribute-language";

const ATTRIBUTES: readonly AttributeName[] = ["aria-label", "aria-description", "alt", "title", "placeholder"];

/** Collect displayed accessible-name/description attributes without changing the page. */
export async function collectAttributeCopy(page: Page): Promise<{
  readonly documentLanguage: string;
  readonly items: readonly AttributeCopy[];
}> {
  return page.evaluate((attributes) => {
    const visible = (element: Element): boolean => {
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return false;
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        const computed = getComputedStyle(parent);
        if (computed.display === "none" || computed.visibility === "hidden" || computed.visibility === "collapse") return false;
      }
      return true;
    };
    const label = (element: Element, index: number): string => {
      if (element.id) return `#${element.id}`;
      const tag = element.tagName.toLowerCase();
      return `${tag}[${index}]`;
    };
    const items: Array<{
      element: string;
      attribute: string;
      value: string;
      inheritedLanguage: string;
      explicitlyMarkedLanguage: string | null;
      visible: boolean;
    }> = [];
    const selector = attributes.map((attribute) => `[${attribute}]`).join(",");
    [...document.querySelectorAll(selector)].forEach((element, index) => {
      for (const attribute of attributes) {
        const value = element.getAttribute(attribute);
        if (value === null) continue;
        const ownLanguage = element.getAttribute("lang");
        const ancestor = element.parentElement?.closest("[lang]")?.getAttribute("lang") ?? document.documentElement.lang;
        items.push({
          element: label(element, index),
          attribute,
          value,
          inheritedLanguage: ancestor,
          explicitlyMarkedLanguage: ownLanguage,
          visible: visible(element),
        });
      }
    });
    return { documentLanguage: document.documentElement.lang, items };
  }, ATTRIBUTES) as Promise<{ documentLanguage: string; items: readonly AttributeCopy[] }>;
}

export async function inspectAttributeLanguage(page: Page): Promise<AttributeLanguageReport> {
  const snapshot = await collectAttributeCopy(page);
  return attributeLanguageReport(snapshot.items, snapshot.documentLanguage);
}
