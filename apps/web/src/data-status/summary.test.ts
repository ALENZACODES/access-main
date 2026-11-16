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
    expect(text).toContain('\n  "schemaVersion": 2');
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
      `sources[${i}].ageDays-required-when-state-known`,
      `sources[${i}].licenceOpen-must-be-null-when-licence-unknown`,
      `sources[${i}].state-must-be-unknown-when-date-unknown`,
    ]);
  });

  describe('version 2: age and limit are stated', () => {
    const copy = () => JSON.parse(summaryToJson(summary)) as { sources: Record<string, unknown>[] };
    const known = () => summary.sources.findIndex((s) => s.ageDays !== null);
    const unknown = () => summary.sources.findIndex((s) => s.ageDays === null);

    it('every source has ageDays and limitDays, null age exactly when the state is unknown', () => {
      for (const s of summary.sources) {
        expect(Number.isInteger(s.limitDays) && s.limitDays >= 1).toBe(true);
        expect(s.ageDays === null).toBe(s.state === 'unknown');
      }
      expect(validateSummary(copy())).toEqual([]);
    });

    it('rejects an age on an unknown source', () => {
      const c = copy();
      c.sources[unknown()]!.ageDays = 3;
      expect(validateSummary(c).join()).toContain('ageDays-must-be-null-when-unknown');
    });

    it('rejects a missing, negative, fractional or non-numeric age and limit', () => {
      for (const [field, value] of [['ageDays', -1], ['ageDays', 1.5], ['ageDays', '3'], ['limitDays', 0], ['limitDays', null], ['limitDays', '180']] as const) {
        const c = copy();
        c.sources[known()]![field] = value;
        expect(validateSummary(c).join(), `${field}=${String(value)}`).toContain(`.${field}`);
      }
    });

    it('rejects a state that its own numbers contradict', () => {
      const c = copy();
      const i = known();
      c.sources[i]!.state = 'fresh';
      c.sources[i]!.ageDays = 400;
      c.sources[i]!.limitDays = 180;
      expect(validateSummary(c).join()).toContain('state-fresh-but-age-over-limit');
      c.sources[i]!.state = 'stale';
      c.sources[i]!.ageDays = 10;
      expect(validateSummary(c).join()).toContain('state-stale-but-age-within-limit');
    });

    it('accepts exactly the limit as fresh and one more day as stale', () => {
      const c = copy();
      const i = known();
      Object.assign(c.sources[i]!, { state: 'fresh', ageDays: 180, limitDays: 180 });
      expect(validateSummary(c)).toEqual([]);
      Object.assign(c.sources[i]!, { state: 'stale', ageDays: 181, limitDays: 180 });
      expect(validateSummary(c)).toEqual([]);
    });

    it('rejects a version-1 summary', () => {
      const c = JSON.parse(summaryToJson(summary)) as { schemaVersion: number };
      c.schemaVersion = 1;
      expect(validateSummary(c)).toContain('schemaVersion');
    });
  });
});
