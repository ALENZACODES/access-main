import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "My typing pace" on the built app, at 320 by 640 CSS pixels. The typing is
 * done by Playwright's keyboard, so the pace itself is not checked, only that
 * it is measured and shown.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#typing-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".typing");

test("runs the practice by keyboard and shows the pace, with each control at least 44 pixels", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Start the typing practice", exact: true }).click();
  await expect(page.locator("#typing-field-name")).toBeFocused();
  await page.keyboard.type("Alex Martin", { delay: 20 });
  await page.keyboard.press("Tab");
  await expect(page.locator("#typing-field-postal")).toBeFocused();
  await page.keyboard.type("K1A 0B2", { delay: 20 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type("1", { delay: 20 });
  for (const box of await panel(page).locator("button, input").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  await panel(page).getByRole("button", { name: "I have finished", exact: true }).click();
  await expect(page.locator("#typing-result-h")).toBeFocused();
  await expect(panel(page).getByRole("status")).toHaveText("The practice is over. The result follows.");
  await expect(panel(page)).toContainText(/2 of 3 practice fields filled in\. Your pace: about \d+ characters a minute/);
  await expect(panel(page)).toContainText("1 correction (deleting or undoing).");
  await expect(panel(page)).toContainText(/text fields? of this page would take about|This page has no text field/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("can be stopped at once, and works in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Commencer l’essai de saisie", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#typing-field-name")).toBeFocused();
  await panel(page).getByRole("button", { name: "Arrêter l’essai", exact: true }).click();
  await expect(page.locator("#typing-result-h")).toHaveText("Votre rythme de saisie");
  await expect(panel(page)).toContainText("Aucun champ d’essai n’a été rempli, donc votre rythme est UNKNOWN.");
});
