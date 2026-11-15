import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const locale of ["en", "fr"] as const) {
  for (const width of [1280, 320]) {
    test(`${locale} report is accessible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      // Client-rendered preview: the locale control is not in the first HTML.
      // The app always starts in English, so the accessible name is "Language"
      // until after the option is chosen. Looking up "Langue" before that switch
      // (as CI run 43762358121 did) times out on getByLabel.
      const localeSelect = page.getByLabel(/^Language$|^Langue$/);
      await expect(localeSelect).toBeVisible();
      await expect(localeSelect).toBeEnabled();
      await localeSelect.selectOption(locale);
      await expect(page.locator("main")).toHaveAttribute("lang", locale);
      await expect(localeSelect).toHaveAccessibleName(locale === "en" ? "Language" : "Langue");
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByRole("status")).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });
  }
}
