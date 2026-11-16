import { describe, expect, it } from 'vitest';
import { buildCompleteness, completenessProblems, completenessRows, COMPLETENESS_FIELDS, completenessToJson, isFieldKnown, renderCompletenessHtml } from './completeness';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { randomRecords } from './fuzzKit';
import { visibleText } from './copyLint';
import { lintFrench } from './i18n';

const NOW = new Date('2026-11-16T12:00:00Z');

const full = { id: 'full', name: 'Full', source: 'Publisher', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', url: 'https://example.org/f' };
const empty = { id: 'empty', name: null, source: null, licence: null, retrievedAt: null, url: null };
const placeholders = { id: 'ph', name: 'N/A', source: 'TBD', licence: 'unknown', retrievedAt: 'inconnu', url: '' };
const future = { id: 'fut', name: 'Future', source: 'P', licence: 'OGL-Ontario', retrievedAt: '2026-12-31', url: 'https://example.org/x' };

function records(...sources: DatasetRecord['sources']): DatasetRecord[] {
  return [{ id: 'd', name: 'D', kind: 'places', sources }];
}

function rate(c: ReturnType<typeof buildCompleteness>, field: (typeof COMPLETENESS_FIELDS)[number]) {
  const r = c.fields.find((f) => f.field === field);
  if (!r) throw new Error(`no rate for ${field}`);
  return r;
}

describe('buildCompleteness', () => {
  it('counts a fully described source as known in every field', () => {
    const c = buildCompleteness(auditRegistry(records(full), NOW));
    for (const f of c.fields) expect([f.field, f.known, f.unknown, f.unknownPercent]).toEqual([f.field, 1, 0, 0]);
  });

  it('counts a source with nothing recorded as unknown in every field', () => {
    const c = buildCompleteness(auditRegistry(records(empty), NOW));
    for (const f of c.fields) expect([f.field, f.known, f.unknown, f.unknownPercent]).toEqual([f.field, 0, 1, 100]);
  });

  it('treats placeholder text exactly like a missing value', () => {
    const a = buildCompleteness(auditRegistry(records(placeholders), NOW));
    const b = buildCompleteness(auditRegistry(records(empty), NOW));
    expect(a.fields.map((f) => f.unknown)).toEqual(b.fields.map((f) => f.unknown));
  });

  it('treats a date in the future as unknown, because it cannot be used', () => {
    const c = buildCompleteness(auditRegistry(records(future), NOW));
    expect(rate(c, 'retrieved').unknown).toBe(1);
    // The other fields of that source are still known.
    expect(rate(c, 'licence').known).toBe(1);
  });

  it('reports a null rate (never 0) when there is nothing to measure', () => {
    for (const recs of [[], [{ id: 'd', name: 'D', kind: 'places' as const, sources: [] }]]) {
      const c = buildCompleteness(auditRegistry(recs, NOW));
      expect(c.total).toBe(0);
      for (const f of c.fields) expect([f.total, f.unknownPercent]).toEqual([0, null]);
    }
  });

  it('mixes sources into exact fractions', () => {
    const c = buildCompleteness(auditRegistry(records(full, empty, placeholders, future), NOW));
    expect(rate(c, 'retrieved')).toMatchObject({ known: 1, unknown: 3, total: 4, unknownPercent: 75 });
    expect(rate(c, 'licence')).toMatchObject({ known: 2, unknown: 2, unknownPercent: 50 });
    expect(rate(c, 'url')).toMatchObject({ known: 2, unknown: 2 });
  });

  it('keeps a separate row per dataset that adds up to the overall total', () => {
    const recs: DatasetRecord[] = [
      { id: 'a', name: 'A', kind: 'places', sources: [full, empty] },
      { id: 'b', name: 'B', kind: 'routes', sources: [placeholders] },
      { id: 'c', name: 'C', kind: 'transit', sources: [] },
    ];
    const c = buildCompleteness(auditRegistry(recs, NOW));
    expect(c.datasets.map((d) => [d.datasetId, d.total])).toEqual([['a', 2], ['b', 1], ['c', 0]]);
    expect(completenessProblems(c)).toEqual([]);
    expect(c.datasets.find((d) => d.datasetId === 'c')?.fields.every((f) => f.unknownPercent === null)).toBe(true);
  });

  it('merges datasets that share an id instead of counting their sources twice', () => {
    const recs: DatasetRecord[] = [
      { id: 'same', name: 'One', kind: 'places', sources: [full] },
      { id: 'same', name: 'Two', kind: 'routes', sources: [empty] },
    ];
    const c = buildCompleteness(auditRegistry(recs, NOW));
    expect(c.total).toBe(2);
    expect(c.datasets).toHaveLength(1);
    expect(completenessProblems(c)).toEqual([]);
  });

  it('is complete for every field name', () => {
    expect(COMPLETENESS_FIELDS).toEqual(['name', 'url', 'source', 'licence', 'licenceStatus', 'retrieved']);
    const audit = auditRegistry(records(full, empty), NOW);
    for (const s of audit.sources) for (const f of COMPLETENESS_FIELDS) expect(typeof isFieldKnown(s, f)).toBe('boolean');
  });

  it('holds for 300 random registries', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const audit = auditRegistry(randomRecords(seed, NOW), NOW);
      expect(completenessProblems(buildCompleteness(audit)), `seed ${seed}`).toEqual([]);
    }
  });
});

