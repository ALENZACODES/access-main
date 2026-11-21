import { expect, type Page } from "@playwright/test";

export interface RouteStabilityIssue {
  readonly code: string;
  readonly detail: string;
}
export interface RouteState {
  readonly path: string;
  readonly title: string;
  readonly language: string;
  readonly heading: string;
  readonly mainCount: number;
  readonly focused: string;
}
export async function captureRouteState(page: Page): Promise<RouteState> {
  return page.evaluate(() => {
    const active = document.activeElement;
    const focused = active instanceof HTMLElement
      ? active.id ? `#${CSS.escape(active.id)}` : active.localName
      : "none";
    return {
      path: `${location.pathname}${location.search}${location.hash}`,
      title: document.title,
      language: document.documentElement.lang,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      mainCount: document.querySelectorAll("main,[role='main']").length,
      focused,
    };
  });
}
export async function assertFocusDoesNotNavigate(page: Page, selector: string): Promise<void> {
  const before = await captureRouteState(page);
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  await target.focus();
  await page.waitForTimeout(50);
  const after = await captureRouteState(page);
  expect(after.path).toBe(before.path);
  expect(after.heading).toBe(before.heading);
  expect(after.focused).not.toBe("none");
}
export async function assertPointerDoesNotStealFocus(page: Page, focusedSelector: string, pointerSelector: string): Promise<void> {
  const focused = page.locator(focusedSelector);
  await focused.focus();
  await expect(focused).toBeFocused();
  const before = await captureRouteState(page);
  await page.locator(pointerSelector).hover();
  const after = await captureRouteState(page);
  expect(after.path).toBe(before.path);
  await expect(focused).toBeFocused();
}
export async function inspectSkipLinks(page: Page): Promise<RouteStabilityIssue[]> {
  return page.evaluate(() => {
    const issues: RouteStabilityIssue[] = [];
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='#']"));
    links.forEach((link, index) => {
      const href = link.getAttribute("href") ?? "";
      if (!href || href === "#") return;
      const id = decodeURIComponent(href.slice(1));
      if (!document.getElementById(id)) issues.push({ code: "skip-target-missing", detail: `Skip link ${index} targets missing #${id}` });
      if (!link.textContent?.trim() && !link.getAttribute("aria-label")) issues.push({ code: "skip-link-unnamed", detail: `Skip link ${index} has no name` });
    });
    return issues;
  });
}
export async function activateFirstSkipLink(page: Page): Promise<void> {
  const skip = page.locator("a[href^='#']").filter({ hasText: /skip|passer|aller/i }).first();
  await expect(skip).toBeVisible();
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main,[role='main']").first()).toBeVisible();
}
