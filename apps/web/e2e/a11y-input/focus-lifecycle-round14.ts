import { expect, type Page } from "@playwright/test";

export interface FocusIssue {
  readonly code: string;
  readonly selector: string;
  readonly detail: string;
}
export interface FocusItem {
  readonly selector: string;
  readonly role: string;
  readonly name: string;
  readonly tabIndex: number;
  readonly disabled: boolean;
  readonly hidden: boolean;
  readonly rect: { x: number; y: number; width: number; height: number };
}
export interface FocusTrace {
  readonly items: readonly FocusItem[];
  readonly issues: readonly FocusIssue[];
  readonly stop: "wrap" | "body" | "limit";
  readonly complete: boolean;
}
export async function currentFocus(page: Page): Promise<FocusItem | null> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement) return null;
    const rect = node.getBoundingClientRect();
    const name = node.getAttribute("aria-label")?.trim() ||
      node.textContent?.trim() ||
      (node instanceof HTMLInputElement ? node.labels?.[0]?.textContent?.trim() ?? "" : "");
    const selector = node.id ? `#${CSS.escape(node.id)}` : `${node.localName}[tabindex="${node.tabIndex}"]`;
    return {
      selector,
      role: node.getAttribute("role") ?? node.localName,
      name,
      tabIndex: node.tabIndex,
      disabled: node.matches(":disabled,[aria-disabled='true']"),
      hidden: rect.width <= 0 || rect.height <= 0 || getComputedStyle(node).visibility === "hidden",
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
}
export async function traceTabOrder(page: Page, max = 100): Promise<FocusTrace> {
  if (!Number.isInteger(max) || max < 1 || max > 300) throw new Error("Invalid focus trace bound");
  const items: FocusItem[] = [];
  const issues: FocusIssue[] = [];
  const seen = new Set<string>();
  const attribute = "data-p16-r14-focus";
  await page.evaluate((key) => {
    document.querySelectorAll(`[${key}]`).forEach((node) => node.removeAttribute(key));
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.focus();
  }, attribute);
  let stop: FocusTrace["stop"] = "limit";
  try {
    for (let step = 1; step <= max; step += 1) {
      await page.keyboard.press("Tab");
      const item = await page.evaluate((key) => {
        const node = document.activeElement;
        if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement) return null;
        if (!node.id && !node.hasAttribute(key)) node.setAttribute(key, String(document.querySelectorAll(`[${key}]`).length + 1));
        const rect = node.getBoundingClientRect();
        const name = node.getAttribute("aria-label")?.trim() ||
          node.textContent?.trim() ||
          (node instanceof HTMLInputElement ? node.labels?.[0]?.textContent?.trim() ?? "" : "");
        return {
          selector: node.id ? `#${CSS.escape(node.id)}` : `[${key}="${node.getAttribute(key)}"]`,
          role: node.getAttribute("role") ?? node.localName,
          name,
          tabIndex: node.tabIndex,
          disabled: node.matches(":disabled,[aria-disabled='true']"),
          hidden: rect.width <= 0 || rect.height <= 0 || getComputedStyle(node).visibility === "hidden",
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }, attribute);
      if (!item) { stop = "body"; break; }
      if (seen.has(item.selector)) { stop = "wrap"; break; }
      seen.add(item.selector);
      items.push(item);
      if (item.hidden) issues.push({ code: "focus-hidden", selector: item.selector, detail: "Tab reached a hidden element" });
      if (item.disabled) issues.push({ code: "focus-disabled", selector: item.selector, detail: "Tab reached a disabled element" });
      if (item.tabIndex > 0) issues.push({ code: "focus-positive-tabindex", selector: item.selector, detail: "Positive tabindex changes order" });
      if (!item.name && ["button", "a", "input", "select", "textarea"].includes(item.role)) {
        issues.push({ code: "focus-unnamed", selector: item.selector, detail: "Native control has no accessible text name" });
      }
      if (item.rect.width < 44 || item.rect.height < 44) {
        issues.push({ code: "focus-small-target", selector: item.selector, detail: `${Math.round(item.rect.width)}x${Math.round(item.rect.height)} CSS px` });
      }
      const visible = await page.evaluate(() => {
        const node = document.activeElement;
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const outline = Number.parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== "none";
        return node.matches(":focus-visible") && (outline || style.boxShadow !== "none" || style.textDecorationLine !== "none");
      });
      if (!visible) issues.push({ code: "focus-indicator", selector: item.selector, detail: "Focused element has no detectable focus indicator" });
    }
  } finally {
    await page.evaluate((key) => document.querySelectorAll(`[${key}]`).forEach((node) => node.removeAttribute(key)), attribute);
  }
  return { items, issues, stop, complete: stop !== "limit" };
}
export async function assertTabTrace(page: Page, max = 100): Promise<FocusTrace> {
  const trace = await traceTabOrder(page, max);
  expect(trace.complete, `Focus trace stopped at ${trace.stop}`).toBe(true);
  expect(trace.items.length).toBeGreaterThan(0);
  expect(trace.issues, "Sequential focus issues").toEqual([]);
  return trace;
}
export async function assertAdjacentFocusReverses(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  const forward = await currentFocus(page);
  expect(forward).not.toBeNull();
  await page.keyboard.press("Shift+Tab");
  const reverse = await currentFocus(page);
  await page.keyboard.press("Tab");
  const restored = await currentFocus(page);
  expect(reverse?.selector).not.toBe(forward?.selector);
  expect(restored?.selector).toBe(forward?.selector);
}
export async function inspectFocusIndicator(page: Page, selector: string): Promise<FocusIssue[]> {
  const node = page.locator(selector);
  await expect(node).toHaveCount(1);
  await node.focus();
  return page.evaluate((target) => {
    const element = document.querySelector<HTMLElement>(target);
    if (!element) return [{ code: "focus-target-missing", selector: target, detail: "Target not found" }];
    const style = getComputedStyle(element);
    const hasOutline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2;
    const hasShadow = style.boxShadow !== "none";
    return element.matches(":focus-visible") && (hasOutline || hasShadow)
      ? []
      : [{ code: "focus-indicator", selector: target, detail: "No visible focus ring detected" }];
  }, selector);
}
