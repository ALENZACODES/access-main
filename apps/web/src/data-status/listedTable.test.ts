import { describe, expect, it } from 'vitest';
import { COLUMN_IDS } from './columns';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, NO_FILTERS, type Filters } from './filters';
import { handleDataStatus } from './http';
import { lintFrench, mountDataStatusPanel, scanCopy } from './index';
import {
  buildListedTable,
  buildListedTableFile,
  describeListedTableSaved,
  LISTED_TABLE_FORMATS,
  listedTableAction,
  listedTableFormatFromAction,
  listedTableLabel,
  listedTableToMarkdown,
  listedTableToText,
  markdownCell,
  textLine,
} from './listedTable';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { parseSort } from './sorting';
import { FakeHost, NOW } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('a'),
      src('b', { tier: 'E', retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary' }),
      src('bare', { name: null, source: null, licence: null, retrievedAt: null, tier: null }),
      src('odd', { name: 'Pipes | and *stars*\nnew line', retrievedAt: isoDayOffset(NOW, 30) }),
    ],
  },
];
const audit = auditRegistry(RECORDS, NOW, {});
const table = (f: Filters = NO_FILTERS, opts = {}) => buildListedTable(audit, f, 'en', opts);
// The list has its own default order, so rows are found by what they hold, not by position.
const rowWith = (t: { rows: string[][] }, licence: string, tier: string) => t.rows.find((r) => r[2] === licence && r[5] === tier)!;
const rowA = (t: { rows: string[][] }) => t.rows.find((r) => r[1] === 'Name a')!;

describe('buildListedTable', () => {
  it('has six fixed columns and one row per listed source', () => {
    const t = table();
    expect(t.headings).toEqual(['Dataset', 'Source', 'Licence', 'Retrieved (YYYY-MM-DD)', 'Status', 'Tier']);
    expect(t.rows).toHaveLength(4);
    expect(t.total).toBe(4);
    expect(rowA(t)).toEqual(['Places', 'Name a', 'OGL-Ontario', isoDayOffset(NOW, -3), 'Within its review period', '0']);
  });
  it('writes UNKNOWN for every fact that is not known, and for a date in the future', () => {
    const bare = rowWith(table(), 'UNKNOWN', 'UNKNOWN');
    expect(bare.slice(2, 4)).toEqual(['UNKNOWN', 'UNKNOWN']);
    expect(bare[5]).toBe('UNKNOWN');
    expect(table().rows.find((r) => r[1]?.startsWith('Pipes'))?.[3]).toBe('UNKNOWN');
    expect(rowWith(buildListedTable(audit, NO_FILTERS, 'fr'), 'UNKNOWN', 'UNKNOWN').slice(2, 4)).toEqual(['UNKNOWN', 'UNKNOWN']);
    expect(table().rows.flat()).not.toContain('Unknown');
    expect(buildListedTable(audit, NO_FILTERS, 'fr').rows.flat()).not.toContain('Inconnu');
  });
  it('adds the chosen extra columns in their fixed order', () => {
    const t = table(NO_FILTERS, { columns: ['gaps', 'kind'] });
    expect(t.headings.slice(6)).toEqual(['Kind of data', 'Facts that are UNKNOWN']);
    expect(rowA(t).slice(6)).toEqual(['Places', 'None']);
    for (const row of table(NO_FILTERS, { columns: [...COLUMN_IDS] }).rows) expect(row).toHaveLength(6 + COLUMN_IDS.length);
  });
  it('follows the filters and the order of the list', () => {
    expect(table({ ...NO_FILTERS, state: 'stale' }).rows.map((r) => r[1])).toEqual(['Name b']);
    expect(table({ ...NO_FILTERS, query: 'no such thing' })).toMatchObject({ rows: [], total: 4 });
    const up = table(NO_FILTERS, { sort: parseSort('?sort=tier') }).rows.map((r) => r[5]);
    const down = table(NO_FILTERS, { sort: parseSort('?sort=tier&dir=desc') }).rows.map((r) => r[5]);
    expect(up.at(-1)).toBe('UNKNOWN');
    expect(down.at(-1)).toBe('UNKNOWN');
    expect(up.slice(0, -1)).toEqual([...down.slice(0, -1)].reverse());
  });
  it('never has an empty cell and always as many cells as headings, on random registries', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const locale of ['en', 'fr'] as const) {
        const t = buildListedTable(a, NO_FILTERS, locale, { columns: [...COLUMN_IDS] });
        expect(t.rows).toHaveLength(a.sources.length);
        for (const row of t.rows) {
          expect(row).toHaveLength(t.headings.length);
          for (const cell of row) expect(cell.trim(), `seed ${seed}`).not.toBe('');
        }
      }
    }
  });
});

