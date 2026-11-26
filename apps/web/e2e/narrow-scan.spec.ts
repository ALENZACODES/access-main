import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Switch scanning" on the built app, at 320 by 640 CSS pixels, by keyboard
 * only, as a person using a switch interface that sends key presses would.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#scan-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".scancost");

test("sets how the person scans and counts the steps on this page, by keyboard, with 44 pixel controls", async ({ page }) => {
  await open(page);
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  await panel(page).getByRole("button", { name: "Count the steps on this page", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#scan-result-h")).toBeFocused();
  await expect(panel(page)).toContainText(/\d+ controls on \d+ rows\./);
  const rowByRow = panel(page).getByRole("button", { name: "Row by row, then along the row", exact: true });
  await rowByRow.focus();
  await page.keyboard.press("Space");
  await expect(rowByRow).toBeFocused();
  await expect(rowByRow).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page).getByRole("status")).toHaveText("Scanning row by row, with auto scan, 1.5 s a step.");
  await expect(panel(page)).toContainText(/presses\./);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("hides the speeds with step scan, in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Pas à pas : un appui par étape", exact: true }).click();
  await expect(panel(page).locator('[data-action="scan-speed"]')).toHaveCount(0);
  await expect(panel(page)).toContainText("Choisi : Balayage un par un, pas à pas, un appui par étape.");
});
