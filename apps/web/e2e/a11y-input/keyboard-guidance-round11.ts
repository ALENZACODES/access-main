import type { Page } from "@playwright/test";

export type KeyboardGuidanceCode =
  | "shortcut-without-name"
  | "shortcut-empty"
  | "shortcut-invalid-token"
  | "duplicate-shortcut"
  | "shortcut-conflicts-with-text-entry"
  | "instruction-ref-missing"
  | "instruction-ref-duplicate"
  | "instructions-hidden"
  | "gesture-without-keyboard-alternative"
  | "alternative-control-missing"
  | "alternative-control-not-focusable"
  | "gesture-alternative-hidden"
  | "accesskey-empty"
  | "accesskey-multiple-characters"
  | "accesskey-duplicate"
  | "invalid-autocomplete"
  | "invalid-inputmode"
  | "invalid-required-state"
  | "invalid-readonly-state"
  | "custom-input-without-label"
  | "description-hidden"
  | "broken-description"
  | "invalid-key-state"
  | "keyboard-map-unknown"
  | "instruction-not-bilingual"
  | "invalid-pressed-state"
  | "invalid-selected-state"
  | "conflicting-keyboard-disabled"
  | "nonfocusable-keyboard-trigger";

export interface GuidanceFinding {
  readonly code: KeyboardGuidanceCode;
  readonly path: string;
  readonly detail: string;
}
export interface GuidanceReport {
  readonly keyboardShortcuts: number;
  readonly gestures: number;
  readonly customInputs: number;
  readonly findings: readonly GuidanceFinding[];
}

