import type { Page } from "@playwright/test";
import type { AttributeCopy, AttributeName } from "./p20u-attribute-language";
import type { TypographyFragment } from "./p20w-french-typography";

const ATTRIBUTES: readonly AttributeName[] = ["aria-label", "aria-description", "alt", "title", "placeholder"];

export interface AttributeSnapshot {
  readonly route: string;
  readonly documentLanguage: string;
  readonly attributes: readonly AttributeCopy[];
  readonly typography: readonly TypographyFragment[];
  readonly inspectionCount: number;
}

/**
 * A read-only collector for text that contributes to accessible names and
 * descriptions. No attributes are modified and no selectors are stored in the
 * real application. The use of an element path only improves test diagnostics.
 */
export async function collectRouteAttributeSnapshot(page: Page, route: string): Promise<AttributeSnapshot> {
  const collected = await page.evaluate((attributes) => {
    const visible = (element: Element): boolean => {
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const styles = getComputedStyle(element);
      if (styles.display === "none" || styles.visibility === "hidden" || styles.visibility === "collapse") return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const pathOf = (element: Element): string => {
      if (element.id) return `#${element.id}`;
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && parts.length < 5) {
        if (current.id) {
          parts.unshift(`#${current.id}`);
          break;
        }
        const parent: Element | null = current.parentElement;
        const siblings = parent ? [...parent.children].filter((child) => child.tagName === current?.tagName) : [];
        const index = siblings.indexOf(current) + 1;
        parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
        current = parent;
      }
      return parts.join(" > ");
    };
    const items: Array<{
      element: string; attribute: "aria-label" | "aria-description" | "alt" | "title" | "placeholder";
      value: string; inheritedLanguage: string; explicitlyMarkedLanguage: string | null; visible: boolean;
    }> = [];
    const source = [...document.querySelectorAll<HTMLElement>("*")];
    for (const element of source) {
      const ancestor = element.closest<HTMLElement>("[lang]");
      const inheritedLanguage = ancestor?.getAttribute("lang") ?? document.documentElement.lang;
      const explicitlyMarkedLanguage = element.getAttribute("lang");
      const displayed = visible(element);
      for (const attr of attributes) {
        const value = element.getAttribute(attr);
        if (value === null) continue;
        items.push({
          element: pathOf(element),
          attribute: attr,
          value,
          inheritedLanguage,
          explicitlyMarkedLanguage,
          visible: displayed,
        });
      }
    }
    const typography: Array<{
      path: string; text: string; language: string; visible: boolean; kind: "text" | "attribute";
    }> = [];
    // Collect leaf direct-text fragments rather than a paragraph and every
    // ancestor. This avoids duplicate reports for the same punctuation.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let current: Node | null = walker.nextNode();
    while (current) {
      const parent: HTMLElement | null = current.parentElement;
      if (parent && !parent.matches("script,style,template,noscript") && current.textContent?.trim()) {
        typography.push({
          path: pathOf(parent),
          text: current.textContent,
          language: parent.closest<HTMLElement>("[lang]")?.getAttribute("lang") ?? document.documentElement.lang,
          visible: visible(parent),
          kind: "text",
        });
      }
      current = walker.nextNode();
    }
    for (const item of items) {
      typography.push({
        path: `${item.element}[${item.attribute}]`,
        text: item.value,
        language: item.explicitlyMarkedLanguage ?? item.inheritedLanguage,
        visible: item.visible,
        kind: "attribute",
      });
    }
    return { documentLanguage: document.documentElement.lang, attributes: items, typography, inspectionCount: source.length };
  }, ATTRIBUTES);
  return { route, ...collected };
}

/** A single HTML document may contain repeated attribute copy. Keep one error per selector and property. */
export function compactAttributeCopy(items: readonly AttributeCopy[]): AttributeCopy[] {
  const used = new Set<string>();
  const out: AttributeCopy[] = [];
  for (const item of items) {
    const key = `${item.element}\u0000${item.attribute}\u0000${item.value}`;
    if (used.has(key)) continue;
    used.add(key);
    out.push(item);
  }
  return out;
}

/** Explicit metadata about the page is needed for a failure to be actionable. */
export function snapshotLabel(snapshot: AttributeSnapshot): string {
  return `${snapshot.route} (${snapshot.documentLanguage}) attributes=${snapshot.attributes.length}, nodes=${snapshot.inspectionCount}`;
}

export function attributeDistribution(items: readonly AttributeCopy[]): Record<AttributeName, number> {
  const counts: Record<AttributeName, number> = {
    "aria-label": 0, "aria-description": 0, alt: 0, title: 0, placeholder: 0,
  };
  for (const item of items) counts[item.attribute] += 1;
  return counts;
}

export function invisibleAttributeCount(items: readonly AttributeCopy[]): number {
  return items.filter((item) => !item.visible).length;
}

export function attributesWithExplicitLanguage(items: readonly AttributeCopy[]): AttributeCopy[] {
  return items.filter((item) => item.explicitlyMarkedLanguage !== null);
}

export function attributesInLanguage(items: readonly AttributeCopy[], locale: string): AttributeCopy[] {
  return items.filter((item) => {
    const tag = item.explicitlyMarkedLanguage ?? item.inheritedLanguage;
    return tag.toLowerCase().split("-")[0] === locale;
  });
}

export function routeHasAttribute(snapshot: AttributeSnapshot, attribute: AttributeName): boolean {
  return snapshot.attributes.some((item) => item.attribute === attribute);
}

export function distinctAttributePaths(snapshot: AttributeSnapshot): string[] {
  return [...new Set(snapshot.attributes.map((item) => item.element))];
}

export function attributesForPath(snapshot: AttributeSnapshot, path: string): AttributeCopy[] {
  return snapshot.attributes.filter((item) => item.element === path);
}
