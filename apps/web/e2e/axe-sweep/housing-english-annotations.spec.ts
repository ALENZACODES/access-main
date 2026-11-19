import { expect, test } from "@playwright/test";
import { chooseLanguage, VIEWPORTS } from "../a11y-input/helpers";

/**
 * The host marks upstream English-only sentences instead of presenting them
 * as French to assistive technology. Every visible copy remains unchanged.
 */
for (const viewport of VIEWPORTS) {
  test(`housing bilingual sentence language at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);
    await chooseLanguage(page, "fr");
    await page.goto("/more/housing", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const sentences = page.locator(".hub-tool p").filter({
      hasText: /of \d+ fields in this record are recorded; the rest are Unknown\.|Optional\. Fixed choices only:/,
    });
    await expect.poll(() => sentences.count()).toBeGreaterThan(0);
    const count = await sentences.count();
    for (let i = 0; i < count; i += 1) {
      const sentence = sentences.nth(i);
      await expect(sentence).toHaveAttribute("lang", "en");
    }
    // Filtering replaces result paragraphs: new copies need the same mark.
    const depthKind = page.locator("#depth-kind");
    await expect(depthKind).toBeVisible();
    await depthKind.selectOption("overnight");
    const remaining = page.locator(".hub-tool p").filter({
      hasText: /of \d+ fields in this record are recorded; the rest are Unknown\.|Optional\. Fixed choices only:/,
    });
    await expect.poll(() => remaining.count()).toBeGreaterThan(0);
    for (let i = 0; i < await remaining.count(); i += 1) {
      await expect(remaining.nth(i)).toHaveAttribute("lang", "en");
    }
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
}
