import { describe, expect, it } from 'vitest';
import { SUMMARY_SCHEMA_VERSION, auditRegistry, buildSummary, summaryToJson, validateSummary } from './index';
import { NOW, RECORDS } from './testkit';

const audit = auditRegistry(RECORDS, NOW);
const summary = buildSummary(audit, NOW);

describe('buildSummary', () => {
  it('has a schema version, a timestamp and totals', () => {
    expect(summary.schemaVersion).toBe(SUMMARY_SCHEMA_VERSION);
    expect(summary.generatedAt).toBe('2026-11-15T12:00:00.000Z');
    expect(summary.totals).toEqual(audit.totals);
  });

  it('keeps unknown values null (never 0, empty text or false)', () => {
    const c = summary.sources.find((s) => s.sourceId === 'c')!;
    expect(c).toMatchObject({ name: null, url: null, licence: null, licenceOpen: null, retrieved: null, state: 'unknown' });
    const b = summary.sources.find((s) => s.sourceId === 'b')!;
    expect(b).toMatchObject({ licenceOpen: false, state: 'stale', retrieved: '2024-01-01' });
  });

  it('lists finding codes, not sentences, so it is language-neutral', () => {
    const routes = summary.datasets.find((d) => d.id === 'r')!;
    expect(routes.findings.map((f) => f.code).sort()).toEqual(['missing-date', 'missing-licence', 'missing-source']);
    expect(JSON.stringify(summary)).not.toMatch(/may be out of date|possiblement/);
  });
});

describe('summaryToJson', () => {
  it('is pretty JSON ending in a newline that parses back identically', () => {
    const text = summaryToJson(summary);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "schemaVersion": 1');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(summary)));
  });
});

describe('validateSummary', () => {
  it('accepts what buildSummary produces', () => {
    expect(validateSummary(JSON.parse(summaryToJson(summary)))).toEqual([]);
  });

  it('catches wrong shapes and values', () => {
    expect(validateSummary(null)).toEqual(['not an object']);
    expect(validateSummary({})).toEqual(['schemaVersion', 'generatedAt', 'totals', 'datasets', 'sources']);
    const mutate = (fn: (s: { sources: Record<string, unknown>[] }) => void) => {
      const copy = JSON.parse(summaryToJson(summary)) as { sources: Record<string, unknown>[] };
      fn(copy);
      return validateSummary(copy);
    };
    expect(mutate((s) => (s.sources[0]!.state = 'great'))).toContain('sources[0].state');
    expect(mutate((s) => (s.sources[0]!.licence = 5))).toContain('sources[0].licence');
    expect(mutate((s) => (s.sources[0]!.retrieved = '1/2/2026'))).toContain('sources[0].retrieved');
  });

  it('rejects inventing a value for something unknown', () => {
    const i = summary.sources.findIndex((s) => s.sourceId === 'c');
    const copy = JSON.parse(summaryToJson(summary)) as { sources: Record<string, unknown>[] };
    copy.sources[i]!.licenceOpen = false;
    copy.sources[i]!.state = 'fresh';
    expect(validateSummary(copy)).toEqual([
      `sources[${i}].licenceOpen-must-be-null-when-licence-unknown`,
      `sources[${i}].state-must-be-unknown-when-date-unknown`,
    ]);
  });
});
