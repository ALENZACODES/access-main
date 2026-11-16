import { describe, expect, it } from 'vitest';
import { buildCacheRecords } from './cacheRecords';
import { cachedSourceInputs, groupCachedSources, type CachedRecordLike } from './cacheSources';
import { auditRegistry } from './datasetRegistry';
import { buildSourceList } from './sourceList';
import { buildCompleteness, completenessProblems } from './completeness';
import { checkConsistency } from './consistency';
import { mulberry32, pick, randomRetrieved } from './fuzzKit';
import { auditProblems } from './invariants';

const NOW = new Date('2026-11-16T12:00:00Z');

function rec(id: string, retrieved: string | null | undefined, over: Partial<CachedRecordLike['provenance']> = {}): CachedRecordLike {
  return { id, title: `Record ${id}`, kind: 'place', provenance: { source_name: 'Open data', licence: 'OGL-Ontario', source_url: 'https://example.org/data', retrieved_at: retrieved, ...over } };
}

function row(records: CachedRecordLike[]) {
  const rows = buildSourceList(cachedSourceInputs(groupCachedSources(records, NOW)), 'en', NOW);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

describe('groupCachedSources: a row never looks better than its worst record', () => {
  it('shows the oldest date when every record has a readable one', () => {
    const [g] = groupCachedSources([rec('a', '2026-11-10'), rec('b', '2026-05-01'), rec('c', '2026-11-01')], NOW);
    expect(g).toMatchObject({ retrievedAt: '2026-05-01', recordCount: 3, unknownDateCount: 0, basis: 'oldest' });
  });

  it('is Unknown when one record has no date, even if the others are recent', () => {
    for (const bad of [null, undefined, '', 'N/A', 'TBD', 'inconnu', '2026-02-31', 'soon', '2026-05-01T10:00:00', '2027-01-01']) {
      const [g] = groupCachedSources([rec('a', '2026-11-10'), rec('b', bad)], NOW);
      expect(g, String(bad)).toMatchObject({ retrievedAt: null, unknownDateCount: 1, recordCount: 2, basis: 'unknown-record' });
    }
  });

  it('is Unknown whichever order the records arrive in', () => {
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2]]) {
      const input = [rec('a', '2026-11-10'), rec('b', 'N/A'), rec('c', '2026-01-01')];
      const [g] = groupCachedSources(order.map((i) => input[i]!), NOW);
      expect(g?.retrievedAt).toBeNull();
    }
  });

  it('shows Unknown in the source list, not a date borrowed from another record', () => {
    const r = row([rec('a', '2026-11-10'), rec('b', 'N/A')]);
    expect(r.retrieved).toBe('Unknown');
    expect(r.state).toBe('unknown');
    expect(r.issues).toContain('missing-date');
  });

  it('compares dates as instants, not as text', () => {
    // As text "2026-11-01T00:30:00+05:00" sorts after "2026-10-31T20:00:00Z", but it is the earlier instant.
    const [g] = groupCachedSources([rec('a', '2026-10-31T20:00:00Z'), rec('b', '2026-11-01T00:30:00+05:00')], NOW);
    expect(g?.retrievedAt).toBe('2026-11-01T00:30:00+05:00');
  });

  it('a stale record is not hidden behind a newer one', () => {
    const r = row([rec('new', '2026-11-14'), rec('old', '2026-01-01')]);
    expect(r.state).toBe('stale');
    expect(r.retrieved).toBe('2026-01-01');
  });

  it('keeps one row per source and licence, in order of first appearance', () => {
    const groups = groupCachedSources(
      [rec('1', '2026-11-01', { source_name: 'B' }), rec('2', '2026-11-01', { source_name: 'A' }), rec('3', '2026-11-02', { source_name: 'B' }), rec('4', '2026-11-01', { source_name: 'B', licence: 'CC-BY-4.0' })],
      NOW,
    );
    expect(groups.map((g) => [g.name, g.licence, g.recordCount])).toEqual([['B', 'OGL-Ontario', 2], ['A', 'OGL-Ontario', 1], ['B', 'CC-BY-4.0', 1]]);
  });

  it('puts every placeholder source or licence in one Unknown row', () => {
    const groups = groupCachedSources([rec('1', '2026-11-01', { source_name: 'N/A', licence: 'TBD' }), rec('2', '2026-11-01', { source_name: 'unknown', licence: '' })], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.recordCount).toBe(2);
  });

  it('treats names that differ only by surrounding space as one source', () => {
    expect(groupCachedSources([rec('1', '2026-11-01', { source_name: ' Open data ' }), rec('2', '2026-11-01')], NOW)).toHaveLength(1);
  });

  it('returns nothing for no records', () => {
    expect(groupCachedSources([], NOW)).toEqual([]);
    expect(buildCacheRecords([], 'en')).toEqual([]);
  });

  it('a single record is its own oldest', () => {
    expect(groupCachedSources([rec('a', '2026-11-10')], NOW)[0]).toMatchObject({ retrievedAt: '2026-11-10', basis: 'oldest', recordCount: 1 });
  });

  it('keeps the date exactly as written (no reformatting) so the source list can read it', () => {
    expect(groupCachedSources([rec('a', '  2026-11-10T08:00:00-05:00 ')], NOW)[0]?.retrievedAt).toBe('2026-11-10T08:00:00-05:00');
  });
});

