import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Shown on hover only" on the built app, at 320 by 640 CSS pixels, by
 * keyboard only, as a person who cannot hover would use it. It reads the
 * app's own style rules.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#hover-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".hoveronly");

test("takes the answer and reads the app's style rules, by keyboard, with 44 pixel controls", async ({ page }) => {
  await open(page);
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  const cannot = panel(page).getByRole("button", { name: "I cannot hover", exact: true });
  await cannot.focus();
  await page.keyboard.press("Enter");
  await expect(cannot).toBeFocused();
  await expect(cannot).toHaveAttribute("aria-pressed", "true");
  await panel(page).getByRole("button", { name: "Find what shows on hover only", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#hover-result-h")).toBeFocused();
  await expect(panel(page)).toContainText(/style sheets? read|hover rules? shows? something/);
  // The app itself should hide no control behind hover.
  await expect(panel(page)).toContainText(/Controls hidden unless hovered: 0\.|No hover rule that shows something/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("works in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Je ne peux pas survoler", exact: true }).click();
  await panel(page).getByRole("button", { name: "Trouver ce qui n’apparaît qu’au survol", exact: true }).click();
  await expect(page.locator("#hover-result-h")).toHaveText("Ce qui a été trouvé");
});
