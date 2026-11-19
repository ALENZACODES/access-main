import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, scanHtml, visibleText } from './index';
import { buildRecordFacts, FACT_FIELDS, factLabel, factsSummary, MAX_FACT_ROWS, renderRecordFactsHtml } from './recordFacts';
import { randomRegistry } from './round7Kit';
import { NOW, RECORDS } from './testkit';

const facts = (records: readonly DatasetRecord[], limit?: number) => buildRecordFacts(records, auditRegistry(records, NOW, {}), limit);

const FULL = { source: 'Publisher', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', tier: 0 } as const;
const one = (over: Record<string, unknown>, id = 's'): DatasetRecord => ({ id: 'd', name: 'Set', kind: 'places', sources: [{ id, ...FULL, ...over } as never] });

describe('buildRecordFacts', () => {
  it('counts a record with all four facts as complete', () => {
    const f = facts([one({})]);
    expect(f).toMatchObject({ total: 1, complete: 1, hidden: 0, rows: [] });
    expect(f.missingBy).toEqual({ source: 0, licence: 0, date: 0, tier: 0 });
  });
  it('names each missing fact', () => {
    expect(facts([one({ source: null })]).rows[0]?.missing).toEqual(['source']);
    expect(facts([one({ licence: '' })]).rows[0]?.missing).toEqual(['licence']);
    expect(facts([one({ retrievedAt: null })]).rows[0]?.missing).toEqual(['date']);
    expect(facts([one({ tier: null })]).rows[0]?.missing).toEqual(['tier']);
  });
  it('treats a date that is invalid or in the future as missing', () => {
    expect(facts([one({ retrievedAt: '2026-13-40' })]).rows[0]?.missing).toEqual(['date']);
    expect(facts([one({ retrievedAt: '2031-01-01' })]).rows[0]?.missing).toEqual(['date']);
  });
  it('treats text that is not a tier as a missing tier', () => {
    expect(facts([one({ tier: 'gold' })]).rows[0]?.missing).toEqual(['tier']);
  });
  it('lists facts in the fixed order when several are missing', () => {
    expect(facts([{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 's' }] }]).rows[0]?.missing).toEqual([...FACT_FIELDS]);
  });
  it('reads the sample registry', () => {
    const f = facts(RECORDS);
    expect(f.total).toBe(3);
    expect(f.complete).toBe(2);
    expect(f.rows.map((r) => r.source.sourceId)).toEqual(['c']);
    expect(f.missingBy).toEqual({ source: 1, licence: 1, date: 1, tier: 1 });
  });
  it('puts records with the most gaps first, then keeps registry order', () => {
    const records: DatasetRecord[] = [
      { id: 'd', name: 'Set', kind: 'places', sources: [{ id: 'a', ...FULL, tier: null }, { id: 'b' }, { id: 'c', ...FULL, licence: null }, { id: 'd', ...FULL }] },
    ];
    expect(facts(records).rows.map((r) => r.source.sourceId)).toEqual(['b', 'a', 'c']);
  });
  it('respects the limit and reports the rest as hidden', () => {
    const records: DatasetRecord[] = [{ id: 'd', name: 'Set', kind: 'places', sources: Array.from({ length: 30 }, (_, i) => ({ id: `s${i}` })) }];
    const f = facts(records);
    expect(f.rows).toHaveLength(MAX_FACT_ROWS);
    expect(f.hidden).toBe(5);
    expect(f.all).toHaveLength(30);
    expect(facts(records, 0).rows).toEqual([]);
    expect(facts(records, 0).hidden).toBe(30);
    expect(facts(records, -2).rows).toEqual([]);
    expect(facts(records, 2.9).rows).toHaveLength(2);
  });
  it('adds up on random registries', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const records = randomRegistry(seed, NOW).map((r) => ({ ...r, sources: r.sources.map((s, i) => ({ ...s, tier: i % 3 === 0 ? null : i % 5 })) }));
      const f = facts(records, 1000);
      expect(f.complete + f.rows.length).toBe(f.total);
      expect(f.all).toHaveLength(f.total);
      for (const field of FACT_FIELDS) expect(f.missingBy[field]).toBe(f.all.filter((r) => r.missing.includes(field)).length);
      for (let i = 1; i < f.rows.length; i++) expect(f.rows[i - 1]!.missing.length).toBeGreaterThanOrEqual(f.rows[i]!.missing.length);
    }
  });
  it('handles an empty registry', () => {
    expect(facts([])).toMatchObject({ total: 0, complete: 0, rows: [], hidden: 0 });
  });
});

