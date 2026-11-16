import { describe, expect, it } from 'vitest';
import { SORT_KEYS, applySort, ariaSort, auditRegistry, isSortKey, nextSort, parseSort, sortParams, type DatasetRecord } from './index';
import { NOW } from './testkit';

const recs: DatasetRecord[] = [
  { id: 'd', name: 'Data', kind: 'places', sources: [
    { id: 's1', name: 'Élan', source: 'x', licence: 'CC0-1.0', retrievedAt: '2026-10-01' },
    { id: 's2', name: 'Zed', source: 'x', licence: 'CC-BY-4.0', retrievedAt: '2024-01-01' },
    { id: 's3', name: 'Alpha', source: 'x', licence: null, retrievedAt: null },
    { id: 's4', name: 'Beta', source: 'x', licence: 'OGL-Ontario', retrievedAt: '2026-11-01' },
    { id: 's5', name: 'élan 2', source: 'x', licence: 'CC0-1.0', retrievedAt: 'garbage' },
  ] },
];
const sources = auditRegistry(recs, NOW).sources;
const ids = (spec: Parameters<typeof applySort>[1], locale: 'en' | 'fr' = 'en') => applySort(sources, spec, locale).map((s) => s.sourceId);

describe('parseSort / sortParams', () => {
  it('reads key and direction; anything else is the default order', () => {
    expect(parseSort('?sort=retrieved&dir=desc')).toEqual({ key: 'retrieved', dir: 'desc' });
    expect(parseSort('sort=licence')).toEqual({ key: 'licence', dir: 'asc' });
    expect(parseSort('?sort=licence&dir=sideways')).toEqual({ key: 'licence', dir: 'asc' });
    for (const bad of ['', '?sort=', '?sort=price', '?dir=desc', '?sort=SOURCE']) expect(parseSort(bad), bad).toBeNull();
  });
  it('round-trips and omits the default direction', () => {
    expect(sortParams(null)).toEqual([]);
    expect(sortParams({ key: 'status', dir: 'asc' })).toEqual([['sort', 'status']]);
    expect(sortParams({ key: 'status', dir: 'desc' })).toEqual([['sort', 'status'], ['dir', 'desc']]);
    for (const k of SORT_KEYS) expect(isSortKey(k)).toBe(true);
    expect(isSortKey('x')).toBe(false);
  });
});

describe('nextSort / ariaSort', () => {
  it('starts ascending, flips on the same column, resets on another', () => {
    expect(nextSort(null, 'source')).toEqual({ key: 'source', dir: 'asc' });
    expect(nextSort({ key: 'source', dir: 'asc' }, 'source')).toEqual({ key: 'source', dir: 'desc' });
    expect(nextSort({ key: 'source', dir: 'desc' }, 'source')).toEqual({ key: 'source', dir: 'asc' });
    expect(nextSort({ key: 'source', dir: 'desc' }, 'licence')).toEqual({ key: 'licence', dir: 'asc' });
  });
  it('reports aria-sort only for the sorted column', () => {
    expect(ariaSort({ key: 'licence', dir: 'desc' }, 'licence')).toBe('descending');
    expect(ariaSort({ key: 'licence', dir: 'asc' }, 'licence')).toBe('ascending');
    expect(ariaSort({ key: 'licence', dir: 'asc' }, 'source')).toBeNull();
    expect(ariaSort(null, 'source')).toBeNull();
  });
});

describe('applySort', () => {
  it('no spec keeps the order and returns a copy', () => {
    const out = applySort(sources, null, 'en');
    expect(out).toEqual(sources);
    expect(out).not.toBe(sources);
  });
  it('sorts by source name ignoring accents and case', () => {
    expect(ids({ key: 'source', dir: 'asc' })).toEqual(['s3', 's4', 's1', 's5', 's2']);
    expect(ids({ key: 'source', dir: 'desc' })).toEqual(['s2', 's5', 's1', 's4', 's3']);
  });
  it('Unknown dates come last in both directions', () => {
    expect(ids({ key: 'retrieved', dir: 'asc' })).toEqual(['s2', 's1', 's4', 's3', 's5']);
    expect(ids({ key: 'retrieved', dir: 'desc' })).toEqual(['s4', 's1', 's2', 's3', 's5']);
  });
  it('Unknown licences come last in both directions', () => {
    expect(ids({ key: 'licence', dir: 'asc' }).slice(-1)).toEqual(['s3']);
    expect(ids({ key: 'licence', dir: 'desc' }).slice(-1)).toEqual(['s3']);
  });
  it('status puts possibly-out-of-date first, then up to date; Unknown is last both ways', () => {
    expect(ids({ key: 'status', dir: 'asc' })).toEqual(['s2', 's4', 's1', 's3', 's5']);
    expect(ids({ key: 'status', dir: 'desc' })).toEqual(['s4', 's1', 's2', 's3', 's5']);
  });
  it('is stable: equal keys keep their order', () => {
    expect(ids({ key: 'licence', dir: 'asc' }).filter((i) => i === 's1' || i === 's5')).toEqual(['s1', 's5']);
  });
  it('does not change its input', () => {
    const copy = JSON.stringify(sources);
    ids({ key: 'retrieved', dir: 'desc' });
    expect(JSON.stringify(sources)).toBe(copy);
  });
});
