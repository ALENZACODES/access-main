import { describe, expect, it } from 'vitest';
import {
  COLUMN_IDS,
  columnCellHtml,
  columnCellsHtml,
  columnHeading,
  columnHeadsHtml,
  columnParams,
  columnText,
  describeColumns,
  isColumnId,
  normaliseColumns,
  parseColumns,
  renderColumnChooser,
  toggleColumn,
  type ColumnId,
} from './columns';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { NO_FILTERS } from './filters';
import { handleDataStatus } from './http';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { buildQuery, parseTableView } from './tableView';
import { FakeHost, NOW, structureProblems, targetsBelow44 } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
// Places are reviewed 180 days after retrieval.
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('a'),
      src('one', { retrievedAt: isoDayOffset(NOW, -1) }),
      src('today', { retrievedAt: isoDayOffset(NOW, -180) }),
      src('next', { retrievedAt: isoDayOffset(NOW, -179) }),
      src('past', { retrievedAt: isoDayOffset(NOW, -181), licence: 'Proprietary' }),
      src('old', { retrievedAt: isoDayOffset(NOW, -400), tier: 'E' }),
      src('bare', { retrievedAt: null, licence: null, tier: null }),
    ],
  },
];
const audit = auditRegistry(RECORDS, NOW, {});
const byId = (id: string) => audit.sources.find((s) => s.sourceId === id)!;
const text = (col: ColumnId, id: string, locale: 'en' | 'fr' = 'en') => columnText(col, byId(id), locale);

describe('choosing columns', () => {
  it('knows its own ids and nothing else', () => {
    for (const id of COLUMN_IDS) expect(isColumnId(id)).toBe(true);
    for (const bad of ['', 'tier', 'KIND', 'constructor', null, 3, undefined]) expect(isColumnId(bad)).toBe(false);
  });
  it('keeps the fixed order, drops repeats and anything that is not a column', () => {
    expect(normaliseColumns(['gaps', 'kind', 'gaps', 'nope', 7, 'review'])).toEqual(['kind', 'review', 'gaps']);
    expect(normaliseColumns([])).toEqual([]);
  });
  it('reads the address in both spellings', () => {
    expect(parseColumns('?cols=review,kind')).toEqual(['kind', 'review']);
    expect(parseColumns('cols=review&cols=kind&cols=x')).toEqual(['kind', 'review']);
    expect(parseColumns('?cols=due,,gaps&cols=age,age')).toEqual(['age', 'due', 'gaps']);
    for (const q of ['', '?cols=', '?col=kind', '?cols=tier', '?cols=Kind']) expect(parseColumns(q), q).toEqual([]);
  });
  it('writes the address back, and nothing when no column is chosen', () => {
    expect(columnParams(['review', 'kind'])).toEqual([['cols', 'kind,review']]);
    expect(columnParams([])).toEqual([]);
    expect(columnParams(undefined)).toEqual([]);
    for (const chosen of [[], ['kind'], ['age', 'gaps'], [...COLUMN_IDS]] as ColumnId[][]) {
      const q = new URLSearchParams(columnParams(chosen)).toString();
      expect(parseColumns(q)).toEqual(chosen);
    }
  });
  it('adds and takes out one column without changing the input', () => {
    const start: ColumnId[] = ['kind', 'gaps'];
    expect(toggleColumn(start, 'review', true)).toEqual(['kind', 'review', 'gaps']);
    expect(toggleColumn(start, 'kind', false)).toEqual(['gaps']);
    expect(toggleColumn(start, 'kind', true)).toEqual(['kind', 'gaps']);
    expect(toggleColumn(start, 'age', false)).toEqual(['kind', 'gaps']);
    expect(start).toEqual(['kind', 'gaps']);
  });
  it('is part of the table view and of every link that keeps it', () => {
    expect(parseTableView('?cols=review,kind').columns).toEqual(['kind', 'review']);
    expect('columns' in parseTableView('?sort=tier')).toBe(false);
    const q = buildQuery({ filters: { ...NO_FILTERS, state: 'stale' }, thresholds: {} }, parseTableView('?cols=gaps&group=tier'));
    expect(parseColumns(q)).toEqual(['gaps']);
    expect(q).toContain('group=tier');
    expect(q).toContain('state=stale');
  });
});

