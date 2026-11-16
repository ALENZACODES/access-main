import { expect, test, type Page } from "@playwright/test";

import { auditFormSemantics } from "./forms-round5";
import { auditCompositeSemantics } from "./composites-round5";
import { auditAnnouncements } from "./announcements-round5";
import { auditDataDisplays } from "./tables-round5";
import { auditRouteContinuity } from "./route-continuity-round5";
import { auditOperability } from "./operability-round5";

const shellStart = `<!doctype html><html lang="en"><head><title>Input lab</title></head>
<body><a href="#main">Skip</a><main id="main"><h1>Input lab</h1>`;
const shellEnd = `</main></body></html>`;

async function fixture(page: Page, markup: string): Promise<void> {
  await page.setContent(`${shellStart}${markup}${shellEnd}`, { waitUntil: "domcontentloaded" });
}

/** A bad fixture must produce its expected diagnostic, never a silent pass. */
async function expectCode(
  page: Page,
  markup: string,
  audit: (page: Page) => Promise<readonly { readonly code: string }[]>,
  code: string,
): Promise<void> {
  await fixture(page, markup);
  expect((await audit(page)).map((finding) => finding.code), `Missing ${code}`).toContain(code);
}

const invalidFormCases = [
  {
    name: "unlabelled text field",
    markup: `<input id="query" type="text">`,
    code: "form-control-name",
  },
  {
    name: "empty text field name",
    markup: `<input aria-label="  " type="text">`,
    code: "form-control-name",
  },
  {
    name: "invalid aria-invalid token",
    markup: `<label for="a">Name</label><input id="a" aria-invalid="unknown">`,
    code: "invalid-aria-invalid",
  },
  {
    name: "invalid aria-required token",
    markup: `<label for="a">Name</label><input id="a" aria-required="maybe">`,
    code: "invalid-aria-required",
  },
  {
    name: "invalid field without an error reference",
    markup: `<label for="a">Name</label><input id="a" aria-invalid="true">`,
    code: "missing-error-association",
  },
  {
    name: "invalid field with empty error text",
    markup: `<label for="a">Name</label><input id="a" aria-invalid="true" aria-errormessage="err"><p id="err"></p>`,
    code: "empty-error-association",
  },
  {
    name: "invalid field with missing error element",
    markup: `<label for="a">Name</label><input id="a" aria-invalid="true" aria-describedby="not-found">`,
    code: "empty-error-association",
  },
  {
    name: "empty autocomplete token",
    markup: `<label for="a">Name</label><input id="a" autocomplete="">`,
    code: "empty-autocomplete",
  },
  {
    name: "radio without group name",
    markup: `<label><input type="radio">Choice</label>`,
    code: "radio-group-name",
  },
  {
    name: "radio fieldset without legend",
    markup: `<fieldset><label><input type="radio" name="x">One</label><label><input type="radio" name="x">Two</label></fieldset>`,
    code: "fieldset-legend",
  },
  {
    name: "label pointing at missing field",
    markup: `<label for="absent">Name</label>`,
    code: "orphan-label",
  },
  {
    name: "label pointing at non-labelable region",
    markup: `<label for="a">Name</label><p id="a">Paragraph</p>`,
    code: "label-target-type",
  },
  {
    name: "unnamed radio group",
    markup: `<div role="radiogroup"><label><input type="radio" name="x">One</label></div>`,
    code: "unnamed-control-group",
  },
  {
    name: "unnamed group with checkboxes",
    markup: `<div role="group"><label><input type="checkbox">One</label></div>`,
    code: "unnamed-control-group",
  },
] as const;

for (const scenario of invalidFormCases) {
  test(`form failure: ${scenario.name}`, async ({ page }) => {
    await expectCode(page, scenario.markup, auditFormSemantics, scenario.code);
  });
}

