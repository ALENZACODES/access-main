import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("request", (request) => {
    const { hostname } = new URL(request.url());
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      throw new Error(`Unexpected request to ${request.url()}`);
    }
  });
});

test("the build card opens from About by keyboard and states only what it can read", async ({ page }) => {
  await page.goto("/about");
  await page.getByRole("link", { name: "Build card for a demonstration" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/build-card$/);
  await expect(page.getByRole("heading", { level: 1, name: "Build card" })).toBeVisible();
  await expect(page).toHaveTitle("Build card — the App");
  await expect(page.getByText("Build identifier: e2e")).toBeVisible();
  await expect(page.getByText("No records are cached on this device.")).toBeVisible();
  await expect(page.getByText("No source is listed, because no record is cached.")).toBeVisible();
  await expect(page.getByText("Cached records that still claim verified: 0.")).toBeVisible();

  const statements = page.getByRole("region", { name: "Statements to deliver" }).getByRole("listitem");
  await expect(statements).toHaveCount(6);
  await expect(statements.nth(3)).toHaveText("No organisation, including Spinal Cord Injury Ontario, has endorsed the App.");

  const parts = page.getByRole("table", { name: "Whether each part answered as connected" });
  await expect(parts.getByRole("row")).toHaveCount(7);
  await expect(parts.getByRole("cell", { name: "Not connected in this build" })).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Print this card" })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test("the build card is in French and passes axe", async ({ page }) => {
  await page.goto("/build-card");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fiche de version" })).toBeVisible();
  await expect(page.getByText("Identifiant de version : e2e")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Non connectée dans cette version" })).toHaveCount(6);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  await page.getByRole("button", { name: "English" }).click();
});

test("the print button calls the browser print dialog and hides itself in print", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await page.goto("/build-card");
  await page.getByRole("button", { name: "Print this card" }).focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print this card" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Build card" })).toBeVisible();
});

test("the build card fits a phone without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/build-card");
  await expect(page.getByRole("heading", { level: 1, name: "Build card" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
