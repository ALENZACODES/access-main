import { expect, test } from "@playwright/test";

test("the report pack exports five files from the keyboard", async ({ page }) => {
  await page.goto("/?lang=en");
  const names: string[] = [];
  page.on("download", (download) => names.push(download.suggestedFilename()));
  const button = page.getByRole("button", { name: "Export report pack" });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("reports-export-status")).toHaveText("Report pack exported as 5 files.");
  await expect.poll(() => names.length).toBe(5);
  expect([...names].sort()).toEqual([
    "advocacy-report-pack-2026-11-15-provenance.csv",
    "advocacy-report-pack-2026-11-15-tables.csv",
    "advocacy-report-pack-2026-11-15.en.md",
    "advocacy-report-pack-2026-11-15.fr.md",
    "advocacy-report-pack-2026-11-15.json",
  ]);
});

test("a wide table scrolls inside its own box at 320 px, and the box takes focus with a visible ring", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/?lang=fr");
  const box = page.getByRole("group", { name: "Stationnement, 2026-10" });
  await box.focus();
  await expect(box).toBeFocused();
  expect(await box.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("suppressed table cells say so in words and no table cell shows 1 to 4", async ({ page }) => {
  await page.goto("/?lang=en");
  const cells = await page.getByTestId("reports-section").getByRole("cell").allTextContents();
  expect(cells.length).toBeGreaterThan(20);
  expect(cells.filter((text) => text === "Suppressed").length).toBeGreaterThanOrEqual(4);
  for (const text of cells) expect(text).toMatch(/^(Suppressed|0|[5-9]|\d{2,})$/);
});
