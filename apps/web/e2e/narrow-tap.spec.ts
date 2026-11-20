import { expect, test } from "@playwright/test";

/**
 * "Button size for my taps" on the built app, at 320 CSS pixels, with real
 * clicks at real positions: on the target for a tap that lands, and on the
 * far side of the area for a tap that misses. A touch screen is emulated
 * for one test, with real taps.
 */

test.use({ viewport: { width: 320, height: 640 } });

const TOTAL = 16;

const open = async (page: import("@playwright/test").Page, language: "en" | "fr" = "en") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto("/dev/narrow");
  await expect(page.locator("#tap-h")).toBeVisible();
};

const tap = (page: import("@playwright/test").Page) => page.locator(".tap");

/** A click on the area as far as it can be from the target, so it cannot land on it. */
async function miss(page: import("@playwright/test").Page) {
  const area = await tap(page).locator(".tap-area").boundingBox();
  const target = await page.locator("#tap-target").boundingBox();
  if (!area || !target) throw new Error("no area or no target");
  const left = target.x + target.width / 2 > area.x + area.width / 2;
  const top = target.y + target.height / 2 > area.y + area.height / 2;
  await page.mouse.click(left ? area.x + 6 : area.x + area.width - 6, top ? area.y + 6 : area.y + area.height - 6);
}

test("each target stays inside the area and the page, at its own size", async ({ page }) => {
  await open(page);
  await tap(page).getByRole("button", { name: "Start the test" }).click();
  for (let i = 0; i < TOTAL; i += 1) {
    const area = await tap(page).locator(".tap-area").boundingBox();
    const target = await page.locator("#tap-target").boundingBox();
    if (!area || !target) throw new Error("no area or no target");
    expect(Math.round(target.width), `target ${i}`).toBeGreaterThanOrEqual(44);
    expect(Math.round(target.width)).toBe(Math.round(target.height));
    expect(target.x).toBeGreaterThanOrEqual(area.x - 0.5);
    expect(target.x + target.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
    expect(target.y).toBeGreaterThanOrEqual(area.y - 0.5);
    expect(target.y + target.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.locator("#tap-target").click();
  }
  await expect(tap(page)).toContainText("every tap landed from 44 CSS pixels up.");
});

test("a click beside the target counts as a miss, and the result never goes below it", async ({ page }) => {
  await open(page);
  await tap(page).getByRole("button", { name: "Start the test" }).click();
  for (let i = 0; i < TOTAL; i += 1) {
    if (i === 9) await miss(page);
    else await page.locator("#tap-target").click();
  }
  await expect(page.locator("#tap-result-h")).toBeFocused();
  await expect(tap(page)).toContainText("On this screen, today, every tap landed from 72 CSS pixels up.");
  await expect(tap(page).getByRole("row", { name: /56 CSS pixels/ })).toContainText("3");
  await expect(tap(page)).toContainText("A browser zoom of 175% brings them to 77 CSS pixels or more.");
  await expect(tap(page)).toContainText("At that zoom the page would have only 182 CSS pixels of width");
  await expect(page.locator("#tap-page-h")).toHaveText("Controls of this page");
});

test("misses at the largest size give UNKNOWN, with no zoom named", async ({ page }) => {
  await open(page);
  await tap(page).getByRole("button", { name: "Start the test" }).click();
  await miss(page);
  for (let i = 1; i < TOTAL; i += 1) await page.locator("#tap-target").click();
  await expect(tap(page)).toContainText("Size UNKNOWN. Taps missed at 96 CSS pixels");
  await expect(tap(page)).toContainText("this test does not say how far to go");
  await expect(page.locator("#tap-page-h")).toHaveCount(0);
});

test("the tap size goes into the barrier text", async ({ page }) => {
  await open(page);
  await tap(page).getByRole("button", { name: "Start the test" }).click();
  for (let i = 0; i < TOTAL; i += 1) {
    if (i === 9) await miss(page);
    else await page.locator("#tap-target").click();
  }
  await page.getByLabel("A button or link is too small or too close to another").check();
  await page.getByLabel("What happened").fill("The close button is too small to press.");
  await page.getByRole("button", { name: "Prepare the text" }).click();
  await expect(page.getByLabel("Your text")).toHaveValue(/\nButton size at which my taps land: 72 CSS pixels\n/);
});

test("can be stopped, and taken again", async ({ page }) => {
  await open(page);
  await tap(page).getByRole("button", { name: "Start the test" }).click();
  await page.locator("#tap-target").click();
  await tap(page).getByRole("button", { name: "Stop the test" }).click();
  await expect(tap(page).locator("[role=status]")).toHaveText("The test was stopped.");
  await expect(tap(page).getByRole("row", { name: /^44 CSS pixels/ })).toContainText("UNKNOWN");
  await tap(page).getByRole("button", { name: "Take the test again" }).click();
  await expect(page.locator("#tap-run-h")).toHaveText(`Target 1 of ${TOTAL}, 96 CSS pixels`);
  await expect(page.locator("#tap-target")).toBeFocused();
});

test("every control of the panel is at least 44 pixels each way", async ({ page }) => {
  await open(page);
  await tap(page).getByRole("button", { name: "Start the test" }).click();
  for (let i = 0; i < TOTAL; i += 1) await page.locator("#tap-target").click();
  const sizes = await tap(page).locator("button").evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { what: (el.textContent ?? "").trim(), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
  }));
  expect(sizes.length).toBeGreaterThanOrEqual(2);
  for (const s of sizes) {
    expect(s.w, s.what).toBeGreaterThanOrEqual(44);
    expect(s.h, s.what).toBeGreaterThanOrEqual(44);
    expect(s.right, s.what).toBeLessThanOrEqual(320);
  }
});

test("works in French", async ({ page }) => {
  await open(page, "fr");
  await tap(page).getByRole("button", { name: "Commencer le test" }).click();
  await expect(page.locator("#tap-run-h")).toHaveText(`Cible 1 sur ${TOTAL}, 96\u00A0pixels CSS`);
  await expect(page.getByRole("button", { name: `Appuyez ici, cible 1 sur ${TOTAL}` })).toBeFocused();
  for (let i = 0; i < TOTAL; i += 1) await page.locator("#tap-target").click();
  await expect(tap(page)).toContainText("tous les appuis ont atteint leur cible à partir de 44\u00A0pixels CSS.");
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 740 } });

  test("real taps land on the targets", async ({ page }) => {
    await open(page);
    await tap(page).getByRole("button", { name: "Start the test" }).tap();
    for (let i = 0; i < TOTAL; i += 1) await page.locator("#tap-target").tap();
    await expect(tap(page)).toContainText("every tap landed from 44 CSS pixels up.");
  });
});
