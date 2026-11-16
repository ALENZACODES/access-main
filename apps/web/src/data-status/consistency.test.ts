import { describe, expect, it } from 'vitest';
import { buildCatalogue } from './catalogue';
import { checkConsistency, compareCatalogue, compareCsv, compareSummary, consistencyToJson, parseCsv } from './consistency';
import { auditedSourcesToCsv, toCsv } from './csv';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { buildSummary, summaryToJson } from './summary';
import { handleDataStatus } from './http';
import { randomRecords } from './fuzzKit';
import { RECORDS, NOW as KIT_NOW } from './testkit';

const NOW = new Date('2026-11-16T12:00:00Z');
const src = { id: 's', name: 'Src', source: 'Pub', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', url: 'https://example.org' };

describe('parseCsv', () => {
  it('parses plain rows with CRLF or LF', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('parses quotes, commas, doubled quotes and newlines inside cells', () => {
    expect(parseCsv('"a,b","say ""hi""","l1\nl2"\r\n')).toEqual([['a,b', 'say "hi"', 'l1\nl2']]);
  });
  it('drops a leading BOM', () => {
    expect(parseCsv('﻿a,b\r\n')).toEqual([['a', 'b']]);
  });
  it('keeps empty cells and a trailing empty cell', () => {
    expect(parseCsv('a,,c,\r\n')).toEqual([['a', '', 'c', '']]);
  });
  it('returns no rows for an empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });
  it('round-trips what toCsv writes, including hostile cells', () => {
    const rows = [['x', 'a,b', 'q"q', 'two\nlines', ''], ['', '', '', '', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('reads the audited CSV back with one row per source plus a header', () => {
    const audit = auditRegistry(RECORDS, KIT_NOW);
    expect(parseCsv(auditedSourcesToCsv(audit.sources, 'en'))).toHaveLength(audit.sources.length + 1);
  });
});

describe('checkConsistency on known registries', () => {
  it('finds the shared test registry consistent in both languages', () => {
    const r = checkConsistency(RECORDS, KIT_NOW);
    expect(r.problems).toEqual([]);
    expect(r.surfaces).toEqual(['audit', 'summary', 'catalogue', 'csv', 'source list', 'review', 'calendar', 'qa counts', 'completeness', 'credits']);
  });

  it('finds an empty registry consistent', () => {
    expect(checkConsistency([], NOW).problems).toEqual([]);
    expect(checkConsistency([{ id: 'd', name: 'D', kind: 'places', sources: [] }], NOW).problems).toEqual([]);
  });

  it('honours custom thresholds on every surface', () => {
    const recs: DatasetRecord[] = [{ id: 'd', name: 'D', kind: 'places', sources: [{ ...src, retrievedAt: '2026-10-01' }] }];
    expect(checkConsistency(recs, NOW, { thresholds: { places: 10 } }).problems).toEqual([]);
    expect(checkConsistency(recs, NOW, { thresholds: { places: 100 } }).problems).toEqual([]);
  });

  it('can check one language at a time', () => {
    expect(checkConsistency(RECORDS, KIT_NOW, { locales: ['fr'] }).problems).toEqual([]);
  });

  it('handles awkward cells: formulas, quotes, markup, commas', () => {
    const recs: DatasetRecord[] = [
      {
        id: 'd',
        name: '=HYPERLINK("x")',
        kind: 'routes',
        sources: [
          { ...src, id: 'a', name: '+cmd, "quoted"', licence: '@x' },
          { ...src, id: 'b', name: '<script>alert(1)</script>', licence: '-1' },
        ],
      },
    ];
    expect(checkConsistency(recs, NOW).problems).toEqual([]);
  });

  it('handles a future date, a bad date, a placeholder and a missing date side by side', () => {
    const recs: DatasetRecord[] = [
      { id: 'd', name: 'D', kind: 'transit', sources: [
        { ...src, id: 'f', retrievedAt: '2027-02-01' },
        { ...src, id: 'b', retrievedAt: '2026-02-31' },
        { ...src, id: 'p', retrievedAt: 'N/A', licence: 'TBD' },
        { ...src, id: 'm', retrievedAt: null },
        { ...src, id: 'o', retrievedAt: '2026-11-10T08:00:00-05:00' },
      ] },
    ];
    expect(checkConsistency(recs, NOW).problems).toEqual([]);
  });

  it('handles duplicate dataset ids and duplicate source ids without false alarms', () => {
    const recs: DatasetRecord[] = [
      { id: 'x', name: 'One', kind: 'places', sources: [src, { ...src, retrievedAt: null }] },
      { id: 'x', name: 'Two', kind: 'routes', sources: [{ ...src, id: 'z' }] },
    ];
    expect(checkConsistency(recs, NOW).problems).toEqual([]);
  });

  it('is deterministic', () => {
    const a = checkConsistency(RECORDS, KIT_NOW);
    expect(checkConsistency(RECORDS, KIT_NOW)).toEqual(a);
  });
});

describe('checkConsistency on 1,200 random messy registries', () => {
  it('never finds two outputs disagreeing', () => {
    for (let seed = 1; seed <= 1200; seed++) {
      const result = checkConsistency(randomRecords(seed, NOW), NOW);
      expect(result.problems, `seed ${seed}`).toEqual([]);
    }
  });

  it('also holds at other times of day and year', () => {
    for (const at of ['2026-01-01T00:00:00Z', '2026-06-30T23:59:59Z', '2027-02-28T12:00:00+05:30', '2028-02-29T00:00:00Z']) {
      const now = new Date(at);
      for (let seed = 1; seed <= 80; seed++) expect(checkConsistency(randomRecords(seed, now), now).problems, `${at} seed ${seed}`).toEqual([]);
    }
  });

  it('the generator really produces fresh, stale and unknown sources', () => {
    const counts = { fresh: 0, stale: 0, unknown: 0 };
    for (let seed = 1; seed <= 200; seed++) for (const s of auditRegistry(randomRecords(seed, NOW), NOW).sources) counts[s.state]++;
    expect(counts.fresh).toBeGreaterThan(100);
    expect(counts.stale).toBeGreaterThan(50);
    expect(counts.unknown).toBeGreaterThan(100);
  });
});

describe('each comparison fails when its surface is wrong (the check bites)', () => {
  const audit = auditRegistry(RECORDS, KIT_NOW);
  const summary = () => JSON.parse(summaryToJson(buildSummary(audit, KIT_NOW))) as { totals: Record<string, number>; sources: Record<string, unknown>[] };
  const csv = (l: 'en' | 'fr' = 'en') => parseCsv(auditedSourcesToCsv(audit.sources, l)).map((r) => [...r]);
  const cat = () => structuredClone(buildCatalogue(audit, KIT_NOW));

  it('start from clean artifacts', () => {
    expect(compareSummary(audit, summary())).toEqual([]);
    expect(compareCsv(audit, csv(), 'en')).toEqual([]);
    expect(compareCsv(audit, csv('fr'), 'fr')).toEqual([]);
    expect(compareCatalogue(audit, cat())).toEqual([]);
  });

  it('summary: a flipped state, date, licence, open flag, issue list or total', () => {
    for (const [field, value, pattern] of [
      ['state', 'unknown', /state/],
      ['retrieved', '1999-01-01', /retrieved differs/],
      ['licence', 'Something else', /licence differs/],
      ['licenceOpen', null, /licenceOpen differs/],
      ['issues', ['stale'], /issues differ/],
    ] as const) {
      const s = summary();
      const before = s.sources[0]![field];
      if (JSON.stringify(before) === JSON.stringify(value)) continue;
      s.sources[0]![field] = value;
      expect(compareSummary(audit, s).join(), field).toMatch(pattern);
    }
    const s = summary();
    s.totals['stale'] = (s.totals['stale'] ?? 0) + 1;
    expect(compareSummary(audit, s).join()).toContain('totals differ');
  });

  it('summary: a dropped source or a broken schema', () => {
    const s = summary();
    s.sources.pop();
    expect(compareSummary(audit, s).join()).toContain('source count differs');
    expect(compareSummary(audit, { schemaVersion: 9 }).join()).toContain('summary: invalid schemaVersion');
  });

  it('csv: a changed status, date, open flag or licence, a missing row or an extra column', () => {
    for (const [col, value] of [[6, 'Anything'], [5, '1999-01-01'], [4, 'Maybe'], [3, 'Other licence']] as const) {
      const rows = csv();
      rows[1]![col] = value;
      expect(compareCsv(audit, rows, 'en').length, `column ${col}`).toBeGreaterThan(0);
    }
    const missing = csv();
    missing.pop();
    expect(compareCsv(audit, missing, 'en').join()).toMatch(/rows for/);
    const wide = csv();
    wide[1]!.push('extra');
    expect(compareCsv(audit, wide, 'en').join()).toContain('8 columns');
  });

  it('csv: English text in a French export is caught', () => {
    const rows = csv('en');
    expect(compareCsv(audit, rows, 'fr').length).toBeGreaterThan(0);
  });

  it('csv: the formula guard is tolerated but any other change to a licence is not', () => {
    const recs: DatasetRecord[] = [{ id: 'd', name: 'D', kind: 'places', sources: [{ ...src, licence: '=cmd' }] }];
    const a = auditRegistry(recs, NOW);
    const rows = parseCsv(auditedSourcesToCsv(a.sources, 'en')).map((r) => [...r]);
    expect(rows[1]![3]).toBe("'=cmd");
    expect(compareCsv(a, rows, 'en')).toEqual([]);
    rows[1]![3] = "'=other";
    expect(compareCsv(a, rows, 'en').join()).toContain('licence');
  });

  it('catalogue: a changed state, a source that claims a known date is unknown, a changed date or a dropped source', () => {
    const c1 = cat();
    const first = c1['dcat:dataset'].flatMap((d) => d['prov:wasDerivedFrom'])[0]!;
    first['ds:state'] = first['ds:state'] === 'fresh' ? 'stale' : 'fresh';
    expect(compareCatalogue(audit, c1).join()).toContain('state differs');

    const c2 = cat();
    c2['dcat:dataset'].flatMap((d) => d['prov:wasDerivedFrom'])[0]!['ds:unknown'].push('licence');
    expect(compareCatalogue(audit, c2).join()).toContain('unknown.licence differs');

    const c3 = cat();
    c3['dcat:dataset'].flatMap((d) => d['prov:wasDerivedFrom'])[0]!['prov:generatedAtTime'] = { '@value': '1999-01-01', '@type': 'xsd:date' };
    expect(compareCatalogue(audit, c3).join()).toContain('retrieved differs');

    const c4 = cat();
    c4['dcat:dataset'][0]!['prov:wasDerivedFrom'].pop();
    expect(compareCatalogue(audit, c4).join()).toContain('source count differs');
  });
});

describe('consistencyToJson', () => {
  it('reports consistent: true and no problems', () => {
    const json = JSON.parse(consistencyToJson(checkConsistency(RECORDS, KIT_NOW), KIT_NOW)) as { consistent: boolean; problems: string[]; schemaVersion: number; surfaces: string[] };
    expect(json.consistent).toBe(true);
    expect(json.problems).toEqual([]);
    expect(json.schemaVersion).toBe(1);
    expect(json.surfaces).toContain('csv');
  });

  it('reports consistent: false when there are problems', () => {
    const json = JSON.parse(consistencyToJson({ surfaces: ['x'], problems: ['p'] }, NOW)) as { consistent: boolean; problems: string[] };
    expect(json).toMatchObject({ consistent: false, problems: ['p'] });
  });
});

describe('the live routes', () => {
  const ctx = { getRecords: () => Promise.resolve(RECORDS), now: () => KIT_NOW };
  const get = (url: string) => handleDataStatus({ method: 'GET', url, headers: {} }, ctx);

  it('serves consistency.json as JSON with a consistent registry', async () => {
    const res = await get('/en/data-status/consistency.json');
    expect(res?.status).toBe(200);
    expect(res?.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(JSON.parse(res!.body)).toMatchObject({ consistent: true, problems: [] });
  });

  it('serves completeness.json with counts that match the summary', async () => {
    const [comp, sum] = await Promise.all([get('/fr/data-status/completeness.json'), get('/fr/data-status/summary.json')]);
    const c = JSON.parse(comp!.body) as { total: number; fields: { field: string; unknown: number }[] };
    const s = JSON.parse(sum!.body) as { totals: { sources: number; unknownDate: number } };
    expect(c.total).toBe(s.totals.sources);
    expect(c.fields.find((f) => f.field === 'retrieved')?.unknown).toBe(s.totals.unknownDate);
  });

  it('applies ?stale thresholds to the new routes as it does to the others', async () => {
    const strict = await get('/en/data-status/consistency.json?routes=1&places=1&transit=1');
    expect(JSON.parse(strict!.body)).toMatchObject({ consistent: true });
  });

  it('redirects the new routes to a locale-prefixed path', async () => {
    for (const p of ['/data-status/consistency.json', '/data-status/completeness.json']) {
      const res = await get(p);
      expect(res?.status).toBe(302);
      expect(res?.headers['location']).toMatch(/^\/(en|fr)\/data-status\//);
    }
  });

  it('answers HEAD without a body and POST with 405', async () => {
    const head = await handleDataStatus({ method: 'HEAD', url: '/en/data-status/completeness.json', headers: {} }, ctx);
    expect(head?.status).toBe(200);
    expect(head?.body).toBe('');
    const post = await handleDataStatus({ method: 'POST', url: '/en/data-status/consistency.json', headers: {} }, ctx);
    expect(post?.status).toBe(405);
  });

  it('shows the new sections on the page in both languages', async () => {
    const en = (await get('/en/data-status'))!.body;
    const fr = (await get('/fr/data-status'))!.body;
    expect(en).toContain('How statuses are decided');
    expect(en).toContain('Completeness by field');
    expect(fr).toContain('Comment les états sont établis');
    expect(fr).toContain('Complétude par champ');
  });
});
