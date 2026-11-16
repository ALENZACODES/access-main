import { expect, type Page } from "@playwright/test";

/**
 * Browser-side focus observations. No app state is modified and no assumptions
 * are made about navigation labels or the availability of particular routes.
 */
export interface FocusSnapshot {
  readonly selector: string;
  readonly tag: string;
  readonly role: string | null;
  readonly name: string;
  readonly inViewport: boolean;
  readonly rendered: boolean;
  readonly ariaHidden: boolean;
  readonly disabled: boolean;
  readonly tabindex: number;
  readonly outline: string;
  readonly shadow: string;
  readonly color: string;
  readonly background: string;
}

export interface FocusWalk {
  readonly forward: readonly FocusSnapshot[];
  readonly backwards: readonly FocusSnapshot[];
  readonly returnedToStart: boolean;
  readonly trapped: boolean;
  readonly error: string | null;
}

export interface TargetIssue {
  readonly selector: string;
  readonly width: number;
  readonly height: number;
  readonly reason: string;
}

export interface FocusOrderIssue {
  readonly selector: string;
  readonly reason: string;
}

export function stableFocusKey(snapshot: FocusSnapshot): string {
  return snapshot.selector;
}

/**
 * Every test starts outside the content's interactive tab order. We focus the
 * body without clicking: clicks could unexpectedly activate map or UI tools.
 */
export async function resetSequentialFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const body = document.body;
    const original = body.getAttribute("tabindex");
    body.setAttribute("tabindex", "-1");
    body.focus({ preventScroll: true });
    if (original === null) body.removeAttribute("tabindex");
    else body.setAttribute("tabindex", original);
  });
}

export async function observeFocus(page: Page): Promise<FocusSnapshot | null> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body) return null;
    const style = getComputedStyle(node);
    const focusStyle = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const ancestorHidden = node.closest("[aria-hidden='true'],[inert]") !== null;
    const all = document.querySelectorAll<HTMLElement>("*");
    const position = Array.from(all).indexOf(node);
    const selector = node.id
      ? `#${CSS.escape(node.id)}`
      : `${node.tagName.toLowerCase()}[dom-index="${position}"]`;
    const name = node.getAttribute("aria-label") ??
      node.getAttribute("title") ?? node.textContent?.trim() ?? "";
    const numericTabindex = node.getAttribute("tabindex");
    return {
      selector,
      tag: node.tagName.toLowerCase(),
      role: node.getAttribute("role"),
      name: name.slice(0, 100),
      inViewport: rect.bottom > 0 && rect.right > 0 &&
        rect.top < innerHeight && rect.left < innerWidth,
      rendered: rect.width > 0 && rect.height > 0 &&
        style.display !== "none" && style.visibility !== "hidden",
      ariaHidden: ancestorHidden,
      disabled: node.matches(":disabled,[aria-disabled='true']"),
      tabindex: numericTabindex === null ? 0 : Number(numericTabindex),
      outline: `${focusStyle.outlineStyle} ${focusStyle.outlineWidth}`,
      shadow: focusStyle.boxShadow,
      color: focusStyle.color,
      background: focusStyle.backgroundColor,
    };
  });
}

export async function tabOnce(page: Page, reverse = false): Promise<FocusSnapshot | null> {
  await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
  return observeFocus(page);
}

/**
 * Stop at the first repeated target: browser Tab navigation forms a cycle.
 * This prevents hanging on app routes with long, dynamic focus sequences.
 */
