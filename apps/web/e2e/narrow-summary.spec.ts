import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "My access summary" on the built app, at 320 by 640 CSS pixels, gathering
 * real results from the zones and press tests.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#summary-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".summary");

test("with no test done, every part is UNKNOWN and each go button takes focus to its test", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Make my summary", exact: true }).click();
  await expect(page.locator("#summary-result-h")).toBeFocused();
  await expect(panel(page)).toContainText("No part is done yet.");
  await expect(panel(page).locator("dd")).toHaveCount(3);
  await panel(page).getByRole("button", { name: "Go to the press test", exact: true }).click();
  await expect(page.locator("#press-h")).toBeFocused();
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("gathers the zones marked and the presses made, with a request to send", async ({ page }) => {
  await open(page);
  await page.locator(".zones").getByRole("button", { name: "Bottom, left", exact: true }).click();
  await page.locator(".press").getByRole("button", { name: "Start the press test", exact: true }).click();
  const box = await page.locator("#press-pad").boundingBox();
  if (!box) throw new Error("no pad");
  for (let i = 0; i < 2; i += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(100);
  }
  await page.locator(".press").getByRole("button", { name: "Stop the test", exact: true }).click();
  await panel(page).getByRole("button", { name: "Make my summary", exact: true }).click();
  await expect(panel(page)).toContainText("2 of 3 parts done. The others stay UNKNOWN.");
  const text = await page.locator("#summary-text").inputValue();
  expect(text).toContain("Screen zones I can reach: Bottom, left (1 of 12).");
  expect(text).toMatch(/My presses \(mouse or pointer\): held from \d+ ms to \d+ ms; at least \d+ ms between presses\./);
  expect(text).toContain("Button size for my taps: UNKNOWN, not done yet.");
  await expect(page.locator("#summary-request")).toHaveValue(/controls within the screen zones I can reach and controls that allow for the way I press/);
});

test("works by keyboard alone, and in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Faire mon résumé", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#summary-result-h")).toBeFocused();
  await expect(page.locator("#summary-result-h")).toHaveText("Votre résumé");
  await expect(page.locator("#summary-text")).toHaveValue(/^Mon résumé d’accès\nMesuré le \d+ \S+ \d{4}, sur cet écran\./);
});
