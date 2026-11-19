import type { Page } from "@playwright/test";

/**
 * Tests cover authored keyboard contracts, not the output of a screen reader.
 * No listener is installed, no focus is moved, and no page state is changed.
 */
export type KeyboardIssueCode =
  | "duplicate-dom-id"
  | "empty-dom-id"
  | "dangling-idref"
  | "ambiguous-idref"
  | "empty-idref"
  | "invalid-activedescendant"
  | "inactive-activedescendant"
  | "missing-composite-name"
  | "missing-item-name"
  | "missing-composite-items"
  | "multiple-selected-tabs"
  | "missing-selected-tab"
  | "tab-not-owned"
  | "tab-panel-missing"
  | "tab-panel-not-linked"
  | "tab-not-focusable"
  | "multiple-roving-stops"
  | "missing-roving-stop"
  | "disabled-roving-stop"
  | "invalid-roving-tabindex"
  | "orphan-option"
  | "orphan-treeitem"
  | "orphan-menuitem"
  | "invalid-expanded"
  | "expanded-without-controls"
  | "missing-controlled-region"
  | "invalid-checked"
  | "invalid-selected"
  | "inert-focusable"
  | "hidden-focusable"
  | "positive-tabindex"
  | "interactive-descendant"
  | "invalid-aria-orientation"
  | "invalid-aria-level"
  | "invalid-aria-posinset"
  | "invalid-aria-setsize"
  | "invalid-aria-keyshortcuts";

export interface KeyboardFinding {
  readonly code: KeyboardIssueCode;
  readonly path: string;
  readonly attribute: string;
  readonly detail: string;
}

export interface KeyboardAudit {
  readonly findings: readonly KeyboardFinding[];
  readonly inspected: number;
  readonly composites: number;
  readonly ids: number;
  readonly roots: number;
}

/** Sorted diagnostic strings are stable enough to compare in CI artifacts. */
export function describeKeyboardAudit(audit: KeyboardAudit): string {
  return audit.findings.map((entry) =>
    `${entry.code}: ${entry.path} ${entry.attribute} ${entry.detail}`.trim(),
  ).join("\n");
}

/**
 * Browser-native DOM audit of composite patterns and sequential input.
 * This is intentionally narrower than WCAG conformance. Valid authored
 * patterns can use aria-activedescendant or roving tabindex; both paths are
 * represented. Closed shadow roots cannot be inspected using a page script.
 *
 * Duplicate IDs are checked per root, matching platform ID lookup. A shadow
 * root may reuse an ID appearing in the light DOM without a false failure.
 */
