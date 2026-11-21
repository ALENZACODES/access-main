import type { Page } from "@playwright/test";

export interface FocusStop {
  readonly index: number; readonly id: string; readonly name: string;
  readonly role: string; readonly tabIndex: number;
  readonly visible: boolean; readonly inViewport: boolean;
  readonly left: number; readonly top: number; readonly width: number; readonly height: number;
}
export interface KeyboardReachReport {
  readonly stops: readonly FocusStop[];
  readonly positiveTabIndexes: readonly string[];
  readonly hiddenFocusable: readonly string[];
  readonly duplicateIds: readonly string[];
  readonly activeId: string;
  readonly activeName: string;
}
export async function inspectKeyboardReachability(page: Page): Promise<KeyboardReachReport> {
  return page.evaluate(() => {
    const selector = "a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex='-1'])";
    const all = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden"
        && !element.closest("[hidden],[inert],[aria-hidden=true]");
    };
    const name = (element: HTMLElement) => element.getAttribute("aria-label")
      || element.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
      || element.textContent || element.getAttribute("placeholder") || "";
    const stops = all.map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        index, id: element.id, name: name(element).trim().replace(/\s+/g, " ").slice(0, 100),
        role: element.getAttribute("role") || element.localName, tabIndex: element.tabIndex,
        visible: visible(element),
        inViewport: rect.right > 0 && rect.left < document.documentElement.clientWidth
          && rect.bottom > 0 && rect.top < document.documentElement.clientHeight,
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      };
    });
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeName = active ? name(active).trim().replace(/\s+/g, " ").slice(0, 100) : "";
    const ids = all.map((element) => element.id).filter(Boolean);
    return {
      stops,
      positiveTabIndexes: stops.filter((stop) => stop.tabIndex > 0).map((stop) => stop.id || stop.name),
      hiddenFocusable: stops.filter((stop) => !stop.visible).map((stop) => stop.id || stop.name),
      duplicateIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
      activeId: active?.id ?? "",
      activeName,
    };
  });
}
export async function tabThroughControls(page: Page, maximum = 80): Promise<FocusStop[]> {
  const observed: FocusStop[] = [];
  for (let index = 0; index < maximum; index += 1) {
    await page.keyboard.press("Tab");
    const current = await page.evaluate(() => {
      const element = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        id: element.id,
        name: (element.getAttribute("aria-label") || element.textContent || element.localName).trim().slice(0, 100),
        role: element.getAttribute("role") || element.localName,
        tabIndex: element.tabIndex,
        visible: style.display !== "none" && style.visibility !== "hidden" && !element.closest("[hidden],[inert],[aria-hidden=true]"),
        inViewport: rect.right > 0 && rect.left < document.documentElement.clientWidth
          && rect.bottom > 0 && rect.top < document.documentElement.clientHeight,
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      };
    });
    if (!current) break;
    const stop = { index, ...current };
    const first = observed[0];
    if (first && first.id === stop.id && first.name === stop.name) break;
    observed.push(stop);
  }
  return observed;
}
export function keyboardReachIssues(report: KeyboardReachReport): string[] {
  const issues: string[] = [];
  for (const id of report.positiveTabIndexes) issues.push(`positive-tabindex:${id}`);
  for (const id of report.hiddenFocusable) issues.push(`hidden-focusable:${id}`);
  for (const id of report.duplicateIds) issues.push(`duplicate-id:${id}`);
  return issues;
}
