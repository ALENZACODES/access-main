import { expect, test, type Page } from "@playwright/test";

import {
  activateSkipLink,
  auditRouteContext,
  captureRouteIdentity,
  inspectLanguageButtons,
  inspectRouteIdentity,
  inspectSkipNavigation,
} from "./route-state-round8";

const SHELL = `<a class="a11y-skip-link" href="#main">Skip to content</a>
<header><nav aria-label="Primary"><a href="/help">Help</a></nav></header>
<main id="main" tabindex="-1"><h1>Home</h1><p>Content</p></main>
<footer><nav aria-label="Secondary"><a href="/about">About</a></nav></footer>`;

async function fixture(page: Page, html = SHELL, language = "en"): Promise<void> {
  await page.setContent(`<!doctype html><html lang="${language}"><head>
    <title>Route contract test</title><style>
    :focus-visible {outline:3px solid black}
    a,button {min-height:44px;min-width:44px}
  </style></head><body>${html}</body></html>`);
}

test.describe("P16 round eight route continuity", () => {
  test("a complete page exposes a title, language and main", async ({ page }) => {
    await fixture(page);
    expect(await inspectRouteIdentity(page)).toEqual([]);
  });

  test("the route identity records document structure", async ({ page }) => {
    await fixture(page);
    const identity = await captureRouteIdentity(page);
    expect(identity.mainCount).toBe(1);
    expect(identity.heading).toBe("Home");
    expect(identity.title).toBe("Route contract test");
    expect(identity.language).toBe("en");
    expect(identity.navNames).toEqual(["Primary", "Secondary"]);
  });

  test("missing title is a failure", async ({ page }) => {
    await fixture(page);
    await page.evaluate(() => { document.title = ""; });
    expect((await inspectRouteIdentity(page)).map((item) => item.code)).toContain("route-title");
  });

  test("undeclared language is a failure", async ({ page }) => {
    await fixture(page);
    await page.locator("html").evaluate((node) => node.removeAttribute("lang"));
    expect((await inspectRouteIdentity(page)).map((item) => item.code))
      .toContain("route-document-language");
  });

  test("two main landmarks are a failure", async ({ page }) => {
    await fixture(page, `<main><h1>First</h1></main><main><h1>Second</h1></main>`);
    expect((await inspectRouteIdentity(page)).map((item) => item.code))
      .toContain("route-main-count");
  });

  test("an empty main heading is a failure", async ({ page }) => {
    await fixture(page, `<main><h1></h1></main>`);
    expect((await inspectRouteIdentity(page)).map((item) => item.code))
      .toContain("route-primary-heading");
  });

  test("multiple unnamed navigation landmarks are a failure", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1></main><nav><a href="/">Home</a></nav>
      <nav><a href="/help">Help</a></nav>`);
    expect((await inspectRouteIdentity(page)).map((item) => item.code))
      .toContain("route-navigation-label");
  });

  test("duplicate HTML ids are rejected", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><p id="same">One</p><p id="same">Two</p></main>`);
    expect((await inspectRouteIdentity(page)).map((item) => item.code))
      .toContain("duplicate-document-id");
  });

  test("images require an alt attribute", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><img src="data:," /></main>`);
    expect((await inspectRouteIdentity(page)).map((item) => item.code))
      .toContain("route-image-alternative");
  });

  test("decorative images can use presentation role", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><img role="presentation" src="data:," /></main>`);
    expect(await inspectRouteIdentity(page)).toEqual([]);
  });

  test("placeholder fragment anchor is a violation", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><a href="#">More</a></main>`);
    expect((await inspectRouteIdentity(page)).map((item) => item.code))
      .toContain("route-placeholder-anchor");
  });

  test("missing fragment destination is a violation", async ({ page }) => {
    await fixture(page, `<main><h1>Page</h1><a href="#missing">More</a></main>`);
    expect((await inspectRouteIdentity(page)).map((item) => item.code))
      .toContain("route-missing-fragment");
  });

  test("valid skip link has no structural finding", async ({ page }) => {
    await fixture(page);
    expect(await inspectSkipNavigation(page)).toEqual([]);
  });

  test("skip link must reference a fragment", async ({ page }) => {
    await fixture(page, `<a data-a11y-skip-link href="/main">Skip</a><main><h1>Page</h1></main>`);
    expect((await inspectSkipNavigation(page)).map((item) => item.code))
      .toContain("skip-destination");
  });

  test("skip link needs its target", async ({ page }) => {
    await fixture(page, `<a data-a11y-skip-link href="#missing">Skip</a><main><h1>Page</h1></main>`);
    expect((await inspectSkipNavigation(page)).map((item) => item.code))
      .toContain("skip-target-missing");
  });

  test("skip link target cannot be hidden", async ({ page }) => {
    await fixture(page, `<a data-a11y-skip-link href="#hidden">Skip</a>
      <main><h1>Page</h1><section id="hidden" hidden>Details</section></main>`);
    expect((await inspectSkipNavigation(page)).map((item) => item.code))
      .toContain("skip-target-hidden");
  });

  test("skip link cannot be removed from Tab navigation", async ({ page }) => {
    await fixture(page, `<a data-a11y-skip-link href="#main" tabindex="-1">Skip</a>
      <main id="main"><h1>Page</h1></main>`);
    expect((await inspectSkipNavigation(page)).map((item) => item.code))
      .toContain("skip-not-sequential");
  });

  test("skip link Enter moves focus into main", async ({ page }) => {
    await fixture(page);
    const result = await activateSkipLink(page);
    expect(result.skipTargetPresent).toBe(true);
    expect(result.focusInMain).toBe(true);
    expect(result.headingVisible).toBe(true);
  });

  test("no language controls is allowed on a static fixture", async ({ page }) => {
    await fixture(page);
    expect(await inspectLanguageButtons(page)).toEqual([]);
  });

  test("a complete EN/FR choice group has one active language", async ({ page }) => {
    await fixture(page, `<main><h1>Home</h1></main>
      <button lang="en" aria-pressed="true">English</button>
      <button lang="fr" aria-pressed="false">Français</button>`);
    expect(await inspectLanguageButtons(page)).toEqual([]);
  });

  test("two active language buttons fail", async ({ page }) => {
    await fixture(page, `<main><h1>Home</h1></main>
      <button lang="en" aria-pressed="true">English</button>
      <button lang="fr" aria-pressed="true">Français</button>`);
    expect((await inspectLanguageButtons(page)).map((item) => item.code))
      .toContain("language-selection-count");
  });

  test("active language must match document language", async ({ page }) => {
    await fixture(page, `<main><h1>Home</h1></main>
      <button lang="en" aria-pressed="false">English</button>
      <button lang="fr" aria-pressed="true">Français</button>`);
    expect((await inspectLanguageButtons(page)).map((item) => item.code))
      .toContain("language-selection-mismatch");
  });

  test("an invalid language button state fails", async ({ page }) => {
    await fixture(page, `<main><h1>Home</h1></main>
      <button lang="fr" aria-pressed="maybe">Français</button>`);
    expect((await inspectLanguageButtons(page)).map((item) => item.code))
      .toContain("language-pressed-value");
  });

  test("undersized language control fails", async ({ page }) => {
    await fixture(page, `<main><h1>Home</h1></main>
      <button lang="en" aria-pressed="true" style="width:20px;height:20px;
       min-width:0;min-height:0;padding:0">E</button>`);
    expect((await inspectLanguageButtons(page)).map((item) => item.code))
      .toContain("language-button-target");
  });

  test("combined route audit includes skip and language findings", async ({ page }) => {
    await fixture(page, `<a data-a11y-skip-link href="#absent">Skip</a>
      <main><h1>Home</h1></main><button lang="en" aria-pressed="maybe">English</button>`);
    const codes = (await auditRouteContext(page)).map((item) => item.code);
    expect(codes).toContain("skip-target-missing");
    expect(codes).toContain("language-pressed-value");
  });
});
