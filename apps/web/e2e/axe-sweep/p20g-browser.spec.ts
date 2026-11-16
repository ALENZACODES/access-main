import { expect, test, type Page } from "@playwright/test";
import {
  controlFindings, detailFindings, fieldFindings, landmarkFindings, linkFindings,
  liveRegionFindings, report,
  type Context,
} from "./p20g-contracts";
import {
  discoverDetailLink, exerciseNavigation, exerciseSearch, inspectControls,
  inspectDetail, inspectFields, inspectLandmarks, inspectLinks,
  inspectLiveRegions, inspectSearchState, probeFocus,
} from "./p20g-browser";

const ctx: Context = { route: "/finders", language: "en", viewport: 320 };

async function fixture(page: Page, inner: string, language = "en"): Promise<void> {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("http://p20g.test/**", (route) => route.fulfill({ status: 200, body: "Fixture" }));
  await page.goto("http://p20g.test/");
  await page.setContent(`<!doctype html><html lang="${language}">
    <head><title>Fixture</title><style>
      *{box-sizing:border-box}body{margin:0;font-family:sans-serif}
      main{padding:1rem}a,button,input,select{font:inherit}
      .target{min-width:44px;min-height:44px;display:inline-flex;align-items:center}
      .radio-option,.check-option{display:flex;align-items:center;min-height:48px}
      .radio-option input,.check-option input{width:24px;height:24px}
      .wide{width:48px;height:48px}
    </style></head><body>
    <a class="target" href="#main">Skip to main</a>
    <header><nav aria-label="Primary"><a class="target" href="#main">Home</a></nav></header>
    <main id="main"><h1>Fixture</h1>${inner}</main>
    </body></html>`);
}

function codes(items: readonly { rule: string }[]): string[] {
  return items.map((item) => item.rule);
}

test.describe("P20G browser target geometry", () => {
  test("native text field uses the actual 48px rectangle", async ({ page }) => {
    await fixture(page, `<label for="finder">Find a place</label>
      <input id="finder" class="wide" aria-label="Find a place" />`);
    const controls = await inspectControls(page);
    const input = controls.find((item) => item.tag === "input");
    expect(input?.width).toBe(48);
    expect(input?.height).toBe(48);
    expect(controlFindings(controls, ctx)).toEqual([]);
  });

  test("React Aria radio hit surface is measured rather than its child input", async ({ page }) => {
    await fixture(page, `<div class="radio-option" role="radio" aria-label="Washroom"
        tabindex="0" aria-checked="true"><input type="radio" aria-label="Washroom" />Washroom</div>`);
    const controls = await inspectControls(page);
    const input = controls.find((item) => item.tag === "input");
    expect(input?.boundingSource).toBe("label");
    expect(input?.height).toBeGreaterThanOrEqual(48);
    expect(input?.sourceIsInteractive).toBe(true);
    expect(controlFindings(controls, ctx), report(controlFindings(controls, ctx))).toEqual([]);
  });

  test("clickable wrapping label expands checkbox target", async ({ page }) => {
    await fixture(page, `<label class="check-option">
      <input type="checkbox" aria-label="Keep choice" /><span>Keep choice</span></label>`);
    const controls = await inspectControls(page);
    const input = controls.find((item) => item.tag === "input");
    expect(input?.boundingSource).toBe("label");
    expect(input?.height).toBeGreaterThanOrEqual(48);
  });

  test("a small unwrapped checkbox cannot borrow arbitrary container size", async ({ page }) => {
    await fixture(page, `<div style="min-height:80px"><input type="checkbox" aria-label="Small" style="width:24px;height:24px" /></div>`);
    const input = (await inspectControls(page)).find((item) => item.tag === "input");
    expect(input?.boundingSource).toBe("self");
    expect(input?.height).toBe(24);
    expect(codes(controlFindings([input!], ctx))).toContain("control-44");
  });

  test("small inline links remain violations", async ({ page }) => {
    await fixture(page, `<p>Read <a href="#main" style="font-size:12px;line-height:16px">more</a> later.</p>`);
    const links = await inspectLinks(page);
    const inline = links.find((item) => item.text === "more");
    expect(inline).toBeDefined();
    expect(codes(linkFindings([inline!], ctx, "http://localhost"))).toContain("link-44");
  });

  test("large inline link passes without a special exception", async ({ page }) => {
    await fixture(page, `<p>Read <a href="#main" class="target">details</a> later.</p>`);
    const inline = (await inspectLinks(page)).find((item) => item.text === "details");
    expect(inline?.height).toBeGreaterThanOrEqual(44);
    expect(linkFindings([inline!], ctx, "http://localhost")).toEqual([]);
  });

  test("hidden controls are marked nonvisible", async ({ page }) => {
    await fixture(page, `<button style="display:none">Hidden</button>
      <button class="target" type="button">Visible</button>`);
    const controls = await inspectControls(page);
    expect(controls.find((item) => item.name === "Hidden")?.visible).toBe(false);
    expect(controls.find((item) => item.name === "Visible")?.visible).toBe(true);
  });

  test("aria-hidden ancestor makes controls invisible to the gate", async ({ page }) => {
    await fixture(page, `<div aria-hidden="true"><button class="target">Hidden</button></div>`);
    const item = (await inspectControls(page)).find((value) => value.name === "Hidden");
    expect(item?.visible).toBe(false);
  });

  test("offscreen elements are represented with viewport status", async ({ page }) => {
    await fixture(page, `<button class="target" style="position:absolute;top:2000px">Below</button>`);
    const item = (await inspectControls(page)).find((value) => value.name === "Below");
    expect(item?.inViewport).toBe(false);
  });

  test("subpixel target geometry is not rounded into passing", async ({ page }) => {
    await fixture(page, `<button style="width:43.5px;height:43.5px">Small</button>`);
    const item = (await inspectControls(page)).find((value) => value.name === "Small");
    expect(item?.width).toBeLessThan(44);
    expect(codes(controlFindings([item!], ctx))).toContain("control-44");
  });

  test("links and buttons are independently measured", async ({ page }) => {
    await fixture(page, `<button class="target">Open</button><a class="target" href="#main">Back</a>`);
    const controls = await inspectControls(page);
    expect(controls.some((item) => item.tag === "button")).toBe(true);
    expect(controls.some((item) => item.tag === "a")).toBe(true);
    expect(controlFindings(controls, ctx)).toEqual([]);
  });
});

