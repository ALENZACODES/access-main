import { expect, test } from "@playwright/test";
import { appRoutes, chooseLanguage, VIEWPORTS, visit } from "../a11y-input/helpers";
import { collectSemanticSnapshot } from "./semantic-integrity-browser";
import { languageIssues } from "./semantic-integrity";

const ROUTE = "/more/auditors";
const COPY = {
  coordinator: /^Choose the Coordinator role to move a report to its next step\.$/,
  ageing: /^A date is not permanent proof\. An observation supports tier 1 for /,
} as const;

test("auditors language contract has a registered route", () => {
  const routes = appRoutes();
  expect(routes).toContain(ROUTE);
  expect(new Set(routes).size).toBe(routes.length);
});

for (const viewport of VIEWPORTS) {
  test.describe(`auditors text language at ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("French page marks the two English passages and retains its French heading", async ({ page }) => {
      const response = await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);
      await chooseLanguage(page, "fr");
      await visit(page, ROUTE, "fr");

      const tool = page.locator(".hub-tool");
      const coordinator = tool.locator("p").filter({ hasText: COPY.coordinator }).first();
      const ageing = tool.locator("p").filter({ hasText: COPY.ageing }).first();
      await expect(coordinator).toBeVisible();
      await expect(ageing).toBeVisible();
      await expect(coordinator).toHaveAttribute("lang", "en");
      await expect(ageing).toHaveAttribute("lang", "en");
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      const snapshot = await collectSemanticSnapshot(page, ROUTE);
      expect(languageIssues(snapshot.documentLanguage, "fr", snapshot.fragments, ROUTE)).toEqual([]);
    });

    test("Changing the shell language removes only adapter-owned markers", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await chooseLanguage(page, "fr");
      await visit(page, ROUTE, "fr");
      const coordinator = page.locator(".hub-tool p").filter({ hasText: COPY.coordinator }).first();
      await expect(coordinator).toHaveAttribute("lang", "en");

      await page.getByRole("button", { name: "English", exact: true }).first().click();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(coordinator).not.toHaveAttribute("data-p20t-english", "1");
      await expect(coordinator).not.toHaveAttribute("lang", "en");

      await page.getByRole("button", { name: "Français", exact: true }).first().click();
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(coordinator).toHaveAttribute("lang", "en");
    });
  });
}
