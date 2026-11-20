import { describe, expect, it } from 'vitest';
import { parseCsv } from './consistency';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { handleDataStatus } from './http';
import { lintFrench, scanCopy } from './index';
import { buildNotesMarkdown, NOTES_FILENAME, NOTES_ROUTE, notesFileLabel, PUBLISHERS_CSV_FILENAME, PUBLISHERS_CSV_ROUTE, publisherSheetRows, publishersToCsv } from './notesFile';
import { buildOddities } from './oddities';
import { buildPublishers } from './publishers';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW } from './testkit';

const src = (id: string, source: string | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source, url: `https://example.org/${id}`, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [src('a', 'City of Example'), src('b', 'city of example', { retrievedAt: '2026-01-01', licence: 'ogl ontario' }), src('c', null, { licence: null }), src('d', 'Pipes | and, "quotes"', { name: 'Name a' })],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('e', 'Transit Agency', { retrievedAt: null })] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const ctx = { getRecords: () => RECORDS, now: () => NOW };
const get = (url: string) => handleDataStatus({ method: 'GET', url, headers: {} }, ctx);

describe('the publishers sheet', () => {
  it('has the columns of the table on the panel and one more for other spellings', () => {
    const rows = publisherSheetRows(buildPublishers(RECORDS, audit), 'en');
    expect(rows[0]).toEqual(['Publisher', 'Sources', 'Datasets', 'Licence types', 'Oldest retrieved date', 'Next review date', 'Also written']);
    expect(rows[1]?.[0]).toBe('City of Example');
    expect(rows[1]?.[6]).toBe('city of example');
    expect(rows.at(-1)?.[0]).toBe('UNKNOWN');
    for (const r of rows) expect(r).toHaveLength(7);
  });
  it('reads back from CSV as written, whatever the names hold, and starts with a byte order mark', () => {
    for (const locale of ['en', 'fr'] as const) {
      const csv = publishersToCsv(RECORDS, audit, locale);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(parseCsv(csv)).toEqual(publisherSheetRows(buildPublishers(RECORDS, audit, 1000), locale));
    }
  });
  it('lists every publisher, past the number the panel shows', () => {
    const many: DatasetRecord[] = [{ id: 'm', name: 'Many', kind: 'places', sources: Array.from({ length: 40 }, (_, i) => src(`s${i}`, `Publisher ${String(i).padStart(2, '0')}`)) }];
    const a = auditRegistry(many, NOW, {});
    expect(buildPublishers(many, a).publishers).toHaveLength(25);
    expect(parseCsv(publishersToCsv(many, a, 'en'))).toHaveLength(1 + 40);
  });
  it('on random registries has a row per publisher and counts that add up to the sources', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const records = randomRegistry(seed, NOW);
      const a = auditRegistry(records, NOW, {});
      const rows = parseCsv(publishersToCsv(records, a, 'en')).slice(1);
      const all = buildPublishers(records, a, 100_000);
      expect(rows, `seed ${seed}`).toHaveLength(all.publishers.length);
      expect(rows.reduce((n, r) => n + Number(/^\d+/.exec(r[1] ?? '')?.[0] ?? 0), 0)).toBe(a.sources.length);
    }
  });
});