test.describe("P20G browser field associations", () => {
  test("visible label is included in computed fallback name", async ({ page }) => {
    await fixture(page, `<label for="search">Search for services</label>
      <input id="search" class="wide" />`);
    const item = (await inspectFields(page)).find((candidate) => candidate.id === "search");
    expect(item?.label).toBe("Search for services");
    expect(item?.accessibleName).toContain("Search for services");
    expect(fieldFindings([item!], ctx)).toEqual([]);
  });

  test("aria-labelledby resolves to visible explanatory text", async ({ page }) => {
    await fixture(page, `<span id="name">Enter a name</span><input id="search" class="wide" aria-labelledby="name" />`);
    const item = (await inspectFields(page)).find((candidate) => candidate.id === "search");
    expect(item?.accessibleName).toBe("Enter a name");
  });

  test("missing aria-describedby reference fails", async ({ page }) => {
    await fixture(page, `<label for="search">Search</label>
      <input id="search" class="wide" aria-describedby="missing-note" />`);
    const item = (await inspectFields(page)).find((candidate) => candidate.id === "search");
    expect(item?.brokenDescriptions).toEqual(["missing-note"]);
    expect(codes(fieldFindings([item!], ctx))).toContain("field-description");
  });

  test("existing aria-describedby reference passes", async ({ page }) => {
    await fixture(page, `<p id="note">Use a place name</p><label for="search">Search</label>
      <input id="search" class="wide" aria-describedby="note" />`);
    const item = (await inspectFields(page)).find((candidate) => candidate.id === "search");
    expect(item?.brokenDescriptions).toEqual([]);
    expect(fieldFindings([item!], ctx)).toEqual([]);
  });

  test("placeholder alone never supplies the accessible label", async ({ page }) => {
    await fixture(page, `<input id="search" class="wide" placeholder="Search" />`);
    const item = (await inspectFields(page)).find((candidate) => candidate.id === "search");
    expect(item?.accessibleName).toBe("");
    expect(codes(fieldFindings([item!], ctx))).toContain("field-placeholder");
  });

  test("required flag is taken from the DOM", async ({ page }) => {
    await fixture(page, `<label for="search">Search</label><input id="search" class="wide" required />`);
    const item = (await inspectFields(page)).find((candidate) => candidate.id === "search");
    expect(item?.required).toBe(true);
  });

  test("aria-invalid without an associated error is caught", async ({ page }) => {
    await fixture(page, `<label for="search">Search</label><input id="search" class="wide" aria-invalid="true" />`);
    const item = (await inspectFields(page)).find((candidate) => candidate.id === "search");
    expect(item?.invalid).toBe(true);
    expect(codes(fieldFindings([item!], ctx))).toContain("field-error-association");
  });

  test("aria-errormessage records the error association", async ({ page }) => {
    await fixture(page, `<label for="search">Search</label><input id="search" class="wide"
      aria-invalid="true" aria-errormessage="problem" /><p id="problem">Enter a value</p>`);
    const item = (await inspectFields(page)).find((candidate) => candidate.id === "search");
    expect(item?.errorIds).toContain("problem");
    expect(fieldFindings([item!], ctx)).toEqual([]);
  });
});

