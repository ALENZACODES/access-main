import { describe, expect, it } from 'vitest';
import { mulberry32, pick, randomRecords, randomRetrieved } from './fuzzKit';
import { auditRegistry } from './datasetRegistry';

const NOW = new Date('2026-11-16T12:00:00Z');

describe('the generator', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('returns values in [0, 1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });

  it('covers its range roughly evenly', () => {
    const r = mulberry32(5);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.floor(r() * 10)]!++;
    for (const n of buckets) expect(n).toBeGreaterThan(1700);
  });

  it('pick chooses every item eventually and nothing else', () => {
    const r = mulberry32(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pick(r, ['a', 'b', 'c']));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
  });

  it('makes the same registry twice for one seed', () => {
    expect(randomRecords(11, NOW)).toEqual(randomRecords(11, NOW));
    expect(randomRecords(11, NOW)).not.toEqual(randomRecords(12, NOW));
  });

  it('makes every kind of retrieved value the audit has to handle', () => {
    const r = mulberry32(21);
    const kinds = { missing: 0, placeholder: 0, impossible: 0, noOffset: 0, future: 0, plain: 0, withOffset: 0 };
    for (let i = 0; i < 3000; i++) {
      const v = randomRetrieved(r, NOW);
      if (v === null || v === undefined) kinds.missing++;
      else if (/^(n\/a|tbd|unknown|inconnu|\s*)$/i.test(v)) kinds.placeholder++;
      else if (/^2026-(02-31|13-01|00-00)|^2025-02-29|^1850|yesterday|\//.test(v) || v === '2026-11') kinds.impossible++;
      else if (/T\d\d:\d\d:\d\d$/.test(v)) kinds.noOffset++;
      else if (/T/.test(v)) kinds.withOffset++;
      else if (v > '2026-11-16') kinds.future++;
      else kinds.plain++;
    }
    for (const [name, n] of Object.entries(kinds)) expect(n, name).toBeGreaterThan(40);
  });

  it('produces between 0 and 4 datasets with 0 to 4 sources each', () => {
    let max = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const recs = randomRecords(seed, NOW);
      expect(recs.length).toBeLessThanOrEqual(4);
      for (const r of recs) {
        expect(r.sources.length).toBeLessThanOrEqual(4);
        max = Math.max(max, r.sources.length);
      }
    }
    expect(max).toBe(4);
  });

  it('sometimes repeats ids on purpose, so duplicate handling is exercised', () => {
    let dupDatasets = 0;
    let dupSources = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const a = auditRegistry(randomRecords(seed, NOW), NOW);
      dupDatasets += a.findings.filter((f) => f.code === 'duplicate-dataset-id').length;
      dupSources += a.findings.filter((f) => f.code === 'duplicate-source-id').length;
    }
    expect(dupDatasets).toBeGreaterThan(0);
    expect(dupSources).toBeGreaterThan(0);
  });
});
