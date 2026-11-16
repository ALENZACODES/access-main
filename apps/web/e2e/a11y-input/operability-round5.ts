import { expect, type Page } from "@playwright/test";

export interface OperabilityFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

/** Cross-input affordances: dragging alternatives, pointer cancel, and focus constraints. */
export async function auditOperability(page: Page): Promise<OperabilityFinding[]> {
  return page.evaluate(() => {
    const issues: OperabilityFinding[] = [];
    const report = (code: string, element: Element, detail: string): void => {
      issues.push({ code, target: element.id || element.localName, detail });
    };
    const visible = (element: Element): boolean => {
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rectangle = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        rectangle.width > 0 && rectangle.height > 0;
    };
    for (const draggable of Array.from(document.querySelectorAll<HTMLElement>(
      "[draggable='true'],[data-a11y-drag-action]",
    ))) {
      if (!visible(draggable)) continue;
      const alternateId = draggable.getAttribute("data-a11y-drag-alternative") || "";
      if (!alternateId) {
        report("drag-alternative", draggable, "Dragging requires a single-pointer alternative");
        continue;
      }
      const alternate = document.getElementById(alternateId);
      if (!alternate || !visible(alternate)) {
        report("drag-alternative-hidden", draggable, alternateId);
        continue;
      }
      if (!alternate.matches("button,a[href],input,select,[role='button']")) {
        report("drag-alternative-not-control", alternate, "Alternative must be operable");
      }
      if (alternate instanceof HTMLElement && alternate.tabIndex < 0) {
        report("drag-alternative-focus", alternate, "Alternative cannot receive sequential focus");
      }
    }
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-pointer-action]",
    ))) {
      if (!visible(element)) continue;
      const activation = element.getAttribute("data-a11y-pointer-action");
      if (activation !== "release" && activation !== "cancel-safe") {
        report("pointer-cancel-contract", element, "Action must occur on release or support cancellation");
      }
    }
    for (const motion of Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-motion-gesture]",
    ))) {
      if (!visible(motion)) continue;
      const controlId = motion.getAttribute("data-a11y-motion-alternative") || "";
      if (!controlId || !document.getElementById(controlId)) {
        report("motion-alternative", motion, "Device-motion gestures require a normal input alternative");
      }
    }
    for (const gesture of Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-multipoint-gesture]",
    ))) {
      if (!visible(gesture)) continue;
      const targetId = gesture.getAttribute("data-a11y-single-pointer") || "";
      const alternative = document.getElementById(targetId);
      if (!alternative || !visible(alternative)) {
        report("multipoint-alternative", gesture, "Multipoint gesture has no visible single-pointer control");
      }
    }
    for (const target of Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-target-size]",
    ))) {
      if (!visible(target)) continue;
      const width = target.getBoundingClientRect().width;
      const height = target.getBoundingClientRect().height;
      if (width < 44 || height < 44) {
        report("target-under-44", target, `${Math.round(width)}x${Math.round(height)}`);
      }
    }
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[tabindex]"))) {
      if (!visible(element)) continue;
      const tabIndex = element.getAttribute("tabindex") || "";
      if (!/^-?\d+$/.test(tabIndex)) {
        report("tabindex-invalid", element, tabIndex);
      } else if (Number(tabIndex) > 0) {
        report("tabindex-positive", element, "Positive tabindex disrupts predictable focus order");
      }
    }
    const body = document.body;
    if (body.getAttribute("aria-hidden") === "true") {
      report("hidden-body", body, "Body must not be hidden from assistive technology");
    }
    const main = document.querySelector("main,[role='main']");
    if (main && main.hasAttribute("inert") && !document.querySelector(
      "dialog[open],[role='dialog'][aria-modal='true']:not([hidden])",
    )) {
      report("stranded-inert-main", main, "Main content inert without a modal dialog");
    }
    return issues;
  });
}

/** Detect focus loss when toggling a safe, local, opt-in UI control. */
export async function auditOptInToggleFocus(page: Page): Promise<OperabilityFinding[]> {
  const issues: OperabilityFinding[] = [];
  const toggles = page.locator("button[data-a11y-toggle-test='reversible']");
  const count = await toggles.count();
  for (let index = 0; index < count; index += 1) {
    const toggle = toggles.nth(index);
    if (!(await toggle.isVisible()) || !(await toggle.isEnabled())) continue;
    const id = (await toggle.getAttribute("id")) || `toggle-${index}`;
    await toggle.focus();
    await page.keyboard.press("Space");
    const focusAfter = await page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && active !== document.body &&
        !active.closest("[hidden],[inert],[aria-hidden='true']");
    });
    if (!focusAfter) issues.push({ code: "toggle-focus-lost", target: id, detail: "Activation leaves focus inaccessible" });
    if (await toggle.count()) {
      await toggle.focus();
      await page.keyboard.press("Space");
    }
  }
  return issues;
}

export async function assertOperability(page: Page): Promise<void> {
  expect(await auditOperability(page), "Alternative input and focus contract").toEqual([]);
  expect(await auditOptInToggleFocus(page), "Reversible toggle focus").toEqual([]);
}
