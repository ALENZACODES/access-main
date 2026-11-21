import { expect, test, type Page } from "@playwright/test";
import { auditRouteContinuityRound11, type RouteContinuityCode } from "./route-continuity-round11";

async function mount(page: Page, content: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Navigation contract</title>
    <style>body{font-family:sans-serif}button,a{min-height:44px;min-width:44px}</style></head>
    <body><main id="main" tabindex="-1"><h1>Navigation contract</h1>${content}</main></body></html>`);
}
async function expectFinding(page: Page, markup: string, code: RouteContinuityCode): Promise<void> {
  await mount(page, markup);
  const report = await auditRouteContinuityRound11(page);
  expect(report.findings.map((entry) => entry.code), JSON.stringify(report.findings)).toContain(code);
}

const scenarios: readonly { title: string; html: string; code: RouteContinuityCode }[] = [
  { title: "link without name", html: `<a id="bad" href="/help"></a>`, code: "unnamed-link" },
  { title: "empty destination", html: `<a href="">Help</a>`, code: "empty-href" },
  { title: "placeholder destination", html: `<a href="#">Continue</a>`, code: "placeholder-link" },
  { title: "missing fragment target", html: `<a href="#lost">Details</a>`, code: "missing-fragment" },
  { title: "duplicate fragment targets", html: `<a href="#same">Open</a><p id="same">A</p><p id="same">B</p>`, code: "duplicate-fragment" },
  { title: "hidden fragment", html: `<a href="#hidden">Show</a><section id="hidden" hidden>Hidden</section>`, code: "hidden-fragment" },
  { title: "unnamed download", html: `<a href="/report.txt" download></a>`, code: "download-without-name" },
  { title: "download without resource", html: `<a href="" download="report.txt">Report</a>`, code: "download-empty-filename" },
  { title: "invalid current state", html: `<nav aria-label="Primary"><a href="/help" aria-current="sometimes">Help</a></nav>`, code: "invalid-current" },
  { title: "two current pages", html: `<nav aria-label="Primary"><a href="/" aria-current="page">Home</a><a href="/help" aria-current="page">Help</a></nav>`, code: "multiple-current-pages" },
  { title: "current page outside navigation", html: `<a href="/help" aria-current="page">Help</a>`, code: "current-outside-navigation" },
  { title: "two unnamed navigations", html: `<nav><a href="/">Home</a></nav><nav><a href="/help">Help</a></nav>`, code: "unnamed-multiple-navigation" },
  { title: "same accessible name on two navigation landmarks", html: `<nav aria-label="Primary"><a href="/">Home</a></nav><nav aria-label="Primary"><a href="/help">Help</a></nav>`, code: "duplicate-navigation-name" },
  { title: "skip link to a route", html: `<a data-a11y-skip-link href="/main">Skip</a>`, code: "skip-without-fragment" },
  { title: "skip link with missing target", html: `<a data-a11y-skip-link href="#absent">Skip</a>`, code: "skip-missing-target" },
  { title: "skip link with hidden target", html: `<a data-a11y-skip-link href="#panel">Skip</a><section id="panel" hidden>Panel</section>`, code: "skip-hidden-target" },
  { title: "skip link to non-focusable container", html: `<a data-a11y-skip-link href="#body">Skip</a><div id="body">Body</div>`, code: "skip-target-not-focusable" },
  { title: "skip link after an action", html: `<button>Action</button><a data-a11y-skip-link href="#main">Skip</a>`, code: "skip-not-first" },
  { title: "external new window missing safe rel", html: `<a href="https://example.org/" target="_blank">External</a>`, code: "external-target-without-rel" },
  { title: "malformed language hint", html: `<a href="/fr" hreflang="not a locale">Français</a>`, code: "invalid-hreflang" },
  { title: "disabled link remains focusable", html: `<a href="/help" aria-disabled="true">Help</a>`, code: "conflicting-link-disabled" },
  { title: "invalid multi-character access key", html: `<a href="/help" accesskey="help">Help</a>`, code: "invalid-accesskey" },
  { title: "link in inert section", html: `<div inert><a href="/help">Help</a></div>`, code: "link-in-inert" },
  { title: "unsupported role on link", html: `<a href="/help" role="meter">Help</a>`, code: "anchor-role-conflict" },
];
for (const scenario of scenarios) {
  test(`navigation negative: ${scenario.title}`, async ({ page }) => {
    await expectFinding(page, scenario.html, scenario.code);
  });
}

test("well-named navigation with one current link has no findings", async ({ page }) => {
  await mount(page, `<nav aria-label="Primary"><a href="/" aria-current="page">Home</a><a href="/help">Help</a></nav>`);
  const report = await auditRouteContinuityRound11(page);
  expect(report.navigationRegions).toBe(1);
  expect(report.inspectedLinks).toBe(2);
  expect(report.findings).toEqual([]);
});

test("named secondary navigation does not collide with primary", async ({ page }) => {
  await mount(page, `<nav aria-label="Primary"><a href="/">Home</a></nav>
    <nav aria-label="Resources"><a href="/about">About</a></nav>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
});