test("labelled form controls and associated error message pass", async ({ page }) => {
  await fixture(page, `<form>
    <label for="name">Name</label>
    <input id="name" aria-invalid="true" aria-errormessage="name-error">
    <p id="name-error">Please enter a name.</p>
    <fieldset><legend>Options</legend>
      <label><input type="radio" name="choice">One</label>
      <label><input type="radio" name="choice">Two</label>
    </fieldset><button type="button">Close</button>
  </form>`);
  expect(await auditFormSemantics(page)).toEqual([]);
});

const invalidCompositeCases = [
  {
    name: "unnamed tablist",
    markup: `<div role="tablist"><button role="tab" aria-selected="true" aria-controls="panel" tabindex="0">First</button></div><div id="panel" role="tabpanel">Panel</div>`,
    code: "tablist-name",
  },
  {
    name: "tablist with multiple selected tabs",
    markup: `<div role="tablist" aria-label="Views"><button role="tab" aria-selected="true" tabindex="0" aria-controls="one">One</button><button role="tab" aria-selected="true" tabindex="-1" aria-controls="two">Two</button></div><div id="one" role="tabpanel">One</div><div id="two" role="tabpanel">Two</div>`,
    code: "tab-selection-count",
  },
  {
    name: "tablist with two tab stops",
    markup: `<div role="tablist" aria-label="Views"><button role="tab" aria-selected="true" tabindex="0" aria-controls="one">One</button><button role="tab" aria-selected="false" tabindex="0" aria-controls="two">Two</button></div><div id="one" role="tabpanel">One</div><div id="two" role="tabpanel">Two</div>`,
    code: "tab-roving-focus",
  },
  {
    name: "tab without panel association",
    markup: `<div role="tablist" aria-label="Views"><button role="tab" aria-selected="true" tabindex="0">One</button></div>`,
    code: "tab-controls",
  },
  {
    name: "tab targeting non-panel",
    markup: `<div role="tablist" aria-label="Views"><button role="tab" aria-selected="true" tabindex="0" aria-controls="one">One</button></div><div id="one">Text</div>`,
    code: "tab-panel",
  },
  {
    name: "tab with non-Boolean selection",
    markup: `<div role="tablist" aria-label="Views"><button role="tab" aria-selected="maybe" tabindex="0" aria-controls="one">One</button></div><div id="one" role="tabpanel">Text</div>`,
    code: "tab-selected-state",
  },
  {
    name: "unnamed listbox",
    markup: `<div role="listbox"><div role="option">One</div></div>`,
    code: "listbox-name",
  },
  {
    name: "listbox without options",
    markup: `<div role="listbox" aria-label="Options">None</div>`,
    code: "listbox-options",
  },
  {
    name: "listbox with multiple selected values",
    markup: `<div role="listbox" aria-label="Options"><div role="option" aria-selected="true">One</div><div role="option" aria-selected="true">Two</div></div>`,
    code: "listbox-multiple-selection",
  },
  {
    name: "unnamed list option",
    markup: `<div role="listbox" aria-label="Options"><div role="option" style="min-height:24px;min-width:24px"></div></div>`,
    code: "option-name",
  },
  {
    name: "invalid list option selection",
    markup: `<div role="listbox" aria-label="Options"><div role="option" aria-selected="sometimes">One</div></div>`,
    code: "option-selection-state",
  },
  {
    name: "unnamed menu",
    markup: `<div role="menu"><button role="menuitem">Open</button></div>`,
    code: "menu-name",
  },
  {
    name: "empty menu",
    markup: `<div role="menu" aria-label="Actions">Empty</div>`,
    code: "menu-items",
  },
  {
    name: "menu with multiple tab stops",
    markup: `<div role="menu" aria-label="Actions"><button role="menuitem" tabindex="0">One</button><button role="menuitem" tabindex="0">Two</button></div>`,
    code: "menu-focus-order",
  },
  {
    name: "unnamed menu item",
    markup: `<div role="menu" aria-label="Actions"><button role="menuitem"></button></div>`,
    code: "menu-item-name",
  },
  {
    name: "checkable menu item without state",
    markup: `<div role="menu" aria-label="Actions"><button role="menuitemcheckbox">Pin</button></div>`,
    code: "menu-item-check-state",
  },
  {
    name: "unnamed tree",
    markup: `<div role="tree"><div role="treeitem" tabindex="0">Node</div></div>`,
    code: "tree-name",
  },
  {
    name: "empty tree",
    markup: `<div role="tree" aria-label="Folders">Empty</div>`,
    code: "tree-empty",
  },
  {
    name: "tree with multiple tab stops",
    markup: `<div role="tree" aria-label="Folders"><div role="treeitem" tabindex="0">One</div><div role="treeitem" tabindex="0">Two</div></div>`,
    code: "tree-roving-focus",
  },
  {
    name: "unnamed tree item",
    markup: `<div role="tree" aria-label="Folders"><div role="treeitem" tabindex="0" style="min-height:24px;min-width:24px"></div></div>`,
    code: "treeitem-name",
  },
  {
    name: "invalid tree expansion state",
    markup: `<div role="tree" aria-label="Folders"><div role="treeitem" tabindex="0" aria-expanded="open">One</div></div>`,
    code: "treeitem-state",
  },
  {
    name: "broken disclosure target",
    markup: `<button aria-expanded="true" aria-controls="missing">Details</button>`,
    code: "disclosure-panel",
  },
  {
    name: "invalid disclosure expansion state",
    markup: `<button aria-expanded="maybe" aria-controls="details">Details</button><div id="details">Text</div>`,
    code: "disclosure-state",
  },
  {
    name: "expanded disclosure with hidden panel",
    markup: `<button aria-expanded="true" aria-controls="details">Details</button><div id="details" hidden>Text</div>`,
    code: "disclosure-expanded-hidden",
  },
  {
    name: "collapsed disclosure with exposed panel",
    markup: `<button aria-expanded="false" aria-controls="details" data-a11y-hide-when-collapsed="true">Details</button><div id="details">Text</div>`,
    code: "disclosure-collapsed-visible",
  },
] as const;

