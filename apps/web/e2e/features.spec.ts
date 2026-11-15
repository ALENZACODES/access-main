import { expect, test } from "@playwright/test";
import axe from "axe-core";

const paths = ["", "/controls", "/consent", "/caregiver", "/sync", "/advocacy", "/sources"];

for (const locale of ["en", "fr"] as const) {
  for (const width of [320, 1280]) {
    test.describe(`${locale} at ${width}px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((language) => {
          localStorage.setItem("access.language", language);
          localStorage.setItem("access.language.set", "1");
        }, locale);
        await page.setViewportSize({ width, height: 900 });
      });

      for (const path of paths) {
        test(`settings${path} is accessible`, async ({ page }) => {
          await page.goto(`settings${path}`);
          await expect(page.locator("main h1")).toBeVisible();
          await page.addScriptTag({ content: axe.source });
          const findings = await page.evaluate(async () => {
            const api = (window as unknown as { axe: typeof axe }).axe;
            return api.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
          });
          expect(findings.violations).toEqual([]);
        });
      }
    });
  }
}

test("Settings lists every package route", async ({ page }) => {
  await page.goto("settings");
  for (const path of paths.slice(1)) {
    await expect(page.locator(`a[href$="/settings${path}"]`)).toBeVisible();
  }
});

test("Caregiver and advocacy actions remain blocked without consent", async ({ page }) => {
  await page.goto("settings/caregiver");
  await expect(page.getByRole("link", { name: /consent/i })).toBeVisible();
  await page.goto("settings/advocacy");
  await page.getByRole("button", { name: /evidence pack|dossier de preuves/i }).click();
  await expect(page.getByRole("alert")).toContainText(/consent|autorisation/i);
});
