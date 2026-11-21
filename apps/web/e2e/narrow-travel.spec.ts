import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Pointer travel" on the built app, at 320 by 640 CSS pixels.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#travel-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".travel");

test("counts the forms of the page and puts focus on the result, with each control at least 44 pixels", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Count the pointer travel", exact: true }).click();
  await expect(page.locator("#travel-result-h")).toBeFocused();
  await expect(panel(page).getByRole("status")).toHaveText("The forms were counted.");
  await expect(panel(page)).toContainText(/(\d+ forms? (was|were) counted|This page has no form with visible controls)/);
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("works by keyboard alone, and in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Compter le déplacement du pointeur", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#travel-result-h")).toBeFocused();
  await expect(page.locator("#travel-result-h")).toHaveText("Ce qui a été compté");
});