for (const scenario of invalidCompositeCases) {
  test(`composite failure: ${scenario.name}`, async ({ page }) => {
    await expectCode(page, scenario.markup, auditCompositeSemantics, scenario.code);
  });
}

test("well-labelled tabset and disclosure pass", async ({ page }) => {
  await fixture(page, `<div role="tablist" aria-label="Views">
    <button role="tab" id="a" aria-selected="true" tabindex="0" aria-controls="panel-a">Summary</button>
    <button role="tab" id="b" aria-selected="false" tabindex="-1" aria-controls="panel-b">Details</button>
  </div><section id="panel-a" role="tabpanel">Summary</section>
  <section id="panel-b" role="tabpanel" hidden>Details</section>
  <button aria-expanded="false" aria-controls="extra">More</button><div id="extra" hidden>Extra</div>`);
  expect(await auditCompositeSemantics(page)).toEqual([]);
});

const invalidAnnouncementCases = [
  {
    name: "invalid live priority",
    markup: `<p aria-live="urgent">Update</p>`,
    code: "live-invalid-value",
  },
  {
    name: "invalid atomic flag",
    markup: `<p aria-live="polite" aria-atomic="sometimes">Update</p>`,
    code: "live-invalid-atomic",
  },
  {
    name: "invalid busy flag",
    markup: `<p aria-live="polite" aria-busy="sometimes">Update</p>`,
    code: "live-invalid-busy",
  },
  {
    name: "invalid relevant token",
    markup: `<p aria-live="polite" aria-relevant="suddenly">Update</p>`,
    code: "live-invalid-relevant",
  },
  {
    name: "silenced alert",
    markup: `<p role="alert" aria-live="off">Important</p>`,
    code: "alert-silenced",
  },
  {
    name: "silenced status",
    markup: `<p role="status" aria-live="off">Ready</p>`,
    code: "status-silenced",
  },
  {
    name: "live region with positive tab order",
    markup: `<p role="status" tabindex="4">Ready</p>`,
    code: "live-positive-tabindex",
  },
  {
    name: "invalid progress range",
    markup: `<div role="progressbar" aria-label="Loading" aria-valuemin="10" aria-valuemax="5"></div>`,
    code: "progress-invalid-range",
  },
  {
    name: "progress value outside range",
    markup: `<div role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="200"></div>`,
    code: "progress-invalid-value",
  },
  {
    name: "custom progress without name",
    markup: `<div role="progressbar" aria-valuenow="25"></div>`,
    code: "progress-name",
  },
  {
    name: "output referencing absent input",
    markup: `<output for="absent">42</output>`,
    code: "output-reference",
  },
] as const;

