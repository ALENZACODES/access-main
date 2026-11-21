import type { Page } from "@playwright/test";

export type NameRelationCode =
  | "unnamed-button"
  | "unnamed-link"
  | "unnamed-field"
  | "unnamed-custom-control"
  | "empty-label-reference"
  | "dangling-label-reference"
  | "duplicate-label-reference"
  | "invisible-label-reference"
  | "empty-aria-label"
  | "empty-title-fallback"
  | "label-not-in-name"
  | "duplicate-control-id"
  | "fieldset-without-legend"
  | "group-without-name"
  | "invalid-description-reference"
  | "invalid-error-reference"
  | "invalid-invalid-state"
  | "invalid-required-state"
  | "invalid-readonly-state"
  | "invalid-disabled-state"
  | "hidden-required-field"
  | "placeholder-only-label"
  | "image-button-without-alt"
  | "input-associated-label-empty"
  | "duplicate-labelledby-token"
  | "label-for-nonexistent-field"
  | "unassociated-visible-label";

export interface NameRelationIssue {
  readonly code: NameRelationCode;
  readonly element: string;
  readonly detail: string;
}

export interface NameRelationReport {
  readonly issues: readonly NameRelationIssue[];
  readonly controls: number;
  readonly names: number;
  readonly groups: number;
  readonly labels: number;
}

/**
 * Read-only, DOM-grounded name and description contract audit. This checks
 * authored relationships; it does not pretend to emulate all browser and
 * screen-reader accessible-name computation rules.
 */
