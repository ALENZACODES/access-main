import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Covered controls" on the built app, at 320 by 640 CSS pixels, by keyboard
 * only. It tests every control of the /dev/narrow page itself, scrolling to
 * each and back; none should be covered.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#hit-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".hittest");

test("tests every control of the page by keyboard, finds none covered, puts the scroll back, and has 44 pixel controls", async ({ page }) => {
  await open(page);
  const button = panel(page).getByRole("button", { name: "Find covered controls", exact: true });
  await button.focus();
  const before = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("Enter");
  await expect(page.locator("#hit-result-h")).toBeFocused();
  await expect(panel(page)).toContainText(/\d{2,} controls tested\. Fully covered: 0\. Partly: 0\./);
  // The page went to each control and came back; focus on the result may scroll it a little, but not far.
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(640);
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("works in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Trouver les commandes couvertes", exact: true }).click();
  await expect(page.locator("#hit-result-h")).toHaveText("Ce qui couvre des commandes");
});