for (const scenario of invalidAnnouncementCases) {
  test(`announcement failure: ${scenario.name}`, async ({ page }) => {
    await expectCode(page, scenario.markup, auditAnnouncements, scenario.code);
  });
}

test("polite status and named progress indicator pass", async ({ page }) => {
  await fixture(page, `<p role="status" aria-live="polite" aria-atomic="true">Ready</p>
    <label for="count">Amount</label><input id="count" type="number">
    <output for="count">0</output>
    <div role="progressbar" aria-label="Loading" aria-valuenow="35" aria-valuemin="0" aria-valuemax="100"></div>`);
  expect(await auditAnnouncements(page)).toEqual([]);
});

const invalidDisplayCases = [
  {
    name: "data table without headings",
    markup: `<table><caption>Places</caption><tr><td>One</td></tr></table>`,
    code: "table-no-headings",
  },
  {
    name: "data table without caption",
    markup: `<table><tr><th scope="col">Name</th></tr><tr><td>One</td></tr></table>`,
    code: "table-no-name",
  },
  {
    name: "invalid heading scope",
    markup: `<table><caption>Places</caption><tr><th scope="diagonal">Name</th></tr><tr><td>One</td></tr></table>`,
    code: "table-invalid-scope",
  },
  {
    name: "empty column heading",
    markup: `<table><caption>Places</caption><tr><th></th></tr><tr><td>One</td></tr></table>`,
    code: "table-empty-heading",
  },
  {
    name: "cell referencing absent heading",
    markup: `<table><caption>Places</caption><tr><th id="name">Name</th></tr><tr><td headers="absent">One</td></tr></table>`,
    code: "table-broken-header",
  },
  {
    name: "unnamed interactive grid",
    markup: `<div role="grid"><div role="row"><span role="gridcell">A</span></div></div>`,
    code: "grid-name",
  },
  {
    name: "grid without rows",
    markup: `<div role="grid" aria-label="Calendar">Empty</div>`,
    code: "grid-rows",
  },
  {
    name: "grid row without cells",
    markup: `<div role="grid" aria-label="Calendar"><div role="row">Empty</div></div>`,
    code: "grid-row-cells",
  },
  {
    name: "grid cell with invalid selection state",
    markup: `<div role="grid" aria-label="Calendar"><div role="row"><span role="gridcell" aria-selected="maybe">A</span></div></div>`,
    code: "grid-cell-selection",
  },
  {
    name: "map without list reference",
    markup: `<div data-a11y-map>Map</div>`,
    code: "map-no-list",
  },
  {
    name: "map with missing list",
    markup: `<div data-a11y-map data-a11y-list-alternative="absent">Map</div>`,
    code: "map-list-missing",
  },
  {
    name: "map alternative that is not a list",
    markup: `<div data-a11y-map data-a11y-list-alternative="alternative">Map</div><p id="alternative">One</p>`,
    code: "map-list-type",
  },
  {
    name: "map alternative hidden from view",
    markup: `<div data-a11y-map data-a11y-list-alternative="alternative">Map</div><ul id="alternative" hidden><li>One</li></ul>`,
    code: "map-list-hidden",
  },
  {
    name: "map alternative without content",
    markup: `<div data-a11y-map data-a11y-list-alternative="alternative">Map</div><ul id="alternative" style="min-height:24px;min-width:24px"></ul>`,
    code: "map-list-empty",
  },
  {
    name: "result summary with non-numeric count",
    markup: `<p data-a11y-results-count="many">Places</p>`,
    code: "result-count-invalid",
  },
  {
    name: "result summary without accessible text",
    markup: `<p data-a11y-results-count="3" style="min-height:24px;min-width:24px"></p>`,
    code: "result-count-not-announced",
  },
  {
    name: "dynamic result summary without live region",
    markup: `<p data-a11y-results-count="3" data-a11y-changes-dynamically>Three places</p>`,
    code: "dynamic-results-not-live",
  },
  {
    name: "evidence missing source",
    markup: `<p data-a11y-evidence data-licence="CC0-1.0" data-date="2026-11-15">Unknown</p>`,
    code: "evidence-source",
  },
  {
    name: "evidence missing licence",
    markup: `<p data-a11y-evidence data-source="Local survey" data-date="2026-11-15">Unknown</p>`,
    code: "evidence-licence",
  },
  {
    name: "evidence missing collection date",
    markup: `<p data-a11y-evidence data-source="Local survey" data-licence="CC0-1.0">Unknown</p>`,
    code: "evidence-date",
  },
  {
    name: "evidence with unsupported state",
    markup: `<p data-a11y-evidence data-source="Local survey" data-licence="CC0-1.0" data-date="2026-11-15" data-accessibility-status="ASSUMED">Unknown</p>`,
    code: "evidence-state",
  },
  {
    name: "unknown evidence upgraded without a source",
    markup: `<p data-a11y-evidence data-a11y-unknown data-source="Local survey" data-licence="CC0-1.0" data-date="2026-11-15" data-accessibility-status="REPORTED">Unknown</p>`,
    code: "evidence-unknown-changed",
  },
] as const;

