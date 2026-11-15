import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

interface AxeResults {
  violations: Array<{ id: string; nodes: Array<{ target: unknown }> }>;
}

async function runAxe(page: Page): Promise<AxeResults> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<AxeResults> } }).axe;
    return axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
  });
}

for (const lang of ["en", "fr"] as const) {
  for (const width of [1280, 320]) {
    test(`axe finds 0 violations in ${lang} at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?lang=${lang}`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await runAxe(page);
      expect(results.violations).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("buttons are at least 44 by 44 px and show a visible focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/?lang=en");
  for (const button of await page.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe("none");
});

test("the export action works from the keyboard and announces the file", async ({ page }) => {
  await page.goto("/?lang=en");
  const button = page.getByRole("button", { name: "Export pack" });
  await button.focus();
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(download.suggestedFilename()).toBe("advocacy-evidence-pack-2026-11-15.json");
  await expect(page.getByRole("status")).toContainText("advocacy-evidence-pack-2026-11-15.json");
});

test("suppressed cells say so and show no count", async ({ page }) => {
  await page.goto("/?lang=en");
  const section = page.getByTestId("suppressed-section");
  await expect(section.getByText("Suppressed. Count withheld.")).toHaveCount(5);
  await expect(section.getByText("Count", { exact: true })).toHaveCount(0);
});