describe('the grouped row agrees with its records (random caches)', () => {
  it('is stale if any record is stale, unknown if any is unknown, else fresh; never better than the worst', () => {
    const r = mulberry32(2026);
    for (let i = 0; i < 400; i++) {
      const n = 1 + Math.floor(r() * 5);
      const records = Array.from({ length: n }, (_, j) => rec(`r${j}`, randomRetrieved(r, NOW)));
      const perRecord = records.map((x) => buildSourceList([{ id: x.id, name: x.title, source: 'Open data', licence: 'OGL-Ontario', retrievedAt: x.provenance.retrieved_at }], 'en', NOW)[0]!.state);
      const grouped = row(records).state;
      if (perRecord.includes('unknown')) expect(grouped, JSON.stringify(records.map((x) => x.provenance.retrieved_at))).toBe('unknown');
      else if (perRecord.includes('stale')) expect(grouped).toBe('stale');
      else expect(grouped).toBe('fresh');
    }
  });

  it('counts unknown records exactly', () => {
    const r = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const records = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, j) => rec(`r${j}`, randomRetrieved(r, NOW)));
      const want = records.filter((x) => buildSourceList([{ id: 'x', name: 'n', source: 's', licence: 'OGL-Ontario', retrievedAt: x.provenance.retrieved_at }], 'en', NOW)[0]!.state === 'unknown').length;
      expect(groupCachedSources(records, NOW)[0]?.unknownDateCount).toBe(want);
    }
  });
});

describe('the cache as a registry (buildCacheRecords) obeys the same rules', () => {
  const records = [rec('a', '2026-11-10'), rec('b', null, { licence: 'N/A' }), rec('c', '2026-01-01', { source_url: null, source_name: '' })];

  it('makes one dataset per kind holding every record as a source', () => {
    const reg = buildCacheRecords(records, 'en');
    expect(reg).toHaveLength(1);
    expect(reg[0]!.sources.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('audits with the same rules as the registry: limit, unknown date, missing licence and publisher', () => {
    const audit = auditRegistry(buildCacheRecords(records, 'en'), NOW);
    const byId = Object.fromEntries(audit.sources.map((s) => [s.sourceId, s]));
    expect(byId['a']).toMatchObject({ state: 'fresh', ageDays: 6, limitDays: 180 });
    expect(byId['b']).toMatchObject({ state: 'unknown', licence: null });
    expect(byId['b']!.issues).toEqual(expect.arrayContaining(['missing-licence', 'missing-date']));
    expect(byId['c']).toMatchObject({ state: 'stale', url: null });
    expect(byId['c']!.issues).toContain('missing-source');
  });

  it('measures UNKNOWN rates for the cache', () => {
    const c = buildCompleteness(auditRegistry(buildCacheRecords(records, 'en'), NOW));
    const f = (name: string) => c.fields.find((x) => x.field === name)!;
    expect(c.total).toBe(3);
    expect(f('retrieved')).toMatchObject({ known: 2, unknown: 1 });
    expect(f('licence')).toMatchObject({ known: 2, unknown: 1 });
    expect(f('source')).toMatchObject({ known: 2, unknown: 1 });
    expect(f('url')).toMatchObject({ known: 2, unknown: 1 });
    expect(f('name')).toMatchObject({ known: 2, unknown: 1 });
    expect(completenessProblems(c)).toEqual([]);
  });

  it('stays consistent across every surface for random caches', () => {
    const r = mulberry32(77);
    for (let i = 0; i < 300; i++) {
      const records = Array.from({ length: Math.floor(r() * 6) }, (_, j) =>
        rec(`r${j}`, randomRetrieved(r, NOW), { source_name: pick(r, ['Open data', 'N/A', '', 'City']), licence: pick(r, ['OGL-Ontario', 'TBD', 'Metrolinx AUA', '', 'Custom']), source_url: pick(r, ['https://example.org', null, 'javascript:x', 'not a url']) }),
      );
      const reg = buildCacheRecords(records, 'en');
      expect(auditProblems(auditRegistry(reg, NOW)), `case ${i}`).toEqual([]);
      expect(checkConsistency(reg, NOW).problems, `case ${i}`).toEqual([]);
    }
  });
});
