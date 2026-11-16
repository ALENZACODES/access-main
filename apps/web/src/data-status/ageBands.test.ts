import { describe, expect, it } from 'vitest';
import { AGE_BANDS, bandFor, bandLabel, buildAgeDistribution, checkBands, renderAgeBandsHtml, shareText, type AgeBand } from './ageBands';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { lintFrench } from './i18n';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, RECORDS, structureProblems } from './testkit';

describe('AGE_BANDS', () => {
  it('cover every age from 0 with no gap or overlap', () => {
    expect(checkBands(AGE_BANDS)).toEqual([]);
  });
  it('are found by checkBands when broken', () => {
    expect(checkBands([])).toEqual(['no bands']);
    expect(checkBands([{ id: 'x', from: 1, to: null }])).toContain('first band must start at 0');
    expect(
      checkBands([
        { id: 'a', from: 0, to: 10 },
        { id: 'b', from: 12, to: null },
      ]),
    ).toEqual(['a: gap or overlap before b']);
    expect(
      checkBands([
        { id: 'a', from: 0, to: 10 },
        { id: 'b', from: 10, to: null },
      ]),
    ).toEqual(['a: gap or overlap before b']);
    expect(checkBands([{ id: 'a', from: 0, to: 10 }])).toEqual(['a: last band must have no upper bound']);
    expect(
      checkBands([
        { id: 'a', from: 0, to: null },
        { id: 'b', from: 5, to: null },
      ]),
    ).toContain('a: only the last band may be open-ended');
    expect(checkBands([{ id: 'a', from: 0, to: -1 }, { id: 'b', from: 0, to: null }])).toContain('a: upper bound below lower bound');
  });
});