describe('facts for each dataset', () => {
  it('counts records, complete records and each unknown fact per dataset', () => {
    const f = facts(RECORDS);
    expect(f.datasets).toEqual([
      { datasetId: 'p', datasetName: 'Places <A>', total: 2, complete: 2, missingBy: { source: 0, licence: 0, date: 0, tier: 0 } },
      { datasetId: 'r', datasetName: 'Routes', total: 1, complete: 0, missingBy: { source: 1, licence: 1, date: 1, tier: 1 } },
    ]);
  });
  it('adds up to the overall counts on random registries', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const records = randomRegistry(seed, NOW).map((r) => ({ ...r, sources: r.sources.map((s, i) => ({ ...s, tier: i % 2 === 0 ? 'E' : 'none' })) }));
      const f = facts(records);
      expect(f.datasets.reduce((n, d) => n + d.total, 0)).toBe(f.total);
      expect(f.datasets.reduce((n, d) => n + d.complete, 0)).toBe(f.complete);
      for (const field of FACT_FIELDS) expect(f.datasets.reduce((n, d) => n + d.missingBy[field], 0)).toBe(f.missingBy[field]);
    }
  });
  it('is not affected by the row limit', () => {
    expect(facts(RECORDS, 0).datasets).toEqual(facts(RECORDS).datasets);
  });
  it('shows a row for each dataset', () => {
    const html = renderRecordFactsHtml(facts(RECORDS), 'en');
    expect(html).toContain('<caption>Unknown facts for each dataset</caption>');
    expect(html).toContain('<th scope="row">Routes</th><td>1</td><td>0</td><td>1</td><td>1</td><td>1</td><td>1</td>');
  });
});

describe('renderRecordFactsHtml', () => {
  it('says there is nothing to check for an empty registry', () => {
    const html = renderRecordFactsHtml(facts([]), 'en');
    expect(html).toContain('There are no records to check.');
    expect(html).not.toContain('<table');
  });
  it('says every record is complete, with no table, when none has a gap', () => {
    const html = renderRecordFactsHtml(facts([one({})]), 'en');
    expect(html).toContain('Every record carries a source, a licence, a retrieved date and a tier.');
    expect(html).toContain('Records that carry all four: 1 of 1.');
    expect(html).not.toContain('<table');
  });
  it('shows Recorded or Unknown in each cell', () => {
    const html = renderRecordFactsHtml(facts([one({ tier: null })]), 'en');
    expect(html).toContain('<th scope="row">Set / Publisher</th><td>Recorded</td><td>Recorded</td><td>Recorded</td><td>Unknown</td>');
  });
  it('has a count for each fact', () => {
    const html = renderRecordFactsHtml(facts(RECORDS), 'en');
    for (const f of FACT_FIELDS) expect(html).toContain(`<th scope="row">${factLabel(f, 'en')}</th><td>1</td>`);
  });
  it('mentions records that are not listed, with the right plural', () => {
    const records: DatasetRecord[] = [{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }];
    expect(renderRecordFactsHtml(facts(records, 2), 'en')).toContain('1 more record with a gap is not listed.');
    expect(renderRecordFactsHtml(facts(records, 1), 'en')).toContain('2 more records with a gap are not listed.');
    expect(renderRecordFactsHtml(facts(records, 1), 'fr')).toContain('2 autres enregistrements ayant une lacune ne sont pas affichés.');
  });
  it('leaves the record table out when the limit is zero, but keeps the counts', () => {
    const html = renderRecordFactsHtml(facts(RECORDS, 0), 'en');
    expect(html.match(/<table>/g)).toHaveLength(2);
  });
  it('escapes names', () => {
    const html = renderRecordFactsHtml(facts(RECORDS), 'en');
    expect(html).not.toContain('<A>');
  });
  it('summarises in both languages', () => {
    expect(factsSummary(facts(RECORDS), 'en')).toBe('Records that carry all four: 2 of 3.');
    expect(factsSummary(facts(RECORDS), 'fr')).toBe('Enregistrements qui comportent les quatre\u00A0: 2 sur 3.');
  });
  it('passes the markup and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const records of [RECORDS, [one({})], []]) {
        const html = renderRecordFactsHtml(facts(records), locale);
        expect(html).toContain('aria-labelledby="ds-facts-title"');
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});
