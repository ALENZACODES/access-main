import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { auditPageReflow, applySpacingStress, clearSpacingStress, readControlRects } from "./p20ae-browser-reflow.ts";
import { inspectKeyboardReachability, tabThroughControls } from "./p20ae-keyboard-reach.ts";
import { compareViewportFrames } from "./p20ae-viewport-transition.ts";

async function openNarrow(page: import("@playwright/test").Page, locale: "en" | "fr") {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  if (locale === "fr") {
    await page.getByRole("button", { name: "Français" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  }
  const response = await page.goto("/dev/narrow");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}
test.describe("P20AE responsive reflow on the live narrow-screen route", () => {
  for (const locale of ["en", "fr"] as const) {
    test(`P20AE ${locale}: one main landmark and one visible h1 at 320 CSS pixels`, async ({ page }) => {
      await openNarrow(page, locale);
      const report = await auditPageReflow(page);
      expect(report.viewport.width).toBe(320);
      expect(report.locale).toBe(locale);
      expect(report.issues.map((issue) => issue.code)).not.toContain("main-missing");
      expect(report.issues.map((issue) => issue.code)).not.toContain("heading-missing");
      expect(report.issues.map((issue) => issue.code)).not.toContain("heading-hidden");
    });
    test(`P20AE ${locale}: text spacing stress keeps the document within the viewport`, async ({ page }) => {
      await openNarrow(page, locale);
      await applySpacingStress(page);
      const report = await auditPageReflow(page);
      expect(report.viewport.scrollWidth - report.viewport.clientWidth).toBeLessThanOrEqual(1);
      await clearSpacingStress(page);
      expect(await page.locator("html").getAttribute("data-p20ae-spacing")).toBeNull();
    });
    test(`P20AE ${locale}: keyboard can reach visible controls after reflow`, async ({ page }) => {
      await openNarrow(page, locale);
      const initial = await inspectKeyboardReachability(page);
      expect(initial.positiveTabIndexes).toEqual([]);
      expect(initial.hiddenFocusable).toEqual([]);
      const stops = await tabThroughControls(page, 30);
      expect(stops.length).toBeGreaterThan(5);
      for (const stop of stops) {
        expect(stop.visible, stop.name).toBe(true);
        expect(stop.width, stop.name).toBeGreaterThanOrEqual(44);
        expect(stop.height, stop.name).toBeGreaterThanOrEqual(44);
      }
    });
  }
  for (const width of [320, 360, 390, 414, 600, 768, 1024, 1280]) {
    test(`P20AE page has no document horizontal overflow at ${width} CSS pixels`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/dev/narrow");
      const report = await auditPageReflow(page);
      expect(report.overflow, JSON.stringify(report.issues)).toBe(0);
    });
  }
  test("P20AE portrait to landscape resize is observed without route or language change", async ({ page }) => {
    await openNarrow(page, "en");
    const before = await page.evaluate(() => ({
      route: location.pathname, locale: document.documentElement.lang as "en" | "fr" | "UNKNOWN",
      viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight, scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight, scrollX, scrollY, deviceScaleFactor: devicePixelRatio,
        orientation: (innerWidth > innerHeight ? "landscape" : innerWidth < innerHeight ? "portrait" : "square") as "landscape" | "portrait" | "square",
        rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize) },
      elements: [],
      activeId: document.activeElement instanceof HTMLElement ? document.activeElement.id : null,
      activeVisible: true,
    }));
    await page.setViewportSize({ width: 800, height: 360 });
    const after = await page.evaluate(() => ({
      route: location.pathname, locale: document.documentElement.lang as "en" | "fr" | "UNKNOWN",
      viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight, scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight, scrollX, scrollY, deviceScaleFactor: devicePixelRatio,
        orientation: (innerWidth > innerHeight ? "landscape" : innerWidth < innerHeight ? "portrait" : "square") as "landscape" | "portrait" | "square",
        rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize) },
      elements: [],
      activeId: document.activeElement instanceof HTMLElement ? document.activeElement.id : null,
      activeVisible: true,
    }));
    const report = compareViewportFrames(before, after);
    expect(report.fromOrientation).toBe("portrait");
    expect(report.toOrientation).toBe("landscape");
    expect(report.issues.map((issue) => issue.code)).not.toContain("route-changed");
    expect(report.issues.map((issue) => issue.code)).not.toContain("locale-changed");
  });
  test("P20AE axe scan reports no violations on the 320-pixel English route", async ({ page }) => {
    await openNarrow(page, "en");
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
  test("P20AE axe scan reports no violations on the 320-pixel French route", async ({ page }) => {
    await openNarrow(page, "fr");
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
  test("P20AE target rectangles are measured from the rendered page", async ({ page }) => {
    await openNarrow(page, "en");
    const controls = await readControlRects(page);
    expect(controls.length).toBeGreaterThan(10);
    expect(controls.every((control) => control.width >= 44 && control.height >= 44)).toBe(true);
  });
});
