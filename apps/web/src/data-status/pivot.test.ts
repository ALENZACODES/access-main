import { describe, expect, it } from 'vitest';
import { parseCsv } from './consistency';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, NO_FILTERS, type Filters } from './filters';
import { handleDataStatus } from './http';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  buildPivot,
  describePivot,
  describePivotPicked,
  isPivotDim,
  parsePivot,
  parsePivotAction,
  PIVOT_DIMS,
  PIVOT_EXPORT_ACTION,
  PIVOT_FILENAME,
  pivotAction,
  pivotCaption,
  pivotCellFilters,
  pivotCellLabel,
  pivotDimLabel,
  pivotParams,
  pivotRows,
  pivotToCsv,
  pivotValueLabel,
  pivotValueOf,
  pivotValues,
  renderPivotControl,
  renderPivotHtml,
  withPivotValue,
  type PivotCell,
  type PivotDim,
  type PivotSpec,
} from './pivot';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { buildQuery, parseTableView } from './tableView';
import { FakeHost, NOW, structureProblems, targetsBelow44 } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [src('a'), src('b', { tier: 'E' }), src('c', { retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary', tier: 'E' }), src('d', { retrievedAt: null, licence: null, tier: null })],
  },
  { id: 'r&d=1', name: 'Routes', kind: 'routes', sources: [src('e'), src('f', { tier: 3 })] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const NAMES = new Map([['p', 'Places'], ['r&d=1', 'Routes']]);
const pivot = (rows: PivotDim, cols: PivotDim | null = null, f: Filters = NO_FILTERS) => buildPivot(applyFilters(audit.sources, f), { rows, cols });

describe('the address', () => {
  it('reads the fact down the side and the fact across', () => {
    expect(parsePivot('?pv=tier&pvby=state')).toEqual({ rows: 'tier', cols: 'state' });
    expect(parsePivot('pv=dataset')).toEqual({ rows: 'dataset', cols: null });
  });
  it('gives no table without a valid first fact, and one count per row without a valid second', () => {
    for (const q of ['', '?pv=', '?pv=none', '?pv=Tier', '?pvby=state', '?pv=gap']) expect(parsePivot(q), q).toBeNull();
    for (const q of ['?pv=tier&pvby=tier', '?pv=tier&pvby=none', '?pv=tier&pvby=x']) expect(parsePivot(q), q).toEqual({ rows: 'tier', cols: null });
  });
  it('writes itself back', () => {
    expect(pivotParams(null)).toEqual([]);
    expect(pivotParams(undefined)).toEqual([]);
    expect(pivotParams({ rows: 'tier', cols: null })).toEqual([['pv', 'tier']]);
    expect(pivotParams({ rows: 'tier', cols: 'tier' })).toEqual([['pv', 'tier']]);
    for (const rows of PIVOT_DIMS) {
      for (const cols of [null, ...PIVOT_DIMS.filter((d) => d !== rows)]) {
        const spec: PivotSpec = { rows, cols };
        expect(parsePivot(new URLSearchParams(pivotParams(spec)).toString())).toEqual(spec);
      }
    }
  });
  it('is part of the table view and of the links that keep it', () => {
    expect(parseTableView('?pv=tier&pvby=state').pivot).toEqual({ rows: 'tier', cols: 'state' });
    expect('pivot' in parseTableView('?sort=tier')).toBe(false);
    const q = buildQuery({ filters: { ...NO_FILTERS, kind: 'places' }, thresholds: {} }, parseTableView('?pv=age&cols=kind'));
    expect(parsePivot(q)).toEqual({ rows: 'age', cols: null });
    expect(q).toContain('cols=kind');
  });
  it('knows its facts', () => {
    for (const d of PIVOT_DIMS) expect(isPivotDim(d)).toBe(true);
    for (const bad of ['gap', 'due', '', 'constructor', null, 1]) expect(isPivotDim(bad)).toBe(false);
  });
});

describe('buildPivot', () => {
  it('counts each source once, with one count per row when there is no second fact', () => {
    const p = pivot('tier');
    expect(p.rows.map((r) => [r.value, r.total])).toEqual([['0', 2], ['3', 1], ['E', 2], ['unknown', 1]]);
    expect(p.cols).toEqual([]);
    expect(p.rows.every((r) => r.cells.length === 0)).toBe(true);
    expect(p.total).toBe(6);
  });
  it('counts two ways, with totals that agree in both directions', () => {
    const p = pivot('tier', 'state');
    expect(p.cols.map((c) => [c.value, c.total])).toEqual([['fresh', 4], ['stale', 1], ['unknown', 1]]);
    expect(p.rows.map((r) => [r.value, ...r.cells, r.total])).toEqual([['0', 2, 0, 0, 2], ['3', 1, 0, 0, 1], ['E', 1, 1, 0, 2], ['unknown', 0, 0, 1, 1]]);
    expect(p.rows.reduce((n, r) => n + r.total, 0)).toBe(p.total);
    expect(p.cols.reduce((n, c) => n + c.total, 0)).toBe(p.total);
  });
  it('lists only the values in use, in the fixed order, and datasets in the order they appear', () => {
    expect(pivotValues(audit.sources, 'state')).toEqual(['fresh', 'stale', 'unknown']);
    expect(pivotValues(audit.sources, 'licence')).toEqual(['open', 'unrecognised', 'unknown']);
    expect(pivotValues(audit.sources, 'dataset')).toEqual(['p', 'r&d=1']);
    expect(pivotValues(audit.sources, 'kind')).toEqual(['places', 'routes']);
    expect(pivotValues([], 'tier')).toEqual([]);
  });
  it('treats the same fact twice as one count per row', () => {
    expect(buildPivot(audit.sources, { rows: 'tier', cols: 'tier' }).spec).toEqual({ rows: 'tier', cols: null });
  });
  it('follows the filters', () => {
    const p = pivot('licence', 'kind', { ...NO_FILTERS, state: 'fresh' });
    expect(p.total).toBe(4);
    expect(p.rows.map((r) => r.value)).toEqual(['open']);
    expect(p.cols.map((c) => [c.value, c.total])).toEqual([['places', 2], ['routes', 2]]);
  });
  it('is empty for an empty list', () => {
    expect(buildPivot([], { rows: 'tier', cols: 'state' })).toEqual({ spec: { rows: 'tier', cols: 'state' }, cols: [], rows: [], total: 0 });
  });
  it('on random registries every cell lists exactly its count, for every pair of facts', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const rows of PIVOT_DIMS) {
        for (const cols of PIVOT_DIMS) {
          if (rows === cols) continue;
          const p = buildPivot(a.sources, { rows, cols });
          expect(p.rows.reduce((n, r) => n + r.total, 0), `seed ${seed} ${rows}/${cols}`).toBe(a.sources.length);
          expect(p.cols.reduce((n, c) => n + c.total, 0)).toBe(a.sources.length);
          for (const r of p.rows) {
            expect(r.cells.reduce((n, c) => n + c, 0)).toBe(r.total);
            expect(a.sources.filter((s) => pivotValueOf(s, rows) === r.value).length).toBe(r.total);
          }
        }
      }
    }
  });
  it('on random registries a cell and its filters agree, for the facts that have a filter value for every source', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const p = buildPivot(a.sources, { rows: 'tier', cols: 'state' });
      for (const r of p.rows) {
        r.cells.forEach((n, i) => {
          const f = pivotCellFilters(NO_FILTERS, { rows: 'tier', row: r.value, cols: 'state', col: p.cols[i]!.value });
          expect(f).not.toBeNull();
          expect(applyFilters(a.sources, f!).length, `seed ${seed} ${r.value}/${p.cols[i]!.value}`).toBe(n);
        });
      }
    }
  });
});

