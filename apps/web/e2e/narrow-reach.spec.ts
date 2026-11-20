import { expect, test } from "@playwright/test";

/**
 * "Reaching controls by keyboard or switch" on the built app, at 320 CSS
 * pixels. The counts the panel gives for this page are checked against real
 * Tab presses from the top of the page.
 */

test.use({ viewport: { width: 320, height: 640 } });

type Page = import("@playwright/test").Page;

const open = async (page: Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto("/dev/narrow");
  await expect(page.locator("#reach-h")).toBeVisible();
};

const reach = (page: Page) => page.locator(".reach");

/** Puts the start of Tab navigation back at the top of the page, without reloading it. */
const toTop = (page: Page) =>
  page.evaluate(() => {
    const body = document.body;
    body.setAttribute("tabindex", "-1");
    body.focus();
    body.removeAttribute("tabindex");
  });

test("counts the stops, puts focus on the result, and keeps every control at 44 pixels and inside the page", async ({ page }) => {
  await open(page);
  await reach(page).getByRole("button", { name: "Count the stops on this page" }).click();
  await expect(page.locator("#reach-result-h")).toBeFocused();
  await expect(reach(page).getByRole("status")).toHaveText("The stops were counted.");
  await expect(reach(page)).toContainText(/This page has \d+ keyboard stops\./);
  for (const box of await reach(page).locator("button, input").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("the order given for a control is the number of Tab presses that reach it from the top", async ({ page }) => {
  await open(page);
  await reach(page).getByRole("button", { name: "Count the stops on this page" }).click();
  await reach(page).getByLabel("Part of the name of a control").fill("Start the test");
  await reach(page).getByRole("button", { name: "Show these stops" }).click();
  const row = reach(page).locator("table").last().locator("tbody tr");
  await expect(row).toHaveCount(1);
  const order = Number(await row.locator("td").first().textContent());
  expect(order).toBeGreaterThan(1);
  await toTop(page);
  for (let i = 0; i < order; i += 1) await page.keyboard.press("Tab");
  await expect(page.locator(".tap").getByRole("button", { name: "Start the test" })).toBeFocused();
});

test("gives the scan time once an interval is given, and refuses a wrong one by the field", async ({ page }) => {
  await open(page);
  await reach(page).getByRole("button", { name: "Count the stops on this page" }).click();
  await expect(reach(page).locator("tbody td").last()).toHaveText("UNKNOWN");
  const field = reach(page).getByLabel("Interval of my switch scan, in seconds");
  await field.fill("later");
  await reach(page).getByRole("button", { name: "Show these stops" }).click();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.fill("2");
  await reach(page).getByRole("button", { name: "Show these stops" }).click();
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await expect(reach(page)).toContainText(/with a scan that steps every 2 s\./);
});

test("works by keyboard alone, and in French", async ({ page }) => {
  await open(page, "fr");
  await reach(page).getByRole("button", { name: "Compter les arrêts de cette page" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#reach-result-h")).toBeFocused();
  await expect(page.locator("#reach-result-h")).toHaveText("Ce qui a été compté");
  await reach(page).getByLabel("Intervalle de balayage de mon contacteur, en secondes").fill("1,5");
  await reach(page).getByRole("button", { name: "Afficher ces arrêts" }).focus();
  await page.keyboard.press("Space");
  await expect(reach(page)).toContainText("toutes les 1,5\u00A0s.");
});
