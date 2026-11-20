import { describe, expect, it } from 'vitest';
import type { DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, scanHtml, visibleText } from './index';
import { randomRegistry } from './round7Kit';
import { NOW, RECORDS } from './testkit';
import {
  buildTierBreakdown,
  emptyTierCounts,
  isTierId,
  MAX_UNRECOGNISED_SHOWN,
  readTier,
  readTiers,
  renderTierBreakdownHtml,
  TIER_IDS,
  tierCell,
  tierLabel,
  tierMeaning,
  tiersInUse,
  tierSummary,
  unrecognisedNote,
} from './tiers';

const reg = (tiers: unknown[], id = 'd', name = 'Set'): DatasetRecord => ({
  id,
  name,
  kind: 'places',
  sources: tiers.map((tier, i) => ({ id: `s${i}`, tier: tier as never })),
});

describe('readTier', () => {
  it('reads whole numbers 0 to 4', () => {
    for (const n of [0, 1, 2, 3, 4]) expect(readTier(n)).toEqual({ kind: 'tier', tier: String(n) });
  });
  it('reads the digits as text, with surrounding space', () => {
    expect(readTier('0')).toEqual({ kind: 'tier', tier: '0' });
    expect(readTier(' 3 ')).toEqual({ kind: 'tier', tier: '3' });
  });
  it('reads E in either case', () => {
    expect(readTier('E')).toEqual({ kind: 'tier', tier: 'E' });
    expect(readTier('e')).toEqual({ kind: 'tier', tier: 'E' });
  });
  it('treats nothing, blanks and placeholders as unknown', () => {
    for (const v of [undefined, null, '', '   ', 'unknown', 'UNKNOWN', 'N/A', NaN]) expect(readTier(v), String(v)).toEqual({ kind: 'unknown' });
  });
  it('does not accept other types', () => {
    for (const v of [true, false, {}, [], () => 1]) expect(readTier(v)).toEqual({ kind: 'unknown' });
  });
  it('reports numbers outside the range, and fractions, as unrecognised and keeps the text', () => {
    expect(readTier(5)).toEqual({ kind: 'unrecognised', text: '5' });
    expect(readTier(-1)).toEqual({ kind: 'unrecognised', text: '-1' });
    expect(readTier(1.5)).toEqual({ kind: 'unrecognised', text: '1.5' });
    expect(readTier(Infinity)).toEqual({ kind: 'unrecognised', text: 'Infinity' });
  });
  it('does not guess from longer text', () => {
    expect(readTier('tier 2')).toEqual({ kind: 'unrecognised', text: 'tier 2' });
    expect(readTier('2.0')).toEqual({ kind: 'unrecognised', text: '2.0' });
    expect(readTier('05')).toEqual({ kind: 'unrecognised', text: '05' });
    expect(readTier('EE')).toEqual({ kind: 'unrecognised', text: 'EE' });
  });
  it('knows the tier ids', () => {
    for (const id of TIER_IDS) expect(isTierId(id)).toBe(true);
    for (const v of ['5', 'e', '', 0, null]) expect(isTierId(v)).toBe(false);
  });
});

describe('readTiers', () => {
  it('gives one entry per source, in order, with display names', () => {
    const out = readTiers(RECORDS);
    expect(out.map((r) => `${r.datasetId}/${r.sourceId}`)).toEqual(['p/a', 'p/b', 'r/c']);
    expect(out[0]?.name).toBe('Alpha');
    expect(out[2]?.name).toBe('c');
    expect(out.map((r) => r.read.kind)).toEqual(['tier', 'tier', 'unknown']);
  });
  it('falls back to the dataset id when the name is blank', () => {
    expect(readTiers([reg([0], 'x', '  ')])[0]?.datasetName).toBe('x');
  });
  it('returns nothing for an empty registry or a dataset with no sources', () => {
    expect(readTiers([])).toEqual([]);
    expect(readTiers([reg([])])).toEqual([]);
  });
});

