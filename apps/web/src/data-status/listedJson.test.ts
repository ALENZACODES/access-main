import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, GAP_FIELDS, NO_FILTERS, parseFilters, type Filters } from './filters';
import { handleDataStatus } from './http';
import { lintFrench, mountDataStatusPanel, renderDataStatusPanel } from './index';
import {
  buildListedJson,
  buildListedJsonFile,
  describeListedJsonSaved,
  LISTED_JSON_ACTION,
  LISTED_JSON_FILENAME,
  LISTED_JSON_VERSION,
  listedJsonLabel,
  listedJsonSource,
  listedJsonText,
  type ListedJson,
} from './listedJson';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { parseSort } from './sorting';
import { FakeHost, NOW } from './testkit';
import { UNKNOWN_WORD } from './unknownWord';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', url: `https://example.org/${id}`, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('a'),
      src('b', { tier: 'E', retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary' }),
      src('bare', { name: null, source: null, url: null, licence: null, retrievedAt: null, tier: null }),
      src('future', { retrievedAt: isoDayOffset(NOW, 30) }),
    ],
  },
];
const audit = auditRegistry(RECORDS, NOW, {});
const doc = (f: Filters = NO_FILTERS) => buildListedJson(audit, f, NOW, 'en');
const one = (id: string) => listedJsonSource(audit.sources.find((s) => s.sourceId === id)!);

describe('listedJsonSource', () => {
  it('writes source, licence, date and tier as recorded', () => {
    expect(one('a')).toEqual({
      datasetId: 'p',
      dataset: 'Places',
      kind: 'places',
      sourceId: 'a',
      source: 'Name a',
      page: 'https://example.org/a',
      licence: 'OGL-Ontario',
      licenceType: 'open',
      retrieved: isoDayOffset(NOW, -3),
      tier: '0',
      status: 'fresh',
      ageDays: 3,
      reviewDate: isoDayOffset(NOW, 177),
      daysUntilReview: 177,
      unknownFacts: [],
    });
    expect(one('b')).toMatchObject({ tier: 'E', status: 'stale', licence: 'Proprietary', licenceType: 'unrecognised', ageDays: 400, daysUntilReview: -220 });
  });
  it('writes every fact that is not known as the token UNKNOWN, and numbers as null', () => {
    const bare = one('bare');
    expect(bare).toMatchObject({ page: UNKNOWN_WORD, licence: UNKNOWN_WORD, licenceType: UNKNOWN_WORD, retrieved: UNKNOWN_WORD, tier: UNKNOWN_WORD, status: UNKNOWN_WORD, reviewDate: UNKNOWN_WORD, ageDays: null, daysUntilReview: null });
    expect(bare.unknownFacts).toEqual(GAP_FIELDS.filter((g) => bare.unknownFacts.includes(g)));
    expect(bare.unknownFacts).toEqual(expect.arrayContaining(['licence', 'date', 'tier']));
    expect(UNKNOWN_WORD).toBe('UNKNOWN');
  });
  it('does not treat a date in the future as a retrieved date', () => {
    expect(one('future')).toMatchObject({ retrieved: UNKNOWN_WORD, status: UNKNOWN_WORD, reviewDate: UNKNOWN_WORD, ageDays: null });
  });
  it('never writes an empty string, on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const s of a.sources) {
        const row = listedJsonSource(s);
        for (const key of ['source', 'page', 'licence', 'licenceType', 'retrieved', 'tier', 'status', 'reviewDate'] as const) {
          expect(row[key].trim(), `seed ${seed} ${s.sourceId} ${key}`).not.toBe('');
        }
        expect(row.retrieved === UNKNOWN_WORD || /^\d{4}-\d{2}-\d{2}$/.test(row.retrieved)).toBe(true);
        expect(row.reviewDate === UNKNOWN_WORD).toBe(row.daysUntilReview === null);
        expect(row.unknownFacts.includes('tier')).toBe(row.tier === UNKNOWN_WORD);
      }
    }
  });
});

