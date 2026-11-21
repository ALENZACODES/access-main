import { describe, expect, it } from 'vitest';
import { auditRegistry, describeLoadIssue, lintFrench, parseRegistry, parseRegistryText } from './index';

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    Object.values(v as object).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

const valid = [
  {
    id: 'd1',
    name: 'Places',
    kind: 'places',
    sources: [{ id: 's1', name: 'Alpha', source: 'A', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', url: 'https://example.org' }],
  },
];

describe('parseRegistry shape', () => {
  it('accepts a list or { datasets }', () => {
    expect(parseRegistry(valid)).toMatchObject({ usable: true, issues: [] });
    expect(parseRegistry({ datasets: valid }).records).toHaveLength(1);
    expect(parseRegistry([]).records).toEqual([]);
  });

  it('rejects anything else as unusable', () => {
    for (const bad of [null, 3, 'x', {}, { datasets: 'no' }]) {
      const r = parseRegistry(bad);
      expect(r.usable).toBe(false);
      expect(r.issues).toEqual([{ severity: 'error', code: 'not-array', path: '' }]);
    }
  });

  it('does not mutate its input', () => {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(valid)));
    expect(() => parseRegistry(frozen)).not.toThrow();
  });

  it('ignores unknown keys', () => {
    const r = parseRegistry([{ ...valid[0], extra: 1, sources: [{ id: 'x', extra: true }] }]);
    expect(r.issues).toEqual([]);
    expect(r.records[0]?.sources[0]).toEqual({ id: 'x' });
  });
});

describe('dataset-level problems drop the dataset with a path', () => {
  it('reports each kind of problem', () => {
    const r = parseRegistry([
      valid[0],
      'text',
      { kind: 'places', sources: [] },
      { id: '  ', kind: 'places', sources: [] },
      { id: 'k', kind: 'medical', sources: [] },
      { id: 's', kind: 'places', sources: 'nope' },
    ]);
    expect(r.records.map((x) => x.id)).toEqual(['d1']);
    expect(r.issues.map((i) => `${i.code}@${i.path}`)).toEqual([
      'not-object@datasets[1]',
      'missing-id@datasets[2].id',
      'missing-id@datasets[3].id',
      'bad-kind@datasets[4].kind',
      'bad-sources@datasets[5].sources',
    ]);
    expect(r.issues.every((i) => i.severity === 'error')).toBe(true);
  });

  it('keeps a dataset whose name is missing (audit will flag it) and reports a wrong-type name', () => {
    expect(parseRegistry([{ id: 'a', kind: 'routes', sources: [] }]).records[0]?.name).toBe('');
    const r = parseRegistry([{ id: 'a', name: 5, kind: 'routes', sources: [] }]);
    expect(r.records).toHaveLength(1);
    expect(r.issues).toEqual([{ severity: 'error', code: 'bad-field', path: 'datasets[0].name' }]);
  });
});

describe('source-level problems', () => {
  it('drops unreadable sources and nulls wrong-type fields, never inventing values', () => {
    const r = parseRegistry([
      {
        id: 'd',
        kind: 'transit',
        sources: [{ id: 'a', licence: 42, retrievedAt: false, source: 'ok' }, 7, { name: 'no id' }, { id: '' }],
      },
    ]);
    expect(r.records[0]?.sources).toEqual([{ id: 'a', source: 'ok' }]);
    expect(r.issues.map((i) => `${i.code}@${i.path}`)).toEqual([
      'bad-field@datasets[0].sources[0].licence',
      'bad-field@datasets[0].sources[0].retrievedAt',
      'not-object@datasets[0].sources[1]',
      'missing-id@datasets[0].sources[2].id',
      'missing-id@datasets[0].sources[3].id',
    ]);
  });

  it('a nulled field shows up as Unknown in the audit, not as a default', () => {
    const r = parseRegistry([{ id: 'd', name: 'D', kind: 'places', sources: [{ id: 'a', licence: 42, retrievedAt: 7 }] }]);
    const a = auditRegistry(r.records, new Date('2026-11-15T00:00:00Z'));
    expect(a.sources[0]).toMatchObject({ licence: null, licenceOpen: null, retrievedIso: null, state: 'unknown' });
  });
});

describe('licence normalisation', () => {
  const withLicence = (licence: string) => [{ id: 'd', kind: 'places', sources: [{ id: 's', licence }] }];

  it('rewrites a recognised alias and says so', () => {
    const r = parseRegistry(withLicence('CC BY 4.0'));
    expect(r.records[0]?.sources[0]?.licence).toBe('CC-BY-4.0');
    expect(r.issues).toEqual([
      { severity: 'warning', code: 'licence-normalised', path: 'datasets[0].sources[0].licence', licence: 'CC-BY-4.0' },
    ]);
  });

  it('leaves canonical ids silent and unrecognised text verbatim (so the audit flags it)', () => {
    expect(parseRegistry(withLicence('OGL-Ontario')).issues).toEqual([]);
    const r = parseRegistry(withLicence('All rights reserved'));
    expect(r.issues).toEqual([]);
    expect(r.records[0]?.sources[0]?.licence).toBe('All rights reserved');
    const a = auditRegistry(r.records, new Date('2026-11-15T00:00:00Z'));
    expect(a.sources[0]?.licenceOpen).toBe(false);
  });

  it('can be switched off', () => {
    const r = parseRegistry(withLicence('CC BY 4.0'), { normaliseLicences: false });
    expect(r.records[0]?.sources[0]?.licence).toBe('CC BY 4.0');
    expect(r.issues).toEqual([]);
  });
});

describe('parseRegistryText', () => {
  it('parses JSON text and reports invalid JSON', () => {
    expect(parseRegistryText(JSON.stringify(valid)).records).toHaveLength(1);
    expect(parseRegistryText('{oops')).toEqual({ records: [], usable: false, issues: [{ severity: 'error', code: 'not-json', path: '' }] });
  });
});

describe('describeLoadIssue', () => {
  it('is localized, with the path in place and NBSP before the FR colon', () => {
    const issue = { severity: 'error', code: 'bad-kind', path: 'datasets[4].kind' } as const;
    expect(describeLoadIssue(issue, 'en')).toBe('datasets[4].kind: unknown dataset type');
    const fr = describeLoadIssue(issue, 'fr');
    expect(fr).toBe('datasets[4].kind\u00A0: type de jeu de données inconnu');
    expect(lintFrench(fr)).toEqual([]);
    expect(describeLoadIssue({ severity: 'warning', code: 'licence-normalised', path: 'p', licence: 'CC0-1.0' }, 'en')).toBe(
      'p: licence name recognised as CC0-1.0',
    );
    expect(describeLoadIssue({ severity: 'error', code: 'not-json', path: '' }, 'fr')).toBe('Le fichier du registre n’est pas du JSON valide.');
  });
});