for (const scenario of invalidDisplayCases) {
  test(`data display failure: ${scenario.name}`, async ({ page }) => {
    await expectCode(page, scenario.markup, auditDataDisplays, scenario.code);
  });
}

test("named data table, list fallback, and UNKNOWN evidence pass", async ({ page }) => {
  await fixture(page, `<table><caption>Places</caption><thead><tr>
    <th id="place" scope="col">Name</th></tr></thead>
    <tbody><tr><td headers="place">Sample</td></tr></tbody></table>
    <div data-a11y-map data-a11y-list-alternative="places">Map display</div>
    <ul id="places"><li>Sample</li></ul>
    <p data-a11y-results-count="1" data-a11y-changes-dynamically role="status">One result</p>
    <p data-a11y-evidence data-a11y-unknown data-source="Field note"
       data-licence="CC0-1.0" data-date="2026-11-15"
       data-accessibility-status="UNKNOWN">Unknown</p>`);
  expect(await auditDataDisplays(page)).toEqual([]);
});

const invalidNavigationCases = [
  {
    name: "placeholder link",
    markup: `<a href="#">Continue</a>`,
    code: "link-placeholder",
  },
  {
    name: "fragment without target",
    markup: `<a href="#not-here">Skip to details</a>`,
    code: "fragment-target-missing",
  },
  {
    name: "new-window link without safe rel",
    markup: `<a href="https://example.org" target="_blank">External resource</a>`,
    code: "external-new-window",
  },
  {
    name: "negative fixture: unnamed download link",
    markup: `<a href="/report.txt" download></a>`,
    code: "unnamed-download",
  },
  {
    name: "invalid current item state",
    markup: `<nav aria-label="Main"><a href="/" aria-current="perhaps">Home</a></nav>`,
    code: "aria-current-value",
  },
  {
    name: "two current pages in one navigation landmark",
    markup: `<nav aria-label="Main"><a href="/" aria-current="page">Home</a><a href="/help" aria-current="page">Help</a></nav>`,
    code: "multiple-current-pages",
  },
  {
    name: "multiple unnamed navigation landmarks",
    markup: `<nav><a href="/">Home</a></nav><nav><a href="/help">Help</a></nav>`,
    code: "navigation-name",
  },
  {
    name: "opt-in skip link without fragment",
    markup: `<a data-a11y-skip-link href="/main">Skip content</a>`,
    code: "skip-link-destination",
  },
  {
    name: "opt-in skip link with absent target",
    markup: `<a data-a11y-skip-link href="#absent">Skip content</a>`,
    code: "skip-link-target",
  },
  {
    name: "opt-in skip link with hidden target",
    markup: `<a data-a11y-skip-link href="#details">Skip content</a><section id="details" hidden>Details</section>`,
    code: "skip-link-hidden",
  },
] as const;

