import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, overflow, setViewport, box } from "./visual-harness";

async function pageAt(page: import("@playwright/test").Page, width: number, markup: string): Promise<void> {
  await fixture(page,markup);
  await setViewport(page,width,800);
}
test.describe("P16 round 16 reflow at narrow viewports",()=>{
  test("single column content fits 320 CSS pixels",async({page})=>{
    await pageAt(page,320,`<article><h2>Details</h2><p>Readable content with enough words to occupy several lines at a narrow viewport.</p><button>Continue</button></article>`);
    await expectNoHorizontalOverflow(page);
  });
  test("single column content fits 360 CSS pixels",async({page})=>{
    await pageAt(page,360,`<article><h2>Details</h2><p>Readable content with enough words to occupy several lines at a narrow viewport.</p><button>Continue</button></article>`);
    await expectNoHorizontalOverflow(page);
  });
  test("single column content fits 400 CSS pixels",async({page})=>{
    await pageAt(page,400,`<article><h2>Details</h2><p>Readable content with enough words to occupy several lines at a narrow viewport.</p><button>Continue</button></article>`);
    await expectNoHorizontalOverflow(page);
  });
  test("flex controls wrap rather than overflow",async({page})=>{
    await pageAt(page,320,`<div class="row"><button>Previous</button><button>Continue</button><button>Save draft</button></div>`);
    await expectNoHorizontalOverflow(page);
    const a=await box(page,"button:nth-of-type(1)"),b=await box(page,"button:nth-of-type(2)");
    expect(b.y).toBeGreaterThanOrEqual(a.y);
  });
  test("long unbroken identifier wraps in a content region",async({page})=>{
    await pageAt(page,320,`<p style="overflow-wrap:anywhere">route_identifier_with_a_very_long_unbroken_value_that_must_wrap_without_creating_page_overflow</p>`);
    await expectNoHorizontalOverflow(page);
  });
  test("long URL wraps without expanding the viewport",async({page})=>{
    await pageAt(page,320,`<p style="overflow-wrap:anywhere">https://example.org/a/very/long/path/with/many/segments/that/must/remain/readable</p>`);
    await expectNoHorizontalOverflow(page);
  });
  test("wide image scales to its container",async({page})=>{
    await pageAt(page,320,`<img id="image" alt="Illustration" width="1200" height="600" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='600'%3E%3Crect width='1200' height='600' fill='gray'/%3E%3C/svg%3E">`);
    await expectNoHorizontalOverflow(page);
    expect((await box(page,"#image")).width).toBeLessThanOrEqual(288);
  });
  test("wide SVG scales to its container",async({page})=>{
    await pageAt(page,320,`<svg id="graphic" viewBox="0 0 1200 600" width="1200" height="600" role="img" aria-label="Graphic"><rect width="1200" height="600"/></svg>`);
    await expectNoHorizontalOverflow(page);
    expect((await box(page,"#graphic")).width).toBeLessThanOrEqual(288);
  });
  test("wide table is contained in an explicit scroll region",async({page})=>{
    await pageAt(page,320,`<div id="table-scroll" role="region" aria-label="Schedule table" tabindex="0" style="max-width:100%;overflow:auto"><table style="min-width:640px"><tr><th>Day</th><th>Morning</th><th>Afternoon</th></tr><tr><td>Monday</td><td>Session</td><td>Session</td></tr></table></div>`);
    await expectNoHorizontalOverflow(page);
    expect((await overflow(page,"#table-scroll")).horizontal).toBe(true);
    await expect(page.locator("#table-scroll")).toHaveAttribute("tabindex","0");
  });
  test("code block scrolls locally rather than across the page",async({page})=>{
    await pageAt(page,320,`<pre id="code" tabindex="0" style="max-width:100%;overflow:auto"><code>const veryLongIdentifier = "this line is wider than a phone viewport";</code></pre>`);
    await expectNoHorizontalOverflow(page);
    expect((await overflow(page,"#code")).horizontal).toBe(true);
  });
  test("two-column grid becomes one column at narrow width",async({page})=>{
    await pageAt(page,320,`<div id="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px"><section class="card">One</section><section class="card">Two</section></div>`);
    await expectNoHorizontalOverflow(page);
    const first=await box(page,".card:nth-child(1)"),second=await box(page,".card:nth-child(2)");
    expect(second.y).toBeGreaterThan(first.y);
  });
  test("two-column grid may remain two columns on desktop",async({page})=>{
    await pageAt(page,1280,`<div id="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px"><section class="card">One</section><section class="card">Two</section></div>`);
    const first=await box(page,".card:nth-child(1)"),second=await box(page,".card:nth-child(2)");
    expect(second.x).toBeGreaterThan(first.x);
  });
  test("form controls remain inside narrow viewport",async({page})=>{
    await pageAt(page,320,`<form><label for="name">Name</label><input id="name" style="width:100%"><label for="notes">Notes</label><textarea id="notes" style="width:100%"></textarea><button>Save</button></form>`);
    await expectNoHorizontalOverflow(page);
  });
  test("navigation links wrap on narrow viewport",async({page})=>{
    await pageAt(page,320,`<nav aria-label="Sections" class="row"><a href="#one">Overview</a><a href="#two">Accessibility settings</a><a href="#three">Contact details</a></nav>`);
    await expectNoHorizontalOverflow(page);
  });
  test("large heading wraps rather than clips",async({page})=>{
    await pageAt(page,320,`<h2 style="font-size:2.5rem;overflow-wrap:anywhere">A long heading that should wrap across lines</h2>`);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator("h2")).toBeVisible();
  });
  test("button label wraps without increasing page width",async({page})=>{
    await pageAt(page,320,`<button style="white-space:normal;max-width:100%">Continue to the next step in the process</button>`);
    await expectNoHorizontalOverflow(page);
  });
  test("horizontal padding remains inside viewport",async({page})=>{
    await pageAt(page,320,`<section style="padding-inline:clamp(8px,4vw,24px)"><p>Text remains within the content column.</p></section>`);
    await expectNoHorizontalOverflow(page);
  });
  test("fixed footer does not force page horizontal scroll",async({page})=>{
    await pageAt(page,320,`<footer style="position:fixed;left:0;right:0;bottom:0;padding:8px;background:white"><button>Continue</button></footer>`);
    await expectNoHorizontalOverflow(page);
  });
  test("reflow remains stable at 375 pixels",async({page})=>{
    await pageAt(page,375,`<div class="row"><article class="card">One</article><article class="card">Two</article><article class="card">Three</article></div>`);
    await expectNoHorizontalOverflow(page);
  });
  test("reflow remains stable at 768 pixels",async({page})=>{
    await pageAt(page,768,`<div class="row"><article class="card">One</article><article class="card">Two</article><article class="card">Three</article></div>`);
    await expectNoHorizontalOverflow(page);
  });
  test("reflow remains stable at 1024 pixels",async({page})=>{
    await pageAt(page,1024,`<div class="row"><article class="card">One</article><article class="card">Two</article><article class="card">Three</article></div>`);
    await expectNoHorizontalOverflow(page);
  });
  test("document width does not exceed viewport after repeated resizing",async({page})=>{
    await fixture(page,`<div class="row"><button>One</button><button>Two</button><button>Three</button></div>`);
    for(const width of [320,360,400,768,1280,320]){await setViewport(page,width,800);await expectNoHorizontalOverflow(page);}
  });
  test("landscape phone width remains free of horizontal overflow",async({page})=>{
    await pageAt(page,568,`<p>Landscape content remains within the viewport.</p>`);
    await expectNoHorizontalOverflow(page);
  });
  test("short viewport can scroll vertically to content",async({page})=>{
    await pageAt(page,320,`<div style="height:1400px"></div><button id="end">End action</button>`);
    await page.locator("#end").scrollIntoViewIfNeeded();
    await expect(page.locator("#end")).toBeInViewport();
  });
});