describe('what a cell says', () => {
  it('names the kind of data and the licence type', () => {
    expect(text('kind', 'a')).toBe('Places');
    expect(text('kind', 'a', 'fr')).toBe('Lieux');
    expect(text('licenceType', 'a')).toBe('Open licence');
    expect(text('licenceType', 'past')).toBe('Not on the reference list');
  });
  it('counts the age in days, with one day in the singular', () => {
    expect(text('age', 'a')).toBe('3 days');
    expect(text('age', 'one')).toBe('1 day');
    expect(text('age', 'one', 'fr')).toBe('1 jour');
    expect(text('age', 'old', 'fr')).toBe('400 jours');
  });
  it('gives the review date and how far away it is', () => {
    expect(text('review', 'a')).toBe('May 11, 2027');
    expect(text('due', 'a')).toBe('In 177 days');
    expect(text('due', 'next')).toBe('In 1 day');
    expect(text('due', 'today')).toBe('Today');
    expect(text('due', 'past')).toBe('Passed 1 day ago');
    expect(text('due', 'old')).toBe('Passed 220 days ago');
    expect(text('due', 'old', 'fr')).toBe('Dépassée depuis 220 jours');
  });
  it('lists the facts that are not known, or says there is none', () => {
    expect(text('gaps', 'a')).toBe('None');
    expect(text('gaps', 'a', 'fr')).toBe('Aucun');
    expect(text('gaps', 'bare').split(', ')).toHaveLength(3);
  });
  it('writes the token UNKNOWN for what is not known, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const col of ['licenceType', 'age', 'review', 'due'] as const) expect(text(col, 'bare', locale), col).toBe('UNKNOWN');
    }
  });
  it('never gives an empty cell, on random registries', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const s of auditRegistry(randomRegistry(seed, NOW), NOW, {}).sources) {
        for (const col of COLUMN_IDS) for (const locale of ['en', 'fr'] as const) expect(columnText(col, s, locale).trim(), `seed ${seed} ${col}`).not.toBe('');
        expect(columnText('review', s, 'en') === 'UNKNOWN').toBe(columnText('due', s, 'en') === 'UNKNOWN');
      }
    }
  });
  it('passes the French typography lint', () => {
    for (const s of audit.sources) for (const col of COLUMN_IDS) expect(lintFrench(columnText(col, s, 'fr')), `${col} ${s.sourceId}`).toEqual([]);
    for (const col of COLUMN_IDS) expect(lintFrench(columnHeading(col, 'fr'))).toEqual([]);
    expect(new Set(COLUMN_IDS.map((c) => columnHeading(c, 'fr'))).size).toBe(COLUMN_IDS.length);
  });
});

describe('markup', () => {
  it('marks the review date up as a time, and escapes text', () => {
    expect(columnCellHtml('review', byId('a'), 'en')).toBe(`<td><time datetime="${isoDayOffset(NOW, 177)}">May 11, 2027</time></td>`);
    expect(columnCellHtml('review', byId('bare'), 'en')).toBe('<td>UNKNOWN</td>');
    expect(columnCellHtml('age', byId('a'), 'en')).toBe('<td>3 days</td>');
  });
  it('gives one heading and one cell per chosen column, in the same order', () => {
    const chosen: ColumnId[] = ['kind', 'due'];
    expect(columnHeadsHtml(chosen, 'en')).toBe('<th scope="col" data-col="kind">Kind of data</th><th scope="col" data-col="due">Time to review date</th>');
    expect(columnCellsHtml(chosen, byId('a'), 'en')).toBe('<td>Places</td><td>In 177 days</td>');
    expect(columnHeadsHtml([], 'en')).toBe('');
    expect(columnCellsHtml([], byId('a'), 'en')).toBe('');
  });
  it('the chooser has one labelled checkbox per column and ticks the chosen ones', () => {
    const html = renderColumnChooser(['review'], 'en');
    expect(html).toContain('data-columns="1"');
    expect(html.match(/<input type="checkbox"/g)).toHaveLength(COLUMN_IDS.length);
    expect(html.match(/ checked>/g)).toHaveLength(1);
    expect(html).toMatch(/id="ds-col-review" name="cols" value="review" data-filter="col"[^>]* checked>/);
    for (const locale of ['en', 'fr'] as const) {
      const chooser = renderColumnChooser(['kind', 'gaps'], locale);
      expect(scanHtml(chooser)).toEqual([]);
      expect(structureProblems(chooser)).toEqual([]);
      expect(targetsBelow44(chooser)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(chooser))).toEqual([]);
    }
  });
  it('says which columns are shown', () => {
    expect(describeColumns([], 'en')).toBe('No extra column is shown.');
    expect(describeColumns(['kind'], 'en')).toBe('1 extra column shown. Kind of data.');
    expect(describeColumns(['kind', 'gaps'], 'en')).toBe('2 extra columns shown. Kind of data, Facts that are UNKNOWN.');
    for (const chosen of [[], ['age'], ['age', 'due']] as ColumnId[][]) expect(lintFrench(describeColumns(chosen, 'fr'))).toEqual([]);
  });
});