describe('cells, filters and actions', () => {
  it('sets one fact, or two, and leaves the other filters and the input alone', () => {
    const f: Filters = { ...NO_FILTERS, query: 'bus', gap: 'date' };
    const copy = { ...f };
    expect(withPivotValue(f, 'state', 'stale')).toEqual({ ...f, state: 'stale' });
    expect(withPivotValue(f, 'kind', 'routes')).toEqual({ ...f, kind: 'routes' });
    expect(withPivotValue(f, 'dataset', 'r&d=1')).toEqual({ ...f, dataset: 'r&d=1' });
    expect(pivotCellFilters(f, { rows: 'tier', row: 'E', cols: 'licence', col: 'open' })).toEqual({ ...f, tier: 'E', licence: 'open' });
    expect(pivotCellFilters(f, { rows: 'age', row: 'd0_30', cols: null, col: null })).toEqual({ ...f, age: 'd0_30' });
    expect(f).toEqual(copy);
  });
  it('refuses a value the fact cannot take, and the same fact twice', () => {
    expect(withPivotValue(NO_FILTERS, 'state', 'any')).toBeNull();
    expect(withPivotValue(NO_FILTERS, 'tier', '9')).toBeNull();
    expect(withPivotValue(NO_FILTERS, 'kind', 'toString')).toBeNull();
    expect(withPivotValue(NO_FILTERS, 'licence', 'closed')).toBeNull();
    expect(withPivotValue(NO_FILTERS, 'age', 'd1')).toBeNull();
    expect(pivotCellFilters(NO_FILTERS, { rows: 'tier', row: 'E', cols: 'tier', col: '0' })).toBeNull();
    expect(pivotCellFilters(NO_FILTERS, { rows: 'tier', row: 'E', cols: 'state', col: 'nope' })).toBeNull();
  });
  it('round-trips cells through their actions, whatever the dataset id holds', () => {
    const cells: PivotCell[] = [
      { rows: 'tier', row: 'E', cols: null, col: null },
      { rows: 'tier', row: 'unknown', cols: 'state', col: 'stale' },
      { rows: 'dataset', row: 'r&d=1', cols: 'kind', col: 'routes' },
      { rows: 'state', row: 'fresh', cols: 'dataset', col: 'a:b|c d/é' },
    ];
    for (const cell of cells) expect(parsePivotAction(pivotAction(cell))).toEqual(cell);
  });
  it('rejects anything that is not a cell', () => {
    for (const bad of [null, undefined, '', 'pivot:', 'pivot:tier', 'pivot:tier=', 'pivot:gap=date', 'pivot:tier=E&tier=0', 'pivot:tier=E&state', 'pivot:tier=E&state=stale&kind=places', 'pivot:tier=%E0%A4%A', 'show:tier:E', 'PIVOT:tier=E']) {
      expect(parsePivotAction(bad), String(bad)).toBeNull();
    }
  });
});

