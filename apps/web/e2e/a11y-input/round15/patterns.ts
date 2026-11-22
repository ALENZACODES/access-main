import { expect, type Page } from "@playwright/test";
import { expectFocus } from "./harness";

export async function expectRoving(page: Page, selector: string, activeId: string): Promise<void> {
  await expectFocus(page, activeId);
  const stops = await page.locator(selector).evaluateAll(nodes =>
    nodes.filter(node => node instanceof HTMLElement && node.tabIndex === 0).map(node => (node as HTMLElement).id));
  expect(stops).toEqual([activeId]);
}
export async function expectSelected(page: Page, selector: string, id: string): Promise<void> {
  await expect(page.locator(`${selector}[aria-selected="true"]`)).toHaveCount(1);
  await expect(page.locator(`#${id}`)).toHaveAttribute("aria-selected","true");
}
export async function expectChecked(page: Page, id: string, value: boolean): Promise<void> {
  await expect(page.locator(`#${id}`)).toHaveAttribute("aria-checked",String(value));
}
export async function expectExpanded(page: Page, id: string, value: boolean): Promise<void> {
  await expect(page.locator(`#${id}`)).toHaveAttribute("aria-expanded",String(value));
}
export async function pressKeys(page: Page, keys: readonly string[]): Promise<void> {
  for (const key of keys) await page.keyboard.press(key);
}
export async function expectFocusInside(page: Page, selector: string): Promise<void> {
  expect(await page.locator(selector).evaluate(node => node.contains(document.activeElement))).toBe(true);
}
export async function expectNoFocusInside(page: Page, selector: string): Promise<void> {
  expect(await page.locator(selector).evaluate(node => !node.contains(document.activeElement))).toBe(true);
}
export async function assertDisabledNotSelected(page: Page, id: string): Promise<void> {
  await expect(page.locator(`#${id}`)).toHaveAttribute("aria-disabled","true");
  await expect(page.locator(`#${id}`)).not.toHaveAttribute("aria-selected","true");
}
export async function typeahead(page: Page, text: string): Promise<void> {
  for (const char of text) await page.keyboard.press(char);
}
export async function assertLiveText(page: Page, selector: string, expected: string): Promise<void> {
  await expect(page.locator(selector)).toContainText(expected);
}
