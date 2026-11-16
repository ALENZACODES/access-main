import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STALE_DAYS,
  auditRegistry,
  isDatasetKind,
  staleAfterFor,
  type DatasetRecord,
} from './index';

const NOW = new Date('2026-11-15T12:00:00Z');
const good = { id: 's1', name: 'Open Data', source: 'Open Data Ontario', licence: 'OGL-Ontario', retrievedAt: '2026-11-01' };

describe('freshnessPolicy', () => {
  it('knows its kinds and defaults', () => {
    expect(isDatasetKind('transit')).toBe(true);
    expect(isDatasetKind('medical')).toBe(false);
    expect(isDatasetKind(3)).toBe(false);
    expect(staleAfterFor('transit')).toBe(DEFAULT_STALE_DAYS.transit);
  });

  it('accepts valid overrides and ignores invalid ones', () => {
    expect(staleAfterFor('places', { places: 10 })).toBe(10);
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(staleAfterFor('places', { places: bad })).toBe(DEFAULT_STALE_DAYS.places);
    }
  });
});

describe('auditRegistry', () => {
  it('a clean registry has no findings', () => {
    const a = auditRegistry([{ id: 'd1', name: 'Places', kind: 'places', sources: [good] }], NOW);
    expect(a.findings).toEqual([]);
    expect(a.datasets[0]).toMatchObject({ state: 'fresh', sourceCount: 1, staleAfterDays: 180 });
    expect(a.sources[0]).toMatchObject({ licenceOpen: true, retrievedIso: '2026-11-01', state: 'fresh' });
  });

  it('uses the per-kind threshold (same date, different verdict)', () => {
    const src = { ...good, retrievedAt: '2026-08-01' }; // 106 days
    const transit = auditRegistry([{ id: 't', name: 'T', kind: 'transit', sources: [src] }], NOW);
    const bounds = auditRegistry([{ id: 'b', name: 'B', kind: 'boundaries', sources: [src] }], NOW);
    expect(transit.datasets[0]?.state).toBe('stale');
    expect(bounds.datasets[0]?.state).toBe('fresh');
    expect(transit.findings.map((f) => f.code)).toContain('stale');
    expect(auditRegistry([{ id: 't', name: 'T', kind: 'transit', sources: [src] }], NOW, { transit: 200 }).datasets[0]?.state).toBe('fresh');
  });

  it('keeps unknown unknown: no date, no licence, no source never become fresh/open', () => {
    const a = auditRegistry([{ id: 'd', name: 'D', kind: 'places', sources: [{ id: 'x' }] }], NOW);
    expect(a.sources[0]).toMatchObject({ licence: null, licenceOpen: null, retrievedIso: null, state: 'unknown' });
    expect(a.datasets[0]?.state).toBe('unknown');
    expect(a.findings.map((f) => f.code).sort()).toEqual(['missing-date', 'missing-licence', 'missing-source']);
    expect(a.totals).toMatchObject({ unknownDate: 1, notOpen: 0, stale: 0, missingDetails: 3 });
  });

  it('flags non-open licences without treating them as unknown', () => {
    const a = auditRegistry([{ id: 'd', name: 'D', kind: 'places', sources: [{ ...good, licence: 'Proprietary' }] }], NOW);
    expect(a.sources[0]?.licenceOpen).toBe(false);
    expect(a.totals.notOpen).toBe(1);
  });

  it('flags empty datasets, empty names and duplicate ids once each', () => {
    const records: DatasetRecord[] = [
      { id: 'dup', name: 'A', kind: 'places', sources: [good, { ...good }] },
      { id: 'dup', name: '  ', kind: 'routes', sources: [] },
    ];
    const codes = auditRegistry(records, NOW).findings.map((f) => f.code);
    expect(codes.filter((c) => c === 'duplicate-dataset-id')).toHaveLength(2);
    expect(codes.filter((c) => c === 'duplicate-source-id')).toHaveLength(1);
    expect(codes).toContain('empty-name');
    expect(codes).toContain('no-sources');
  });

  it('dataset state: stale beats unknown beats fresh', () => {
    const mk = (srcs: object[]) =>
      auditRegistry([{ id: 'd', name: 'D', kind: 'places', sources: srcs as DatasetRecord['sources'] }], NOW).datasets[0]?.state;
    expect(mk([good, { ...good, id: 'b', retrievedAt: '2020-01-01' }, { id: 'c' }])).toBe('stale');
    expect(mk([good, { id: 'c' }])).toBe('unknown');
    expect(mk([good])).toBe('fresh');
  });

  it('sorts findings by priority, then name', () => {
    const a = auditRegistry(
      [
        { id: 'z', name: 'Zed', kind: 'places', sources: [{ ...good, retrievedAt: '2020-01-01' }] },
        { id: 'a', name: 'Alpha', kind: 'places', sources: [{ ...good, licence: 'Nope' }] },
      ],
      NOW,
    );
    expect(a.findings.map((f) => f.code)).toEqual(['licence-unrecognised', 'stale']);
  });

  it('drops unsafe URLs and reports future dates as unknown', () => {
    const a = auditRegistry(
      [{ id: 'd', name: 'D', kind: 'places', sources: [{ ...good, url: 'javascript:alert(1)', retrievedAt: '2027-01-01' }] }],
      NOW,
    );
    expect(a.sources[0]).toMatchObject({ url: null, state: 'unknown' });
    expect(a.findings.map((f) => f.code)).toContain('future-date');
  });
});