describe('the words', () => {
  it('names the facts differently, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) expect(new Set(PIVOT_DIMS.map((d) => pivotDimLabel(d, locale))).size).toBe(PIVOT_DIMS.length);
  });
  it('names values as the rest of the panel does, with UNKNOWN for what is not known', () => {
    expect(pivotValueLabel('tier', 'E', 'en')).toBe('Tier E');
    expect(pivotValueLabel('tier', 'unknown', 'en')).toBe('UNKNOWN');
    expect(pivotValueLabel('tier', 'unknown', 'fr')).toBe('UNKNOWN');
    expect(pivotValueLabel('licence', 'unknown', 'fr')).toBe('UNKNOWN');
    expect(pivotValueLabel('state', 'stale', 'en')).toBe('May be out of date');
    expect(pivotValueLabel('kind', 'routes', 'fr')).not.toBe('routes');
    expect(pivotValueLabel('dataset', 'p', 'en', NAMES)).toBe('Places');
    expect(pivotValueLabel('dataset', 'zz', 'en', NAMES)).toBe('zz');
    expect(pivotValueLabel('age', 'd0_30', 'en')).toBe('0 to 30 days');
    expect(pivotValueLabel('state', 'nope', 'en')).toBe('nope');
  });
  it('captions the table, says what was drawn and what was picked', () => {
    expect(pivotCaption({ rows: 'tier', cols: 'state' }, 'en')).toBe('Listed sources by tier and status');
    expect(pivotCaption({ rows: 'dataset', cols: null }, 'en')).toBe('Listed sources by dataset');
    expect(describePivot({ rows: 'tier', cols: 'state' }, 'en')).toBe('Count table by tier and status.');
    expect(describePivot({ rows: 'tier', cols: null }, 'en')).toBe('Count table by tier.');
    expect(describePivot(null, 'en')).toBe('Count table removed.');
    const cell: PivotCell = { rows: 'tier', row: 'E', cols: 'state', col: 'stale' };
    expect(pivotCellLabel(cell, 'en')).toBe('Tier E, May be out of date');
    expect(describePivotPicked(cell, 1, 'en')).toBe('List narrowed to 1 source. Tier E, May be out of date.');
    expect(describePivotPicked({ rows: 'dataset', row: 'p', cols: null, col: null }, 4, 'en', NAMES)).toBe('List narrowed to 4 sources. Places.');
    for (const text of [describePivot({ rows: 'age', cols: 'licence' }, 'fr'), describePivot(null, 'fr'), describePivotPicked(cell, 2, 'fr'), pivotCaption({ rows: 'kind', cols: 'tier' }, 'fr')]) expect(lintFrench(text), text).toEqual([]);
  });
});

