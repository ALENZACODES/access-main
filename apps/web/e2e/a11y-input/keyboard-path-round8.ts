import { expect, type Page } from "@playwright/test";

export interface KeyboardFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

export interface KeyboardStep {
  readonly key: string;
  readonly name: string;
  readonly tag: string;
  readonly disabled: boolean;
  readonly hidden: boolean;
  readonly visible: boolean;
  readonly route: string;
}

export interface KeyboardSequence {
  readonly steps: readonly KeyboardStep[];
  readonly failures: readonly KeyboardFinding[];
  readonly terminated: boolean;
}

const CANDIDATES = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
  "[role='button']",
  "[role='link']",
  "[contenteditable='true']",
].join(",");

/** Collect actual sequential navigation hazards, not inferred tab positions. */
export async function inspectKeyboardCandidates(page: Page): Promise<KeyboardFinding[]> {
  return page.evaluate((selector) => {
    const findings: KeyboardFinding[] = [];
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const seen = new Set<string>();
    const describe = (element: HTMLElement, index: number): string =>
      element.id ? `#${element.id}` : `${element.localName}[${index}]`;
    for (const [index, element] of elements.entries()) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const target = describe(element, index);
      const tabindex = element.getAttribute("tabindex");
      const numeric = tabindex === null ? null : Number(tabindex);
      const hiddenByAncestor = element.closest("[hidden],[inert],[aria-hidden='true']");
      const rendered = style.display !== "none" && style.visibility !== "hidden" &&
        rect.width > 0 && rect.height > 0;
      if (element.id) {
        if (seen.has(element.id)) {
          findings.push({ code: "duplicate-target-id", target, detail: element.id });
        }
        seen.add(element.id);
      }
      if (numeric !== null && !Number.isInteger(numeric)) {
        findings.push({ code: "noninteger-tabindex", target, detail: tabindex ?? "" });
      }
      if (numeric !== null && numeric > 0) {
        findings.push({ code: "positive-tabindex", target, detail: String(numeric) });
      }
      const naturallyFocusable = element.matches(
        "a[href],area[href],button,input:not([type='hidden']),select,textarea,summary",
      );
      const explicitFocusable = numeric !== null && numeric >= 0;
      if (hiddenByAncestor && rendered && (naturallyFocusable || explicitFocusable)) {
        if (!element.matches(":disabled") && numeric !== -1) {
          findings.push({ code: "focusable-hidden-subtree", target,
            detail: hiddenByAncestor.localName });
        }
      }
      if (element.getAttribute("aria-disabled") === "true" &&
          element.getAttribute("role") === "link" && numeric !== -1) {
        findings.push({ code: "disabled-link-in-order", target,
          detail: "Disabled synthetic link remains reachable" });
      }
      if (element.matches("a[href]") && element.getAttribute("href") === "javascript:void(0)") {
        findings.push({ code: "javascript-placeholder-link", target,
          detail: "Action requires button semantics" });
      }
      if (rendered && element.matches("[role='button']") &&
          !naturallyFocusable && numeric === null) {
        findings.push({ code: "synthetic-button-no-tabstop", target,
          detail: "Button role lacks sequential focus" });
      }
      if (rendered && element.matches("[role='link']") &&
          !naturallyFocusable && numeric === null) {
        findings.push({ code: "synthetic-link-no-tabstop", target,
          detail: "Link role lacks sequential focus" });
      }
    }
    return findings;
  }, CANDIDATES);
}

/** Assess whether the current active element can be seen and named. */
export async function inspectActiveKeyboardTarget(page: Page): Promise<KeyboardFinding[]> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body) {
      return [{ code: "no-active-keyboard-target", target: "document", detail: "Focus outside app" }];
    }
    const target = node.id ? `#${node.id}` : node.localName;
    const failures: KeyboardFinding[] = [];
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" ||
        style.display === "none") {
      failures.push({ code: "focused-control-not-rendered", target,
        detail: "Active target is not rendered" });
    }
    if (node.closest("[inert],[aria-hidden='true']")) {
      failures.push({ code: "focused-control-hidden-from-at", target,
        detail: "Hidden or inert ancestor" });
    }
    if (node.matches(":disabled,[aria-disabled='true']")) {
      failures.push({ code: "disabled-control-focused", target,
        detail: "Disabled control has focus" });
    }
    const hidden = node.getAttribute("aria-hidden") === "true";
    if (hidden) failures.push({ code: "focused-control-aria-hidden", target,
      detail: "Focused node is hidden from assistive technology" });
    const idrefs = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    const referenced = idrefs.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ");
    const label = node instanceof HTMLInputElement || node instanceof HTMLSelectElement ||
      node instanceof HTMLTextAreaElement ? Array.from(node.labels ?? []).map((item) =>
        item.textContent?.trim() ?? "").join(" ") : "";
    const name = node.getAttribute("aria-label")?.trim() || referenced.trim() || label.trim() ||
      node.textContent?.trim() || node.getAttribute("title")?.trim() || "";
    if (!name && node.matches("button,a[href],input,select,textarea,[role='button'],[role='link']")) {
      failures.push({ code: "focused-control-unnamed", target,
        detail: "No accessible name from standard labelling patterns" });
    }
    const keyboardStyle = getComputedStyle(node, ":focus-visible");
    const outline = keyboardStyle.outlineStyle !== "none" &&
      parseFloat(keyboardStyle.outlineWidth || "0") > 0;
    const shadow = keyboardStyle.boxShadow !== "none";
    const border = keyboardStyle.borderStyle !== "none" &&
      parseFloat(keyboardStyle.borderWidth || "0") > 0;
    if (!outline && !shadow && !border) {
      failures.push({ code: "focused-control-no-indicator", target,
        detail: "No outline, shadow or border from focus-visible styling" });
    }
    return failures;
  });
}