test("skip link before controls points to focusable main landmark", async ({ page }) => {
  await page.setContent(`<!doctype html><html lang="en"><body>
    <a class="a11y-skip-link" href="#main">Skip to content</a>
    <nav aria-label="Primary"><a href="/help">Help</a></nav>
    <main id="main" tabindex="-1"><h1>Content</h1></main>
  </body></html>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.locator(".a11y-skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("new-window external link with noopener is accepted", async ({ page }) => {
  await mount(page, `<a href="https://example.org/" rel="noopener" target="_blank">Documentation</a>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
});

test("valid download requires name but no invented file metadata", async ({ page }) => {
  await mount(page, `<a href="/manual.txt" download="manual.txt">Download manual</a>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
});

test("duplicate IDs are reported even if only one fragment is visible", async ({ page }) => {
  await mount(page, `<a href="#same">Jump</a><div id="same">A</div><div id="same" hidden>B</div>`);
  const issues = (await auditRouteContinuityRound11(page)).findings;
  expect(issues.map((issue) => issue.code)).toContain("duplicate-fragment");
});

test("current-step state is valid inside a named step navigation", async ({ page }) => {
  await mount(page, `<nav aria-label="Steps"><a href="/one" aria-current="step">Step one</a><a href="/two">Step two</a></nav>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
});

test("role presentation does not turn an unnamed link into named content", async ({ page }) => {
  await mount(page, `<a href="/help" role="presentation"></a>`);
  expect((await auditRouteContinuityRound11(page)).findings.map((item) => item.code)).toContain("unnamed-link");
});

test("hidden links do not trigger false accessibility findings", async ({ page }) => {
  await mount(page, `<div hidden><a href=""></a></div><a href="/help">Help</a>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
});

test("aria-labelledby gives a name to an otherwise empty link", async ({ page }) => {
  await mount(page, `<p id="name">Further information</p><a href="/help" aria-labelledby="name"></a>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
});

test("text alternative on an image-only link supplies a name", async ({ page }) => {
  await mount(page, `<a href="/help"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" alt="Help" /></a>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
});

test("fragment encoded identifiers resolve accurately", async ({ page }) => {
  await mount(page, `<a href="#guide%20section">Guide</a><section id="guide section">Instructions</section>`);
  expect((await auditRouteContinuityRound11(page)).findings).toEqual([]);
});

test("no-UI-content fixture has zero inspected links without an invented failure", async ({ page }) => {
  await mount(page, `<p>No links in this panel.</p>`);
  const report = await auditRouteContinuityRound11(page);
  expect(report.inspectedLinks).toBe(0);
  expect(report.findings).toEqual([]);
});
