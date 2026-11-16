import { describe, expect, it } from 'vitest';
import {
  CACHE_KIND_GROUP,
  EN,
  FR,
  EXPORT_IDS,
  auditRegistry,
  buildCacheRecords,
  buildExportFiles,
  cacheKindName,
  cacheKindNames,
  lintFrench,
  scanCopy,
  validateCatalogue,
  validateSummary,
  type CachedEntryLike,
} from './index';

const NOW = new Date('2026-11-15T12:00:00Z');
const entry = (id: string, kind: string, p: Partial<CachedEntryLike['provenance']> = {}): CachedEntryLike => ({
  id,
  kind,
  provenance: { source_name: 'Open data', source_url: 'https://example.org/data', licence: 'OGL-Ontario', retrieved_at: '2026-11-01T00:00:00Z', ...p },
});

describe('buildCacheRecords', () => {
  it('gives no datasets for an empty cache', () => {
    expect(buildCacheRecords([], 'en')).toEqual([]);
  });

  it('groups by cache kind and keeps every source', () => {
    const records = buildCacheRecords([entry('a', 'place'), entry('b', 'place'), entry('c', 'journey')], 'en');
    expect(records.map((r) => [r.id, r.sources.length])).toEqual([['journey', 1], ['place', 2]]);
    expect(records.find((r) => r.id === 'place')?.kind).toBe(CACHE_KIND_GROUP['place']);
  });

  it('puts unlisted kinds in one "other" dataset and never invents a specific kind', () => {
    const [other] = buildCacheRecords([entry('x', 'mystery')], 'en');
    expect(other).toMatchObject({ id: 'other', name: 'Other cached records', kind: 'reference' });
  });

  it('treats prototype keys as unlisted kinds', () => {
    const [other] = buildCacheRecords([entry('x', 'constructor'), entry('y', '__proto__')], 'en');
    expect(other?.id).toBe('other');
    expect(other?.sources).toHaveLength(2);
  });

  it('keeps gaps as gaps: missing source, licence and date audit as Unknown, not as values', () => {
    const records = buildCacheRecords([entry('g', 'place', { source_name: null, licence: '', retrieved_at: null, source_url: null })], 'en');
    const audit = auditRegistry(records, NOW);
    expect(audit.sources[0]).toMatchObject({ name: null, licence: null, retrievedIso: null, state: 'unknown' });
    expect(audit.findings.map((f) => f.code).sort()).toEqual(['missing-date', 'missing-licence', 'missing-source']);
  });

  it('flags an old record stale and a future date unknown', () => {
    const records = buildCacheRecords(
      [entry('old', 'place', { retrieved_at: '2025-01-01T00:00:00Z' }), entry('future', 'place', { retrieved_at: '2027-06-01T00:00:00Z' })],
      'en',
    );
    const states = Object.fromEntries(auditRegistry(records, NOW).sources.map((s) => [s.sourceId, s.state]));
    expect(states).toEqual({ old: 'stale', future: 'unknown' });
  });

  it('names every kind in both languages, with clean French typography', () => {
    for (const kind of [...cacheKindNames(), 'other']) {
      const en = cacheKindName(kind, 'en');
      const fr = cacheKindName(kind, 'fr');
      expect(en).not.toBe('');
      expect(fr).not.toBe('');
      if (kind !== 'other') expect(fr).not.toBe(en);
      expect(lintFrench(fr)).toEqual([]);
      expect(scanCopy(en)).toEqual([]);
      expect(scanCopy(fr)).toEqual([]);
    }
  });
});

describe('buildExportFiles', () => {
  const records = buildCacheRecords([entry('a', 'place'), entry('b', 'journey', { licence: null, retrieved_at: null })], 'en');

  it('builds every export with a name, type and non-empty text', () => {
    const files = buildExportFiles(records, 'en', NOW);
    expect(files.map((f) => f.id)).toEqual([...EXPORT_IDS]);
    for (const f of files) {
      expect(f.filename).toMatch(/^[a-z-]+\.[a-z]+$/);
      expect(f.mime).toContain('charset=utf-8');
      expect(f.text.length).toBeGreaterThan(0);
      expect(f.label.length).toBeGreaterThan(0);
    }
  });

  it('produces a valid summary and catalogue in which unknown stays unknown', () => {
    const files = Object.fromEntries(buildExportFiles(records, 'en', NOW).map((f) => [f.id, f.text]));
    const summary = JSON.parse(files['summary'] ?? '{}') as { sources: { sourceId: string; licence: unknown; retrieved: unknown }[] };
    expect(validateSummary(summary)).toEqual([]);
    expect(summary.sources.find((s) => s.sourceId === 'b')).toMatchObject({ licence: null, retrieved: null });
    expect(validateCatalogue(JSON.parse(files['catalogue'] ?? '{}'))).toEqual([]);
  });

  it('matches the audit: the CSV has one row per source plus the header', () => {
    const csv = buildExportFiles(records, 'en', NOW).find((f) => f.id === 'csv')?.text ?? '';
    const body = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
    expect(body.trim().split(/\r\n/)).toHaveLength(3);
  });

  it('labels files in the chosen language and never uses banned wording', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const f of buildExportFiles(records, locale, NOW)) {
        expect(scanCopy(f.label)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(f.label)).toEqual([]);
      }
    }
    const en = buildExportFiles(records, 'en', NOW).map((f) => f.label);
    const fr = buildExportFiles(records, 'fr', NOW).map((f) => f.label);
    expect(fr.every((label, i) => label !== en[i])).toBe(true);
  });

  it('respects staleness thresholds passed in', () => {
    const old = buildCacheRecords([entry('o', 'place', { retrieved_at: '2026-06-01T00:00:00Z' })], 'en');
    const stale = (days: number) =>
      JSON.parse(buildExportFiles(old, 'en', NOW, { places: days }).find((f) => f.id === 'summary')?.text ?? '{}').sources[0].state;
    expect(stale(30)).toBe('stale');
    expect(stale(400)).toBe('fresh');
  });
});

describe('no recency claims', () => {
  // A record 170 days old is still "fresh" under a 180-day setting, so no label may call it recent.
  const RECENT = /\brecent(?:ly)?\b|\brécent(?:e|s|es)?\b|récemment|\bnew(?:ly)?\b|\bup[- ]to[- ]date\b|(?<!mise )à jour\b/i;

  it('keeps recent, new and up-to-date wording out of every EN and FR message', () => {
    const offenders = [...Object.entries(EN), ...Object.entries(FR)].filter(([, v]) => RECENT.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it('states what the fresh label means: inside the review period', () => {
    expect(EN['state.fresh']).toBe('Within its review period');
    expect(FR['state.fresh']).toBe('Dans sa période de révision');
  });
});
