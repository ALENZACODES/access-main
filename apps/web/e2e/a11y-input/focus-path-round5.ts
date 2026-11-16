import { expect, type Page } from "@playwright/test";

export interface FocusPathFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

export interface FocusPathStep {
  readonly tag: string;
  readonly id: string;
  readonly role: string;
  readonly tabindex: number;
  readonly visible: boolean;
  readonly unobscured: boolean;
}

/** Collect actual keyboard order, not an inferred DOM order. */
export async function collectKeyboardPath(page: Page, limit = 120): Promise<FocusPathStep[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Focus traversal limit must be an integer from 1 through 500");
  }
  const steps: FocusPathStep[] = [];
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("body");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    target?.focus();
  });
  const seen = new Set<string>();
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    const step = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) return null;
      const rect = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
      const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
      const atPoint = document.elementFromPoint(x, y);
      return {
        tag: active.localName,
        id: active.id,
        role: active.getAttribute("role") || "",
        tabindex: active.tabIndex,
        visible: style.display !== "none" && style.visibility !== "hidden" &&
          rect.width > 0 && rect.height > 0 &&
          rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight,
        unobscured: Boolean(atPoint && (active.contains(atPoint) || atPoint.contains(active))),
      };
    });
    if (!step) break;
    const identity = JSON.stringify(step);
    if (seen.has(identity)) break;
    seen.add(identity);
    steps.push(step);
  }
  return steps;
}

/**
 * Detect keyboard elements that are hidden, permanently obscured, or outside
 * the viewport. Pages with no controls fail rather than silently passing.
 */
export async function auditKeyboardPath(page: Page): Promise<FocusPathFinding[]> {
  const issues: FocusPathFinding[] = [];
  const steps = await collectKeyboardPath(page);
  if (steps.length === 0) {
    issues.push({ code: "focus-path-empty", target: "document", detail: "No keyboard-reachable control" });
    return issues;
  }
  steps.forEach((step, index) => {
    const label = step.id || `${step.tag}-${index}`;
    if (step.tabindex > 0) {
      issues.push({ code: "focus-path-positive-tabindex", target: label, detail: String(step.tabindex) });
    }
    if (!step.visible) {
      issues.push({ code: "focus-path-hidden", target: label, detail: "Focused element is not visible" });
    }
    if (step.visible && !step.unobscured) {
      issues.push({ code: "focus-path-obscured", target: label, detail: "Focus is behind another element" });
    }
  });
  return issues;
}

/** Check that reverse navigation returns to the previous focus position. */
export async function auditReverseFocus(page: Page): Promise<FocusPathFinding[]> {
  const issues: FocusPathFinding[] = [];
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return "";
    return active.id || active.outerHTML;
  });
  await page.keyboard.press("Tab");
  const second = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return "";
    return active.id || active.outerHTML;
  });
  if (!first || !second || first === second) return issues;
  await page.keyboard.press("Shift+Tab");
  const reachedFirst = await page.evaluate((expected) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    return (active.id || active.outerHTML) === expected;
  }, first);
  if (!reachedFirst) {
    issues.push({ code: "reverse-focus-order", target: "document", detail: "Shift+Tab did not restore first control" });
  }
  return issues;
}

export async function assertFocusPath(page: Page): Promise<void> {
  expect(await auditKeyboardPath(page), "Sequential keyboard visibility").toEqual([]);
  expect(await auditReverseFocus(page), "Reverse keyboard navigation").toEqual([]);
}
