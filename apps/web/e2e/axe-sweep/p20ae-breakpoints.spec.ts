import { expect, test } from "@playwright/test";
import { inspectBreakpointSeries } from "./p20ae-breakpoints.ts";

const fixture = `<!doctype html><html lang="en"><head><title>Breakpoint fixture</title>
<style>
body{margin:0;font:16px sans-serif}nav{display:flex;min-height:48px}
.mobile{display:block}.desktop{display:none}.layout{display:grid;grid-template-columns:1fr;gap:12px}
main{padding:16px}.panel{min-width:0;padding:12px;border:1px solid}
button{min-width:44px;min-height:44px}
@media(min-width:600px){.layout{grid-template-columns:repeat(2,minmax(0,1fr))}.panel-side{display:block}}
@media(min-width:768px){.mobile{display:none}.desktop{display:block}}
@media(min-width:900px){.layout{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style></head><body><nav><span class="mobile">Mobile navigation</span><span class="desktop">Desktop navigation</span></nav>
<main><h1>Breakpoint fixture</h1><div class="layout"><section class="panel"><h2>One</h2><p>Content one</p><button>Open one</button></section>
<section class="panel"><h2>Two</h2><p>Content two</p><button>Open two</button></section>
<section class="panel panel-side"><h2>Three</h2><p>Content three</p><button>Open three</button></section></div></main></body></html>`;

test("P20AE responsive breakpoint fixture exposes exactly one navigation at each width", async ({ page }) => {
  const observations = [];
  for (const width of [320, 600, 768, 900, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.setContent(fixture);
    observations.push(await page.evaluate((currentWidth) => ({
      width: currentWidth,
      mobileNavigationVisible: getComputedStyle(document.querySelector(".mobile")!).display !== "none",
      desktopNavigationVisible: getComputedStyle(document.querySelector(".desktop")!).display !== "none",
      columns: getComputedStyle(document.querySelector(".layout")!).gridTemplateColumns.split(" ").length,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      sidePanelVisible: getComputedStyle(document.querySelector(".panel-side")!).display !== "none",
      contentVisible: Boolean(document.querySelector("main h1")?.getClientRects().length),
    }), width));
  }
  const report = inspectBreakpointSeries(observations);
  expect(report.clean, JSON.stringify(report.issues)).toBe(true);
});

test("P20AE breakpoint fixture maintains keyboard reachability in mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.setContent(fixture);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("P20AE breakpoint fixture maintains keyboard reachability in desktop layout", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(fixture);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("P20AE breakpoint fixture has no horizontal overflow after each transition", async ({ page }) => {
  await page.setContent(fixture);
  for (const width of [320, 414, 600, 768, 900, 1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `width ${width}`).toBeLessThanOrEqual(1);
  }
});
