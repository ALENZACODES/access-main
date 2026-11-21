import { expect, test, type Page } from "@playwright/test";
import { auditDataViewsRound11, type DataViewCode } from "./data-view-round11";

async function mount(page: Page, content: string): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Data view</title></head>
  <body><main><h1>Data view</h1>${content}</main></body></html>`);
}
async function negative(page: Page, html: string, code: DataViewCode): Promise<void> {
  await mount(page, html);
  const result = await auditDataViewsRound11(page);
  expect(result.findings.map((finding) => finding.code), JSON.stringify(result.findings)).toContain(code);
}

const cases: readonly { title: string; html: string; code: DataViewCode }[] = [
  { title: "unnamed data table", html: `<table><tr><th>Label</th></tr><tr><td>Value</td></tr></table>`, code: "table-without-name" },
  { title: "table without headings", html: `<table><caption>Items</caption><tr><td>A</td></tr></table>`, code: "table-without-headings" },
  { title: "empty heading", html: `<table><caption>Items</caption><tr><th></th></tr><tr><td>A</td></tr></table>`, code: "empty-table-heading" },
  { title: "invalid heading scope", html: `<table><caption>Items</caption><tr><th scope="diagonal">Label</th></tr></table>`, code: "invalid-header-scope" },
  { title: "broken cell header reference", html: `<table><caption>Items</caption><tr><th id="name">Name</th></tr><tr><td headers="absent">A</td></tr></table>`, code: "broken-headers-ref" },
  { title: "ambiguous cell header reference", html: `<table><caption>Items</caption><tr><th id="same">Name</th><th id="same">Value</th></tr><tr><td headers="same">A</td></tr></table>`, code: "ambiguous-headers-ref" },
  { title: "hidden caption", html: `<table><caption hidden>Items</caption><tr><th>Name</th></tr><tr><td>A</td></tr></table>`, code: "caption-hidden" },
  { title: "presentation table with headings", html: `<table role="presentation"><tr><th>Visual</th></tr></table>`, code: "table-presentation-has-headers" },
  { title: "sort control missing direction", html: `<table><caption>Items</caption><tr><th data-a11y-sortable><button>Name</button></th></tr></table>`, code: "sorting-without-direction" },
  { title: "invalid sort state", html: `<table><caption>Items</caption><tr><th aria-sort="up">Name</th></tr></table>`, code: "invalid-sort-direction" },
  { title: "sorting state on data cell", html: `<table><caption>Items</caption><tr><th>Name</th></tr><tr><td aria-sort="ascending">A</td></tr></table>`, code: "sort-direction-on-cell" },
  { title: "two primary sorts", html: `<table><caption>Items</caption><tr><th aria-sort="ascending">Name</th><th aria-sort="descending">Date</th></tr></table>`, code: "multiple-sort-primaries" },
  { title: "sort action not focusable", html: `<table><caption>Items</caption><tr><th data-a11y-sortable aria-sort="ascending">Name</th></tr></table>`, code: "sort-action-not-keyboard" },
  { title: "invalid grid row count", html: `<div role="grid" aria-label="Grid" aria-rowcount="0" tabindex="0"><div role="row"><span role="gridcell">A</span></div></div>`, code: "invalid-row-count" },
  { title: "invalid grid column count", html: `<div role="grid" aria-label="Grid" aria-colcount="0" tabindex="0"><div role="row"><span role="gridcell">A</span></div></div>`, code: "invalid-column-count" },
  { title: "grid without rows", html: `<div role="grid" aria-label="Grid" tabindex="0">Empty</div>`, code: "grid-without-rows" },
  { title: "grid row without cells", html: `<div role="grid" aria-label="Grid" tabindex="0"><div role="row">Empty</div></div>`, code: "grid-row-without-cells" },
  { title: "grid cell outside row", html: `<div role="grid" aria-label="Grid" tabindex="0"><div role="gridcell">A</div></div>`, code: "grid-cell-outside-row" },
  { title: "grid lacks name", html: `<div role="grid" tabindex="0"><div role="row"><span role="gridcell">A</span></div></div>`, code: "grid-without-name" },
  { title: "grid lacks keyboard entry", html: `<div role="grid" aria-label="Grid"><div role="row"><span role="gridcell">A</span></div></div>`, code: "grid-without-keyboard-entry" },
  { title: "invalid row index", html: `<div role="grid" aria-label="Grid" tabindex="0"><div role="row"><span role="gridcell" aria-rowindex="0">A</span></div></div>`, code: "invalid-row-index" },
  { title: "invalid column index", html: `<div role="grid" aria-label="Grid" tabindex="0"><div role="row"><span role="gridcell" aria-colindex="0">A</span></div></div>`, code: "invalid-column-index" },
  { title: "invalid selection state", html: `<div role="grid" aria-label="Grid" tabindex="0"><div role="row"><span role="gridcell" aria-selected="maybe">A</span></div></div>`, code: "invalid-selection-state" },
  { title: "selection without state", html: `<div role="grid" aria-label="Grid" tabindex="0"><div role="row"><span role="gridcell" data-a11y-selectable>A</span></div></div>`, code: "selection-without-state" },
  { title: "listbox without name", html: `<div role="listbox" tabindex="0"><div role="option">A</div></div>`, code: "listbox-without-name" },
  { title: "listbox without options", html: `<div role="listbox" aria-label="Options" tabindex="0"></div>`, code: "listbox-without-options" },
  { title: "unnamed option", html: `<div role="listbox" aria-label="Options" tabindex="0"><div role="option"></div></div>`, code: "option-without-name" },
  { title: "orphaned option", html: `<div role="option">A</div>`, code: "option-outside-listbox" },
  { title: "multiple selections in single listbox", html: `<div role="listbox" aria-label="Options" tabindex="0"><div role="option" aria-selected="true">A</div><div role="option" aria-selected="true">B</div></div>`, code: "multiple-selected-options" },
  { title: "invalid option selection state", html: `<div role="listbox" aria-label="Options" tabindex="0"><div role="option" aria-selected="maybe">A</div></div>`, code: "invalid-option-state" },
  { title: "slider without name", html: `<div role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="10" aria-valuenow="5"></div>`, code: "slider-without-name" },
  { title: "slider without range", html: `<div role="slider" tabindex="0" aria-label="Amount" aria-valuemin="10" aria-valuemax="5"></div>`, code: "slider-without-range" },
  { title: "slider outside range", html: `<div role="slider" tabindex="0" aria-label="Amount" aria-valuemin="0" aria-valuemax="10" aria-valuenow="20"></div>`, code: "slider-value-outside-range" },
  { title: "slider without keyboard entry", html: `<div role="slider" aria-label="Amount" aria-valuemin="0" aria-valuemax="10" aria-valuenow="5"></div>`, code: "slider-without-keyboard-entry" },
];
for (const scenario of cases) {
  test(`data-view negative: ${scenario.title}`, async ({ page }) => {
    await negative(page, scenario.html, scenario.code);
  });
}

test("named table with scope and header references passes", async ({ page }) => {
  await mount(page, `<table><caption>Items</caption><thead><tr><th id="name" scope="col">Name</th><th id="value" scope="col">Value</th></tr></thead>
    <tbody><tr><td headers="name">A</td><td headers="value">1</td></tr></tbody></table>`);
  expect((await auditDataViewsRound11(page)).findings).toEqual([]);
});

test("well-labelled sortable table uses a native sort button", async ({ page }) => {
  await mount(page, `<table><caption>Items</caption><tr><th id="head" aria-sort="ascending" data-a11y-sortable>
    <button id="sort" type="button">Name ascending</button></th></tr><tr><td>A</td></tr></table>`);
  expect((await auditDataViewsRound11(page)).findings).toEqual([]);
  await page.locator("#sort").focus();
  await expect(page.locator("#sort")).toBeFocused();
});

test("grid with roving tabindex has one keyboard entry", async ({ page }) => {
  await mount(page, `<div role="grid" aria-label="Results"><div role="row"><span role="gridcell" tabindex="0">A</span>
    <span role="gridcell" tabindex="-1">B</span></div></div>`);
  expect((await auditDataViewsRound11(page)).findings).toEqual([]);
});

test("multi-select listbox may select two named options", async ({ page }) => {
  await mount(page, `<div role="listbox" tabindex="0" aria-label="Choices" aria-multiselectable="true">
    <div role="option" aria-selected="true">A</div><div role="option" aria-selected="true">B</div></div>`);
  expect((await auditDataViewsRound11(page)).findings).toEqual([]);
});

test("single-select listbox exposes one selected option", async ({ page }) => {
  await mount(page, `<div role="listbox" tabindex="0" aria-label="Choices"><div role="option" aria-selected="true">A</div>
    <div role="option" aria-selected="false">B</div></div>`);
  expect((await auditDataViewsRound11(page)).findings).toEqual([]);
});

test("native labelled range is keyboard-operable", async ({ page }) => {
  await mount(page, `<label for="amount">Amount</label><input type="range" id="amount" min="0" max="10" value="5" />`);
  expect((await auditDataViewsRound11(page)).findings).toEqual([]);
  await page.locator("#amount").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#amount")).toHaveValue("6");
});

test("rendered decorative layout table without headings is permitted", async ({ page }) => {
  await mount(page, `<table role="presentation"><tr><td>Left</td><td>Right</td></tr></table>`);
  expect((await auditDataViewsRound11(page)).findings).toEqual([]);
});

test("hidden data table does not create an invented data-view issue", async ({ page }) => {
  await mount(page, `<section hidden><table><tr><td>Hidden</td></tr></table></section>`);
  const report = await auditDataViewsRound11(page);
  expect(report.tables).toBe(0);
  expect(report.findings).toEqual([]);
});

test("native table with one heading and no data rows is acceptable", async ({ page }) => {
  await mount(page, `<table aria-label="Empty report"><thead><tr><th scope="col">Name</th></tr></thead></table>`);
  expect((await auditDataViewsRound11(page)).findings).toEqual([]);
});

test("an empty page has zero data widgets", async ({ page }) => {
  await mount(page, `<p>Nothing recorded.</p>`);
  const report = await auditDataViewsRound11(page);
  expect(report.tables).toBe(0);
  expect(report.grids).toBe(0);
  expect(report.listboxes).toBe(0);
  expect(report.sliders).toBe(0);
  expect(report.findings).toEqual([]);
});
