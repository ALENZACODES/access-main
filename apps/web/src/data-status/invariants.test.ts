import { describe, expect, it } from 'vitest';
import { auditRegistry, type AuditedSource, type AuditResult, type DatasetRecord } from './datasetRegistry';
import { auditProblems, sourceProblems } from './invariants';
import { randomRecords } from './fuzzKit';
import { EN, FR } from './i18n';

const NOW = new Date('2026-11-16T12:00:00Z');
const ok = { id: 's', name: 'Src', source: 'Pub', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', url: 'https://example.org' };

function audit(...sources: DatasetRecord['sources']): AuditResult {
  return auditRegistry([{ id: 'd', name: 'D', kind: 'places', sources }], NOW);
}

function mutate(a: AuditResult, patch: Partial<AuditedSource>): AuditResult {
  const copy = structuredClone(a);
  copy.sources[0] = { ...copy.sources[0]!, ...patch };
  return copy;
}

describe('a correct audit has no problems', () => {
  it.each([
    ['fresh', ok],
    ['stale', { ...ok, retrievedAt: '2025-01-01' }],
    ['no date', { ...ok, retrievedAt: null }],
    ['bad date', { ...ok, retrievedAt: '2026-02-31' }],
    ['future date', { ...ok, retrievedAt: '2027-01-01' }],
    ['no licence', { ...ok, licence: null }],
    ['unrecognised licence', { ...ok, licence: 'Proprietary' }],
    ['nothing recorded', { id: 's' }],
    ['placeholders', { id: 's', name: 'N/A', source: 'TBD', licence: 'unknown', retrievedAt: 'inconnu' }],
  ])('%s', (_n, src) => expect(auditProblems(audit(src)), JSON.stringify(src)).toEqual([]));

  it('for 600 random registries', () => {
    for (let seed = 1; seed <= 600; seed++) expect(auditProblems(auditRegistry(randomRecords(seed, NOW), NOW)), `seed ${seed}`).toEqual([]);
  });
});

describe('every misleading status is caught', () => {
  const fresh = audit(ok);
  const stale = audit({ ...ok, retrievedAt: '2025-01-01' });
  const unknown = audit({ ...ok, retrievedAt: null });
  const future = audit({ ...ok, retrievedAt: '2027-01-01' });
  const noLicence = audit({ ...ok, licence: null });

  const cases: [string, AuditResult, RegExp][] = [
    ['fresh but older than the limit', mutate(fresh, { ageDays: 400 }), /fresh but older than the limit/],
    ['fresh without an age', mutate(fresh, { ageDays: null }), /fresh without an age/],
    ['fresh with a date issue', mutate(fresh, { issues: ['invalid-date'] }), /fresh although the date has an issue/],
    ['fresh without a date', mutate(fresh, { retrievedIso: null }), /fresh without a retrieved date/],
    ['stale but within the limit', mutate(stale, { ageDays: 10 }), /stale but within the limit/],
    ['stale without an age', mutate(stale, { ageDays: null }), /stale without an age/],
    ['unknown but with an age', mutate(unknown, { ageDays: 5 }), /unknown but an age is given/],
    ['unknown without a reason', mutate(unknown, { issues: unknown.sources[0]!.issues.filter((i) => i !== 'missing-date') }), /exactly one date issue/],
    ['unknown with two reasons', mutate(unknown, { issues: ['missing-date', 'invalid-date'] }), /exactly one date issue/],
    ['future date hidden', mutate(future, { retrievedIso: null }), /future-date without the date/],
    ['missing date shown', mutate(unknown, { retrievedIso: '2026-01-01' }), /missing-date but a date is shown/],
    ['negative age', mutate(fresh, { ageDays: -1 }), /negative age/],
    ['limit of 0', mutate(fresh, { limitDays: 0 }), /limit is not a whole number/],
    ['licence status without a licence', mutate(noLicence, { licenceOpen: true }), /licence status without a licence/],
    ['missing licence not reported', mutate(noLicence, { issues: [] }), /missing-licence not reported/],
    ['licence given but reported missing', mutate(fresh, { issues: ['missing-licence'] }), /reported missing/],
    ['not-open licence not reported', mutate(audit({ ...ok, licence: 'Proprietary' }), { issues: [] }), /not-open licence not reported/],
    ['unrecognised reported but open', mutate(audit({ ...ok, licence: 'Proprietary' }), { licenceOpen: true }), /status is not "No"/],
    ['no name and no issue', mutate(fresh, { name: null }), /no name and no missing-source/],
    ['placeholder as name', mutate(fresh, { name: 'N/A' }), /placeholder shown as name/],
    ['placeholder as licence', mutate(fresh, { licence: 'TBD' }), /placeholder shown as licence/],
    ['non-http url', mutate(fresh, { url: 'javascript:alert(1)' }), /url is not http\(s\)/],
  ];

  it.each(cases)('%s', (_name, bad, pattern) => {
    expect(auditProblems(bad).join('\n')).toMatch(pattern);
  });

  it('the mutations are real differences (the originals are clean)', () => {
    for (const a of [fresh, stale, unknown, future, noLicence]) expect(auditProblems(a)).toEqual([]);
  });
});

describe('whole-audit rules', () => {
  const two = auditRegistry(
    [
      { id: 'a', name: 'A', kind: 'places', sources: [ok, { ...ok, id: 't', retrievedAt: '2025-01-01' }] },
      { id: 'b', name: 'B', kind: 'routes', sources: [{ ...ok, retrievedAt: null }] },
    ],
    NOW,
  );

  it('a dataset is stale when any source is stale', () => {
    const bad = structuredClone(two);
    bad.datasets.find((d) => d.id === 'a')!.state = 'fresh';
    expect(auditProblems(bad).join()).toContain('a: dataset state fresh, sources say stale');
  });

  it('a dataset with only unknown sources is unknown, never fresh', () => {
    const bad = structuredClone(two);
    bad.datasets.find((d) => d.id === 'b')!.state = 'fresh';
    expect(auditProblems(bad).join()).toContain('b: dataset state fresh, sources say unknown');
  });

  it('catches every wrong total', () => {
    for (const k of ['sources', 'datasets', 'stale', 'unknownDate', 'notOpen', 'missingDetails', 'duplicates'] as const) {
      const bad = structuredClone(two);
      bad.totals[k] += 1;
      expect(auditProblems(bad).join(), k).toContain(`totals.${k}`);
    }
  });

  it('catches a stated issue with no finding', () => {
    const bad = structuredClone(two);
    bad.findings = bad.findings.filter((f) => f.code !== 'missing-date');
    expect(auditProblems(bad).join()).toMatch(/issue missing-date missing from findings/);
  });

  it('catches stale findings that do not match stale sources', () => {
    const bad = structuredClone(two);
    bad.datasets.find((d) => d.id === 'a')!.findings = [];
    expect(auditProblems(bad).join()).toContain('stale findings do not match');
  });

  it('catches a source whose limit differs from its dataset', () => {
    const bad = structuredClone(two);
    bad.sources[0]!.limitDays = 7;
    expect(auditProblems(bad).join()).toContain('limit differs from the dataset');
  });

  it('does not blame duplicate dataset ids for mixing sources', () => {
    const dup = auditRegistry(
      [
        { id: 'x', name: 'X1', kind: 'places', sources: [ok] },
        { id: 'x', name: 'X2', kind: 'routes', sources: [{ ...ok, retrievedAt: null }] },
      ],
      NOW,
    );
    expect(auditProblems(dup)).toEqual([]);
    expect(dup.totals.duplicates).toBe(2);
  });
});

describe('sourceProblems', () => {
  it('names the dataset and source of each problem', () => {
    const a = mutate(audit(ok), { ageDays: 999 });
    expect(sourceProblems(a.sources[0]!)[0]).toMatch(/^d\/s: /);
  });
});

describe('wording that would overclaim freshness', () => {
  const words = /recent|récemment|up[- ]to[- ]date|(?<!mise )à jour|current|actuel|latest|dernier/i;

  it('no status label claims the data is recent or current', () => {
    for (const s of ['fresh', 'stale', 'unknown'] as const) {
      expect(EN[`state.${s}` as const], `en ${s}`).not.toMatch(words);
      expect(FR[`state.${s}` as const], `fr ${s}`).not.toMatch(words);
    }
  });

  it('the fresh label names a limit instead of a time', () => {
    expect(EN['state.fresh']).toBe('Within the update limit');
    expect(FR['state.fresh']).toBe('Dans le délai de mise à jour');
  });
});
