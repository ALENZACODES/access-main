import type { Page } from "@playwright/test";

/** Stable, machine-readable failures; no English page copy is assumed. */
export type RelationCode =
  | "duplicate-id"
  | "empty-id"
  | "missing-reference"
  | "duplicate-reference"
  | "self-reference"
  | "hidden-label-reference"
  | "missing-description"
  | "invalid-controls"
  | "invalid-owns"
  | "invalid-activedescendant"
  | "invalid-error-message"
  | "invalid-form-label"
  | "invalid-header-reference"
  | "invalid-fragment-target";

export interface RelationFinding {
  readonly code: RelationCode;
  readonly selector: string;
  readonly attribute: string;
  readonly target: string;
}

export interface RelationAudit {
  readonly findings: readonly RelationFinding[];
  readonly ids: number;
  readonly references: number;
  readonly inspectedElements: number;
}

/**
 * Inspect DOM ID relationships rather than relying on axe's partial coverage.
 * References in detached nodes are not included. SVG IDs, IDs in templates,
 * hidden error messages and valid cross-shadow-tree scopes are not conflated.
 * Each tree root is validated independently because document.getElementById
 * cannot resolve shadow-root-local IDs.
 */
export async function auditDomRelations(page: Page): Promise<RelationAudit> {
  return page.evaluate(() => {
    type Code =
      | "duplicate-id" | "empty-id" | "missing-reference"
      | "duplicate-reference" | "self-reference" | "hidden-label-reference"
      | "missing-description" | "invalid-controls" | "invalid-owns"
      | "invalid-activedescendant" | "invalid-error-message"
      | "invalid-form-label" | "invalid-header-reference"
      | "invalid-fragment-target";
    type Finding = { code: Code; selector: string; attribute: string; target: string };
    const findings: Finding[] = [];
    let ids = 0;
    let references = 0;
    let inspectedElements = 0;

    const escape = (value: string): string => {
      if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
      return value.replace(/[^a-zA-Z0-9_-]/g, (character) =>
        `\\${character.codePointAt(0)?.toString(16) ?? "0"} `);
    };
    const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;
    const position = (element: Element): string => {
      if (element.id) return `#${escape(element.id)}`;
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && parts.length < 7) {
        const tag = current.localName;
        const parent: Element | null = current.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const siblings = [...parent.children].filter((child) => child.localName === tag);
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
        current = parent;
      }
      return parts.join(" > ");
    };
    const add = (code: Code, element: Element, attribute: string, target = ""): void => {
      findings.push({ code, selector: position(element), attribute, target });
    };
    const nonEmpty = (value: string): boolean => value.trim().length > 0;
    const isRendered = (element: Element): boolean => {
      if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return true;
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const attrGroups: readonly { attr: string; code: Code; multiple: boolean; allowSelf: boolean }[] = [
      { attr: "aria-labelledby", code: "missing-reference", multiple: true, allowSelf: true },
      { attr: "aria-describedby", code: "missing-description", multiple: true, allowSelf: false },
      { attr: "aria-controls", code: "invalid-controls", multiple: true, allowSelf: false },
      { attr: "aria-owns", code: "invalid-owns", multiple: true, allowSelf: false },
      { attr: "aria-activedescendant", code: "invalid-activedescendant", multiple: false, allowSelf: false },
      { attr: "aria-errormessage", code: "invalid-error-message", multiple: false, allowSelf: false },
      { attr: "headers", code: "invalid-header-reference", multiple: true, allowSelf: false },
      { attr: "for", code: "invalid-form-label", multiple: false, allowSelf: false },
      { attr: "list", code: "missing-reference", multiple: false, allowSelf: false },
      { attr: "form", code: "missing-reference", multiple: false, allowSelf: false },
    ];

    function inspectRoot(root: Document | ShadowRoot): void {
      const elements = [...root.querySelectorAll("*")];
      inspectedElements += elements.length;
      const index = new Map<string, Element[]>();
      for (const element of elements) {
        if (!element.hasAttribute("id")) continue;
        const id = element.getAttribute("id") ?? "";
        ids += 1;
        if (!nonEmpty(id)) {
          add("empty-id", element, "id");
          continue;
        }
        const matches = index.get(id) ?? [];
        matches.push(element);
        index.set(id, matches);
        if (matches.length === 2) {
          add("duplicate-id", matches[0]!, "id", id);
          add("duplicate-id", element, "id", id);
        } else if (matches.length > 2) {
          add("duplicate-id", element, "id", id);
        }
      }
      for (const element of elements) {
        for (const group of attrGroups) {
          if (!element.hasAttribute(group.attr)) continue;
          const raw = element.getAttribute(group.attr) ?? "";
          // Empty optional ARIA relationships have no valid target.
          const targets = group.multiple ? raw.trim().split(/\s+/).filter(Boolean) : [raw.trim()];
          if (!nonEmpty(raw)) {
            add(group.code, element, group.attr);
            continue;
          }
          const seen = new Set<string>();
          for (const target of targets) {
            references += 1;
            if (seen.has(target)) add("duplicate-reference", element, group.attr, target);
            seen.add(target);
            const matches = index.get(target);
            if (!matches?.length) {
              add(group.code, element, group.attr, target);
              continue;
            }
            if (!group.allowSelf && matches.includes(element)) add("self-reference", element, group.attr, target);
            if (group.attr === "aria-labelledby" && !matches.some(isRendered)) {
              // Hidden text *can* contribute to accessible name in ARIA; do not
              // reject it. An explicit aria-hidden ancestor, however, can
              // make the authored target ambiguous across AT combinations.
              if (matches.every((match) => Boolean(match.closest("[aria-hidden='true']")))) {
                add("hidden-label-reference", element, group.attr, target);
              }
            }
            if (group.attr === "for" && !matches.some((match) =>
              match.matches("input,select,textarea,button,output,meter,progress"))) {
              add("invalid-form-label", element, group.attr, target);
            }
            if (group.attr === "headers" && !matches.some((match) => match.matches("th"))) {
              add("invalid-header-reference", element, group.attr, target);
            }
            if (group.attr === "list" && !matches.some((match) => match.matches("datalist"))) {
              add("missing-reference", element, group.attr, target);
            }
            if (group.attr === "form" && !matches.some((match) => match.matches("form"))) {
              add("missing-reference", element, group.attr, target);
            }
          }
        }
        if (element.matches("a[href^='#'], area[href^='#']")) {
          const raw = element.getAttribute("href") ?? "";
          if (raw === "#") continue; // placeholder links are reviewed separately
          let fragment = "";
          try { fragment = decodeURIComponent(raw.slice(1)); } catch { fragment = raw.slice(1); }
          if (!index.has(fragment) && fragment !== "") add("invalid-fragment-target", element, "href", fragment);
        }
      }
      for (const element of elements) {
        if (isElement(element) && element.shadowRoot) inspectRoot(element.shadowRoot);
      }
    }
    inspectRoot(document);
    findings.sort((a, b) =>
      a.code.localeCompare(b.code) || a.selector.localeCompare(b.selector) ||
      a.attribute.localeCompare(b.attribute) || a.target.localeCompare(b.target));
    return { findings, ids, references, inspectedElements };
  });
}

export function formatRelationFindings(audit: RelationAudit): string {
  if (!audit.findings.length) return "No DOM ID relationship findings";
  return audit.findings.map((finding) =>
    `${finding.code} ${finding.selector} [${finding.attribute}] ${finding.target}`.trim()).join("\n");
}