describe('Markdown', () => {
  it('escapes what Markdown would act on and keeps a cell on one line', () => {
    expect(markdownCell('a | b')).toBe('a \\| b');
    expect(markdownCell('*x*\n_y_')).toBe('\\*x\\* \\_y\\_');
    expect(markdownCell('   ')).toBe('UNKNOWN');
  });
  it('has a title, the facts about the list, and a table with one line per source', () => {
    const md = listedTableToMarkdown(table(), NO_FILTERS, NOW, 'en');
    const lines = md.split('\n');
    expect(lines[0]).toBe('# Listed sources');
    expect(md).toContain('4 sources listed, of 4 in all.');
    expect(md).toContain('No filter is set.');
    expect(md).toContain('UNKNOWN means the fact is not recorded.');
    const tableLines = lines.filter((l) => l.startsWith('| '));
    expect(tableLines).toHaveLength(2 + 4);
    expect(tableLines[1]).toBe('| --- | --- | --- | --- | --- | --- |');
    expect(md.endsWith('|\n')).toBe(true);
  });
  it('every table line has the same number of cells, whatever the names hold', () => {
    const md = listedTableToMarkdown(table(NO_FILTERS, { columns: [...COLUMN_IDS] }), NO_FILTERS, NOW, 'en');
    const counts = md
      .split('\n')
      .filter((l) => l.startsWith('| '))
      .map((l) => l.replace(/\\\|/g, '').split('|').length);
    expect(new Set(counts).size).toBe(1);
    expect(md).toContain('Pipes \\| and \\*stars\\* new line');
  });
  it('names the filters in force, and says so when nothing is listed', () => {
    const f: Filters = { ...NO_FILTERS, state: 'stale', tier: 'E' };
    const md = listedTableToMarkdown(table(f), f, NOW, 'en');
    expect(md).toContain('1 source listed, of 4 in all.');
    expect(md).toMatch(/Filters: .*Status.*Tier.*\./);
    const none: Filters = { ...NO_FILTERS, query: 'zzz' };
    const empty = listedTableToMarkdown(table(none), none, NOW, 'en');
    expect(empty).toContain('No source is listed.');
    expect(empty).not.toContain('| ---');
  });
  it('is the same text for the same input', () => {
    expect(listedTableToMarkdown(table(), NO_FILTERS, NOW, 'en')).toBe(listedTableToMarkdown(table(), NO_FILTERS, NOW, 'en'));
  });
});

