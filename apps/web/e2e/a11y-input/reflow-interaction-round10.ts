import type { Page } from "@playwright/test";

export type ReflowCode =
  | "document-overflows-horizontally"
  | "control-overflows-horizontally"
  | "scrollable-region-without-name"
  | "touch-target-undersized"
  | "drag-action-without-keyboard-alternative"
  | "drag-alternative-not-found"
  | "drag-alternative-not-operable"
  | "gesture-without-single-pointer-alternative"
  | "gesture-alternative-not-found"
  | "gesture-alternative-not-operable"
  | "motion-without-alternative"
  | "motion-alternative-not-found"
  | "motion-alternative-not-operable"
  | "keyboard-inaccessible-scroller";

export interface ReflowIssue {
  readonly code: ReflowCode;
  readonly target: string;
  readonly detail: string;
}

export interface ReflowReport {
  readonly issues: readonly ReflowIssue[];
  readonly viewportWidth: number;
  readonly documentWidth: number;
  readonly scrollableRegions: number;
  readonly gestureControls: number;
  readonly actionTargets: number;
}

/**
 * Read-only 320px/desktop reflow and interaction census. It does not change
 * page zoom, scroll position, user preferences, or touch settings. Map zoom,
 * horizontal tab strips and data tables can scroll when they provide keyboard
 * access and a usable label.
 */
export async function auditReflowInteractions(page: Page): Promise<ReflowReport> {
  return page.evaluate(() => {
    type Code = ReflowCode;
    const issues: ReflowIssue[] = [];
    const targetOf = (element: Element): string => element.id
      ? `#${CSS.escape(element.id)}` : element.localName;
    const report = (code: Code, target: Element, detail: string): void => {
      issues.push({ code, target: targetOf(target), detail });
    };
    const visible = (element: HTMLElement): boolean => {
      if (element.closest("[hidden],[inert]")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const named = (element: HTMLElement): boolean => {
      if (element.getAttribute("aria-label")?.trim()) return true;
      const refs = element.getAttribute("aria-labelledby")?.trim().split(/\s+/).filter(Boolean) ?? [];
      if (refs.some((id) => document.getElementById(id)?.textContent?.trim())) return true;
      if (element.getAttribute("title")?.trim()) return true;
      return false;
    };
    const operable = (element: HTMLElement): boolean => {
      if (!visible(element) || element.matches(":disabled,[aria-disabled='true']")) return false;
      return element.matches("button,a[href],input,select,textarea,summary") || element.tabIndex >= 0;
    };
    const alternative = (element: HTMLElement, attribute: string): HTMLElement | null => {
      const id = element.getAttribute(attribute)?.trim();
      return id ? document.getElementById(id) : null;
    };
    const root = document.documentElement;
    const docWidth = root.scrollWidth;
    const horizontalOverflow = docWidth > innerWidth + 2;
    // The application's 320px contract requires the document itself not to
    // overflow; local, independently scrollable tables are permissible.
    if (horizontalOverflow && innerWidth <= 320) report("document-overflows-horizontally", root, `${docWidth} > ${innerWidth}`);
    let scrollableRegions = 0;
    let gestureControls = 0;
    let actionTargets = 0;
    const interactionSelector = [
      "button", "a[href]", "input:not([type='hidden'])", "select", "textarea",
      "summary", "[role='button']", "[role='switch']", "[role='checkbox']",
      "[role='tab']", "[role='radio']", "[role='menuitem']",
    ].join(",");
    for (const element of document.querySelectorAll<HTMLElement>(interactionSelector)) {
      if (!visible(element) || element.matches(":disabled,[aria-disabled='true']")) continue;
      actionTargets += 1;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (rect.left < -1 || rect.right > root.scrollWidth + 1) {
        report("control-overflows-horizontally", element, `${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
      const textLink = element.matches("a[href]") && style.display === "inline" &&
        element.closest("p,li,blockquote,dd,dt,small") !== null;
      if (textLink) continue;
      let targetRect = rect;
      if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
        const label = element.labels?.[0] ?? element.closest("label");
        if (label) {
          const lr = label.getBoundingClientRect();
          if (lr.width && lr.height) {
            targetRect = new DOMRect(Math.min(rect.left, lr.left), Math.min(rect.top, lr.top),
              Math.max(rect.right, lr.right) - Math.min(rect.left, lr.left),
              Math.max(rect.bottom, lr.bottom) - Math.min(rect.top, lr.top));
          }
        }
      }
      if (targetRect.width < 44 || targetRect.height < 44) {
        report("touch-target-undersized", element, `${Math.round(targetRect.width)}x${Math.round(targetRect.height)}`);
      }
    }
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
      if (!visible(element)) continue;
      const style = getComputedStyle(element);
      const overflows = element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
      const scrolls = /(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`);
      if (overflows && scrolls) {
        scrollableRegions += 1;
        // Opt-in scrolling widgets require a name. Browsers render overflow
        // tables natively, and a scrollable table can be identified by caption.
        if (element.hasAttribute("data-a11y-keyboard-scroller")) {
          if (element.tabIndex < 0) report("keyboard-inaccessible-scroller", element, "Scrollable region has no keyboard focus stop");
          if (!named(element)) report("scrollable-region-without-name", element, "Scrollable region has no accessible name");
        }
      }
      if (element.hasAttribute("data-a11y-drag-operation")) {
        gestureControls += 1;
        const id = element.getAttribute("data-a11y-drag-alternative")?.trim();
        if (!id) report("drag-action-without-keyboard-alternative", element, "Drag operation needs a non-drag alternative");
        else {
          const fallback = alternative(element, "data-a11y-drag-alternative");
          if (!fallback) report("drag-alternative-not-found", element, id);
          else if (!operable(fallback)) report("drag-alternative-not-operable", element, id);
        }
      }
      if (element.hasAttribute("data-a11y-multipoint-gesture")) {
        gestureControls += 1;
        const id = element.getAttribute("data-a11y-single-pointer")?.trim();
        if (!id) report("gesture-without-single-pointer-alternative", element, "Multipoint gesture needs a single-pointer action");
        else {
          const fallback = alternative(element, "data-a11y-single-pointer");
          if (!fallback) report("gesture-alternative-not-found", element, id);
          else if (!operable(fallback)) report("gesture-alternative-not-operable", element, id);
        }
      }
      if (element.hasAttribute("data-a11y-motion-gesture")) {
        gestureControls += 1;
        const id = element.getAttribute("data-a11y-motion-alternative")?.trim();
        if (!id) report("motion-without-alternative", element, "Motion action requires a standard control");
        else {
          const fallback = alternative(element, "data-a11y-motion-alternative");
          if (!fallback) report("motion-alternative-not-found", element, id);
          else if (!operable(fallback)) report("motion-alternative-not-operable", element, id);
        }
      }
    }
    return { issues, viewportWidth: innerWidth, documentWidth: docWidth, scrollableRegions, gestureControls, actionTargets };
  });
}

export function describeReflow(report: ReflowReport): string {
  return report.issues.map((item) => `${item.code}: ${item.target} ${item.detail}`).join("\n");
}
