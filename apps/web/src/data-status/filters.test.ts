import { describe, expect, it } from 'vitest';
import {
  MAX_QUERY_LENGTH,
  NO_FILTERS,
  applyFilters,
  auditRegistry,
  hasActiveFilters,
  needsReview,
  normaliseQuery,
  parseFilters,
  serializeFilters,
  type DatasetRecord,
} from './index';

const NOW = new Date('2026-11-15T12:00:00Z');
const records: DatasetRecord[] = [
  { id: 'p', name: 'Lieux publics', kind: 'places', sources: [{ id: 'a', name: 'Alpha', source: 'A', licence: 'OGL-Ontario', retrievedAt: '2026-11-01' }] },
  { id: 't', name: 'Transit', kind: 'transit', sources: [{ id: 'b', name: 'Béta', source: 'B', licence: 'OGL-Ontario', retrievedAt: '2026-08-01' }] },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [{ id: 'c' }, { id: 'd', name: 'Delta', source: 'D', licence: 'Proprietary', retrievedAt: '2026-11-10' }] },
];
const all = auditRegistry(records, NOW).sources;
const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(all, f).map((s) => s.sourceId).sort();

describe('parseFilters / serializeFilters', () => {
  it('round-trips active filters and omits defaults', () => {
    const f = { state: 'stale', kind: 'transit', query: 'beta', onlyIssues: true } as const;
    expect(serializeFilters(f)).toBe('?state=stale&kind=transit&q=beta&issues=1');
    expect(parseFilters(serializeFilters(f))).toEqual(f);
    expect(serializeFilters(NO_FILTERS)).toBe('');
    expect(parseFilters('')).toEqual(NO_FILTERS);
  });

  it('accepts a missing leading ?', () => {
    expect(parseFilters('state=fresh').state).toBe('fresh');
  });

  it('ignores invalid values instead of guessing', () => {
    expect(parseFilters('?state=great&kind=medical&issues=yes')).toEqual(NO_FILTERS);
    expect(parseFilters('?state=&kind=')).toEqual(NO_FILTERS);
  });

  it('normalises and caps the query', () => {
    expect(parseFilters('?q=%20%20B%C3%89TA%20%20').query).toBe('beta');
    expect(parseFilters(`?q=${'x'.repeat(500)}`).query).toHaveLength(MAX_QUERY_LENGTH);
    expect(normaliseQuery('  À  la   Carte ')).toBe('a la carte');
  });

  it('encodes special characters safely', () => {
    expect(serializeFilters({ ...NO_FILTERS, query: 'a&b=c' })).toBe('?q=a%26b%3Dc');
    expect(parseFilters('?q=a%26b%3Dc').query).toBe('a&b=c');
  });
});

describe('applyFilters', () => {
  it('no filters keeps everything', () => {
    expect(ids(NO_FILTERS)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by status, including unknown', () => {
    expect(ids({ ...NO_FILTERS, state: 'fresh' })).toEqual(['a', 'd']);
    expect(ids({ ...NO_FILTERS, state: 'stale' })).toEqual(['b']);
    expect(ids({ ...NO_FILTERS, state: 'unknown' })).toEqual(['c']);
  });

  it('filters by kind', () => {
    expect(ids({ ...NO_FILTERS, kind: 'routes' })).toEqual(['c', 'd']);
    expect(ids({ ...NO_FILTERS, kind: 'boundaries' })).toEqual([]);
  });

  it('only-issues keeps stale, missing-detail and non-open sources', () => {
    expect(ids({ ...NO_FILTERS, onlyIssues: true })).toEqual(['b', 'c', 'd']);
    expect(needsReview(all.find((s) => s.sourceId === 'a')!)).toBe(false);
    expect(needsReview(all.find((s) => s.sourceId === 'b')!)).toBe(true);
  });

  it('searches names, ids and licences ignoring case and accents', () => {
    expect(ids({ ...NO_FILTERS, query: 'BETA' })).toEqual(['b']);
    expect(ids({ ...NO_FILTERS, query: 'lieux' })).toEqual(['a']);
    expect(ids({ ...NO_FILTERS, query: 'proprietary' })).toEqual(['d']);
    expect(ids({ ...NO_FILTERS, query: 'zzz' })).toEqual([]);
  });

  it('combines filters with AND', () => {
    expect(ids({ state: 'fresh', kind: 'routes', query: 'delta', onlyIssues: true })).toEqual(['d']);
    expect(ids({ state: 'stale', kind: 'routes', query: '', onlyIssues: false })).toEqual([]);
  });

  it('does not change the input list', () => {
    const copy = [...all];
    applyFilters(all, { ...NO_FILTERS, state: 'stale' });
    expect(all).toEqual(copy);
  });
});

describe('hasActiveFilters', () => {
  it('is false only for the defaults (a blank query is not active)', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, query: '   ' })).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, query: 'a' })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, onlyIssues: true })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, state: 'stale' })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, kind: 'places' })).toBe(true);
  });
});
