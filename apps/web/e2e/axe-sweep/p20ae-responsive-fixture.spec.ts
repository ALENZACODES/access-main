import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { auditPageReflow, applySpacingStress, readControlRects } from "./p20ae-browser-reflow.ts";
import { inspectKeyboardReachability, tabThroughControls } from "./p20ae-keyboard-reach.ts";
import { inspectBreakpointSeries } from "./p20ae-breakpoints.ts";

const fixture = `<!doctype html><html lang="en"><head><title>Responsive fixture</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; font:16px/1.5 sans-serif; }
  nav { display:flex; gap:8px; padding:8px; }
  nav a, button { display:inline-flex; min-width:44px; min-height:44px; align-items:center; padding:8px; }
  main { max-width:100%; padding:16px; }
  .grid { display:grid; grid-template-columns:1fr; gap:12px; }
  .card { min-width:0; padding:12px; border:1px solid; }
  :focus-visible { outline:3px solid currentColor; outline-offset:2px; }
  @media (min-width:600px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (min-width:900px) { .grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
</style></head><body><nav aria-label="Primary">
<a href="#one">One</a><a href="#two">Two</a><a href="#three">Three</a></nav>
<main><h1 id="heading" tabindex="-1">Responsive fixture</h1>
<div class="grid"><section class="card" id="one"><h2>First section</h2><p>Readable content that wraps to the available width without forcing the page to scroll sideways.</p><button>Open first</button></section>
<section class="card" id="two"><h2>Second section</h2><p>Second text block with enough words to wrap when the viewport narrows.</p><button>Open second</button></section>
<section class="card" id="three"><h2>Third section</h2><p>Third text block stays in the reading order at each breakpoint.</p><button>Open third</button></section></div></main></body></html>`;

test.describe("P20AE responsive layout fixture", () => {
  for (const width of [320, 360, 414, 600, 768, 900, 1280]) {
    test(`P20AE fixture reflows without horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(fixture);
      const report = await auditPageReflow(page);
      expect(report.overflow).toBe(0);
      expect(report.issues.map((x) => x.code)).not.toContain("main-missing");
      expect(report.issues.map((x) => x.code)).not.toContain("heading-missing");
    });
  }
  test("P20AE fixture retains three columns only at the wide breakpoint", async ({ page }) => {
    await page.setContent(fixture);
    const counts = [];
    for (const width of [320, 600, 900]) {
      await page.setViewportSize({ width, height: 800 });
      counts.push(await page.locator(".grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length));
    }
    expect(counts).toEqual([1, 2, 3]);
  });
  test("P20AE fixture keeps all action targets at least 44 by 44", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.setContent(fixture);
    const targets = await readControlRects(page);
    for (const target of targets.filter((x) => x.visible)) {
      expect(target.width, target.name).toBeGreaterThanOrEqual(44);
      expect(target.height, target.name).toBeGreaterThanOrEqual(44);
    }
  });
  test("P20AE fixture keeps sequential keyboard navigation visible", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.setContent(fixture);
    const report = await inspectKeyboardReachability(page);
    expect(report.positiveTabIndexes).toEqual([]);
    const stops = await tabThroughControls(page, 12);
    expect(stops.length).toBeGreaterThan(4);
    expect(stops.every((stop) => stop.visible)).toBe(true);
  });
  test("P20AE fixture remains axe-clean at the narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.setContent(fixture);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
  test("P20AE fixture accepts text-spacing stress without document overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.setContent(fixture);
    await applySpacingStress(page);
    const report = await auditPageReflow(page);
    expect(report.overflow).toBe(0);
  });
  test("P20AE fixture records correct breakpoint series", () => {
    const rows = [
      { width: 320, mobileNavigationVisible: true, desktopNavigationVisible: false, columns: 1, horizontalOverflow: 0, sidePanelVisible: false, contentVisible: true },
      { width: 768, mobileNavigationVisible: true, desktopNavigationVisible: false, columns: 2, horizontalOverflow: 0, sidePanelVisible: true, contentVisible: true },
      { width: 1280, mobileNavigationVisible: false, desktopNavigationVisible: true, columns: 3, horizontalOverflow: 0, sidePanelVisible: true, contentVisible: true },
    ];
    expect(inspectBreakpointSeries(rows).clean).toBe(true);
  });
});
