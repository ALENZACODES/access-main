import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Slips onto risky controls" on the built app, at 320 by 640 CSS pixels.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#slip-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".slip");

test("reads the page with the App minimum before the tap test, and puts focus on the result", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Find the slips on this page", exact: true }).click();
  await expect(page.locator("#slip-result-h")).toBeFocused();
  await expect(panel(page)).toContainText("Tap size used: 44 px, the App’s minimum, since the tap test was not taken. Yours stays UNKNOWN.");
  await expect(panel(page)).toContainText(/Of \d+ controls, \d+ do(es)? something hard to take back\./);
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("works by keyboard alone, and in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Trouver les glissements de cette page", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#slip-result-h")).toBeFocused();
  await expect(page.locator("#slip-result-h")).toHaveText("Ce qui a été trouvé");
  await expect(panel(page)).toContainText("Taille de toucher utilisée : 44 px, le minimum de l’App");
});
