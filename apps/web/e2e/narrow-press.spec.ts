import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "How I press" on the built app, at 320 by 640 CSS pixels, with real mouse
 * and key presses held for set times.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#press-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".press");

/** One mouse press on the pad, held for `hold` ms. */
async function mousePress(page: Page, hold: number) {
  const box = await page.locator("#press-pad").boundingBox();
  if (!box) throw new Error("no pad");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(hold);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

test("the pad is large, inside the page, and keeps focus while the presses are counted", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Start the press test", exact: true }).click();
  const pad = page.locator("#press-pad");
  await expect(pad).toBeFocused();
  const box = await pad.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(160);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await mousePress(page, 100);
  await expect(page.locator("#press-run-h")).toHaveText("Press 2 of 8");
  await expect(pad).toBeFocused();
  await expect(panel(page).getByRole("status")).toHaveText("1 of 8.");
});

test("eight presses give the result, with a long hold pointed to", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Start the press test", exact: true }).click();
  for (let i = 0; i < 8; i += 1) await mousePress(page, i === 3 ? 650 : 100);
  await expect(page.locator("#press-result-h")).toBeFocused();
  await expect(panel(page)).toContainText("8 of 8 presses measured.");
  await expect(panel(page)).toContainText(/1 press was held 500 ms or more, up to \d+ ms\./);
  await expect(panel(page).locator("tbody tr")).toHaveCount(8);
});

test("works by keyboard alone, and in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Commencer le test d’appui", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#press-pad")).toBeFocused();
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.down("Enter");
    await page.waitForTimeout(80);
    await page.keyboard.up("Enter");
    await page.waitForTimeout(80);
  }
  await expect(page.locator("#press-run-h")).toHaveText("Appui 4 sur 8");
  await panel(page).getByRole("button", { name: "Arrêter le test", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#press-result-h")).toBeFocused();
  await expect(page.locator("#press-result-h")).toHaveText("Vos temps d’appui");
  await expect(panel(page)).toContainText("3 appuis mesurés sur 8, le test a été arrêté avant la fin.");
});

test("the press line goes into the barrier text of the fit panel", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Start the press test", exact: true }).click();
  await mousePress(page, 100);
  await mousePress(page, 100);
  await panel(page).getByRole("button", { name: "Stop the test", exact: true }).click();
  await page.locator("#fit-kind-too-small").check();
  await page.locator("#fit-what").fill("A long press opens a menu.");
  await page.locator('[data-action="fit-make"]').click();
  await expect(page.locator("#fit-text")).toHaveValue(/My presses \(mouse or pointer\): held from \d+ ms to \d+ ms; at least \d+ ms between presses\./);
});
