import { expect, type Page } from "@playwright/test";

export interface SemanticIssue {
  readonly code: string;
  readonly selector: string;
  readonly detail: string;
}
export interface SemanticNode {
  readonly selector: string;
  readonly role: string;
  readonly name: string;
  readonly description: string;
  readonly hidden: boolean;
  readonly tag: string;
}
export interface SemanticSnapshot {
  readonly title: string;
  readonly language: string;
  readonly mains: number;
  readonly headings: readonly { level: number; text: string }[];
  readonly landmarks: readonly SemanticNode[];
  readonly controls: readonly SemanticNode[];
  readonly issues: readonly SemanticIssue[];
}
const CONTROL_SELECTOR = [
  "a[href]", "button", "input:not([type='hidden'])", "select", "textarea",
  "[role='button']", "[role='link']", "[role='checkbox']", "[role='radio']",
  "[role='switch']", "[role='tab']", "[role='option']", "[contenteditable='true']",
].join(",");

export async function inspectSemanticSurface(page: Page): Promise<SemanticSnapshot> {
  return page.evaluate((controlSelector) => {
    const issues: SemanticIssue[] = [];
    const selectorFor = (node: Element, index: number): string => {
      const element = node as HTMLElement;
      if (element.id) return `#${CSS.escape(element.id)}`;
      const marker = element.getAttribute("data-p16-semantic-id");
      if (marker) return `[data-p16-semantic-id="${marker}"]`;
      element.setAttribute("data-p16-semantic-id", String(index));
      return `[data-p16-semantic-id="${index}"]`;
    };
    const hidden = (node: Element): boolean => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      return !!element.closest("[hidden],[inert],[aria-hidden='true']") ||
        style.display === "none" || style.visibility === "hidden" ||
        element.getAttribute("aria-hidden") === "true";
    };
    const referencedText = (node: Element, attribute: string): string => {
      const ids = (node.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean);
      return ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean).join(" ").trim();
    };
    const labelText = (node: HTMLElement): string => {
      if (node instanceof HTMLInputElement || node instanceof HTMLSelectElement ||
          node instanceof HTMLTextAreaElement || node instanceof HTMLButtonElement) {
        return Array.from(node.labels ?? []).map((label) => label.textContent?.trim() ?? "")
          .filter(Boolean).join(" ").trim();
      }
      return "";
    };
    const accessibleName = (node: HTMLElement): string => {
      const aria = node.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const labelled = referencedText(node, "aria-labelledby");
      if (labelled) return labelled;
      const label = labelText(node);
      if (label) return label;
      if (node instanceof HTMLInputElement && ["submit", "button", "reset"].includes(node.type)) {
        return node.value.trim();
      }
      return node.textContent?.trim() ?? node.getAttribute("title")?.trim() ?? "";
    };
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(controlSelector));
    const controls = nodes.map((node, index): SemanticNode => {
      const selector = selectorFor(node, index);
      const name = accessibleName(node);
      const description = referencedText(node, "aria-describedby");
      const isHidden = hidden(node);
      if (!isHidden && !name) {
        issues.push({ code: "control-name-empty", selector, detail: "Visible interactive element has no accessible name" });
      }
      if (node.hasAttribute("aria-labelledby") && !referencedText(node, "aria-labelledby")) {
        issues.push({ code: "labelledby-empty", selector, detail: "aria-labelledby has no resolvable text" });
      }
      const role = node.getAttribute("role") ?? node.localName;
      if (!isHidden && node.getAttribute("aria-disabled") === "true" && node.tabIndex >= 0) {
        issues.push({ code: "aria-disabled-tabbable", selector, detail: "aria-disabled control remains in sequential focus" });
      }
      if (!isHidden && node.tabIndex > 0) {
        issues.push({ code: "positive-tabindex", selector, detail: "Positive tabindex changes natural focus order" });
      }
      if (!isHidden && node.hasAttribute("aria-checked") &&
          !["true", "false", "mixed"].includes(node.getAttribute("aria-checked") ?? "")) {
        issues.push({ code: "aria-checked-invalid", selector, detail: "aria-checked has an unsupported value" });
      }
      if (node.getAttribute("aria-pressed") !== null &&
          !["true", "false", "mixed"].includes(node.getAttribute("aria-pressed") ?? "")) {
        issues.push({ code: "aria-pressed-invalid", selector, detail: "aria-pressed has an unsupported value" });
      }
      if (node.hasAttribute("aria-current") &&
          !["page", "step", "location", "date", "time", "true", "false"].includes(node.getAttribute("aria-current") ?? "")) {
        issues.push({ code: "aria-current-invalid", selector, detail: "aria-current has an unsupported value" });
      }
      if (!isHidden && description.length === 0 && node.getAttribute("aria-invalid") === "true") {
        issues.push({ code: "invalid-control-no-description", selector, detail: "Invalid control has no described error or help text" });
      }
      return { selector, role, name, description, hidden: isHidden, tag: node.localName };
    });
    const references = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"];
    const owners = document.querySelectorAll(references.map(attribute => `[${attribute}]`).join(","));
    for (const owner of owners) {
      for (const attribute of references) {
        const ids = (owner.getAttribute(attribute) ?? "").trim().split(/\s+/).filter(Boolean);
        for (const id of ids) {
          if (!document.getElementById(id)) {
            const selector = owner.id ? `#${CSS.escape(owner.id)}` : owner.localName;
            issues.push({ code: "id-reference-missing", selector, detail: `${attribute} references missing id ${id}` });
          }
        }
      }
    }
    const headingNodes = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"));
    const headings = headingNodes.map((node) => ({
      level: Number(node.localName.slice(1)),
      text: node.textContent?.trim() ?? "",
    }));
    const mains = document.querySelectorAll("main,[role='main']").length;
    if (mains !== 1) issues.push({ code: "main-count", selector: "document", detail: `Expected one main landmark, found ${mains}` });
    const h1 = headings.filter((heading) => heading.level === 1);
    if (h1.length !== 1) issues.push({ code: "h1-count", selector: "document", detail: `Expected one h1, found ${h1.length}` });
    headings.forEach((heading, index) => {
      if (!heading.text) issues.push({ code: "heading-empty", selector: `heading[${index}]`, detail: "Heading has no text" });
      const previous = headings[index - 1];
      if (previous && heading.level > previous.level + 1) {
        issues.push({ code: "heading-level-skip", selector: `heading[${index}]`, detail: "Heading hierarchy skips a level" });
      }
    });
    const landmarks = Array.from(document.querySelectorAll<HTMLElement>(
      "nav,aside,header,footer,main,[role='navigation'],[role='region'],[role='complementary'],[role='banner'],[role='contentinfo']",
    )).map((node, index): SemanticNode => {
      const selector = selectorFor(node, index + nodes.length);
      const nativeRoles: Record<string, string> = {
        nav: "navigation",
        aside: "complementary",
        main: "main",
        header: node.parentElement === document.body ? "banner" : "generic",
        footer: node.parentElement === document.body ? "contentinfo" : "generic",
      };
      const role = node.getAttribute("role") ?? nativeRoles[node.localName] ?? node.localName;
      const name = node.getAttribute("aria-label")?.trim() ??
        referencedText(node, "aria-labelledby");
      if (["navigation", "region", "complementary"].includes(role) && !name) {
        issues.push({ code: "landmark-name-empty", selector, detail: `${role} landmark needs an explicit accessible name` });
      }
      return { selector, role, name, description: "", hidden: hidden(node), tag: node.localName };
    });
    const ids = new Map<string, number>();
    document.querySelectorAll<HTMLElement>("[id]").forEach((node) => ids.set(node.id, (ids.get(node.id) ?? 0) + 1));
    for (const [id, count] of ids) {
      if (count > 1) issues.push({ code: "id-duplicate", selector: `#${CSS.escape(id)}`, detail: `Duplicate id occurs ${count} times` });
    }
    return {
      title: document.title,
      language: document.documentElement.lang,
      mains,
      headings,
      landmarks,
      controls,
      issues,
    };
  }, CONTROL_SELECTOR);
}
export async function assertSemanticSurface(page: Page): Promise<SemanticSnapshot> {
  const result = await inspectSemanticSurface(page);
  expect(result.title.trim().length, "Document title").toBeGreaterThan(0);
  expect(result.language.toLowerCase()).toMatch(/^(en|fr)(-|$)/);
  expect(result.issues, "Semantic surface issues").toEqual([]);
  return result;
}
export async function assertControlHasName(page: Page, selector: string, expected: string): Promise<void> {
  const snapshot = await inspectSemanticSurface(page);
  const control = snapshot.controls.find((item) => item.selector === selector);
  expect(control?.name).toBe(expected);
}
