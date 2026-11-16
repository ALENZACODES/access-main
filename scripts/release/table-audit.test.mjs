import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectDataTable, inspectHtmlTables, tableStructure } from './table-audit.mjs';

const base = '<table><caption>Accessible place details</caption><tr><th scope="col">Name</th><th scope="col">Status</th></tr><tr><td>Library</td><td>UNKNOWN</td></tr></table>';
const has = (issues, code) => assert.ok(issues.some((issue) => issue.code === code),
  `Expected ${code}, got ${issues.map((issue) => issue.code).join(', ')}`);

describe('data tables and captions', () => {
  it('accepts a captioned table', () => assert.deepEqual(inspectHtmlTables(base), []));
  it('accepts an aria-label', () => assert.deepEqual(inspectHtmlTables('<table aria-label="Places"><tr><th>Name</th></tr><tr><td>A</td></tr></table>'), []));
  it('accepts a referenced label', () => assert.deepEqual(inspectHtmlTables('<table aria-labelledby="heading"><caption id="heading">List</caption><tr><th>Name</th></tr><tr><td>A</td></tr></table>'), []));
  it('rejects a missing name', () => has(inspectHtmlTables('<table><tr><th>Name</th><td>A</td></tr></table>'), 'TABLE_NAME'));
  it('rejects missing headers', () => has(inspectHtmlTables('<table><caption>Items</caption><tr><td>A</td></tr></table>'), 'TABLE_HEADERS'));
  it('rejects missing rows', () => has(inspectHtmlTables('<table><caption>Items</caption><th>A</th><td>B</td></table>'), 'TABLE_ROWS'));
  it('accepts header-only table', () => assert.deepEqual(inspectHtmlTables('<table><caption>Items</caption><tr><th>A</th></tr></table>'), []));
  it('allows a presentation-only table', () => assert.deepEqual(inspectHtmlTables('<table role="presentation"><tr><td>A</td></tr></table>'), []));
  it('rejects presentation headers', () => has(inspectHtmlTables('<table role="presentation"><tr><th>A</th></tr></table>'), 'TABLE_PRESENTATION_HEADER'));
  it('rejects presentation interactive controls', () => has(inspectHtmlTables('<table role="none"><tr><td><button>Go</button></td></tr></table>'), 'TABLE_PRESENTATION_INTERACTIVE'));
  it('rejects nested tables', () => has(inspectDataTable('<table><caption>Outer</caption><table><caption>Inner</caption></table></table>'), 'TABLE_NESTED'));
  it('rejects an unfinished table', () => has(inspectHtmlTables('<table><tr><td>A</td></tr>'), 'TABLE_UNCLOSED'));
  it('accepts a page without tables', () => assert.deepEqual(inspectHtmlTables('<main>Text</main>'), []));
  it('counts distinct tables', () => assert.deepEqual(inspectHtmlTables(base + base), []));
  it('summarizes counts', () => assert.deepEqual(tableStructure(base), { name: 'Accessible place details', headerCells: 2, dataCells: 2, rows: 2, nestedTables: 1, controls: 0 }));
  it('returns empty summary for missing table', () => assert.equal(tableStructure('<p>none</p>').rows, 0));
});

describe('header semantics', () => {
  for (const scope of ['row', 'col', 'rowgroup', 'colgroup']) {
    it(`accepts ${scope}`, () => assert.deepEqual(inspectHtmlTables(`<table><caption>Items</caption><tr><th scope="${scope}">A</th><td>B</td></tr></table>`), []));
  }
  it('rejects invalid scope', () => has(inspectHtmlTables('<table><caption>Items</caption><tr><th scope="header">A</th></tr></table>'), 'TABLE_SCOPE'));
  for (const sort of ['ascending', 'descending', 'none', 'other']) {
    it(`accepts aria-sort ${sort}`, () => assert.deepEqual(inspectHtmlTables(`<table><caption>Items</caption><tr><th aria-sort="${sort}">A</th></tr></table>`), []));
  }
  it('rejects invalid aria-sort', () => has(inspectHtmlTables('<table><caption>Items</caption><tr><th aria-sort="sorted">A</th></tr></table>'), 'TABLE_SORT'));
  it('accepts explicit headers reference', () => assert.deepEqual(inspectHtmlTables('<table><caption>Items</caption><tr><th id="h">Name</th></tr><tr><td headers="h">A</td></tr></table>'), []));
  it('rejects missing header reference', () => has(inspectHtmlTables('<table><caption>Items</caption><tr><th>Name</th></tr><tr><td headers="missing">A</td></tr></table>'), 'TABLE_HEADER_REFERENCE'));
  it('rejects empty header reference', () => has(inspectHtmlTables('<table><caption>Items</caption><tr><th>Name</th><td headers="">A</td></tr></table>'), 'TABLE_EMPTY_HEADERS'));
  it('rejects header references to data cells', () => has(inspectHtmlTables('<table><caption>Items</caption><tr><th>Name</th><td id="data" headers="data">A</td></tr></table>'), 'TABLE_HEADER_REFERENCE'));
  it('accepts positive cell spans', () => assert.deepEqual(inspectHtmlTables('<table><caption>Items</caption><tr><th colspan="2">Name</th></tr><tr><td rowspan="2">A</td></tr></table>'), []));
  for (const attribute of ['colspan', 'rowspan']) {
    for (const value of ['0', '-1', '1.5', 'one']) {
      it(`rejects ${attribute} ${value}`, () => has(inspectHtmlTables(`<table><caption>Items</caption><tr><th ${attribute}="${value}">A</th></tr></table>`), 'TABLE_SPAN'));
    }
  }
  it('rejects a broken table name reference', () => has(inspectHtmlTables('<table aria-labelledby="absent"><tr><th>A</th></tr></table>'), 'TABLE_LABEL_REFERENCE'));
  it('rejects a positive tabindex in controls', () => has(inspectHtmlTables('<table><caption>Items</caption><tr><th>A</th><td><button tabindex="2">Go</button></td></tr></table>'), 'TABLE_TAB_ORDER'));
  it('accepts natural tabindex', () => assert.deepEqual(inspectHtmlTables('<table><caption>Items</caption><tr><th>A</th><td><button tabindex="0">Go</button></td></tr></table>'), []));
  it('rejects legacy summary without caption', () => has(inspectHtmlTables('<table summary="total count"><tr><th>A</th></tr></table>'), 'TABLE_LEGACY_SUMMARY'));
  it('includes table number in diagnostics', () => assert.match(inspectDataTable('<table><td>A</td></table>', 'fr/places.html', 3)[0].detail, /^Table 3:/));
});
