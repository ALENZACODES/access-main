import { expect, type Page } from "@playwright/test";

export interface GestureIssue {
  readonly code: string;
  readonly selector: string;
  readonly detail: string;
}
export interface GestureControl {
  readonly selector: string;
  readonly name: string;
  readonly role: string;
  readonly hasKeyboardAction: boolean;
  readonly hasClickAction: boolean;
  readonly hasAlternative: boolean;
  readonly targetWidth: number;
  readonly targetHeight: number;
}
export async function inspectGestureAlternatives(page: Page): Promise<{ controls: GestureControl[]; issues: GestureIssue[] }> {
  return page.evaluate(() => {
    const issues: GestureIssue[] = [];
    const selector = "button,a[href],[role='button'],[role='slider'],[role='spinbutton'],[data-gesture-action]";
    const controls = Array.from(document.querySelectorAll<HTMLElement>(selector)).map((node, index): GestureControl => {
      const target = node.id ? `#${CSS.escape(node.id)}` : `${node.localName}[${index}]`;
      const name = node.getAttribute("aria-label")?.trim() ||
        (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim() ||
        node.textContent?.trim() || "";
      const role = node.getAttribute("role") ?? node.localName;
      const rect = node.getBoundingClientRect();
      const keyboard = node.matches("button,a[href],input,select,textarea") ||
        node.tabIndex >= 0 && (node.hasAttribute("onkeydown") || node.hasAttribute("onkeyup") || node.hasAttribute("data-keyboard-action"));
      const click = node.matches("button,a[href]") || node.hasAttribute("data-gesture-action");
      const alternative = node.hasAttribute("data-keyboard-alternative") ||
        node.hasAttribute("aria-keyshortcuts") || node.matches("button,a[href]");
      if (!name) issues.push({ code: "gesture-name-empty", selector: target, detail: "Action has no accessible name" });
      if (rect.width < 44 || rect.height < 44) issues.push({ code: "gesture-target-small", selector: target, detail: `${Math.round(rect.width)}x${Math.round(rect.height)} CSS px` });
      if (node.hasAttribute("data-gesture-action") && !alternative) {
        issues.push({ code: "gesture-alternative-missing", selector: target, detail: "Gesture action has no keyboard alternative declaration" });
      }
      if (node.getAttribute("role") === "slider" && (!node.hasAttribute("aria-valuenow") || !node.hasAttribute("aria-valuemin") || !node.hasAttribute("aria-valuemax"))) {
        issues.push({ code: "slider-value-missing", selector: target, detail: "Slider must expose current and boundary values" });
      }
      if (node.getAttribute("role") === "slider" && !node.hasAttribute("aria-orientation")) {
        issues.push({ code: "slider-orientation-missing", selector: target, detail: "Custom slider must expose its orientation" });
      }
      return { selector: target, name, role, hasKeyboardAction: keyboard, hasClickAction: click, hasAlternative: alternative, targetWidth: rect.width, targetHeight: rect.height };
    });
    return { controls, issues };
  });
}
export async function assertGestureAlternatives(page: Page): Promise<void> {
  const result = await inspectGestureAlternatives(page);
  expect(result.issues, "Gesture alternative contract").toEqual([]);
}
export async function exerciseKeyboardAlternative(page: Page, selector: string, key: "Enter" | "Space" | "ArrowLeft" | "ArrowRight"): Promise<void> {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  await target.focus();
  await page.keyboard.press(key);
}
export async function assertSliderKeyboard(page: Page, selector: string): Promise<{ before: number; after: number }> {
  const slider = page.locator(selector);
  await expect(slider).toHaveAttribute("role", "slider");
  await slider.focus();
  const before = Number(await slider.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  const after = Number(await slider.getAttribute("aria-valuenow"));
  expect(Number.isFinite(before)).toBe(true);
  expect(after).toBeGreaterThan(before);
  return { before, after };
}
