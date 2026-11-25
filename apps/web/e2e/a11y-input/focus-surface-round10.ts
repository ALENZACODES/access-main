import type { Page } from "@playwright/test";

export type FocusSurfaceCode =
  | "focus-in-hidden-subtree"
  | "focus-on-disabled-control"
  | "focus-not-rendered"
  | "focus-outside-viewport"
  | "focus-indicator-absent"
  | "focus-indicator-clipped"
  | "focus-obscured"
  | "positive-tab-order"
  | "focusable-hidden-control"
  | "focusable-inert-control"
  | "focusable-disabled-link"
  | "interactive-target-too-small"
  | "control-overflow"
;

export interface FocusSurfaceIssue {
  readonly code: FocusSurfaceCode;
  readonly target: string;
  readonly detail: string;
}

export interface FocusSurfaceReport {
  readonly issues: readonly FocusSurfaceIssue[];
  readonly inspected: number;
  readonly focusable: number;
  readonly viewport: { readonly width: number; readonly height: number };
}

export interface FocusProbe {
  readonly selector: string;
  readonly id: string;
  readonly tag: string;
  readonly name: string;
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly visible: boolean;
  readonly focusVisible: boolean;
  readonly outline: string;
  readonly boxShadow: string;
  readonly border: string;
  readonly obscuredBy: string | null;
  readonly issues: readonly FocusSurfaceIssue[];
}

/**
 * The static census never clicks, focuses, scrolls or alters application state.
 * It catches impossible keyboard targets and undersized standalone controls.
 * Inline text links are treated separately from standalone action targets.
 */
export async function auditFocusSurfaces(page: Page): Promise<FocusSurfaceReport> {
  return page.evaluate(() => {
    type Code = FocusSurfaceCode;
    const issues: FocusSurfaceIssue[] = [];
    let inspected = 0;
    let focusable = 0;
    const targets = document.querySelectorAll<HTMLElement>([
      "a[href]", "area[href]", "button", "input:not([type='hidden'])",
      "select", "textarea", "summary", "[tabindex]", "[contenteditable='true']",
      "[role='button']", "[role='link']", "[role='switch']", "[role='checkbox']",
      "[role='radio']", "[role='tab']", "[role='menuitem']",
    ].join(","));
    const label = (element: HTMLElement, index: number): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const name = element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 32);
      return `${element.localName}[${index}]${name ? ` ${name}` : ""}`;
    };
    const report = (code: Code, target: string, detail: string): void => {
      issues.push({ code, target, detail });
    };
    const isHidden = (element: HTMLElement): boolean => {
      if (element.closest("[hidden],[inert]")) return true;
      let ancestor: HTMLElement | null = element;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return true;
        ancestor = ancestor.parentElement;
      }
      return false;
    };
    const isInlineTextLink = (element: HTMLElement): boolean => {
      if (!element.matches("a[href]")) return false;
      if (getComputedStyle(element).display !== "inline") return false;
      return element.closest("p,li,blockquote,dd,dt,figcaption,small") !== null;
    };
    const associatedLabel = (input: HTMLInputElement): DOMRect | null => {
      if (!(["checkbox", "radio"] as string[]).includes(input.type)) return null;
      const explicit = input.labels?.[0];
      const labelElement = explicit ?? input.closest("label");
      if (!labelElement) return null;
      return labelElement.getBoundingClientRect();
    };
    const unionRect = (one: DOMRect, two: DOMRect | null): DOMRect => {
      if (!two || two.width === 0 || two.height === 0) return one;
      const left = Math.min(one.left, two.left);
      const top = Math.min(one.top, two.top);
      const right = Math.max(one.right, two.right);
      const bottom = Math.max(one.bottom, two.bottom);
      return new DOMRect(left, top, right - left, bottom - top);
    };
    for (const [index, element] of Array.from(targets).entries()) {
      inspected += 1;
      const selector = label(element, index);
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const hidden = isHidden(element);
      const tabIndex = element.tabIndex;
      const tabindexAttribute = element.getAttribute("tabindex");
      const disabled = element.matches(":disabled,[disabled]");
      const sequential = tabIndex >= 0 && !disabled && !hidden;
      if (tabindexAttribute !== null && Number(tabindexAttribute) > 0) {
        report("positive-tab-order", selector, `tabindex=${tabindexAttribute}`);
      }
      if (hidden && tabIndex >= 0 && element.closest("[aria-hidden='true']")) {
        report("focusable-hidden-control", selector, "An aria-hidden ancestor contains a sequential keyboard target");
      }
      if (element.closest("[inert]") && tabindexAttribute !== null && Number(tabindexAttribute) >= 0) {
        report("focusable-inert-control", selector, "Explicit sequential tabindex remains inside inert content");
      }
      if (element.getAttribute("role") === "link" && element.getAttribute("aria-disabled") === "true" && tabIndex >= 0) {
        report("focusable-disabled-link", selector, "Disabled synthetic link remains in sequential keyboard order");
      }
      if (!sequential) continue;
      focusable += 1;
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") {
        report("focus-not-rendered", selector, "Focusable element has no rendered target");
        continue;
      }
      if (isInlineTextLink(element)) continue;
      const box = element instanceof HTMLInputElement
        ? unionRect(rect, associatedLabel(element)) : rect;
      if (box.width < 44 || box.height < 44) {
        report("interactive-target-too-small", selector, `${Math.round(box.width)} by ${Math.round(box.height)} CSS pixels`);
      }
      if (box.right > document.documentElement.scrollWidth + 1 || box.left < -1) {
        report("control-overflow", selector, "Control extends outside document horizontal bounds");
      }
    }
    return { issues, inspected, focusable, viewport: { width: innerWidth, height: innerHeight } };
  });
}

