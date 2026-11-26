import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Where to start" on the built app, at 320 by 640 CSS pixels, by keyboard
 * only: marking tools, the tests put first, and a go button that takes focus
 * to a test further down the page.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#start-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".start");

test("marks tools by keyboard, puts their tests first and goes to one, with 44 pixel controls", async ({ page }) => {
  await open(page);
  const head = panel(page).getByRole("button", { name: "A head pointer", exact: true });
  await head.focus();
  await page.keyboard.press("Enter");
  await expect(head).toBeFocused();
  await expect(head).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page).getByRole("status")).toHaveText("Marked: a head pointer.");
  await expect(panel(page).locator("ol li").first()).toContainText("Things that move");
  for (const box of await panel(page).locator("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  const go = panel(page).getByRole("button", { name: "Go to things that move", exact: true });
  await go.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#moving-h")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("works in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Un ou deux contacteurs", exact: true }).click();
  await expect(panel(page).locator("ol li").first()).toContainText("Balayage par contacteur");
  await panel(page).getByRole("button", { name: "Aller au balayage par contacteur", exact: true }).click();
  await expect(page.locator("#scan-h")).toBeFocused();
});