export async function walkSequentialFocus(
  page: Page,
  maxSteps = 90,
): Promise<FocusWalk> {
  if (!Number.isInteger(maxSteps) || maxSteps < 2 || maxSteps > 500) {
    throw new RangeError("maxSteps must be an integer from 2 to 500");
  }
  await resetSequentialFocus(page);
  const forward: FocusSnapshot[] = [];
  const keys = new Set<string>();
  let wrapped = false;
  for (let index = 0; index < maxSteps; index += 1) {
    const next = await tabOnce(page);
    if (next === null) break;
    const key = stableFocusKey(next);
    if (keys.has(key)) {
      wrapped = true;
      break;
    }
    forward.push(next);
    keys.add(key);
  }
  if (forward.length === 0) {
    return {
      forward, backwards: [], returnedToStart: false,
      trapped: false, error: "No keyboard focus target found",
    };
  }
  // A wrapped Tab is already sitting on the first recorded control. A Tab
  // that leaves the document instead sits in browser chrome or on the body.
  // Reverse that *one* exploratory Tab to regain the actual last control.
  // Never reconstruct the walk from body: browser chrome, SPA render timing,
  // and per-control DOM updates can yield a different entry point.
  if (wrapped || forward.length < maxSteps) {
    await page.keyboard.press("Shift+Tab");
  }
  const last = await observeFocus(page);
  const expectedLast = forward[forward.length - 1];
  const atLast = last !== null &&
    stableFocusKey(last) === stableFocusKey(expectedLast);
  if (!atLast) {
    return {
      forward, backwards: [], returnedToStart: false,
      trapped: !wrapped && forward.length === maxSteps,
      error: `Reverse focus mismatch at last step ${forward.length - 1}`,
    };
  }
  const backwards: FocusSnapshot[] = [];
  let mismatch: string | null = null;
  for (let index = forward.length - 2; index >= 0; index -= 1) {
    const previous = await tabOnce(page, true);
    if (previous === null) {
      mismatch = `Focus disappeared while reversing at step ${index}`;
      break;
    }
    backwards.push(previous);
    if (stableFocusKey(previous) !== stableFocusKey(forward[index])) {
      mismatch = `Reverse focus mismatch at step ${index}`;
      break;
    }
  }
  return {
    forward,
    backwards,
    returnedToStart: mismatch === null,
    trapped: !wrapped && forward.length === maxSteps,
    error: mismatch,
  };
}

/** Detect positive tabindex and focusable descendants of hidden regions. */
export async function inspectFocusOrder(page: Page): Promise<FocusOrderIssue[]> {
  return page.evaluate(() => {
    const issues: { selector: string; reason: string }[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      "a[href],button,input:not([type='hidden']),select,textarea,summary," +
      "[tabindex],[contenteditable='true']",
    );
    for (const [index, element] of Array.from(controls).entries()) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" ||
          rect.width === 0 || rect.height === 0) continue;
      const selector = element.id ? `#${element.id}` :
        `${element.tagName.toLowerCase()} at candidate ${index}`;
      const tabindex = Number(element.getAttribute("tabindex") ?? "0");
      if (tabindex > 0) {
        issues.push({ selector, reason: `Positive tabindex ${tabindex} changes sequential order` });
      }
      if (tabindex >= 0 && element.closest("[inert],[aria-hidden='true']")) {
        issues.push({ selector, reason: "Focusable control inside hidden or inert subtree" });
      }
      if (element.matches("[aria-disabled='true']") &&
          element.getAttribute("role") === "link" && tabindex >= 0) {
        issues.push({ selector, reason: "Disabled synthetic link remains in tab order" });
      }
    }
    return issues;
  });
}

/**
 * The project's 44-pixel minimum is stronger than WCAG's 24-pixel minimum.
 * Inline links in text are excluded because they have a different box model;
 * all other visible interactive targets are checked without inferring a
 * larger click area from nearby blank space.
 */
export async function inspectTargetSizes(page: Page): Promise<TargetIssue[]> {
  return page.evaluate(() => {
    const selector = [
      "button", "input:not([type='hidden'])", "select", "textarea",
      "summary", "[role='button']", "[role='switch']", "[role='checkbox']",
      "[role='radio']", "[role='tab']", "[role='menuitem']", "a[href]",
    ].join(",");
    const issues: { selector: string; width: number; height: number; reason: string }[] = [];
    for (const [index, element] of Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    ).entries()) {
      if (element.matches(":disabled,[aria-disabled='true']")) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" ||
          rect.width === 0 || rect.height === 0) continue;
      if (element.matches("a[href]") &&
          style.display === "inline" && element.closest("p,li,blockquote")) continue;
      if (rect.width >= 44 && rect.height >= 44) continue;
      issues.push({
        selector: element.id ? `#${element.id}` :
          `${element.tagName.toLowerCase()} at candidate ${index}`,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        reason: "Interactive target smaller than 44 by 44 CSS pixels",
      });
    }
    return issues;
  });
}

export function assertWalk(walk: FocusWalk): void {
  expect(walk.error, "Focus walk must complete").toBeNull();
  expect(walk.forward.length, "Route must have a sequential focus target")
    .toBeGreaterThan(0);
  expect(walk.trapped, "Focus sequence exceeded bounded walk").toBe(false);
  expect(walk.returnedToStart, "Reverse Tab must follow forward Tab order")
    .toBe(true);
  for (const target of walk.forward) {
    expect(target.rendered, `${target.selector} is not rendered`).toBe(true);
    expect(target.ariaHidden, `${target.selector} is aria-hidden or inert`).toBe(false);
    expect(target.disabled, `${target.selector} is disabled`).toBe(false);
  }
}