describe('bandFor', () => {
  const id = (n: number) => bandFor(n)?.id ?? null;
  it('uses inclusive edges', () => {
    expect(id(0)).toBe('d0_30');
    expect(id(30)).toBe('d0_30');
    expect(id(31)).toBe('d31_90');
    expect(id(90)).toBe('d31_90');
    expect(id(91)).toBe('d91_180');
    expect(id(180)).toBe('d91_180');
    expect(id(181)).toBe('d181_365');
    expect(id(365)).toBe('d181_365');
    expect(id(366)).toBe('d366_plus');
    expect(id(100_000)).toBe('d366_plus');
  });
  it('has no band for negative, fractional or non-finite ages', () => {
    expect(id(-1)).toBeNull();
    expect(id(1.5)).toBeNull();
    expect(id(Number.NaN)).toBeNull();
    expect(id(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it('accepts a custom band list', () => {
    const bands: AgeBand[] = [{ id: 'all', from: 0, to: null }];
    expect(bandFor(5, bands)?.id).toBe('all');
  });
});

describe('buildAgeDistribution', () => {
  const dist = buildAgeDistribution(auditRegistry(RECORDS, NOW), NOW);
  it('counts each source once, by whole days since its retrieved date', () => {
    expect(dist.total).toBe(3);
    expect(Object.fromEntries(dist.bands.map((b) => [b.id, b.count]))).toEqual({ d0_30: 1, d31_90: 0, d91_180: 0, d181_365: 0, d366_plus: 1 });
  });
  it('keeps Unknown out of the bands and reports the oldest and newest known ages', () => {
    expect(dist.unknown).toBe(1);
    expect(dist.newest).toBe(14);
    expect(dist.oldest).toBe(1049);
  });
  it('treats a future date and placeholder text as Unknown', () => {
    const records: DatasetRecord[] = [
      { id: 'd', name: 'D', kind: 'places', sources: [{ id: '1', retrievedAt: isoDayOffset(NOW, 3) }, { id: '2', retrievedAt: 'N/A' }, { id: '3', retrievedAt: '2026-13-40' }, { id: '4', retrievedAt: isoDayOffset(NOW, 0) }] },
    ];
    const d = buildAgeDistribution(auditRegistry(records, NOW), NOW);
    expect(d.unknown).toBe(3);
    expect(d.bands[0]?.count).toBe(1);
    expect(d.oldest).toBe(0);
    expect(d.newest).toBe(0);
  });
  it('has null extremes when nothing is readable', () => {
    const d = buildAgeDistribution(auditRegistry([{ id: 'd', name: 'D', kind: 'places', sources: [{ id: 'x' }] }], NOW), NOW);
    expect(d.oldest).toBeNull();
    expect(d.newest).toBeNull();
    expect(d.unknown).toBe(1);
  });
  it('is empty for an empty registry', () => {
    const d = buildAgeDistribution(auditRegistry([], NOW), NOW);
    expect(d.total).toBe(0);
    expect(d.bands.every((b) => b.count === 0)).toBe(true);
  });
  it('puts day 0 and the 30/31 boundary in the right band', () => {
    const mk = (n: number): DatasetRecord => ({ id: `d${n}`, name: 'D', kind: 'places', sources: [{ id: `s${n}`, retrievedAt: isoDayOffset(NOW, -n) }] });
    const d = buildAgeDistribution(auditRegistry([mk(0), mk(30), mk(31)], NOW), NOW);
    expect(d.bands[0]?.count).toBe(2);
    expect(d.bands[1]?.count).toBe(1);
  });
});

describe('labels and shares', () => {
  it('words each band in both languages', () => {
    expect(bandLabel({ from: 0, to: 30 }, 'en')).toBe('0 to 30 days');
    expect(bandLabel({ from: 366, to: null }, 'en')).toBe('More than 365 days');
    expect(bandLabel({ from: 31, to: 90 }, 'fr')).toBe('De 31 à 90 jours');
    expect(bandLabel({ from: 366, to: null }, 'fr')).toBe('Plus de 365 jours');
  });
  it('gives a whole-number share, and nothing when the total is zero', () => {
    expect(shareText(1, 3, 'en')).toBe('33%');
    expect(shareText(3, 3, 'en')).toBe('100%');
    expect(shareText(0, 3, 'en')).toBe('0%');
    expect(shareText(0, 0, 'en')).toBe('');
    expect(shareText(1, 2, 'fr').replace(/\s/g, '')).toBe('50%');
    expect(shareText(1, 2, 'fr')).toMatch(/^50\s%$/);
  });
});

describe('renderAgeBandsHtml', () => {
  const html = renderAgeBandsHtml(buildAgeDistribution(auditRegistry(RECORDS, NOW), NOW), 'en');
  it('has a caption, scoped headers and a row for each band plus Unknown', () => {
    expect(html).toContain('<caption>Sources by age of retrieved date</caption>');
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(AGE_BANDS.length + 1);
    expect(html).toContain('<th scope="row">Unknown date</th><td>1</td><td>33%</td>');
  });
  it('states the range and the Unknown note in words', () => {
    expect(html).toContain('The most recent retrieved date is 14 days old and the oldest is 1049 days old.');
    expect(html).toContain('1 source has no usable retrieved date and is not placed in an age band.');
  });
  it('passes the markup audit', () => {
    expect(structureProblems(html)).toEqual([]);
  });
  it('says there is nothing to count for an empty registry', () => {
    const empty = renderAgeBandsHtml(buildAgeDistribution(auditRegistry([], NOW), NOW), 'fr');
    expect(empty).toContain('Il n’y a aucune source à compter.');
    expect(empty).not.toContain('<table');
  });
  it('uses the French singular for one day', () => {
    const records: DatasetRecord[] = [{ id: 'd', name: 'D', kind: 'places', sources: [{ id: 'a', retrievedAt: isoDayOffset(NOW, -1) }] }];
    const fr = renderAgeBandsHtml(buildAgeDistribution(auditRegistry(records, NOW), NOW), 'fr');
    expect(fr).toContain('date de 1 jour et la plus ancienne de 1 jours');
  });
  it('has no French typography problems in its own words', () => {
    const fr = renderAgeBandsHtml(buildAgeDistribution(auditRegistry(RECORDS, NOW), NOW), 'fr');
    expect(lintFrench(fr.replace(/<[^>]*>/g, ' ').replace(/\d+\s?%/g, ''))).toEqual([]);
  });
});

describe('age distribution over random registries', () => {
  it('counts every source exactly once', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW);
      const d = buildAgeDistribution(audit, NOW);
      const inBands = d.bands.reduce((n, b) => n + b.count, 0);
      expect(inBands + d.unknown, `seed ${seed}`).toBe(audit.sources.length);
      expect(d.total, `seed ${seed}`).toBe(audit.sources.length);
      if (d.oldest !== null && d.newest !== null) expect(d.oldest).toBeGreaterThanOrEqual(d.newest);
      expect(structureProblems(renderAgeBandsHtml(d, seed % 2 === 0 ? 'en' : 'fr')), `seed ${seed}`).toEqual([]);
    }
  });
});
