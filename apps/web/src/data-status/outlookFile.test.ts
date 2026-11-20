import { describe, expect, it } from 'vitest';
import { parseCsv } from './consistency';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { FORECAST_HORIZONS } from './forecast';
import { handleDataStatus } from './http';
import { lintFrench, scanCopy } from './index';
import { OUTLOOK_FILENAME, OUTLOOK_ROUTE, outlookLabel, outlookRows, outlookToCsv } from './outlookFile';
import { buildPageHosts } from './pageHosts';
import { PERIOD_PRESETS } from './reviewPeriods';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW } from './testkit';

const src = (id: string, days: number | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', url: `https://data.example.org/${id}`, licence: 'OGL-Ontario', retrievedAt: days === null ? null : isoDayOffset(NOW, -days), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  { id: 'p', name: 'Places', kind: 'places', sources: [src('a', 10), src('b', 100, { name: 'Comma, "quote"' }), src('c', 200, { url: null }), src('d', null)] },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('e', 130, { url: 'https://city.example.net/e' })] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const rows = outlookRows(audit, NOW, {}, 'en');
const section = (name: string) => rows.filter((r) => r[0] === name);

describe('outlookRows', () => {
  it('has a heading row and four cells on every row', () => {
    expect(rows[0]).toEqual(['Section', 'Item', 'Sources', 'Detail']);
    for (const r of rows) expect(r).toHaveLength(4);
  });
  it('has one row per later day, with the count for that day', () => {
    const later = section('If no source is retrieved again');
    expect(later).toHaveLength(FORECAST_HORIZONS.length);
    expect(later[0]?.slice(1, 3)).toEqual(['Today (November 15, 2026)', '2']);
    expect(later.map((r) => Number(r[2]))).toEqual([...later.map((r) => Number(r[2]))].sort((x, y) => x - y));
  });
  it('has one row per kind of data and period, with the period in use as the detail', () => {
    const periods = section('Review periods');
    expect(periods).toHaveLength(2 * PERIOD_PRESETS.length);
    expect(periods[0]).toEqual(['Review periods', 'Places, with a period of 30 days', '2', '180 days: 1 source marked']);
    expect(periods.at(-1)?.[1]).toBe('Routes, with a period of 730 days');
  });
  it('has one row per web site, every one of them, and the row for no site last', () => {
    const sites = section('Sources by web site');
    expect(sites).toHaveLength(buildPageHosts(audit, 1000).hosts.length);
    expect(sites.map((r) => r[1])).toEqual(['data.example.org', 'city.example.net', 'UNKNOWN']);
    expect(sites.reduce((n, r) => n + Number(r[2]), 0)).toBe(audit.sources.length);
  });
  it('follows the review periods it is given', () => {
    const short = outlookRows(auditRegistry(RECORDS, NOW, { places: 30 }), NOW, { places: 30 }, 'en');
    expect(short.find((r) => r[0] === 'Review periods')?.[3]).toBe('30 days, chosen here: 2 sources marked');
    expect(short.find((r) => r[1]?.startsWith('Today'))?.[2]).toBe('3');
  });
  it('has only the heading row and no site row for an empty registry', () => {
    const empty = outlookRows(auditRegistry([], NOW, {}), NOW, {}, 'en');
    expect(empty.filter((r) => r[0] !== 'If no source is retrieved again')).toHaveLength(1);
  });
});

describe('the file', () => {
  it('reads back from CSV as written, in both languages, and starts with a byte order mark', () => {
    for (const locale of ['en', 'fr'] as const) {
      const csv = outlookToCsv(audit, NOW, {}, locale);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(parseCsv(csv)).toEqual(outlookRows(audit, NOW, {}, locale));
      expect(scanCopy(csv)).toEqual([]);
    }
    expect(outlookToCsv(audit, NOW, {}, 'en')).toContain('"Places / Comma, ""quote"""');
  });
  it('reads back on random registries', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      expect(parseCsv(outlookToCsv(a, NOW, {}, 'fr')), `seed ${seed}`).toEqual(outlookRows(a, NOW, {}, 'fr'));
    }
  });
  it('the server sends it, follows the periods in the address and no filter, and links to it from the page', async () => {
    const ctx = { getRecords: () => RECORDS, now: () => NOW };
    const get = async (url: string) => (await handleDataStatus({ method: 'GET', url, headers: {} }, ctx))!;
    const plain = await get(`/en/data-status${OUTLOOK_ROUTE}`);
    expect(plain.status).toBe(200);
    expect(plain.headers['content-disposition']).toBe(`attachment; filename="${OUTLOOK_FILENAME}"`);
    expect(plain.body).toBe(outlookToCsv(audit, NOW, {}, 'en'));
    expect((await get(`/en/data-status${OUTLOOK_ROUTE}?state=stale&q=zzz`)).body).toBe(plain.body);
    expect((await get(`/en/data-status${OUTLOOK_ROUTE}?stale_places=30`)).body).toBe(outlookToCsv(auditRegistry(RECORDS, NOW, { places: 30 }), NOW, { places: 30 }, 'en'));
    const page = await get('/fr/data-status?stale_places=30');
    expect(page.body).toContain(`href="/fr/data-status${OUTLOOK_ROUTE}?stale_places=30"`);
    expect(page.body).toContain(outlookLabel('fr'));
    expect(lintFrench(outlookLabel('fr'))).toEqual([]);
  });
});
