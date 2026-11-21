import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Scroll effort on this page" on the built app, at 320 by 640 CSS pixels.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#scroll-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".scroll-effort");

test("counts the page without scrolling it, and puts focus on the result", async ({ page }) => {
  await open(page);
  const button = panel(page).getByRole("button", { name: "Count the scrolling on this page", exact: true });
  await button.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await button.click();
  await expect(page.locator("#scroll-result-h")).toBeFocused();
  await expect(panel(page).getByRole("status")).toHaveText("The page was read.");
  await expect(panel(page)).toContainText(/The page is [\d.]+ screens tall, in this window of 320 by 640 CSS pixels/);
  // Focus on the result heading may bring it into view, but the count itself does not scroll back to the top.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before / 2);
});

test("lists the headings of the other panels, and not its own, with each control at least 44 pixels", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Count the scrolling on this page", exact: true }).click();
  const names = await panel(page).locator("tbody th").allTextContents();
  expect(names).toContain("How I press");
  expect(names).not.toContain("Scroll effort on this page");
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("works by keyboard alone, and in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Compter le défilement de cette page", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#scroll-result-h")).toBeFocused();
  await expect(page.locator("#scroll-result-h")).toHaveText("Ce qui a été compté");
  await expect(panel(page)).toContainText(/La page fait [\d,]+\u00A0écrans de haut/);
});