describe('buildListedJson', () => {
  it('describes the file and holds every source when no filter is set', () => {
    const d = doc();
    expect(d).toMatchObject({ version: LISTED_JSON_VERSION, generatedAt: NOW.toISOString(), locale: 'en', unknownToken: 'UNKNOWN', filters: '', total: 4, listed: 4 });
    expect(d.sources.map((s) => s.sourceId)).toEqual(audit.sources.map((s) => s.sourceId));
  });
  it('holds only what the filters list, and records the filters', () => {
    const f: Filters = { ...NO_FILTERS, state: 'stale' };
    const d = doc(f);
    expect(d.listed).toBe(1);
    expect(d.total).toBe(4);
    expect(d.sources.map((s) => s.sourceId)).toEqual(['b']);
    expect(parseFilters(d.filters)).toEqual(f);
    expect(doc({ ...NO_FILTERS, query: 'nothing matches this' })).toMatchObject({ listed: 0, sources: [] });
  });
  it('follows the order of the list', () => {
    for (const sort of ['?sort=source&dir=desc', '?sort=retrieved&dir=asc']) {
      const spec = parseSort(sort);
      const d = buildListedJson(audit, NO_FILTERS, NOW, 'en', spec);
      expect(d.sources).toHaveLength(4);
      expect(new Set(d.sources.map((s) => s.sourceId)).size).toBe(4);
    }
    const down = buildListedJson(audit, NO_FILTERS, NOW, 'en', parseSort('?sort=source&dir=desc')).sources.map((s) => s.sourceId);
    const up = buildListedJson(audit, NO_FILTERS, NOW, 'en', parseSort('?sort=source&dir=asc')).sources.map((s) => s.sourceId);
    expect(down).not.toEqual(up);
  });
  it('is the same text for the same input, parses back and ends with a new line', () => {
    const text = listedJsonText(doc());
    expect(text).toBe(listedJsonText(doc()));
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(doc());
    const file = buildListedJsonFile(audit, NO_FILTERS, NOW, 'fr');
    expect(file).toMatchObject({ filename: LISTED_JSON_FILENAME, mime: 'application/json;charset=utf-8' });
    expect((JSON.parse(file.text) as ListedJson).locale).toBe('fr');
  });
});

describe('the words', () => {
  it('labels the download and says how many sources were saved', () => {
    expect(listedJsonLabel('en')).toBe('Download the listed sources (JSON)');
    expect(describeListedJsonSaved(1, 'en')).toBe('File saved with 1 source.');
    expect(describeListedJsonSaved(4, 'en')).toBe('File saved with 4 sources.');
    expect(describeListedJsonSaved(0, 'en')).toBe('File saved. No source is listed, so it holds none.');
    for (const n of [0, 1, 4]) expect(lintFrench(describeListedJsonSaved(n, 'fr'))).toEqual([]);
    expect(lintFrench(listedJsonLabel('fr'))).toEqual([]);
  });
});

describe('in the panel and on the static page', () => {
  it('saves what is listed, in the order shown, and says so', () => {
    const host = new FakeHost();
    const files: { text: string; filename: string; mime: string }[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onExportFile: (f) => files.push(f) });
    expect(host.innerHTML).toContain(`data-action="${LISTED_JSON_ACTION}"`);
    host.filter('change', 'state', 'stale');
    host.click(LISTED_JSON_ACTION);
    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe(LISTED_JSON_FILENAME);
    const saved = JSON.parse(files[0]!.text) as ListedJson;
    expect(saved.sources.map((s) => s.sourceId)).toEqual(['b']);
    expect(saved.filters).toBe('?state=stale');
    expect(host.announce.innerHTML).toContain('File saved with 1 source.');
  });
  it('does nothing when the page gave no way to save a file', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    host.click(LISTED_JSON_ACTION);
    expect(host.announce.innerHTML).toBe('');
  });
  it('the static page links to the file with the filters and the order of the list', () => {
    const page = renderDataStatusPanel({
      records: RECORDS,
      locale: 'en',
      now: NOW,
      filters: { ...NO_FILTERS, state: 'stale' },
      table: { sort: parseSort('?sort=source&dir=desc'), paging: { page: 1, size: 25 } },
      staticView: { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s', listedJsonHref: '/en/data-status/listed-sources.json' },
    });
    expect(page).toMatch(/href="\/en\/data-status\/listed-sources\.json\?[^"]*state=stale[^"]*sort=source[^"]*"/);
    expect(page).not.toContain(`data-action="${LISTED_JSON_ACTION}"`);
  });
  it('the server answers the route with the same file, in both languages', async () => {
    const ctx = { getRecords: () => Promise.resolve(RECORDS), now: () => NOW };
    for (const locale of ['en', 'fr'] as const) {
      const res = await handleDataStatus({ method: 'GET', url: `/${locale}/data-status/listed-sources.json?state=stale`, headers: {} }, ctx);
      expect(res?.status).toBe(200);
      expect(res?.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(res?.headers['content-disposition']).toBe(`attachment; filename="${LISTED_JSON_FILENAME}"`);
      expect(res?.body).toBe(buildListedJsonFile(audit, { ...NO_FILTERS, state: 'stale' }, NOW, locale).text);
    }
    const all = await handleDataStatus({ method: 'GET', url: '/en/data-status/listed-sources.json', headers: {} }, ctx);
    expect((JSON.parse(all!.body) as ListedJson).listed).toBe(applyFilters(audit.sources, NO_FILTERS).length);
    const page = await handleDataStatus({ method: 'GET', url: '/en/data-status', headers: {} }, ctx);
    expect(page?.body).toContain('href="/en/data-status/listed-sources.json"');
  });
});
