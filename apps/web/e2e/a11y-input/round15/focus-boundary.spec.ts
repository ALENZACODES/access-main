import { expect, test } from "@playwright/test";
import { fixture } from "./harness";

test("Shift Tab at first target moves to document boundary", async ({ page }) => {
  await fixture(page, `<button id="first">First</button>`);
  await page.locator("#first").focus();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});
test("Tab at last target moves to document boundary", async ({ page }) => {
  await fixture(page, `<button id="last">Last</button>`);
  await page.locator("#last").focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});
test("reverse focus returns after one forward movement", async ({ page }) => {
  await fixture(page, `<button id="first">First</button><button id="second">Second</button>`);
  await page.locator("#first").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#second")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#first")).toBeFocused();
});
test("forward focus restores after reverse movement", async ({ page }) => {
  await fixture(page, `<button id="first">First</button><button id="second">Second</button>`);
  await page.locator("#second").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#first")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#second")).toBeFocused();
});