describe('in the panel', () => {
  const mount = (initialColumns?: ColumnId[]) => {
    const host = new FakeHost();
    const changes: string[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (v) => changes.push(v), ...(initialColumns ? { initialColumns } : {}) });
    return { host, panel, changes };
  };
  const heads = (html: string) => [...html.matchAll(/<th scope="col"[^>]*>(?:<[^>]+>)*([^<]+)/g)].map((m) => m[1]);
  it('starts with the five fixed columns and no box ticked', () => {
    const { host, panel } = mount();
    expect(panel.getColumns()).toEqual([]);
    expect(host.innerHTML).toContain('data-columns="0"');
    expect(host.innerHTML).not.toContain('data-col="');
  });
  it('adds a column when its box is ticked, says so, and puts it in the address', () => {
    const { host, panel, changes } = mount();
    host.filter('change', 'col', 'review', true);
    expect(panel.getColumns()).toEqual(['review']);
    expect(heads(host.region.innerHTML).at(-1)).toBe('Review date');
    expect(host.region.innerHTML).toContain(`<time datetime="${isoDayOffset(NOW, 177)}">`);
    expect(host.announce.innerHTML).toContain('1 extra column shown. Review date.');
    expect(changes.at(-1)).toBe('?cols=review');
    host.filter('change', 'col', 'kind', true);
    expect(heads(host.region.innerHTML).slice(-2)).toEqual(['Kind of data', 'Review date']);
    expect(changes.at(-1)).toBe('?cols=kind%2Creview');
  });
  it('takes it out again when the box is cleared', () => {
    const { host, panel, changes } = mount(['review', 'kind']);
    expect(panel.getColumns()).toEqual(['kind', 'review']);
    expect(host.innerHTML).toContain('data-columns="2"');
    host.filter('change', 'col', 'kind', false);
    host.filter('change', 'col', 'review', false);
    expect(panel.getColumns()).toEqual([]);
    expect(host.region.innerHTML).not.toContain('data-col="');
    expect(host.announce.innerHTML).toContain('No extra column is shown.');
    expect(changes.at(-1)).toBe('');
  });
  it('ignores a box for a column it does not know', () => {
    const { host, panel, changes } = mount();
    host.filter('change', 'col', 'tier', true);
    expect(panel.getColumns()).toEqual([]);
    expect(changes).toEqual([]);
  });
  it('keeps the columns through a filter change, grouping and a redraw', () => {
    const { host, panel } = mount(['gaps']);
    host.filter('change', 'state', 'fresh');
    host.filter('change', 'group', 'tier');
    host.click('recalculate');
    expect(panel.getColumns()).toEqual(['gaps']);
    expect(host.innerHTML.match(/data-col="gaps"/g)?.length).toBeGreaterThan(0);
    expect(host.innerHTML).toContain('data-columns="1"');
  });
  it('gives every row as many cells as there are headings', () => {
    const { host } = mount([...COLUMN_IDS]);
    const table = /<table>.*?<\/table>/s.exec(host.innerHTML.slice(host.innerHTML.indexOf('data-region="sources"')))?.[0] ?? '';
    const headCount = (table.match(/<th scope="col"/g) ?? []).length;
    expect(headCount).toBe(5 + COLUMN_IDS.length);
    for (const row of table.split('<tr>').slice(2)) expect((row.match(/<td/g) ?? []).length + 1).toBe(headCount);
  });
  it('passes the audits with every column shown, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW, live: { sort: null, limit: 50, columns: [...COLUMN_IDS] } });
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
});

describe('on the page the server sends', () => {
  const ctx = { getRecords: () => RECORDS, now: () => NOW };
  const get = async (url: string) => (await handleDataStatus({ method: 'GET', url, headers: {} }, ctx))!;
  it('shows the columns named in the address and ticks their boxes in the form', async () => {
    const page = await get('/en/data-status?cols=review,gaps');
    expect(page.body).toContain('data-columns="2"');
    expect(page.body).toContain('data-col="review"');
    expect(page.body).toContain('data-col="gaps"');
    expect(page.body).not.toContain('data-col="kind"');
    expect(page.body).toMatch(/id="ds-col-gaps"[^>]* checked>/);
    expect(describeProblems(auditHtml(page.body))).toEqual([]);
  });
  it('keeps them in the sort links and in the links to the table files', async () => {
    const page = await get('/fr/data-status?cols=kind');
    const sortLinks = [...page.body.matchAll(/<th scope="col"[^>]*><a href="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(sortLinks).toHaveLength(5);
    for (const href of sortLinks) expect(href, href).toContain('cols=kind');
    expect(page.body).toMatch(/href="\/fr\/data-status\/listed-sources\.md\?[^"]*cols=kind/);
    expect(page.body).toMatch(/href="\/fr\/data-status\/listed-sources\.txt\?[^"]*cols=kind/);
  });
  it('accepts the form spelling, one cols per ticked box', async () => {
    const page = await get('/en/data-status?cols=kind&cols=age');
    expect(page.body).toContain('data-columns="2"');
    expect(page.body).toContain('<td>3 days</td>');
  });
});