describe('completenessProblems', () => {
  const good = () => buildCompleteness(auditRegistry(records(full, empty), NOW));

  it('is clean for a real value', () => expect(completenessProblems(good())).toEqual([]));

  it('catches a rate that does not match its counts', () => {
    const c = good();
    c.fields[0] = { ...c.fields[0]!, unknownPercent: 0 };
    expect(completenessProblems(c).join()).toContain('unknownPercent');
  });

  it('catches counts that do not add up', () => {
    const c = good();
    c.fields[1] = { ...c.fields[1]!, known: 2 };
    expect(completenessProblems(c).join()).toContain('known + unknown');
  });

  it('catches a 0 where the rate should be null', () => {
    const c = buildCompleteness(auditRegistry([], NOW));
    c.fields[0] = { ...c.fields[0]!, unknownPercent: 0 };
    expect(completenessProblems(c).join()).toContain('unknownPercent');
  });

  it('catches dataset rows that do not add up to the total', () => {
    const c = good();
    c.datasets[0] = { ...c.datasets[0]!, total: 5 };
    expect(completenessProblems(c).length).toBeGreaterThan(0);
  });
});

describe('rendering', () => {
  const c = buildCompleteness(auditRegistry(records(full, empty, future), NOW));

  it('shows a labelled table with Unknown share in English', () => {
    const html = renderCompletenessHtml(c, 'en');
    expect(html).toContain('Completeness by field');
    expect(html).toContain('<th scope="col">Unknown share</th>');
    expect(html).toContain('66.7%');
    expect(visibleText(html)).toContain('never treated as “No”');
  });

  it('shows the same numbers in French with French typography', () => {
    const html = renderCompletenessHtml(c, 'fr');
    expect(html).toContain('Complétude par champ');
    expect(html).toContain('66,7 %');
    expect(lintFrench(visibleText(html))).toEqual([]);
  });

  it('gives each rate an accessible label that says what it is', () => {
    expect(renderCompletenessHtml(c, 'en')).toMatch(/aria-label="Rate: 66\.7%"/);
  });

  it('says there is nothing to measure instead of showing 0%', () => {
    const none = buildCompleteness(auditRegistry([], NOW));
    for (const l of ['en', 'fr'] as const) {
      const html = renderCompletenessHtml(none, l);
      expect(html).not.toContain('<table');
      expect(html).not.toContain('0.0%');
      expect(html).not.toContain('0,0');
    }
    expect(renderCompletenessHtml(none, 'en')).toContain('no sources to measure');
    expect(renderCompletenessHtml(none, 'fr')).toContain('aucune source à mesurer');
  });

  it('never gives two landmarks the same name', () => {
    for (const l of ['en', 'fr'] as const) {
      const html = renderCompletenessHtml(c, l);
      const names = [...html.matchAll(/<(?:section|div)[^>]*\b(?:role="region"|aria-labelledby=)[^>]*>/g)].map((m) => m[0]);
      // Only the scrollable table region is a named landmark; the section is not.
      expect(names).toHaveLength(1);
      expect(html).not.toMatch(/<section[^>]*aria-labelledby/);
    }
  });

  it('escapes nothing it should not and injects nothing it should', () => {
    const html = renderCompletenessHtml(c, 'en');
    expect(html).not.toMatch(/<script/i);
    expect((html.match(/<table/g) ?? []).length).toBe(1);
  });

  it('rows use the localized field names', () => {
    expect(completenessRows(c.fields, 'en').map((r) => r.label)).toEqual(['Source name', 'Link', 'Publisher', 'Licence', 'Licence status', 'Retrieved date']);
    expect(completenessRows(c.fields, 'fr').map((r) => r.label)).toEqual(['Nom de la source', 'Lien', 'Éditeur', 'Licence', 'État de la licence', 'Date de récupération']);
  });

  it('formats an unmeasurable rate as Unknown', () => {
    const rows = completenessRows(buildCompleteness(auditRegistry([], NOW)).fields, 'en');
    expect(rows.every((r) => !r.share.known && r.share.text === 'Unknown')).toBe(true);
  });
});

describe('completenessToJson', () => {
  it('is language-neutral JSON with a schema version and null for unmeasurable rates', () => {
    const parsed = JSON.parse(completenessToJson(buildCompleteness(auditRegistry([], NOW)), NOW)) as { schemaVersion: number; generatedAt: string; fields: { unknownPercent: unknown }[] };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.generatedAt).toBe('2026-11-16T12:00:00.000Z');
    expect(parsed.fields.every((f) => f.unknownPercent === null)).toBe(true);
  });

  it('ends with a newline and round-trips', () => {
    const c = buildCompleteness(auditRegistry(records(full, empty), NOW));
    const json = completenessToJson(c, NOW);
    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json)).toMatchObject({ total: 2 });
  });
});
