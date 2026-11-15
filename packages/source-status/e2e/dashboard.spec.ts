import axe from "axe-core";
import { expect, test } from "@playwright/test";

for (const language of ["en", "fr"] as const) {
  for (const width of [1280, 320]) {
    test(`${language} at ${width}px: axe and responsive layout`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.getByLabel("Language").selectOption(language);
      await expect(page.locator("main")).toHaveAttribute("lang", language);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("article")).toHaveCount(2);
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () => {
        const runner = (window as typeof window & { axe: typeof axe }).axe;
        const result = await runner.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
        return result.violations.map((item) => ({ id: item.id, nodes: item.nodes.length }));
      });
      expect(violations).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });
  }
}
