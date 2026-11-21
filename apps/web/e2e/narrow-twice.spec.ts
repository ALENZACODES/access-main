import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Asked twice" on the built app, at 320 by 640 CSS pixels, by keyboard
 * only. It reads the forms of the /dev/narrow page itself.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#twice-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".twice");

test("reads the forms of the page by keyboard, with 44 pixel controls", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Find what is asked twice", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#twice-result-h")).toBeFocused();
  await expect(panel(page)).toContainText(/\d+ fields? to fill in\. Asked for twice: \d+\./);
  await expect(panel(page)).toContainText("Only this page is read.");
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("works in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Trouver ce qui est demandé deux fois", exact: true }).click();
  await expect(page.locator("#twice-result-h")).toHaveText("Formulaires de cette page");
});