describe('plain text', () => {
  it('keeps a value on one line', () => {
    expect(textLine('a\nb\tc\u2028d  e ')).toBe('a b c d e');
  });
  it('has one block per source with one line per column', () => {
    const text = listedTableToText(table(NO_FILTERS, { columns: ['review'] }), NO_FILTERS, NOW, 'en');
    const blocks = text.trimEnd().split('\n\n');
    expect(blocks[0]).toBe('Listed sources');
    expect(blocks).toHaveLength(2 + 4);
    for (const block of blocks.slice(2)) expect(block.split('\n')).toHaveLength(7);
    const blockA = blocks.find((b) => b.includes('Source: Name a'))!;
    expect(blockA.split('\n')[0]).toBe('Dataset: Places');
    expect(blockA.split('\n')[6]).toBe('Review date: May 11, 2027');
    expect(blocks.filter((b) => b.includes('Tier: UNKNOWN'))).toHaveLength(1);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
  it('says so when nothing is listed', () => {
    const none: Filters = { ...NO_FILTERS, query: 'zzz' };
    expect(listedTableToText(table(none), none, NOW, 'en').trimEnd().endsWith('No source is listed.')).toBe(true);
  });
  it('is written in French with the right spacing, and passes the copy check in both languages', () => {
    const f: Filters = { ...NO_FILTERS, state: 'stale', tier: 'E' };
    const fr = buildListedTable(audit, f, 'fr', { columns: [...COLUMN_IDS] });
    const text = listedTableToText(fr, f, NOW, 'fr');
    expect(text).toContain('Niveau\u00A0: E');
    expect(text).toContain('Filtres\u00A0: ');
    for (const line of text.split('\n')) expect(lintFrench(line), line).toEqual([]);
    for (const line of listedTableToMarkdown(fr, f, NOW, 'fr').split('\n').filter((l) => !l.startsWith('|'))) expect(lintFrench(line.replace(/\\/g, '')), line).toEqual([]);
    for (const locale of ['en', 'fr'] as const) {
      const t = buildListedTable(audit, NO_FILTERS, locale);
      expect(scanCopy(listedTableToText(t, NO_FILTERS, NOW, locale))).toEqual([]);
    }
  });
});

describe('files, actions and words', () => {
  it('names each file and its type', () => {
    expect(buildListedTableFile(table(), 'md', NO_FILTERS, NOW, 'en')).toMatchObject({ filename: 'listed-sources.md', mime: 'text/markdown;charset=utf-8' });
    expect(buildListedTableFile(table(), 'txt', NO_FILTERS, NOW, 'en')).toMatchObject({ filename: 'listed-sources.txt', mime: 'text/plain;charset=utf-8' });
  });
  it('round-trips the formats through their actions and rejects anything else', () => {
    for (const f of LISTED_TABLE_FORMATS) expect(listedTableFormatFromAction(listedTableAction(f))).toBe(f);
    for (const bad of [null, undefined, '', 'export-listed-', 'export-listed-json', 'export-listed-csv', 'export-listed-MD', 'export-checklist-md']) expect(listedTableFormatFromAction(bad), String(bad)).toBeNull();
  });
  it('labels the downloads differently and says how many sources were saved', () => {
    for (const locale of ['en', 'fr'] as const) {
      expect(listedTableLabel('md', locale)).not.toBe(listedTableLabel('txt', locale));
      expect(lintFrench(listedTableLabel('md', 'fr'))).toEqual([]);
    }
    expect(describeListedTableSaved(table(), 'en')).toBe('File saved with 4 sources.');
    expect(describeListedTableSaved(table({ ...NO_FILTERS, state: 'stale' }), 'en')).toBe('File saved with 1 source.');
    expect(describeListedTableSaved(table({ ...NO_FILTERS, query: 'zzz' }), 'en')).toBe('File saved. No source is listed, so it holds none.');
  });
});

describe('in the panel and on the server', () => {
  it('saves what is listed, with the extra columns and the order shown', () => {
    const host = new FakeHost();
    const files: { text: string; filename: string; mime: string }[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onExportFile: (f) => files.push(f) });
    for (const f of LISTED_TABLE_FORMATS) expect(host.innerHTML).toContain(`data-action="${listedTableAction(f)}"`);
    host.filter('change', 'col', 'kind', true);
    host.filter('change', 'state', 'stale');
    host.click(listedTableAction('md'));
    host.click(listedTableAction('txt'));
    expect(files.map((f) => f.filename)).toEqual(['listed-sources.md', 'listed-sources.txt']);
    expect(files[0]?.text).toContain('| Places | Name b | Proprietary |');
    expect(files[0]?.text).toContain('| Kind of data |');
    expect(files[1]?.text).toContain('Kind of data: Places');
    expect(files[1]?.text).toContain('1 source listed, of 4 in all.');
    expect(host.announce.innerHTML).toContain('File saved with 1 source.');
  });
  it('does nothing when the page gave no way to save a file', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    host.click(listedTableAction('md'));
    expect(host.announce.innerHTML).toBe('');
  });
  it('the server answers both routes with the same files, following filters, order and columns', async () => {
    const ctx = { getRecords: () => RECORDS, now: () => NOW };
    for (const locale of ['en', 'fr'] as const) {
      for (const format of LISTED_TABLE_FORMATS) {
        const res = await handleDataStatus({ method: 'GET', url: `/${locale}/data-status/listed-sources.${format}?state=stale&cols=kind&sort=tier`, headers: {} }, ctx);
        const f: Filters = { ...NO_FILTERS, state: 'stale' };
        const want = buildListedTableFile(buildListedTable(audit, f, locale, { sort: parseSort('?sort=tier'), columns: ['kind'] }), format, f, NOW, locale, { datasetNames: new Map([['p', 'Places']]) });
        expect(res?.status).toBe(200);
        expect(res?.body).toBe(want.text);
        expect(res?.headers['content-disposition']).toBe(`attachment; filename="${want.filename}"`);
        expect(res?.headers['content-type']).toBe(format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
      }
    }
    const all = await handleDataStatus({ method: 'GET', url: '/en/data-status/listed-sources.txt', headers: {} }, ctx);
    expect(all?.body).toContain(`${applyFilters(audit.sources, NO_FILTERS).length} sources listed`);
  });
});
