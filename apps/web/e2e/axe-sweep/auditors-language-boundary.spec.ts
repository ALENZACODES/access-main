import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, VIEWPORTS, visit } from "../a11y-input/helpers";

const ROUTE = "/more/auditors";
test("the auditors route participates in the normal route inventory", () => {
  const routes = appRoutes();
  expect(routes).toContain(ROUTE);
  expect(new Set(routes).size).toBe(routes.length);
});

for (const viewport of VIEWPORTS) {
  test.describe(`auditors language annotations at ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("live French route exposes its English-only paragraphs with language metadata", async ({ page }) => {
      test.setTimeout(60_000);
      const response = await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);
      await chooseLanguage(page, "fr");
      await visit(page, ROUTE, "fr");
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const policyParagraph = page.locator(".hub-tool p").filter({ hasText: /^A date is not permanent proof\./ }).first();
      const coordinatorParagraph = page.locator(".hub-tool p").filter({ hasText: /^Choose the Coordinator role/ }).first();
      await expect(policyParagraph).toBeVisible();
      await expect(coordinatorParagraph).toBeVisible();
      await expect(policyParagraph).toHaveAttribute("lang", "en");
      await expect(coordinatorParagraph).toHaveAttribute("lang", "en");
    });
  });
}
