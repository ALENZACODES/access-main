import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { randomRegistry } from './round7Kit';
import { buildStatusByTier, renderStatusByTierHtml, STATUS_COLUMNS } from './statusByTier';
import { NOW, RECORDS } from './testkit';
import { TIER_IDS } from './tierValue';

const build = (records: readonly DatasetRecord[]) => buildStatusByTier(auditRegistry(records, NOW, {}));

describe('buildStatusByTier', () => {
  it('counts each record once, in its tier row and status column', () => {
    const b = build(RECORDS);
    expect(b.rows).toEqual([
      { tier: '0', counts: { fresh: 1, stale: 0, unknown: 0 }, total: 1 },
      { tier: 'E', counts: { fresh: 0, stale: 1, unknown: 0 }, total: 1 },
      { tier: null, counts: { fresh: 0, stale: 0, unknown: 1 }, total: 1 },
    ]);
    expect(b.totals).toEqual({ fresh: 1, stale: 1, unknown: 1 });
    expect(b.total).toBe(3);
  });
  it('lists tiers in the fixed order with Unknown last, and only tiers in use', () => {
    const records: DatasetRecord[] = [{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 'a', tier: 'E' }, { id: 'b' }, { id: 'c', tier: 4 }, { id: 'e', tier: 1 }] }];
    expect(build(records).rows.map((r) => r.tier)).toEqual(['1', '4', 'E', null]);
  });
  it('has no Unknown row when every record states a tier', () => {
    expect(build([{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 'a', tier: 0 }] }]).rows.map((r) => r.tier)).toEqual(['0']);
  });
  it('adds up across rows and columns on random registries', () => {
    const pool = [...TIER_IDS, null, 'x'];
    for (let seed = 1; seed <= 20; seed++) {
      const records = randomRegistry(seed, NOW).map((r, ri) => ({ ...r, sources: r.sources.map((s, si) => ({ ...s, tier: pool[(seed + ri + si * 2) % pool.length] as never })) }));
      const audit = auditRegistry(records, NOW, {});
      const b = buildStatusByTier(audit);
      expect(b.total).toBe(audit.sources.length);
      expect(b.rows.reduce((n, r) => n + r.total, 0)).toBe(b.total);
      for (const s of STATUS_COLUMNS) {
        expect(b.rows.reduce((n, r) => n + r.counts[s], 0)).toBe(b.totals[s]);
        expect(b.totals[s]).toBe(audit.sources.filter((x) => x.state === s).length);
      }
      for (const r of b.rows) expect(r.counts.fresh + r.counts.stale + r.counts.unknown).toBe(r.total);
    }
  });
  it('is empty for an empty registry', () => {
    expect(build([])).toEqual({ rows: [], totals: { fresh: 0, stale: 0, unknown: 0 }, total: 0 });
  });
});

describe('renderStatusByTierHtml', () => {
  it('has a row for each tier, a column for each status and a totals row', () => {
    const html = renderStatusByTierHtml(build(RECORDS), 'en');
    expect(html).toContain('<th scope="row">Tier 0</th><td>1</td><td>0</td><td>0</td><td>1</td>');
    expect(html).toContain('<th scope="row">Unknown</th><td>0</td><td>0</td><td>1</td><td>1</td>');
    expect(html).toContain('<tfoot><tr><th scope="row">All tiers</th><td>1</td><td>1</td><td>1</td><td>3</td></tr></tfoot>');
    expect(html.match(/<th scope="col">/g)).toHaveLength(5);
  });
  it('uses the panel’s status labels as column headings', () => {
    const html = renderStatusByTierHtml(build(RECORDS), 'fr');
    expect(html).toContain('<th scope="col">Possiblement périmé</th>');
    expect(html).toContain('<th scope="row">Niveau E</th>');
  });
  it('says so when there are no records', () => {
    const html = renderStatusByTierHtml(build([]), 'en');
    expect(html).toContain('There are no records to count.');
    expect(html).not.toContain('<table');
  });
  it('passes the markup and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const records of [RECORDS, []]) {
        const html = renderStatusByTierHtml(build(records), locale);
        expect(html).toContain('aria-labelledby="ds-statustier-title"');
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
  it('is on the panel after the tier counts, once', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(html.match(/id="ds-statustier-title"/g)).toHaveLength(1);
    expect(html.indexOf('id="ds-statustier-title"')).toBeGreaterThan(html.indexOf('id="ds-tiers-title"'));
    expect(html.indexOf('id="ds-statustier-title"')).toBeLessThan(html.indexOf('id="ds-facts-title"'));
  });
});