test.describe("P20G document and region probes", () => {
  test("one main and one H1 are captured", async ({ page }) => {
    await fixture(page, `<p>Content is available.</p>`);
    const document = await inspectLandmarks(page);
    expect(document.mainCount).toBe(1);
    expect(document.h1).toEqual(["Fixture"]);
    expect(landmarkFindings(document, ctx)).toEqual([]);
  });

  test("French document language is captured, not inferred from pathname", async ({ page }) => {
    await fixture(page, `<p>Contenu.</p>`, "fr");
    const document = await inspectLandmarks(page);
    expect(document.documentLanguage).toBe("fr");
    expect(landmarkFindings(document, { ...ctx, language: "fr" })).toEqual([]);
  });

  test("duplicate visible main regions fail", async ({ page }) => {
    await fixture(page, `<main><h2>Nested content</h2></main>`);
    const document = await inspectLandmarks(page);
    expect(document.mainCount).toBe(2);
    expect(codes(landmarkFindings(document, ctx))).toContain("main-count");
  });

  test("duplicate visible top-level headings fail", async ({ page }) => {
    await fixture(page, `<h1>Another heading</h1>`);
    const document = await inspectLandmarks(page);
    expect(document.h1).toHaveLength(2);
    expect(codes(landmarkFindings(document, ctx))).toContain("h1-count");
  });

  test("missing skip target is reported", async ({ page }) => {
    await fixture(page, `<p>Content</p>`);
    await page.locator("#main").evaluate((element) => element.removeAttribute("id"));
    const document = await inspectLandmarks(page);
    expect(codes(landmarkFindings(document, ctx))).toContain("skip-destination");
  });

  test("reflow detects an overflowing fixed-width child", async ({ page }) => {
    await fixture(page, `<div style="width:1000px;height:10px">Oversized</div>`);
    const document = await inspectLandmarks(page);
    expect(document.horizontalOverflow).toBeGreaterThan(1);
    expect(codes(landmarkFindings(document, ctx))).toContain("reflow");
  });

  test("a polite status element is captured", async ({ page }) => {
    await fixture(page, `<p role="status" aria-live="polite" id="results">No results</p>`);
    const regions = await inspectLiveRegions(page);
    const region = regions.find((item) => item.id === "results");
    expect(region?.live).toBe("polite");
    expect(liveRegionFindings(regions, ctx)).toEqual([]);
  });

  test("status forced to aria-live off fails", async ({ page }) => {
    await fixture(page, `<p role="status" aria-live="off">No results</p>`);
    expect(codes(liveRegionFindings(await inspectLiveRegions(page), ctx))).toContain("live-muted");
  });

  test("busy alert is reported", async ({ page }) => {
    await fixture(page, `<p role="alert" aria-busy="true">Updating</p>`);
    expect(codes(liveRegionFindings(await inspectLiveRegions(page), ctx))).toContain("live-busy-alert");
  });

  test("keyboard Tab and reverse Tab return to the same element", async ({ page }) => {
    await fixture(page, `<button class="target">Save</button><a href="#main" class="target">Continue</a>`);
    const focus = await probeFocus(page, 12);
    expect(focus.firstTab).toBeTruthy();
    expect(focus.secondTab).toBeTruthy();
    expect(focus.returnedTab).toBe(focus.firstTab);
  });
});