describe('renderPivotHtml', () => {
  it('has a caption, a header per column and per row, and a totals row and column', () => {
    const p = pivot('tier', 'state');
    const html = renderPivotHtml(p, 'en');
    expect(html).toContain('data-pivot="tier state"');
    expect(html.match(/<caption>/g)).toHaveLength(1);
    expect(html.match(/<th scope="col">/g)).toHaveLength(1 + 3 + 1);
    expect(html.match(/<th scope="row">/g)).toHaveLength(4 + 1);
    expect(html).toContain('<tr><th scope="row">All</th><td>4</td><td>1</td><td>1</td><td>6</td></tr>');
  });
  it('makes a number a button only when it would narrow the list', () => {
    const html = renderPivotHtml(pivot('tier', 'state'), 'en');
    // 4 cells with sources and 4 row totals; no zero is a button and no total of a column is.
    expect(html.match(/<button /g)).toHaveLength(5 + 4);
    expect(html).not.toMatch(/<button[^>]*>0<\/button>/);
    expect(html).toContain('data-action="pivot:tier=E&amp;state=stale" aria-label="1 source. Tier E, May be out of date. List it"');
    expect(html).toContain('aria-label="2 sources. Tier E. List them"');
    const all = renderPivotHtml(pivot('kind', null, { ...NO_FILTERS, kind: 'places' }), 'en');
    expect(all).not.toContain('<button');
  });
  it('starts each control name with the number it shows', () => {
    const html = renderPivotHtml(pivot('licence', 'kind'), 'en');
    for (const m of html.matchAll(/aria-label="(\d+) [^"]*"[^>]*>(\d+)</g)) expect(m[1]).toBe(m[2]);
    expect([...html.matchAll(/aria-label="\d+ /g)].length).toBeGreaterThan(3);
  });
  it('uses links on static pages, and plain numbers where there is no link to give', () => {
    const html = renderPivotHtml(pivot('tier', 'state'), 'en', { hrefFor: (c) => (c.row === 'E' ? `/x?${c.rows}=${c.row}&c=${c.col ?? ''}` : null) });
    expect(html).not.toContain('<button');
    expect(html).toContain('href="/x?tier=E&amp;c=stale"');
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(targetsBelow44(html)).toEqual([]);
  });
  it('says so when nothing is listed', () => {
    const html = renderPivotHtml(buildPivot([], { rows: 'tier', cols: null }), 'en');
    expect(html).not.toContain('<table');
    expect(visibleText(html)).toContain('No source is listed, so there is nothing to count.');
  });
  it('escapes names', () => {
    const html = renderPivotHtml(pivot('dataset', 'kind'), 'en', { datasetNames: new Map([['p', '<b>P</b>']]) });
    expect(html).not.toContain('<b>P</b>');
    expect(html).toContain('&lt;b&gt;P&lt;/b&gt;');
    expect(html).toContain('pivot:dataset=r%26d%3D1&amp;kind=routes');
  });
  it('passes the audits in both languages for every pair of facts', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const rows of PIVOT_DIMS) {
        for (const cols of [null, ...PIVOT_DIMS.filter((d) => d !== rows)]) {
          const html = renderPivotHtml(pivot(rows, cols), locale, { datasetNames: NAMES });
          expect(scanHtml(html), `${rows}/${cols}`).toEqual([]);
          expect(structureProblems(html), `${rows}/${cols}`).toEqual([]);
          expect(targetsBelow44(html), `${rows}/${cols}`).toEqual([]);
        }
      }
      const control = renderPivotControl({ rows: 'tier', cols: 'state' }, locale);
      expect(structureProblems(control)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(control))).toEqual([]);
    }
  });
  it('the control selects what is drawn', () => {
    const off = renderPivotControl(null, 'en');
    expect(off.match(/<option value="none" selected>/g)).toHaveLength(2);
    const on = renderPivotControl({ rows: 'tier', cols: 'state' }, 'en');
    expect(on).toContain('<option value="tier" selected>Tier</option>');
    expect(on).toContain('<option value="state" selected>Status</option>');
    expect(on.match(/ selected>/g)).toHaveLength(2);
  });
});