function describeStep(page: Page): Promise<KeyboardStep | null> {
  return page.evaluate(() => {
    const current = document.activeElement;
    if (!(current instanceof HTMLElement) || current === document.body) return null;
    const style = getComputedStyle(current);
    const rect = current.getBoundingClientRect();
    const index = Array.from(document.querySelectorAll("*")).indexOf(current);
    return {
      key: current.id ? `#${current.id}` : `${current.tagName.toLowerCase()}@${index}`,
      name: (current.getAttribute("aria-label") || current.textContent || "").trim().slice(0, 80),
      tag: current.tagName.toLowerCase(),
      disabled: current.matches(":disabled,[aria-disabled='true']"),
      hidden: current.closest("[inert],[aria-hidden='true']") !== null,
      visible: style.visibility !== "hidden" && style.display !== "none" &&
        rect.width > 0 && rect.height > 0,
      route: location.pathname,
    };
  });
}

/**
 * A bounded, read-only sequence for switch-style scanning. Activations are
 * never issued: audit runs on live routes may contain destructive commands.
 */
export async function scanKeyboardRoute(page: Page, limit = 90): Promise<KeyboardSequence> {
  if (!Number.isInteger(limit) || limit < 2 || limit > 300) {
    throw new RangeError("Keyboard scan limit must be between 2 and 300");
  }
  await page.evaluate(() => {
    const body = document.body;
    const original = body.getAttribute("tabindex");
    body.setAttribute("tabindex", "-1");
    body.focus({ preventScroll: true });
    if (original === null) body.removeAttribute("tabindex");
    else body.setAttribute("tabindex", original);
  });
  const steps: KeyboardStep[] = [];
  const failures: KeyboardFinding[] = [];
  const keys = new Set<string>();
  let terminated = false;
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    const step = await describeStep(page);
    if (!step) {
      terminated = true;
      break;
    }
    if (keys.has(step.key)) {
      terminated = true;
      break;
    }
    keys.add(step.key);
    steps.push(step);
    if (!step.visible) failures.push({ code: "tabstop-invisible", target: step.key,
      detail: "Tab landed on an invisible control" });
    if (step.disabled) failures.push({ code: "tabstop-disabled", target: step.key,
      detail: "Tab landed on a disabled control" });
    if (step.hidden) failures.push({ code: "tabstop-hidden", target: step.key,
      detail: "Tab landed inside an aria-hidden or inert subtree" });
    if (step.route !== steps[0]?.route) {
      failures.push({ code: "tab-changed-route", target: step.key,
        detail: `Tab navigated to ${step.route}` });
      break;
    }
  }
  if (!terminated && steps.length === limit) {
    failures.push({ code: "focus-scan-limit", target: "route",
      detail: `Reached ${limit} sequential steps without wrap or document exit` });
  }
  if (steps.length === 0) failures.push({ code: "no-sequential-targets", target: "route",
    detail: "No focusable control reached by Tab" });
  return { steps, failures, terminated };
}

/** Probe a safe target without assuming that focus by itself activates it. */
export async function assertFocusDoesNotNavigate(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  const currentPath = new URL(page.url()).pathname;
  await control.focus();
  await expect(control).toBeFocused();
  expect(new URL(page.url()).pathname).toBe(currentPath);
}

/** Real keyboard activation for a purpose-built, non-destructive test button. */
export async function activateOptInButton(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  await control.focus();
  const initial = await control.getAttribute("data-keyboard-count");
  expect(initial, "Opt-in button must expose its activation counter").not.toBeNull();
  await page.keyboard.press("Enter");
  await expect.poll(() => control.getAttribute("data-keyboard-count"))
    .not.toBe(initial);
}

export async function inspectKeyboardRoute(page: Page): Promise<KeyboardFinding[]> {
  const structural = await inspectKeyboardCandidates(page);
  const sequence = await scanKeyboardRoute(page);
  return [...structural, ...sequence.failures];
}