describe('buildTierBreakdown', () => {
  it('counts each record once', () => {
    const b = buildTierBreakdown([reg([0, 0, 1, 'E', null, 'tier 2', 9])]);
    expect(b.counts).toEqual({ ...emptyTierCounts(), '0': 2, '1': 1, E: 1 });
    expect(b.unknown).toBe(3);
    expect(b.unrecognised).toBe(2);
    expect(b.unrecognisedTexts).toEqual(['tier 2', '9']);
    expect(b.total).toBe(7);
    expect(b.known).toBe(4);
  });
  it('known plus unknown is the total, on random registries with mixed tiers', () => {
    const pool = [0, 1, 2, 3, 4, 'E', 'e', null, undefined, '', 'x', 7];
    for (let seed = 1; seed <= 20; seed++) {
      const records = randomRegistry(seed, NOW).map((r, ri) => ({
        ...r,
        sources: r.sources.map((s, si) => ({ ...s, tier: pool[(seed + ri * 3 + si) % pool.length] as never })),
      }));
      const b = buildTierBreakdown(records);
      const sum = TIER_IDS.reduce((n, id) => n + b.counts[id], 0);
      expect(sum).toBe(b.known);
      expect(b.known + b.unknown).toBe(b.total);
      expect(b.total).toBe(records.reduce((n, r) => n + r.sources.length, 0));
      expect(b.unrecognised).toBeLessThanOrEqual(b.unknown);
      expect(b.datasets.reduce((n, d) => n + d.total, 0)).toBe(b.total);
      for (const d of b.datasets) expect(TIER_IDS.reduce((n, id) => n + d.counts[id], 0) + d.unknown).toBe(d.total);
    }
  });
  it('groups datasets that share an id into one row', () => {
    const b = buildTierBreakdown([reg([0], 'same', 'First'), reg([1, null], 'same', 'Second')]);
    expect(b.datasets).toHaveLength(1);
    expect(b.datasets[0]).toMatchObject({ datasetName: 'First', total: 3, unknown: 1 });
  });
  it('keeps only the first few distinct unrecognised texts', () => {
    const b = buildTierBreakdown([reg(['a', 'a', 'b', 'c', 'd', 'e2', 'f', 'g'])]);
    expect(b.unrecognised).toBe(8);
    expect(b.unrecognisedTexts).toHaveLength(MAX_UNRECOGNISED_SHOWN);
    expect(b.unrecognisedTexts[0]).toBe('a');
  });
  it('lists tiers in use in the fixed order', () => {
    expect(tiersInUse(buildTierBreakdown([reg(['E', 3, 0])]))).toEqual(['0', '3', 'E']);
    expect(tiersInUse(buildTierBreakdown([]))).toEqual([]);
  });
  it('handles an empty registry', () => {
    const b = buildTierBreakdown([]);
    expect(b).toMatchObject({ total: 0, known: 0, unknown: 0, unrecognised: 0, datasets: [] });
  });
});

describe('tier wording', () => {
  it('labels tiers and Unknown in both languages', () => {
    expect(tierLabel('0', 'en')).toBe('Tier 0');
    expect(tierLabel('E', 'fr')).toBe('Niveau E');
    expect(tierLabel(null, 'en')).toBe('UNKNOWN');
    expect(tierLabel(null, 'fr')).toBe('UNKNOWN');
  });
  it('has a meaning for every tier and for Unknown, different in each language', () => {
    for (const id of [...TIER_IDS, null]) {
      expect(tierMeaning(id, 'en').length).toBeGreaterThan(5);
      expect(tierMeaning(id, 'fr')).not.toBe(tierMeaning(id, 'en'));
    }
  });
  it('writes a short cell value', () => {
    expect(tierCell({ kind: 'tier', tier: 'E' }, 'en')).toBe('E');
    expect(tierCell({ kind: 'unknown' }, 'fr')).toBe('UNKNOWN');
    expect(tierCell({ kind: 'unrecognised', text: 'x' }, 'en')).toBe('UNKNOWN');
  });
  it('summarises how many records state a tier', () => {
    expect(tierSummary(buildTierBreakdown(RECORDS), 'en')).toBe('Records that state a tier: 2 of 3.');
    expect(tierSummary(buildTierBreakdown(RECORDS), 'fr')).toBe('Enregistrements qui indiquent un niveau\u00A0: 2 sur 3.');
  });
  it('notes unrecognised text only when there is some, with the right plural', () => {
    expect(unrecognisedNote(buildTierBreakdown(RECORDS), 'en')).toBeNull();
    expect(unrecognisedNote(buildTierBreakdown([reg(['x'])]), 'en')).toBe('1 record has text in place of a tier that is not a tier: x.');
    expect(unrecognisedNote(buildTierBreakdown([reg(['x', 'y'])]), 'en')).toBe('2 records have text in place of a tier that is not a tier: x, y.');
  });
});

describe('renderTierBreakdownHtml', () => {
  it('shows a row for each tier in use and one for Unknown', () => {
    const html = renderTierBreakdownHtml(buildTierBreakdown(RECORDS), 'en');
    expect(html).toContain('<th scope="row">Tier 0</th>');
    expect(html).toContain('<th scope="row">Tier E</th>');
    expect(html).not.toContain('<th scope="row">Tier 1</th>');
    expect(html).toContain('<th scope="row">UNKNOWN</th>');
    expect(html.match(/<table>/g)).toHaveLength(2);
  });
  it('leaves the Unknown row out when every record states a tier', () => {
    const html = renderTierBreakdownHtml(buildTierBreakdown([reg([0, 1])]), 'en');
    expect(html).not.toContain('<th scope="row">Unknown</th>');
  });
  it('says so when there are no records', () => {
    const html = renderTierBreakdownHtml(buildTierBreakdown([]), 'en');
    expect(html).toContain('There are no records to count.');
    expect(html).not.toContain('<table');
  });
  it('escapes dataset names and unrecognised text', () => {
    const html = renderTierBreakdownHtml(buildTierBreakdown([reg(['<i>t</i>'], 'd', '<b>N</b>')]), 'en');
    expect(html).not.toContain('<b>N</b>');
    expect(html).not.toContain('<i>t</i>');
    expect(html).toContain('&lt;b&gt;N&lt;/b&gt;');
  });
  it('passes the markup and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const records of [RECORDS, [reg(['x', 0, 4])], []]) {
        const html = renderTierBreakdownHtml(buildTierBreakdown(records), locale);
        expect(html).toContain('aria-labelledby="ds-tiers-title"');
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});