export async function auditNameRelations(page: Page): Promise<NameRelationReport> {
  return page.evaluate(() => {
    type Code = NameRelationCode;
    const issues: NameRelationIssue[] = [];
    let controls = 0;
    let names = 0;
    let groups = 0;
    let labels = 0;
    const controlSelector = [
      "button", "a[href]", "input:not([type='hidden'])", "select", "textarea",
      "[role='button']", "[role='link']", "[role='checkbox']", "[role='radio']",
      "[role='switch']", "[role='slider']", "[role='spinbutton']",
      "[role='textbox']", "[role='combobox']", "[role='tab']", "[role='option']",
      "[role='menuitem']", "[role='menuitemcheckbox']", "[role='menuitemradio']",
    ].join(",");
    const elementName = (element: Element): string => element.id
      ? `#${CSS.escape(element.id)}` : element.localName + (element.getAttribute("role") ? `[role=${element.getAttribute("role")}]` : "");
    const report = (code: Code, element: Element, detail: string): void => {
      issues.push({ code, element: elementName(element), detail });
    };
    const hidden = (element: Element): boolean => {
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return true;
      let node: Element | null = element;
      while (node) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return true;
        node = node.parentElement;
      }
      return false;
    };
    const nodesFor = (id: string): Element[] => Array.from(document.querySelectorAll("[id]"))
      .filter((node) => node.id === id);
    const ids = new Map<string, number>();
    for (const element of document.querySelectorAll("[id]")) {
      ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
    }
    const labelsFor = (element: Element): HTMLLabelElement[] => {
      if (!(element instanceof HTMLElement)) return [];
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        return Array.from(element.labels ?? []);
      }
      return [];
    };
    const namedFrom = (element: Element): { name: string; source: string } => {
      const references = element.getAttribute("aria-labelledby")?.trim().split(/\s+/).filter(Boolean) ?? [];
      if (references.length) {
        const pieces = references.flatMap((id) => nodesFor(id).map((node) => node.textContent?.trim() ?? ""));
        const name = pieces.join(" ").trim();
        if (name) return { name, source: "aria-labelledby" };
      }
      const aria = element.getAttribute("aria-label")?.trim();
      if (aria) return { name: aria, source: "aria-label" };
      const label = labelsFor(element).map((node) => node.textContent?.trim() ?? "").join(" ").trim();
      if (label) return { name: label, source: "label" };
      if (element instanceof HTMLInputElement && element.type === "image" && element.alt.trim()) {
        return { name: element.alt.trim(), source: "alt" };
      }
      const text = element.textContent?.trim() ?? "";
      if (text && !element.matches("input,select,textarea")) return { name: text, source: "content" };
      if (element instanceof HTMLInputElement && ["submit", "reset", "button"].includes(element.type) && element.value.trim()) {
        return { name: element.value.trim(), source: "value" };
      }
      const title = element.getAttribute("title")?.trim();
      if (title) return { name: title, source: "title" };
      return { name: "", source: "" };
    };
    const visibleText = (element: Element): string => {
      const children = Array.from(element.childNodes);
      return children.map((node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
        if (!(node instanceof Element) || hidden(node)) return "";
        return node.textContent ?? "";
      }).join(" ").replace(/\s+/g, " ").trim();
    };
    const role = (element: Element): string => element.getAttribute("role") ?? "";
    const isNativeField = (element: Element): boolean => element.matches("input,select,textarea");
    for (const element of document.querySelectorAll(controlSelector)) {
      if (hidden(element)) continue;
      controls += 1;
      const result = namedFrom(element);
      if (result.name) names += 1;
      const custom = role(element);
      if (!result.name) {
        const code: Code = isNativeField(element) ? "unnamed-field" :
          (element.matches("button") || custom === "button") ? "unnamed-button" :
          (element.matches("a[href]") || custom === "link") ? "unnamed-link" : "unnamed-custom-control";
        report(code, element, "Control has no authored accessible-name source");
      }
      if (element.hasAttribute("aria-label") && !element.getAttribute("aria-label")?.trim()) {
        report("empty-aria-label", element, "aria-label is present but empty");
      }
      if (element.hasAttribute("title") && !element.getAttribute("title")?.trim()) {
        report("empty-title-fallback", element, "Empty title does not provide a name");
      }
      if (element.id && (ids.get(element.id) ?? 0) > 1) {
        report("duplicate-control-id", element, `ID ${element.id} is not unique`);
      }
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy !== null) {
        const tokens = labelledBy.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) report("empty-label-reference", element, "aria-labelledby has no tokens");
        const seen = new Set<string>();
        for (const token of tokens) {
          if (seen.has(token)) report("duplicate-labelledby-token", element, `Duplicate token: ${token}`);
          seen.add(token);
          const targets = nodesFor(token);
          if (targets.length === 0) report("dangling-label-reference", element, token);
          else if (targets.length > 1) report("duplicate-label-reference", element, token);
          else if (!targets[0]?.textContent?.trim()) report("invisible-label-reference", element, `Reference ${token} has no text`);
        }
      }
      const text = visibleText(element);
      if (text && result.name && !result.name.toLocaleLowerCase().includes(text.toLocaleLowerCase()) &&
          ["aria-label", "aria-labelledby", "title"].includes(result.source) && text.length <= 80) {
        report("label-not-in-name", element, `Visible label ${JSON.stringify(text)} is absent from accessible name`);
      }
      if (isNativeField(element)) {
        const field = element as HTMLInputElement;
        if (field.hasAttribute("placeholder") && !result.name) report("placeholder-only-label", element, "Placeholder is not a persistent label");
        if (field.type === "image" && !field.alt.trim()) report("image-button-without-alt", element, "Image input requires non-empty alternative text");
        if (field.required && hidden(field)) report("hidden-required-field", element, "Required control is hidden");
        const nativeLabels = labelsFor(element);
        if (nativeLabels.some((label) => !label.textContent?.trim())) report("input-associated-label-empty", element, "Associated label has no text");
      }
      for (const [attribute, code] of [
        ["aria-describedby", "invalid-description-reference"],
        ["aria-errormessage", "invalid-error-reference"],
      ] as const) {
        const value = element.getAttribute(attribute);
        if (value === null) continue;
        const tokens = value.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || tokens.some((id) => nodesFor(id).length !== 1)) report(code, element, value);
      }
      for (const [attribute, code, allowed] of [
        ["aria-invalid", "invalid-invalid-state", ["true", "false", "grammar", "spelling"]],
        ["aria-required", "invalid-required-state", ["true", "false"]],
        ["aria-readonly", "invalid-readonly-state", ["true", "false"]],
        ["aria-disabled", "invalid-disabled-state", ["true", "false"]],
      ] as const) {
        const value = element.getAttribute(attribute);
        if (value !== null && !(allowed as readonly string[]).includes(value)) report(code, element, value);
      }
    }
    for (const label of document.querySelectorAll("label")) {
      if (hidden(label)) continue;
      labels += 1;
      if (label.htmlFor && nodesFor(label.htmlFor).length === 0) {
        report("label-for-nonexistent-field", label, label.htmlFor);
      }
      if (!label.control && !label.htmlFor && !label.querySelector("input,select,textarea")) {
        report("unassociated-visible-label", label, "Visible label has no associated form control");
      }
    }
    for (const group of document.querySelectorAll("fieldset,[role='group'],[role='radiogroup']")) {
      if (hidden(group)) continue;
      groups += 1;
      if (group.matches("fieldset")) {
        const legend = Array.from(group.children).find((child) => child.localName === "legend");
        if (!legend || !legend.textContent?.trim()) report("fieldset-without-legend", group, "Group has no non-empty legend");
      } else {
        const groupName = namedFrom(group);
        if (!groupName.name || groupName.source === "content") {
          report("group-without-name", group, "Authored group name is required");
        }
      }
    }
    return { issues, controls, names, groups, labels };
  });
}

export function summarizeNameRelations(report: NameRelationReport): string {
  return report.issues.map((issue) => `${issue.code} ${issue.element}: ${issue.detail}`).join("\n");
}

export function containsNameIssue(report: NameRelationReport, code: NameRelationCode): boolean {
  return report.issues.some((issue) => issue.code === code);
}
