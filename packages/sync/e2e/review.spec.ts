import { test, expect } from "@playwright/test";
import axe from "axe-core";

for (const language of ["en", "fr"] as const) {
  for (const width of [1280, 320]) {
    test(`${language} review and empty state: axe at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?lang=${language}`);
      await expect(page.locator("fieldset")).toHaveCount(1);
      await page.evaluate(axe.source);
      const result = await page.evaluate(async () => (window as typeof window & { axe: typeof axe }).axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      }));
      expect(result.violations).toEqual([]);
      await page.goto(`/?lang=${language}&empty=1`);
      await expect(page.getByRole("status")).toBeVisible();
      await page.evaluate(axe.source);
      const empty = await page.evaluate(async () => (window as typeof window & { axe: typeof axe }).axe.run(document));
      expect(empty.violations).toEqual([]);
    });
  }
}
