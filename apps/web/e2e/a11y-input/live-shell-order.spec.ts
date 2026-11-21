import { expect, test } from "@playwright/test";

import { assertWalk, walkSequentialFocus } from "./navigation-audit";

// Exercise the real shell rather than a document-only fixture. The boundary
// between its navigation links and route content must remain reversible.
for (const route of ["/", "/about"]) {
  test(`shell keyboard order is reversible on ${route}`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const walk = await walkSequentialFocus(page);
    assertWalk(walk);
  });

  test(`header navigation allows exact Shift+Tab return on ${route}`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const links = page.locator("header nav .nav-link");
    const count = await links.count();
    expect(count).toBeGreaterThan(1);
    await links.first().focus();
    for (let index = 1; index < count; index += 1) {
      await page.keyboard.press("Tab");
      await expect(links.nth(index)).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(links.nth(index - 1)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(links.nth(index)).toBeFocused();
    }
    await page.keyboard.press("Tab");
    const next = await page.evaluate(() => document.activeElement);
    expect(next).not.toBeNull();
    await page.keyboard.press("Shift+Tab");
    await expect(links.last()).toBeFocused();
  });
}