describe('the notes', () => {
  const md = buildNotesMarkdown(RECORDS, audit, NOW, 'en');
  it('has a title, what it covers, and the two sections', () => {
    const lines = md.split('\n');
    expect(lines[0]).toBe('# Notes on the saved records');
    expect(md).toContain('It covers all 5 sources, whatever the list on screen is filtered to.');
    expect(md).toContain('UNKNOWN means the fact is not recorded.');
    expect(lines.filter((l) => l.startsWith('## '))).toEqual(['## Worth a second look', '## Sources by publisher']);
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
  });
  it('lists every item to look at with a tick box, under a heading for its check', () => {
    const d = buildOddities(audit);
    expect(md.match(/^### /gm)).toHaveLength(d.groups.length);
    expect(md.match(/^- \[ \] /gm)).toHaveLength(d.total);
    expect(d.groups.map((g) => g.code)).toEqual(['same-name', 'licence-spelling', 'first-of-january']);
    expect(md).toContain('### One licence written more than one way');
  });
  it('has the publishers as a table with a line each, and escapes what Markdown would act on', () => {
    const table = md.split('\n').filter((l) => l.startsWith('| '));
    expect(table).toHaveLength(2 + buildPublishers(RECORDS, audit).publishers.length);
    expect(new Set(table.map((l) => l.replace(/\\\|/g, '').split('|').length)).size).toBe(1);
    expect(md).toContain('Pipes \\| and, "quotes"');
  });
  it('says so for an empty registry and for a tidy one', () => {
    const empty = buildNotesMarkdown([], auditRegistry([], NOW, {}), NOW, 'en');
    expect(empty).toContain('It covers all 0 sources');
    expect(empty).toContain('There are no sources to look at.');
    expect(empty).toContain('There are no sources to group.');
    expect(empty).not.toContain('| ---');
    const tidy: DatasetRecord[] = [{ id: 't', name: 'T', kind: 'places', sources: [src('a', 'One')] }];
    const one = buildNotesMarkdown(tidy, auditRegistry(tidy, NOW, {}), NOW, 'en');
    expect(one).toContain('It covers 1 source,');
    expect(one).toContain('Nothing stands out in the records saved on this device.');
    expect(one).not.toContain('- [ ]');
  });
  it('is the same text for the same input, and passes the copy and French checks', () => {
    expect(buildNotesMarkdown(RECORDS, audit, NOW, 'en')).toBe(md);
    for (const locale of ['en', 'fr'] as const) expect(scanCopy(buildNotesMarkdown(RECORDS, audit, NOW, locale))).toEqual([]);
    const fr = buildNotesMarkdown(RECORDS, audit, NOW, 'fr');
    for (const line of fr.split('\n').filter((l) => !l.startsWith('|') && !l.startsWith('- [ ]'))) expect(lintFrench(line.replace(/\\/g, '')), line).toEqual([]);
  });
});

describe('on the server', () => {
  it('sends both files under their names, in both languages', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const csv = await get(`/${locale}/data-status${PUBLISHERS_CSV_ROUTE}`);
      expect(csv?.status).toBe(200);
      expect(csv?.headers['content-disposition']).toBe(`attachment; filename="${PUBLISHERS_CSV_FILENAME}"`);
      expect(csv?.body).toBe(publishersToCsv(RECORDS, audit, locale));
      const notes = await get(`/${locale}/data-status${NOTES_ROUTE}`);
      expect(notes?.headers['content-type']).toBe('text/markdown; charset=utf-8');
      expect(notes?.headers['content-disposition']).toBe(`attachment; filename="${NOTES_FILENAME}"`);
      expect(notes?.body).toBe(buildNotesMarkdown(RECORDS, audit, NOW, locale));
    }
  });
  it('covers every source whatever filter is in the address', async () => {
    const plain = await get(`/en/data-status${NOTES_ROUTE}`);
    const filtered = await get(`/en/data-status${NOTES_ROUTE}?state=stale&q=zzz`);
    expect(filtered?.body).toBe(plain?.body);
  });
  it('links to both from the page, with labels that say what they are', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = await get(`/${locale}/data-status?state=stale`);
      expect(page!.body).toContain(`href="/${locale}/data-status${PUBLISHERS_CSV_ROUTE}"`);
      expect(page!.body).toContain(`href="/${locale}/data-status${NOTES_ROUTE}"`);
      expect(page!.body).toContain(notesFileLabel('publishers', locale));
      expect(page!.body).toContain(notesFileLabel('notes', locale));
      expect(lintFrench(notesFileLabel('notes', 'fr'))).toEqual([]);
    }
    expect(notesFileLabel('publishers', 'en')).not.toBe(notesFileLabel('notes', 'en'));
  });
});
