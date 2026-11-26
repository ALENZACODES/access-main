import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Things that move" on the built app, at 320 by 640 CSS pixels, by keyboard
 * only. The page itself should hold still: the panel's own result is checked
 * for that, as a person aiming slowly would need.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#moving-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".moving");

test("watches the page for the time chosen, by keyboard, with 44 pixel controls, and finds the page still", async ({ page }) => {
  await open(page);
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  const two = panel(page).getByRole("button", { name: "2 s", exact: true });
  await two.focus();
  await page.keyboard.press("Enter");
  await expect(two).toBeFocused();
  await expect(two).toHaveAttribute("aria-pressed", "true");
  await panel(page).getByRole("button", { name: "Watch this page", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#moving-watch-h")).toBeFocused();
  await expect(page.locator("#moving-result-h")).toBeFocused({ timeout: 10_000 });
  await expect(panel(page)).toContainText(/Two looks [\d.]+ s apart/);
  await expect(panel(page)).toContainText("Controls that moved: 0. Appeared: 0. Gone: 0.");
  await expect(panel(page)).toContainText(/Animations running: \d+, of which 0 never stop/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("can be stopped at once, in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Observer cette page", exact: true }).click();
  await panel(page).getByRole("button", { name: "Arrêter d’observer", exact: true }).click();
  await expect(page.locator("#moving-result-h")).toHaveText("Ce qui a bougé");
  await expect(panel(page)).toContainText("Vous avez dit viser en environ 5 s.");
});