export async function auditKeyboardContracts(page: Page): Promise<KeyboardAudit> {
  return page.evaluate(() => {
    type Code = KeyboardIssueCode;
    type Finding = { code: Code; path: string; attribute: string; detail: string };
    const findings: Finding[] = [];
    let inspected = 0;
    let composites = 0;
    let ids = 0;
    let roots = 0;
    const compositeRoles = new Set(["tablist", "listbox", "menu", "menubar", "tree", "grid", "radiogroup"]);
    const itemRoles = new Set(["tab", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem", "gridcell", "radio"]);
    const interactiveRoles = new Set(["button", "link", "checkbox", "radio", "switch", "slider", "spinbutton", "textbox", "combobox", "tab", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem"]);
    const inputSelector = "a[href],button,input:not([type='hidden']),select,textarea,summary,[tabindex]";
    const idrefs = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-activedescendant", "aria-errormessage", "headers", "for"];
    const multipleIdrefs = new Set(["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "headers"]);
    const escape = (value: string): string => {
      if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
      return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch.codePointAt(0)?.toString(16) ?? "0"} `);
    };
    const roleOf = (element: Element): string => element.getAttribute("role")?.trim().split(/\s+/)[0] ?? "";
    const isDisabled = (element: Element): boolean =>
      element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
    const isHidden = (element: Element): boolean => {
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return true;
      const style = getComputedStyle(element);
      return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
    };
    const focusable = (element: Element): boolean => {
      const tabIndex = (element as HTMLElement).tabIndex;
      if (tabIndex < 0 || isDisabled(element)) return false;
      if (element.matches("a:not([href]),area:not([href])")) return element.hasAttribute("tabindex");
      return element.matches(inputSelector) || interactiveRoles.has(roleOf(element));
    };
    const pathOf = (element: Element, prefix: string): string => {
      if (element.id) return `${prefix}#${escape(element.id)}`;
      const segments: string[] = [];
      let current: Element | null = element;
      while (current && segments.length < 8) {
        const parent: Element | null = current.parentElement;
        const siblings = parent ? Array.from(parent.children).filter((candidate) => candidate.localName === current!.localName) : [current];
        segments.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`);
        current = parent;
      }
      return `${prefix}${segments.join(" > ")}`;
    };
    const add = (code: Code, element: Element, prefix: string, attribute: string, detail = ""): void => {
      findings.push({ code, path: pathOf(element, prefix), attribute, detail });
    };
    const hasName = (element: Element, index: Map<string, Element[]>, explicit = false): boolean => {
      const label = element.getAttribute("aria-label")?.trim();
      if (label) return true;
      const labelledby = element.getAttribute("aria-labelledby")?.trim().split(/\s+/).filter(Boolean) ?? [];
      if (labelledby.some((id) => index.get(id)?.some((target) => Boolean(target.textContent?.trim())))) return true;
      if (element.getAttribute("title")?.trim()) return true;
      if (explicit) return false;
      if (element.matches("input") && element.getAttribute("type") === "image" && element.getAttribute("alt")?.trim()) return true;
      return Boolean(element.textContent?.trim());
    };
    const inside = (ancestor: Element, descendant: Element): boolean => ancestor.contains(descendant);
    const descendantsWithRoles = (root: Element, roleSet: Set<string>): Element[] =>
      Array.from(root.querySelectorAll("[role]")).filter((child) => roleSet.has(roleOf(child)));
    const compositeParent = (element: Element): Element | null =>
      element.closest('[role="tablist"],[role="listbox"],[role="menu"],[role="menubar"],[role="tree"],[role="grid"],[role="radiogroup"]');

    const inspectRoot = (root: Document | ShadowRoot, prefix: string): void => {
      roots += 1;
      const elements = Array.from(root.querySelectorAll("*"));
      inspected += elements.length;
      const index = new Map<string, Element[]>();
      for (const element of elements) {
        const id = element.getAttribute("id");
        if (id === null) continue;
        ids += 1;
        if (!id.trim()) add("empty-dom-id", element, prefix, "id");
        const matches = index.get(id) ?? [];
        matches.push(element);
        index.set(id, matches);
        if (matches.length > 1) add("duplicate-dom-id", element, prefix, "id", id);
      }
      const getTarget = (id: string): Element | null => {
        const matches = index.get(id);
        return matches?.length === 1 ? matches[0]! : null;
      };
      for (const element of elements) {
        for (const attribute of idrefs) {
          const raw = element.getAttribute(attribute);
          if (raw === null) continue;
          const tokens = multipleIdrefs.has(attribute) ? raw.trim().split(/\s+/) : [raw.trim()];
          for (const id of tokens) {
            if (!id) {
              add("empty-idref", element, prefix, attribute);
              continue;
            }
            const count = index.get(id)?.length ?? 0;
            if (count === 0) add("dangling-idref", element, prefix, attribute, id);
            if (count > 1) add("ambiguous-idref", element, prefix, attribute, id);
          }
        }
        const role = roleOf(element);
        const tabIndex = element.getAttribute("tabindex");
        if (tabIndex !== null && Number(tabIndex) > 0) add("positive-tabindex", element, prefix, "tabindex", tabIndex);
        if (focusable(element) && element.closest("[inert]")) add("inert-focusable", element, prefix, "inert");
        if (focusable(element) && element.closest("[aria-hidden='true']")) add("hidden-focusable", element, prefix, "aria-hidden");
        const orientation = element.getAttribute("aria-orientation");
        if (orientation !== null && orientation !== "horizontal" && orientation !== "vertical" && orientation !== "undefined") {
          add("invalid-aria-orientation", element, prefix, "aria-orientation", orientation);
        }
        for (const attribute of ["aria-level", "aria-posinset", "aria-setsize"] as const) {
          const raw = element.getAttribute(attribute);
          if (raw === null) continue;
          const value = Number(raw);
          if (!Number.isInteger(value) || (attribute === "aria-setsize" ? value < -1 || value === 0 : value < 1)) {
            add(attribute === "aria-level" ? "invalid-aria-level" : attribute === "aria-posinset" ? "invalid-aria-posinset" : "invalid-aria-setsize", element, prefix, attribute, raw);
          }
        }
        const shortcuts = element.getAttribute("aria-keyshortcuts");
        if (shortcuts !== null && !shortcuts.trim()) add("invalid-aria-keyshortcuts", element, prefix, "aria-keyshortcuts");
        const expanded = element.getAttribute("aria-expanded");
        if (expanded !== null && expanded !== "true" && expanded !== "false" && expanded !== "undefined") {
          add("invalid-expanded", element, prefix, "aria-expanded", expanded);
        }
        if (expanded === "true" && element.hasAttribute("aria-controls")) {
          const ids = (element.getAttribute("aria-controls") ?? "").trim().split(/\s+/).filter(Boolean);
          if (ids.some((id) => !getTarget(id))) add("missing-controlled-region", element, prefix, "aria-controls", ids.join(" "));
        }
        if (expanded === "true" && !element.hasAttribute("aria-controls") && ["button", "combobox"].includes(role)) {
          add("expanded-without-controls", element, prefix, "aria-expanded");
        }
        const checked = element.getAttribute("aria-checked");
        if (checked !== null && !["true", "false", "mixed", "undefined"].includes(checked)) {
          add("invalid-checked", element, prefix, "aria-checked", checked);
        }
        const selected = element.getAttribute("aria-selected");
        if (selected !== null && !["true", "false", "undefined"].includes(selected)) {
          add("invalid-selected", element, prefix, "aria-selected", selected);
        }
        if (itemRoles.has(role) && !hasName(element, index)) add("missing-item-name", element, prefix, "name");
        if (["option", "treeitem", "menuitem", "menuitemcheckbox", "menuitemradio"].includes(role) && !compositeParent(element)) {
          add(role === "option" ? "orphan-option" : role === "treeitem" ? "orphan-treeitem" : "orphan-menuitem", element, prefix, "role", role);
        }
        const activeId = element.getAttribute("aria-activedescendant");
        if (activeId !== null) {
          const active = getTarget(activeId);
          if (!active || active === element) add("invalid-activedescendant", element, prefix, "aria-activedescendant", activeId);
          else if (!(inside(element, active) || (element.getAttribute("aria-owns") ?? "").split(/\s+/).includes(activeId))) {
            add("inactive-activedescendant", element, prefix, "aria-activedescendant", activeId);
          }
        }
        if (interactiveRoles.has(role)) {
          const nested = Array.from(element.querySelectorAll("button,a[href],input,select,textarea,[role]"))
            .find((child) => child.matches("button,a[href],input,select,textarea") || interactiveRoles.has(roleOf(child)));
          if (nested) add("interactive-descendant", element, prefix, "role", pathOf(nested, prefix));
        }
        if (!compositeRoles.has(role)) continue;
        composites += 1;
        if (!hasName(element, index, true) && !["menu", "menubar", "grid"].includes(role)) {
          add("missing-composite-name", element, prefix, "name");
        }
        const items = descendantsWithRoles(element, itemRoles);
        if (items.length === 0) add("missing-composite-items", element, prefix, "role", role);
        if (role === "tablist") {
          const tabs = items.filter((item) => roleOf(item) === "tab");
          const selectedTabs = tabs.filter((tab) => tab.getAttribute("aria-selected") === "true");
          if (selectedTabs.length > 1) add("multiple-selected-tabs", element, prefix, "aria-selected", String(selectedTabs.length));
          if (tabs.length > 0 && selectedTabs.length === 0) add("missing-selected-tab", element, prefix, "aria-selected");
          for (const tab of tabs) {
            if (compositeParent(tab) !== element) add("tab-not-owned", tab, prefix, "role");
            if ((tab as HTMLElement).tabIndex < 0 && !element.hasAttribute("aria-activedescendant") && selectedTabs.includes(tab)) {
              add("tab-not-focusable", tab, prefix, "tabindex");
            }
            const controls = tab.getAttribute("aria-controls")?.trim();
            if (!controls) {
              add("tab-panel-missing", tab, prefix, "aria-controls");
            } else {
              const panel = getTarget(controls);
              if (!panel || roleOf(panel) !== "tabpanel") add("tab-panel-missing", tab, prefix, "aria-controls", controls);
              else if (!panel.getAttribute("aria-labelledby")?.split(/\s+/).includes(tab.id)) {
                add("tab-panel-not-linked", panel, prefix, "aria-labelledby", tab.id);
              }
            }
          }
        }
        if (items.length === 0 || element.hasAttribute("aria-activedescendant")) continue;
        const relevantRoles: ReadonlySet<string> = role === "tablist" ? new Set(["tab"]) : role === "tree" ? new Set(["treeitem"]) :
          role === "listbox" ? new Set(["option"]) : role === "radiogroup" ? new Set(["radio"]) :
          role === "grid" ? new Set(["gridcell"]) : new Set(["menuitem", "menuitemcheckbox", "menuitemradio"]);
        const relevant = items.filter((item) => relevantRoles.has(roleOf(item)) && compositeParent(item) === element);
        if (!relevant.length) continue;
        const stops = relevant.filter((item) => (item as HTMLElement).tabIndex === 0 && !isDisabled(item));
        if (stops.length > 1) add("multiple-roving-stops", element, prefix, "tabindex", String(stops.length));
        if (stops.length === 0 && !focusable(element) && !relevant.some((item) => isDisabled(item) === false && !isHidden(item) && (item as HTMLElement).tabIndex >= 0)) {
          add("missing-roving-stop", element, prefix, "tabindex");
        }
        for (const item of relevant) {
          const ownTabindex = item.getAttribute("tabindex");
          if (ownTabindex !== null && ownTabindex !== "-1" && ownTabindex !== "0") add("invalid-roving-tabindex", item, prefix, "tabindex", ownTabindex);
          if (ownTabindex === "0" && isDisabled(item)) add("disabled-roving-stop", item, prefix, "tabindex");
        }
      }
      for (const element of elements) {
        if (element.shadowRoot) inspectRoot(element.shadowRoot, `${prefix}${pathOf(element, "")}/shadow/`);
      }
    };
    inspectRoot(document, "document/");
    findings.sort((a, b) => a.code.localeCompare(b.code) || a.path.localeCompare(b.path) || a.attribute.localeCompare(b.attribute) || a.detail.localeCompare(b.detail));
    return { findings, inspected, composites, ids, roots };
  });
}

/**
 * Assert a subset of known failures without coupling callers to document
 * order. Useful when fixture behavior is intentionally not entirely valid.
 */
export function issueCodes(audit: KeyboardAudit): KeyboardIssueCode[] {
  return [...new Set(audit.findings.map((finding) => finding.code))].sort();
}

/** Exclude browser/locale copy to retain a minimal reproducible payload. */
export function auditAsJson(audit: KeyboardAudit): string {
  return JSON.stringify({
    inspected: audit.inspected,
    composites: audit.composites,
    ids: audit.ids,
    roots: audit.roots,
    findings: audit.findings,
  }, null, 2);
}
