import { expect, test } from "@playwright/test";
import { narrowRoute } from "./narrow-route.ts";

/**
 * "Compare two colours" on the built app, in a real browser at 320 CSS
 * pixels: typing a pair, the result, using a suggestion, the colour tokens
 * of the App itself, and the sizes of the controls. Short tests, one thing
 * each.
 */

test.use({ viewport: { width: 320, height: 640 } });

const open = async (page: import("@playwright/test").Page, language: "en" | "fr") => {
  await page.goto("/");
  await page.getByRole("button", { name: language === "fr" ? "Français" : "English" }).click();
  await page.goto(narrowRoute());
  await expect(page.locator("#pair-h")).toBeVisible();
};

const compare = async (page: import("@playwright/test").Page, text: string, background: string) => {
  await page.getByLabel("Text colour").fill(text);
  await page.getByLabel("Background colour").fill(background);
  await page.getByRole("button", { name: "Compare the two colours" }).click();
};

test("measures a typed pair and moves focus to the result", async ({ page }) => {
  await open(page, "en");
  await compare(page, "#777777", "white");
  await expect(page.locator("#pair-result-h")).toBeFocused();
  await expect(page.locator(".pair caption")).toHaveText("#777777 on #ffffff: 4.47:1");
  await expect(page.locator(".pair [role=status]")).toHaveText("Contrast is 4.47:1. It is below the 4.5:1 minimum for normal text.");
  await expect(page.getByRole("row", { name: /Large text/ })).toContainText("reaches it");
});

test("the browser agrees with the suggestion: the swatch is the colour named next to it", async ({ page }) => {
  await open(page, "en");
  await compare(page, "#777777", "#ffffff");
  const item = page.locator(".pair li", { hasText: "Darker text" });
  await expect(item).toContainText("#767676 gives 4.54:1.");
  const painted = await item.locator(".pair-swatch").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(painted).toBe("rgb(118, 118, 118)");
});

test("using a suggestion fills the field and the pair then reaches the minimum", async ({ page }) => {
  await open(page, "en");
  await compare(page, "#777777", "#ffffff");
  await page.getByRole("button", { name: "Use #767676 for the text" }).click();
  await expect(page.getByLabel("Text colour")).toHaveValue("#767676");
  await expect(page.locator(".pair [role=status]")).toHaveText("Contrast is 4.54:1. It reaches the 4.5:1 minimum for normal text.");
  await expect(page.locator("#pair-suggest-h")).toHaveCount(0);
  await expect(page.locator("#pair-result-h")).toBeFocused();
});

test("refuses what is not a colour, by the field, with focus on it", async ({ page }) => {
  await open(page, "en");
  await compare(page, "#000", "sky");
  const background = page.getByLabel("Background colour");
  await expect(background).toBeFocused();
  await expect(background).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#pair-background-error")).toContainText("“sky” was not read as a colour.");
  await expect(page.locator("#pair-result-h")).toHaveCount(0);
});

test("says UNKNOWN for a background with transparency", async ({ page }) => {
  await open(page, "en");
  await compare(page, "#000", "rgb(255 255 255 / 50%)");
  await expect(page.locator(".pair [role=status]")).toContainText("Contrast UNKNOWN.");
  await expect(page.locator(".pair table")).toHaveCount(0);
});

test("reads the colour tokens of the App and measures the named pairs", async ({ page }) => {
  await open(page, "en");
  await page.getByRole("button", { name: "Read the colour tokens of this page" }).click();
  await expect(page.locator("#pair-tokens-h")).toBeFocused();
  const section = page.locator('[aria-labelledby="pair-tokens-h"]');
  await expect(section.locator("h4").first()).toBeVisible();
  await expect(section).toContainText(/\d+ colour tokens? read, \d+ pairs? measured from the names\./);
  await expect(section.locator("li", { hasText: "--header-ink on --header" }).first()).toContainText(/: \d+\.\d\d:1, /);
});

test("does not scroll sideways at 320 pixels, and every control is at least 44 pixels each way", async ({ page }) => {
  await open(page, "en");
  await compare(page, "#7a7a7a", "#777777");
  await page.getByRole("button", { name: "Read the colour tokens of this page" }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const sizes = await page.locator(".pair button, .pair input").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { what: ((el as HTMLElement).textContent || el.id).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    }),
  );
  expect(sizes.length).toBeGreaterThanOrEqual(8);
  for (const s of sizes) {
    expect(s.h, s.what).toBeGreaterThanOrEqual(44);
    expect(s.w, s.what).toBeGreaterThanOrEqual(44);
    expect(s.right, s.what).toBeLessThanOrEqual(320);
  }
});

test("keeps the typed colours when the audit runs", async ({ page }) => {
  await open(page, "en");
  await page.getByLabel("Text colour").fill("#123456");
  await page.getByLabel("Background colour").fill("#fedcba");
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByRole("button", { name: "Copy report (JSON)" })).toBeVisible();
  await expect(page.getByLabel("Text colour")).toHaveValue("#123456");
  await expect(page.getByLabel("Background colour")).toHaveValue("#fedcba");
});

test("works in French, and with the keyboard alone", async ({ page }) => {
  await open(page, "fr");
  await expect(page.locator("#pair-h")).toHaveText("Comparer deux couleurs");
  await page.getByLabel("Couleur du texte").focus();
  await page.keyboard.type("#777777");
  await page.keyboard.press("Tab");
  await page.keyboard.type("blanc");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Comparer les deux couleurs" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Couleur d’arrière-plan")).toBeFocused();
  await expect(page.locator("#pair-background-error")).toContainText("n’a pas été lu comme une couleur");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("white");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pair caption")).toHaveText("#777777 sur #ffffff\u00A0: 4,47\u00A0:\u00A01");
  await expect(page.getByRole("button", { name: "Utiliser #767676 pour le texte" })).toBeVisible();
});
