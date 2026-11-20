import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Say it to press it" on the built app, at 320 by 640 CSS pixels.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#voice-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".voice");

test("reads the controls of the page and puts focus on the result, with each control at least 44 pixels", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Read the controls of this page", exact: true }).click();
  await expect(page.locator("#voice-result-h")).toBeFocused();
  await expect(panel(page)).toContainText(/Of \d+ controls, \d+ can be reached in one step by saying what (it shows|they show)\./);
  for (const box of await panel(page).locator("button, input").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("a phrase reaches the button of another panel, as the browser names it", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Read the controls of this page", exact: true }).click();
  await panel(page).getByLabel("What you would say", { exact: true }).fill("click Start the press test");
  await panel(page).getByRole("button", { name: "See what it reaches", exact: true }).click();
  await expect(panel(page).locator("#voice-said")).toHaveText("One control answers to “start the press test”: button “Start the press test”.");
  await expect(page.getByRole("button", { name: "Start the press test", exact: true })).toHaveCount(1);
  await expect(panel(page).getByRole("status")).toHaveText("One control answers to “start the press test”: button “Start the press test”.");
});

test("works by keyboard alone, and in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Lire les commandes de cette page", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#voice-result-h")).toBeFocused();
  await expect(page.locator("#voice-result-h")).toHaveText("Ce qui a été trouvé");
  await panel(page).getByLabel("Ce que vous diriez", { exact: true }).fill("");
  await panel(page).getByRole("button", { name: "Voir ce que cela atteint", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page).getByLabel("Ce que vous diriez", { exact: true })).toBeFocused();
  await expect(panel(page).locator("#voice-said")).toHaveText("Écrivez ce que vous diriez, par exemple Envoyer.");
});