describe('the file', () => {
  it('has a heading row, a row per value and the totals, and reads back as the same numbers', () => {
    const p = pivot('tier', 'state');
    expect(pivotRows(p, 'en')).toEqual([
      ['Tier', 'Within its review period', 'May be out of date', 'Update date UNKNOWN', 'All'],
      ['Tier 0', '2', '0', '0', '2'],
      ['Tier 3', '1', '0', '0', '1'],
      ['Tier E', '1', '1', '0', '2'],
      ['UNKNOWN', '0', '0', '1', '1'],
      ['All', '4', '1', '1', '6'],
    ]);
    expect(parseCsv(pivotToCsv(p, 'en'))).toEqual(pivotRows(p, 'en'));
    expect(pivotRows(pivot('dataset'), 'fr', NAMES)).toEqual([['Jeu de données', 'Sources'], ['Places', '4'], ['Routes', '2'], ['Ensemble', '6']]);
  });
  it('the server sends it for the table in the address, and by status when none is named', async () => {
    const ctx = { getRecords: () => RECORDS, now: () => NOW };
    const res = await handleDataStatus({ method: 'GET', url: '/en/data-status/list-counts.csv?pv=tier&pvby=state&state=fresh', headers: {} }, ctx);
    expect(res?.status).toBe(200);
    expect(res?.headers['content-disposition']).toBe(`attachment; filename="${PIVOT_FILENAME}"`);
    expect(res?.body).toBe(pivotToCsv(pivot('tier', 'state', { ...NO_FILTERS, state: 'fresh' }), 'en', NAMES));
    const plain = await handleDataStatus({ method: 'GET', url: '/fr/data-status/list-counts.csv', headers: {} }, ctx);
    expect(plain?.body).toBe(pivotToCsv(pivot('state'), 'fr', NAMES));
  });
});