test.describe("P20G routes and search interactions", () => {
  test("does not manufacture a place identifier when no link exists", async ({ page }) => {
    await fixture(page, `<p>No listing available</p>`);
    expect(await discoverDetailLink(page, "places")).toBeNull();
  });

  test("discovers a real places detail link", async ({ page }) => {
    await fixture(page, `<a href="/places/item-7" class="target">Open place</a>`);
    expect(await discoverDetailLink(page, "places")).toBe("/places/item-7");
  });

  test("discovers a real help article link", async ({ page }) => {
    await fixture(page, `<a href="/help/article-7" class="target">Read article</a>`);
    expect(await discoverDetailLink(page, "help")).toBe("/help/article-7");
  });

  test("ignores off-origin place identifiers", async ({ page }) => {
    await fixture(page, `<a href="https://example.invalid/places/item-7" class="target">External</a>`);
    expect(await discoverDetailLink(page, "places")).toBeNull();
  });

  test("help articles cannot substitute for place records", async ({ page }) => {
    await fixture(page, `<a href="/help/article-7" class="target">Article</a>`);
    expect(await discoverDetailLink(page, "places")).toBeNull();
  });

  test("detail view identifies a visible record from document structure", async ({ page }) => {
    await fixture(page, `<article><h2>Details</h2><dl><dt>Access</dt><dd>Unknown</dd></dl></article>`);
    await page.evaluate(() => window.history.replaceState({}, "", "/places/item-7"));
    const detail = await inspectDetail(page, "places", true);
    expect(detail.requestedId).toBe("item-7");
    expect(detail.visibleRecord).toBe(true);
    expect(detailFindings(detail, "places", ctx)).toEqual([]);
  });

  test("an article detail view is not treated as an empty place", async ({ page }) => {
    await fixture(page, `<article><h2>Instructions</h2><p>Use the keyboard.</p></article>`);
    await page.evaluate(() => window.history.replaceState({}, "", "/help/article-7"));
    const detail = await inspectDetail(page, "help", true);
    expect(detail.requestedId).toBe("article-7");
    expect(detail.visibleRecord).toBe(true);
    expect(detailFindings(detail, "help", ctx)).toEqual([]);
  });

  test("a blank detail page cannot pass as real content", async ({ page }) => {
    await fixture(page, `<p></p>`);
    await page.evaluate(() => window.history.replaceState({}, "", "/places/item-7"));
    const detail = await inspectDetail(page, "places", true);
    expect(detail.visibleRecord).toBe(false);
    expect(codes(detailFindings(detail, "places", ctx))).toContain("detail-no-record");
  });

  test("an enabled search input is detected", async ({ page }) => {
    await fixture(page, `<form><label for="query">Search</label><input id="query" class="wide" />
      <button class="target" type="submit">Go</button></form><p role="status">Ready</p>`);
    expect((await inspectSearchState(page)).enabled).toBe(true);
  });

  test("a disabled form is not falsely treated as operational", async ({ page }) => {
    await fixture(page, `<form><label for="query">Search</label><input id="query" class="wide" disabled />
      <button class="target" type="submit" disabled>Go</button></form><p role="status">Unavailable</p>`);
    expect((await inspectSearchState(page)).enabled).toBe(false);
  });

  test("enter submits an actual form in the browser", async ({ page }) => {
    await fixture(page, `<form id="find"><label for="query">Search</label><input id="query" class="wide" />
      <button class="target" type="submit">Go</button></form><p role="status">Ready</p>`);
    await page.evaluate(() => {
      const form = document.getElementById("find");
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        const status = document.querySelector("[role=status]");
        if (status) status.textContent = "No results";
      });
    });
    const result = await exerciseSearch(page);
    expect(result.submitted).toBe(true);
    expect(result.query).toBe("access");
    expect(result.statusAfter).toBe("No results");
  });

  test("navigation round-trip observes actual browser history", async ({ page }) => {
    // The test hosts the route transition inside the document with History API.
    await fixture(page, `<a href="#secondary" class="target" id="next">Next</a><h2 id="secondary">Details</h2>`);
    await page.locator("#next").evaluate((element) => element.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.pushState({}, "", "/places/item-7");
      document.title = "Item";
      const title = document.querySelector("main h1");
      if (title) title.textContent = "Item";
    }));
    const from = page.url();
    const result = await exerciseNavigation(page, "#secondary");
    expect(result.from).toBe(from);
    expect(result.to).toContain("/places/item-7");
    expect(result.historyReturned).toBe(true);
  });
});
