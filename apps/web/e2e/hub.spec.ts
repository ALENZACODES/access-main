import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["", "employment", "housing", "safety", "diary", "auditors", "handoff", "peers", "events"];
for (const locale of ["en", "fr"] as const) {
  for (const width of [320, 1280]) {
    for (const page of pages) {
      test(`${locale} ${width}px /more/${page}: no axe violations`, async ({ page: browserPage }) => {
        await browserPage.setViewportSize({ width, height: 900 });
        await browserPage.addInitScript((lang) => {
          localStorage.setItem("access.language", lang);
          localStorage.setItem("access.language.set", "1");
        }, locale);
        await browserPage.goto(`/more${page ? `/${page}` : ""}`);
        await expect(browserPage.getByRole("heading", { level: 1 }).first()).toBeVisible();
        const result = await new AxeBuilder({ page: browserPage }).analyze();
        expect(result.violations).toEqual([]);
      });
    }
  }
}

test("more hub links to all mounted idea packages", async ({ page }) => {
  await page.goto("/more");
  for (const name of pages.filter(Boolean)) {
    await expect(page.locator(`a[href$="/more/${name}"]`)).toBeVisible();
  }
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
});

test("trip safety delegates journey planning to the journey route", async ({ page }) => {
  await page.goto("/more/safety");
  await expect(page.locator('a[href="/journey"]').first()).toBeVisible();
});