describe('in the panel', () => {
  const mount = (initialPivot?: PivotSpec) => {
    const host = new FakeHost();
    const changes: string[] = [];
    const files: { text: string; filename: string; mime: string }[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (v) => changes.push(v), onExportFile: (f) => files.push(f), ...(initialPivot ? { initialPivot } : {}) });
    return { host, panel, changes, files };
  };
  it('draws no table until a fact is chosen', () => {
    const { host, panel } = mount();
    expect(panel.getPivot()).toBeNull();
    expect(host.innerHTML).not.toContain('data-pivot=');
    expect(host.innerHTML).toContain('id="ds-pv-rows"');
  });
  it('draws the table, says so, keeps focus on the select and puts the choice in the address', () => {
    const { host, panel, changes } = mount();
    host.filter('change', 'pivotRows', 'tier');
    expect(panel.getPivot()).toEqual({ rows: 'tier', cols: null });
    expect(host.innerHTML).toContain('data-pivot="tier"');
    expect(host.announce.innerHTML).toContain('Count table by tier.');
    expect(host.focused.at(-1)).toBe('#ds-pv-rows');
    expect(changes.at(-1)).toBe('?pv=tier');
    host.filter('change', 'pivotCols', 'state');
    expect(panel.getPivot()).toEqual({ rows: 'tier', cols: 'state' });
    expect(host.innerHTML).toContain('data-pivot="tier state"');
    expect(host.focused.at(-1)).toBe('#ds-pv-cols');
    expect(changes.at(-1)).toBe('?pv=tier&pvby=state');
  });
  it('drops the second fact when it becomes the same as the first, and the table when the first is cleared', () => {
    const { host, panel } = mount({ rows: 'tier', cols: 'state' });
    host.filter('change', 'pivotRows', 'state');
    expect(panel.getPivot()).toEqual({ rows: 'state', cols: null });
    host.filter('change', 'pivotCols', 'state');
    expect(panel.getPivot()).toEqual({ rows: 'state', cols: null });
    host.filter('change', 'pivotRows', 'none');
    expect(panel.getPivot()).toBeNull();
    expect(host.innerHTML).not.toContain('data-pivot=');
    expect(host.announce.innerHTML).toContain('Count table removed.');
    host.filter('change', 'pivotCols', 'tier');
    expect(panel.getPivot()).toBeNull();
  });
  it('narrows the list to a cell when its number is chosen', () => {
    const { host, panel } = mount({ rows: 'tier', cols: 'state' });
    host.click(pivotAction({ rows: 'tier', row: 'E', cols: 'state', col: 'stale' }));
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, tier: 'E', state: 'stale' });
    expect(host.announce.innerHTML).toContain('List narrowed to 1 source. Tier E, May be out of date.');
    expect(host.innerHTML).toContain('data-listed-summary="1"');
    expect(host.focused.at(-1)).toBe('#ds-pv-rows');
    expect(panel.getPivot()).toEqual({ rows: 'tier', cols: 'state' });
  });
  it('ignores a cell it cannot read', () => {
    const { host, panel, changes } = mount({ rows: 'tier', cols: null });
    host.click('pivot:tier=9');
    host.click('pivot:nope=1');
    expect(panel.getFilters()).toEqual(NO_FILTERS);
    expect(changes).toEqual([]);
  });
  it('follows the filters and saves the table as a file', () => {
    const { host, files } = mount({ rows: 'licence', cols: 'kind' });
    host.filter('change', 'state', 'fresh');
    expect(host.region.innerHTML).toContain('data-pivot="licence kind"');
    host.click(PIVOT_EXPORT_ACTION);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ filename: PIVOT_FILENAME, mime: 'text/csv;charset=utf-8' });
    expect(files[0]?.text).toBe(pivotToCsv(pivot('licence', 'kind', { ...NO_FILTERS, state: 'fresh' }), 'en', NAMES));
  });
  it('saves nothing when no table is drawn', () => {
    const { host, files } = mount();
    host.click(PIVOT_EXPORT_ACTION);
    expect(files).toEqual([]);
  });
  it('the static page draws the table from the address, with links that list each cell', async () => {
    const ctx = { getRecords: () => RECORDS, now: () => NOW };
    for (const locale of ['en', 'fr'] as const) {
      const page = (await handleDataStatus({ method: 'GET', url: `/${locale}/data-status?pv=tier&pvby=state`, headers: {} }, ctx))!;
      expect(page.body).toContain('data-pivot="tier state"');
      expect(page.body).not.toContain('data-action="pivot:');
      expect(page.body).toContain(`href="/${locale}/data-status/${PIVOT_FILENAME}?pv=tier&amp;pvby=state"`);
      expect(page.body).toContain('<option value="tier" selected>');
      const cell = /<a href="([^"]+)" aria-label="1 source[^"]*"/.exec(page.body.slice(page.body.indexOf('data-pivot=')))?.[1]?.replace(/&amp;/g, '&');
      expect(cell).toBeTruthy();
      const next = (await handleDataStatus({ method: 'GET', url: cell!, headers: {} }, ctx))!;
      expect(next.body).toContain('data-listed-summary="1"');
      expect(scanHtml(page.body)).toEqual([]);
      expect(describeProblems(auditHtml(page.body))).toEqual([]);
    }
    const live = renderDataStatusPanel({ records: RECORDS, locale: 'fr', now: NOW, live: { sort: null, limit: 50, pivot: { rows: 'age', cols: 'licence' } } });
    expect(describeProblems(auditHtml(live))).toEqual([]);
  });
});