for (const scenario of invalidNavigationCases) {
  test(`navigation failure: ${scenario.name}`, async ({ page }) => {
    await expectCode(page, scenario.markup, auditRouteContinuity, scenario.code);
  });
}

test("download links need an accessible name even without a painted box", async ({ page }) => {
  await fixture(page, `<a id="unnamed" href="/report.txt" download></a>
    <a href="/named.txt" download aria-label="Download report"></a>
    <span id="download-name">Download list</span>
    <a href="/list.txt" download aria-labelledby="download-name"></a>`);
  const issues = await auditRouteContinuity(page);
  expect(issues.filter((issue) => issue.code === "unnamed-download"))
    .toEqual([{ code: "unnamed-download", target: "unnamed", detail: "Download action has no accessible name" }]);
});

test("two named navigation areas with one current page pass", async ({ page }) => {
  await fixture(page, `<nav aria-label="Primary"><a href="/" aria-current="page">Home</a></nav>
    <nav aria-label="Secondary"><a href="/help">Help</a></nav>
    <a href="#main" data-a11y-skip-link>Skip content</a>`);
  expect(await auditRouteContinuity(page)).toEqual([]);
});

const invalidOperabilityCases = [
  {
    name: "dragging with no alternative",
    markup: `<div draggable="true">Drag item</div>`,
    code: "drag-alternative",
  },
  {
    name: "dragging with missing alternative",
    markup: `<div draggable="true" data-a11y-drag-alternative="absent">Drag item</div>`,
    code: "drag-alternative-hidden",
  },
  {
    name: "dragging with non-interactive alternative",
    markup: `<div draggable="true" data-a11y-drag-alternative="hint">Drag item</div><p id="hint">Move</p>`,
    code: "drag-alternative-not-control",
  },
  {
    name: "pointer action with unsupported cancellation contract",
    markup: `<button data-a11y-pointer-action="press">Select</button>`,
    code: "pointer-cancel-contract",
  },
  {
    name: "motion gesture without button alternative",
    markup: `<div data-a11y-motion-gesture data-a11y-motion-alternative="missing">Shake</div>`,
    code: "motion-alternative",
  },
  {
    name: "multipoint gesture without single-pointer alternative",
    markup: `<div data-a11y-multipoint-gesture data-a11y-single-pointer="missing">Pinch</div>`,
    code: "multipoint-alternative",
  },
  {
    name: "opt-in target under 44 pixels",
    markup: `<button data-a11y-target-size style="width:30px;height:30px">Small</button>`,
    code: "target-under-44",
  },
  {
    name: "non-numeric tabindex",
    markup: `<button tabindex="high">Button</button>`,
    code: "tabindex-invalid",
  },
  {
    name: "positive tabindex",
    markup: `<button tabindex="5">Button</button>`,
    code: "tabindex-positive",
  },
] as const;

for (const scenario of invalidOperabilityCases) {
  test(`operability failure: ${scenario.name}`, async ({ page }) => {
    await expectCode(page, scenario.markup, auditOperability, scenario.code);
  });
}

test("single-pointer drag alternative and large button pass", async ({ page }) => {
  await fixture(page, `<div draggable="true" data-a11y-drag-alternative="move">Item</div>
    <button id="move" style="width:60px;height:50px" data-a11y-target-size>Move</button>
    <button data-a11y-pointer-action="release" style="width:50px;height:50px">Select</button>`);
  expect(await auditOperability(page)).toEqual([]);
});


test("an inert primary landmark without a modal is rejected", async ({ page }) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Input lab</title></head>
    <body><main id="main" inert><h1>Input lab</h1></main></body></html>`);
  expect((await auditOperability(page)).map((finding) => finding.code)).toContain(
    "stranded-inert-main",
  );
});
