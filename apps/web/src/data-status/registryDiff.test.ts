import { describe, expect, it } from 'vitest';
import {
  changeRank,
  countChanges,
  describeChange,
  diffRegistries,
  isAttentionChange,
  lintFrench,
  renderChangesHtml,
  scanHtml,
  type ChangeCode,
  type DatasetRecord,
} from './index';

const rec = (id: string, sources: DatasetRecord['sources'], name = id.toUpperCase()): DatasetRecord => ({ id, name, kind: 'places', sources });
const base = (over: Record<string, unknown> = {}): DatasetRecord[] => [rec('a', [{ id: 's', licence: 'OGL-Ontario', retrievedAt: '2026-10-01', ...over }])];
const codes = (a: DatasetRecord[], b: DatasetRecord[]) => diffRegistries(a, b).map((c) => c.code);

describe('diffRegistries', () => {
  it('finds nothing when registries match (same day in different formats)', () => {
    expect(codes(base(), base())).toEqual([]);
    expect(codes(base(), base({ retrievedAt: '2026-10-01T09:00:00Z' }))).toEqual([]);
  });

  it('dataset and source additions/removals', () => {
    expect(codes(base(), [])).toEqual(['dataset-removed']);
    expect(codes([], base())).toEqual(['dataset-added']);
    expect(codes(base(), [rec('a', [])])).toEqual(['source-removed']);
    expect(codes([rec('a', [])], base())).toEqual(['source-added']);
  });

  it('licence changes, losses and additions', () => {
    expect(diffRegistries(base(), base({ licence: 'CC0-1.0' }))[0]).toMatchObject({ code: 'licence-changed', from: 'OGL-Ontario', to: 'CC0-1.0' });
    expect(diffRegistries(base(), base({ licence: '  ' }))[0]).toMatchObject({ code: 'licence-lost', from: 'OGL-Ontario' });
    expect(diffRegistries(base({ licence: null }), base())[0]).toMatchObject({ code: 'licence-added', to: 'OGL-Ontario' });
  });

  it('retrieved dates: advanced, regressed, lost, added; unreadable dates count as missing', () => {
    expect(diffRegistries(base(), base({ retrievedAt: '2026-11-01' }))[0]).toMatchObject({ code: 'retrieved-advanced', from: '2026-10-01', to: '2026-11-01' });
    expect(diffRegistries(base(), base({ retrievedAt: '2026-09-01' }))[0]).toMatchObject({ code: 'retrieved-regressed' });
    expect(diffRegistries(base(), base({ retrievedAt: undefined }))[0]).toMatchObject({ code: 'retrieved-lost', from: '2026-10-01' });
    expect(codes(base(), base({ retrievedAt: 'soon' }))).toEqual(['retrieved-lost']);
    expect(diffRegistries(base({ retrievedAt: 'soon' }), base())[0]).toMatchObject({ code: 'retrieved-added', to: '2026-10-01' });
    expect(codes(base({ retrievedAt: undefined }), base({ retrievedAt: 'soon' }))).toEqual([]);
  });

  it('uses the first record when ids repeat', () => {
    const dup = [rec('a', [{ id: 's', licence: 'CC0-1.0' }]), rec('a', [{ id: 's', licence: 'x' }])];
    expect(codes(dup, [rec('a', [{ id: 's', licence: 'CC0-1.0' }])])).toEqual([]);
  });

  it('labels with the dataset id when the name is empty', () => {
    expect(diffRegistries([], [rec('zz', [], ' ')])[0]?.datasetName).toBe('zz');
  });

  it('puts dates going backwards and lost details before everything else', () => {
    const prev: DatasetRecord[] = [
      rec('a', [{ id: '1', licence: 'CC0-1.0', retrievedAt: '2026-10-01' }, { id: '2', retrievedAt: '2026-10-01' }]),
      rec('b', []),
    ];
    const next: DatasetRecord[] = [
      rec('a', [{ id: '1', licence: undefined, retrievedAt: '2026-09-01' }, { id: '2', retrievedAt: '2026-11-01' }, { id: '3' }]),
      rec('c', []),
    ];
    const list = diffRegistries(prev, next);
    expect(list.map((c) => c.code)).toEqual([
      'licence-lost',
      'retrieved-regressed',
      'dataset-removed',
      'source-added',
      'dataset-added',
      'retrieved-advanced',
    ]);
    expect(list.filter(isAttentionChange).map((c) => c.code)).toEqual(['licence-lost', 'retrieved-regressed']);
  });
});

describe('describeChange / countChanges', () => {
  const change = diffRegistries(base(), base({ licence: 'CC0-1.0' }))[0]!;

  it('writes EN and FR lines, FR with NBSP before the colon', () => {
    expect(describeChange(change, 'en')).toBe('A / s: licence changed from OGL-Ontario to CC0-1.0');
    const fr = describeChange(change, 'fr');
    expect(fr).toBe('A / s\u00A0: licence passée de OGL-Ontario à CC0-1.0');
    expect(lintFrench(fr)).toEqual([]);
  });

  it('shows Unknown for a missing side instead of leaving it blank', () => {
    const c = { code: 'licence-changed', datasetId: 'a', datasetName: 'A', sourceId: null } as const;
    expect(describeChange(c, 'en')).toBe('A: licence changed from UNKNOWN to UNKNOWN');
    expect(describeChange({ ...c, code: 'dataset-added' }, 'fr')).toBe('A\u00A0: jeu de données ajouté');
  });

  it('counts every code, zero included', () => {
    const counts = countChanges(diffRegistries(base(), []));
    expect(counts['dataset-removed']).toBe(1);
    expect(Object.keys(counts)).toHaveLength(11);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('ranks every code', () => {
    const all = Object.keys(countChanges([])) as ChangeCode[];
    for (const c of all) expect(changeRank(c)).toBeGreaterThanOrEqual(0);
  });
});

describe('renderChangesHtml', () => {
  it('lists changes, escaped, or says none were found', () => {
    const changes = diffRegistries([rec('a', [], '<x>')], []);
    const html = renderChangesHtml(changes, 'en');
    expect(html).toContain('<h2 id="ds-diff-title">Changes since the saved copy</h2>');
    expect(html).toContain('&lt;x&gt;: dataset removed');
    expect(renderChangesHtml([], 'fr')).toContain('Aucun changement relevé.');
    expect(scanHtml(html)).toEqual([]);
  });
});
