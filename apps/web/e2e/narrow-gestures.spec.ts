import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Dragging and gestures" on the built app, at 320 by 640 CSS pixels. The
 * drags are made by Playwright's mouse, so they show the test counts a drag,
 * not how anyone drags.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#gest-h")).toBeVisible();
};

const panel = (page: Page) => page.locator(".gest");

const dragBy = async (page: Page, fraction: number) => {
  const handle = page.locator(".gest-handle");
  await handle.scrollIntoViewIfNeeded();
  const h = await handle.boundingBox();
  const t = await page.locator(".gest-track").boundingBox();
  if (!h || !t) throw new Error("no track");
  const y = h.y + h.height / 2;
  const x0 = h.x + h.width / 2;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x0 + (t.width - h.width - 12) * fraction, y, { steps: 8 });
  await page.mouse.up();
};

test("runs the drag test with a real pointer, with each control at least 44 pixels", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "Start the drag test", exact: true }).click();
  await expect(page.locator("#gest-test-h")).toBeFocused();
  for (const box of await panel(page).locator("button, .gest-handle").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  await dragBy(page, 1);
  await expect(panel(page).getByRole("status")).toHaveText("Try 1 reached the end.");
  await dragBy(page, 0.4);
  await expect(panel(page).getByRole("status")).toHaveText("Try 2 stopped short.");
  await dragBy(page, 1);
  await expect(page.locator("#gest-test-h")).toBeFocused();
  await expect(panel(page)).toContainText("2 of 3 tries reached the end of the track, with a mouse or similar pointer.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("works by keyboard alone without dragging, and in French", async ({ page }) => {
  await open(page, "fr");
  await panel(page).getByRole("button", { name: "Je ne peux pas glisser", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toContainText("Vous avez indiqué ne pas pouvoir glisser ici.");
  await panel(page).getByRole("button", { name: "Trouver les commandes à glisser ou à geste", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#gest-result-h")).toBeFocused();
  await expect(page.locator("#gest-result-h")).toHaveText("Ce qui a été trouvé");
});