/** Detects authored keyboard guidance and alternative input contracts. */
export async function auditKeyboardGuidanceRound11(page: Page): Promise<GuidanceReport> {
  return page.evaluate(() => {
    type Code = KeyboardGuidanceCode;
    const findings: GuidanceFinding[] = [];
    const add = (code: Code, node: Element, detail = ""): void => {
      const path = node.id ? `#${CSS.escape(node.id)}` : (() => {
        const parts: string[] = [];
        let n: Element | null = node;
        while (n && parts.length < 5) {
          const parent: Element | null = n.parentElement;
          const siblings = parent ? Array.from(parent.children).filter((child) => child.localName === n!.localName) : [n];
          parts.unshift(`${n.localName}:nth-of-type(${siblings.indexOf(n) + 1})`);
          n = parent;
        }
        return parts.join(" > ");
      })();
      findings.push({ code, path, detail });
    };
    const visible = (node: Element): boolean => {
      if (node.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const nameOf = (node: Element): string => {
      const direct = node.getAttribute("aria-label")?.trim();
      if (direct) return direct;
      const by = node.getAttribute("aria-labelledby")?.trim().split(/\s+/).filter(Boolean) ?? [];
      const linked = by.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      return linked || node.getAttribute("title")?.trim() || node.textContent?.trim() || "";
    };
    const isKeyboard = (node: Element): boolean => (node as HTMLElement).tabIndex >= 0 && visible(node) && !node.matches(":disabled,[aria-disabled='true']");
    const shortcutMap = new Map<string, Element[]>();
    const shortcutNodes = Array.from(document.querySelectorAll<HTMLElement>("[aria-keyshortcuts]"));
    for (const element of shortcutNodes) {
      if (!visible(element)) continue;
      const raw = element.getAttribute("aria-keyshortcuts") ?? "";
      if (!raw.trim()) add("shortcut-empty", element);
      if (!nameOf(element)) add("shortcut-without-name", element);
      if (!isKeyboard(element)) add("nonfocusable-keyboard-trigger", element);
      for (const shortcut of raw.split(/\s+/).filter(Boolean)) {
        const parts = shortcut.split("+");
        const valid = parts.length > 0 && parts.every((part) => /^[a-z0-9-]+$/i.test(part));
        const modifiers = new Set(["alt", "control", "meta", "shift"]);
        if (!valid || !parts[parts.length - 1] || parts.slice(0, -1).some((part) => !modifiers.has(part.toLowerCase()))) {
          add("shortcut-invalid-token", element, shortcut);
        }
        if (parts.length === 1 && /^[a-z0-9]$/i.test(parts[0] ?? "") && element.hasAttribute("data-a11y-global-shortcut")) {
          add("shortcut-conflicts-with-text-entry", element, shortcut);
        }
        const key = shortcut.toLowerCase();
        const entries = shortcutMap.get(key) ?? [];
        entries.push(element);
        shortcutMap.set(key, entries);
      }
    }
    for (const [key, entries] of shortcutMap) {
      if (entries.length > 1) for (const entry of entries.slice(1)) add("duplicate-shortcut", entry, key);
    }
    const accessKeyMap = new Map<string, Element[]>();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[accesskey]"))) {
      const raw = element.getAttribute("accesskey") ?? "";
      if (!raw.trim()) add("accesskey-empty", element);
      if (Array.from(raw.trim()).length !== 1) add("accesskey-multiple-characters", element, raw);
      const key = raw.toLowerCase();
      accessKeyMap.set(key, [...(accessKeyMap.get(key) ?? []), element]);
    }
    for (const [key, entries] of accessKeyMap) {
      if (entries.length > 1) for (const entry of entries.slice(1)) add("accesskey-duplicate", entry, key);
    }
    const gestureNodes = Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-gesture],[data-a11y-motion-gesture],[data-a11y-drag-source],[data-a11y-multipoint-gesture]",
    ));
    for (const node of gestureNodes) {
      if (!visible(node)) continue;
      const targetId = node.getAttribute("data-a11y-keyboard-alternative")?.trim();
      if (!targetId) { add("gesture-without-keyboard-alternative", node); continue; }
      const matches = Array.from(document.querySelectorAll<HTMLElement>("[id]")).filter((item) => item.id === targetId);
      if (matches.length !== 1) { add("alternative-control-missing", node, targetId); continue; }
      const target = matches[0]!;
      if (!visible(target)) add("gesture-alternative-hidden", node, targetId);
      else if (!isKeyboard(target)) add("alternative-control-not-focusable", node, targetId);
    }
    const customInputs = Array.from(document.querySelectorAll<HTMLElement>(
      "[role='textbox'],[role='combobox'],[role='spinbutton'],[role='searchbox'],[role='switch'],[role='checkbox'],[role='radio']",
    )).filter(visible);
    for (const node of customInputs) {
      if (!nameOf(node) && !node.getAttribute("aria-labelledby")?.trim()) add("custom-input-without-label", node);
      const required = node.getAttribute("aria-required");
      if (required !== null && required !== "true" && required !== "false") add("invalid-required-state", node, required);
      const readonly = node.getAttribute("aria-readonly");
      if (readonly !== null && readonly !== "true" && readonly !== "false") add("invalid-readonly-state", node, readonly);
      const pressed = node.getAttribute("aria-pressed");
      if (pressed !== null && !["true", "false", "mixed", "undefined"].includes(pressed)) add("invalid-pressed-state", node, pressed);
      const selected = node.getAttribute("aria-selected");
      if (selected !== null && !["true", "false", "undefined"].includes(selected)) add("invalid-selected-state", node, selected);
      if (node.getAttribute("aria-disabled") === "true" && isKeyboard(node)) add("conflicting-keyboard-disabled", node);
      const controls = node.getAttribute("aria-describedby");
      if (controls) for (const id of controls.split(/\s+/).filter(Boolean)) {
        const target = document.getElementById(id);
        if (!target) add("broken-description", node, id);
        else if (!visible(target) && !target.matches(".sr-only,.visually-hidden,[data-a11y-screen-reader-only]")) add("description-hidden", node, id);
      }
    }
    for (const field of Array.from(document.querySelectorAll<HTMLInputElement>("input[inputmode],textarea[inputmode]"))) {
      const mode = field.getAttribute("inputmode") ?? "";
      if (!["none", "text", "tel", "url", "email", "numeric", "decimal", "search"].includes(mode)) add("invalid-inputmode", field, mode);
    }
    for (const field of Array.from(document.querySelectorAll<HTMLInputElement>("input[autocomplete]"))) {
      const value = field.getAttribute("autocomplete")?.trim() ?? "";
      if (!value) add("invalid-autocomplete", field);
    }
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-a11y-keyboard-instructions]"))) {
      const id = element.getAttribute("data-a11y-keyboard-instructions")?.trim() ?? "";
      const target = id ? document.getElementById(id) : null;
      if (!target) { add("instruction-ref-missing", element, id); continue; }
      if (document.querySelectorAll(`[id=${JSON.stringify(id)}]`).length > 1) add("instruction-ref-duplicate", element, id);
      if (!visible(target) && !target.matches(".sr-only,.visually-hidden,[data-a11y-screen-reader-only]")) add("instructions-hidden", element, id);
      const locale = document.documentElement.lang.toLowerCase().startsWith("fr") ? "fr" : "en";
      const declared = target.getAttribute("lang");
      if (declared && !declared.toLowerCase().startsWith(locale)) add("instruction-not-bilingual", element, `${declared} / ${locale}`);
    }
    for (const node of Array.from(document.querySelectorAll<HTMLElement>("[data-a11y-key-map]"))) {
      const source = node.getAttribute("data-a11y-key-map")?.trim() ?? "";
      if (!source || !["arrows", "tab", "enter-space", "escape", "home-end", "page-keys"].includes(source)) add("keyboard-map-unknown", node, source);
      const state = node.getAttribute("data-a11y-key-state");
      if (state !== null && !["idle", "active", "disabled"].includes(state)) add("invalid-key-state", node, state);
    }
    return { keyboardShortcuts: shortcutNodes.length, gestures: gestureNodes.length, customInputs: customInputs.length, findings };
  });
}
