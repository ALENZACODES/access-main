import { expect, test } from "@playwright/test";

/**
 * "Screen zones I can reach" on the built app, at 320 by 640 CSS pixels.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto("/dev/narrow");
  await expect(page.locator("#zones-h")).toBeVisible();
};

const zones = (page: Page) => page.locator(".zones");

test("the grid has 12 toggle buttons of at least 44 pixels, laid out in 3 columns, inside the page", async ({ page }) => {
  await open(page);
  const buttons = zones(page).locator(".zones-grid button");
  await expect(buttons).toHaveCount(12);
  const boxes = await buttons.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: r.width, h: r.height })));
  for (const box of boxes) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(new Set(boxes.map((b) => b.x)).size).toBe(3);
  expect(new Set(boxes.map((b) => b.y)).size).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("asks for a zone first, then lists controls out of reach, and none once every zone is marked", async ({ page }) => {
  await open(page);
  await zones(page).getByRole("button", { name: "Find the controls out of reach", exact: true }).click();
  await expect(zones(page).getByRole("button", { name: "Top, left", exact: true })).toBeFocused();
  await expect(zones(page).locator("#zones-error")).toHaveText("Mark at least one zone you can reach first.");
  const bottomRight = zones(page).getByRole("button", { name: "Bottom, right", exact: true });
  await bottomRight.click();
  await expect(bottomRight).toHaveAttribute("aria-pressed", "true");
  await expect(zones(page).locator("#zones-error")).toHaveCount(0);
  await zones(page).getByRole("button", { name: "Find the controls out of reach", exact: true }).click();
  await expect(page.locator("#zones-result-h")).toBeFocused();
  await expect(zones(page)).toContainText(/You marked 1 of 12 zones\. Counted for this window, 320 by 640 CSS pixels\./);
  await expect(zones(page).locator("#zones-out-h")).toHaveText("Controls out of reach");
  const counts = zones(page).locator("table.zones-counts");
  await expect(counts.locator("caption")).toHaveText("Controls each zone can take, by scrolling if needed");
  await expect(counts.locator("tbody td")).toHaveCount(12);
  await expect(counts.locator("tbody td").last()).toHaveText(/^\d+ \(marked\)$/);
  await expect(zones(page)).toContainText(/can take the most controls: .+, with \d+ of \d+\./);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await zones(page).getByRole("button", { name: "Mark every zone", exact: true }).click();
  await expect(zones(page)).toContainText(/All \d+ controls of this page can be brought into a zone you marked, by scrolling if needed\./);
  await expect(zones(page).locator("#zones-out-h")).toHaveCount(0);
});

test("works by keyboard alone, and in French", async ({ page }) => {
  await open(page, "fr");
  await zones(page).getByRole("button", { name: "Bas, gauche", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(zones(page).getByRole("button", { name: "Bas, gauche", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(zones(page).getByRole("button", { name: "Bas, gauche", exact: true })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(zones(page).getByRole("button", { name: "Bas, gauche", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await zones(page).getByRole("button", { name: "Trouver les commandes hors d’atteinte", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#zones-result-h")).toBeFocused();
  await expect(page.locator("#zones-result-h")).toHaveText("Ce qui a été trouvé");
});

test("the marked zones go into the barrier text of the fit panel", async ({ page }) => {
  await open(page);
  await zones(page).getByRole("button", { name: "Bottom, left", exact: true }).click();
  await zones(page).getByRole("button", { name: "Bottom, centre", exact: true }).click();
  await page.locator("#fit-kind-too-small").check();
  await page.locator("#fit-what").fill("The menu is at the top right.");
  await page.locator('[data-action="fit-make"]').click();
  await expect(page.locator("#fit-text")).toHaveValue(/Screen zones I can reach: Bottom, left; Bottom, centre \(2 of 12\)\./);
});

test("marks the bottom half in one press, in place of the zones marked before", async ({ page }) => {
  await open(page);
  await zones(page).getByRole("button", { name: "Top, left", exact: true }).click();
  const preset = zones(page).getByRole("group", { name: /Or mark a set of zones in one press/ }).getByRole("button", { name: "Bottom half", exact: true });
  await preset.click();
  await expect(preset).toBeFocused();
  const pressed = await zones(page).locator(".zones-grid button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")));
  expect(pressed).toEqual(["false", "false", "false", "false", "false", "false", "true", "true", "true", "true", "true", "true"]);
});