/**
 * The active-focus probe reads actual computed style and hit testing.
 * Caller owns focus changes, enabling both deterministic fixtures and live
 * non-destructive keyboard checks. Browser chrome is never counted as a target.
 */
export async function probeCurrentFocus(page: Page): Promise<FocusProbe | null> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body || element === document.documentElement) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    // :focus-visible is a pseudo-class, not a pseudo-element. Passing it as
    // getComputedStyle's second argument returns empty declarations in Chromium.
    const focusStyle = getComputedStyle(element);
    const path = element.id ? `#${CSS.escape(element.id)}` : element.localName;
    const issues: FocusSurfaceIssue[] = [];
    const add = (code: FocusSurfaceCode, detail: string): void => { issues.push({ code, target: path, detail }); };
    const hidden = element.closest("[hidden],[inert],[aria-hidden='true']") !== null;
    if (hidden) add("focus-in-hidden-subtree", "Active focus belongs to a hidden or inert subtree");
    if (element.matches(":disabled,[aria-disabled='true']")) add("focus-on-disabled-control", "Disabled control has active focus");
    const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    if (!visible) add("focus-not-rendered", "Focused control is not rendered");
    if (visible && (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth)) {
      add("focus-outside-viewport", "Focused control is entirely outside the viewport");
    }
    const outlineWidth = Number.parseFloat(focusStyle.outlineWidth) || 0;
    const borderWidth = Number.parseFloat(focusStyle.borderTopWidth) || 0;
    const outline = focusStyle.outlineStyle !== "none" && outlineWidth >= 2;
    const shadow = focusStyle.boxShadow !== "none";
    const border = borderWidth >= 2 && focusStyle.borderStyle !== "none";
    const focusVisible = element.matches(":focus-visible") && (outline || shadow || border);
    if (visible && !focusVisible) add("focus-indicator-absent", "No qualifying outline, shadow, or border around the focused control");
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const elementAtPoint = visible && rect.bottom > 0 && rect.top < innerHeight
      ? document.elementFromPoint(x, y) : null;
    let obscuredBy: string | null = null;
    if (elementAtPoint && elementAtPoint !== element && !element.contains(elementAtPoint)) {
      obscuredBy = elementAtPoint.id ? `#${elementAtPoint.id}` : elementAtPoint.localName;
      add("focus-obscured", `Focused element centre is covered by ${obscuredBy}`);
    }
    const parent = element.parentElement;
    if (parent) {
      const parentStyle = getComputedStyle(parent);
      const parentRect = parent.getBoundingClientRect();
      if ((parentStyle.overflow === "hidden" || parentStyle.overflowX === "hidden" || parentStyle.overflowY === "hidden") &&
          (rect.right > parentRect.right + 1 || rect.left < parentRect.left - 1 || rect.bottom > parentRect.bottom + 1)) {
        add("focus-indicator-clipped", "Focus target is clipped by an overflow-hidden parent");
      }
    }
    return {
      selector: path,
      id: element.id,
      tag: element.localName,
      name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? "",
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visible,
      focusVisible,
      outline: focusStyle.outline,
      boxShadow: focusStyle.boxShadow,
      border: focusStyle.border,
      obscuredBy,
      issues,
    };
  });
}

/**
 * Explicitly focuses a known safe target, without clicking it or changing
 * application data. This is particularly useful for synthetic fixtures.
 */
export async function probeFocusSelector(page: Page, selector: string): Promise<FocusProbe | null> {
  await page.locator(selector).focus();
  return probeCurrentFocus(page);
}

export function formatFocusIssues(report: FocusSurfaceReport): string {
  return report.issues.map((issue) => `${issue.code}: ${issue.target}: ${issue.detail}`).join("\n");
}

export function hasFocusIssue(report: FocusSurfaceReport, code: FocusSurfaceCode): boolean {
  return report.issues.some((issue) => issue.code === code);
}
