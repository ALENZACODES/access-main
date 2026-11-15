import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * The integrating PWA mounts ReviewQueue at /proposals.
 * Run these checks when the route is wired into the shell.
 */
const baseURL = process.env.PROPOSALS_TEST_URL;

test.describe("unverified drafts review route", () => {
  test.skip(!baseURL, "Set PROPOSALS_TEST_URL to the integrating PWA URL");

  for (const width of [320, 1280]) {
    test(`English queue meets axe at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${baseURL}/proposals?lang=en`);
      await expect(
        page.getByRole("heading", { name: "Unverified drafts" }),
      ).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test(`French queue meets axe at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${baseURL}/proposals?lang=fr`);
      await expect(
        page.getByRole("heading", { name: "Brouillons non vérifiés" }),
      ).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
