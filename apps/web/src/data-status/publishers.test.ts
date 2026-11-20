import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  buildPublishers,
  MAX_PUBLISHERS,
  publisherCountText,
  publisherKey,
  publisherLicenceText,
  publisherName,
  publisherRows,
  publishersSummary,
  publisherTexts,
  renderPublishersHtml,
} from './publishers';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, structureProblems } from './testkit';

const src = (id: string, source: string | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
// Places are reviewed 180 days after retrieval, routes 120.
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('a', 'City of Example'),
      src('b', 'city  of  example', { retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary' }),
      src('c', 'Ville d’Exemple'),
      src('d', null, { licence: null }),
      src('e', 'N/A'),
    ],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('f', 'CITY OF EXAMPLE.', { retrievedAt: isoDayOffset(NOW, -100) }), src('g', 'Transit Agency', { retrievedAt: null })] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const d = buildPublishers(RECORDS, audit);
const named = (key: string) => d.publishers.find((p) => p.key === key)!;

describe('publisherKey', () => {
  it('gives one spelling to names that differ in capitals, accents, spaces or punctuation', () => {
    for (const name of ['City of Example', 'city  of  example', 'CITY OF EXAMPLE.', ' City-of-Example ', 'Cìty of Éxample']) expect(publisherKey(name), name).toBe('city of example');
  });
  it('keeps different names apart, and gives the empty key for no name', () => {
    expect(publisherKey('City of Example')).not.toBe(publisherKey('County of Example'));
    expect(publisherKey(null)).toBe('');
    expect(publisherKey('—')).toBe('');
  });
});

describe('publisherTexts', () => {
  it('reads the publisher of each record, with placeholders as not recorded', () => {
    const texts = publisherTexts(RECORDS);
    expect(texts.get('p\u0000a')).toBe('City of Example');
    expect(texts.get('p\u0000d')).toBeNull();
    expect(texts.get('p\u0000e')).toBeNull();
    expect(texts.size).toBe(7);
  });
  it('keeps the first record when a dataset id and a record id are used twice', () => {
    const twice: DatasetRecord[] = [{ id: 'x', name: 'X', kind: 'places', sources: [src('a', 'First'), src('a', 'Second')] }];
    expect(publisherTexts(twice).get('x\u0000a')).toBe('First');
  });
});

describe('buildPublishers', () => {
  it('counts every source under exactly one publisher, or under no publisher', () => {
    expect(d.sourceCount).toBe(7);
    expect(d.publishers.reduce((n, p) => n + p.sources.length, 0)).toBe(7);
    expect(d.named).toBe(3);
    expect(d.unknown).toBe(2);
  });
  it('puts the publisher with the most sources first, then by name, and the row with no publisher last', () => {
    expect(d.publishers.map((p) => p.key)).toEqual(['city of example', 'transit agency', 'ville d exemple', '']);
    expect(d.publishers.map((p) => p.sources.length)).toEqual([3, 1, 1, 2]);
  });
  it('keeps the first spelling as the name and lists the others', () => {
    const city = named('city of example');
    expect(city.name).toBe('City of Example');
    expect(city.spellings).toEqual(['city  of  example', 'CITY OF EXAMPLE.']);
    expect(named('transit agency').spellings).toEqual([]);
    expect(named('').name).toBeNull();
    expect(publisherName(named(''))).toBe('UNKNOWN');
  });
  it('lists the datasets and counts the licence types and the sources that may be out of date', () => {
    const city = named('city of example');
    expect(city.datasets).toEqual(['Places', 'Routes']);
    expect(city.licences).toEqual({ open: 2, terms: 0, unrecognised: 1, unknown: 0 });
    expect(city.stale).toBe(1);
    expect(named('').licences).toEqual({ open: 1, terms: 0, unrecognised: 0, unknown: 1 });
  });
  it('gives the oldest usable retrieved date and the next review date that has not passed', () => {
    const city = named('city of example');
    expect(city.oldestIso).toBe(isoDayOffset(NOW, -400));
    // The source retrieved 400 days ago is past its review date; of the others, the route comes first (120 days after 100 days ago).
    expect(city.nextReviewIso).toBe(isoDayOffset(NOW, 20));
    expect(named('transit agency')).toMatchObject({ oldestIso: null, nextReviewIso: null });
  });
  it('keeps the counts when the list is cut short, and always keeps the row with no publisher', () => {
    const cut = buildPublishers(RECORDS, audit, 1);
    expect(cut.publishers.map((p) => p.key)).toEqual(['city of example', '']);
    expect(cut.named).toBe(3);
    expect(buildPublishers(RECORDS, audit, 0).publishers.map((p) => p.key)).toEqual(['']);
    expect(d.publishers.length).toBeLessThanOrEqual(MAX_PUBLISHERS + 1);
  });
  it('is empty for an empty registry', () => {
    expect(buildPublishers([], auditRegistry([], NOW, {}))).toEqual({ publishers: [], named: 0, unknown: 0, sourceCount: 0 });
  });
  it('holds its promises on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const records = randomRegistry(seed, NOW);
      const a = auditRegistry(records, NOW, {});
      const all = buildPublishers(records, a, 10_000);
      expect(all.publishers.reduce((n, p) => n + p.sources.length, 0), `seed ${seed}`).toBe(a.sources.length);
      expect(new Set(all.publishers.map((p) => p.key)).size).toBe(all.publishers.length);
      expect(all.publishers.filter((p) => p.key !== '').length).toBe(all.named);
      for (const p of all.publishers) {
        expect(Object.values(p.licences).reduce((n, c) => n + c, 0)).toBe(p.sources.length);
        expect(p.stale).toBe(p.sources.filter((s) => s.state === 'stale').length);
        if (p.key !== '') expect(publisherKey(p.name)).toBe(p.key);
        for (const other of p.spellings) expect(publisherKey(other)).toBe(p.key);
      }
      const sizes = all.publishers.filter((p) => p.key !== '').map((p) => p.sources.length);
      expect(sizes).toEqual([...sizes].sort((x, y) => y - x));
    }
  });
});

describe('the words', () => {
  it('lists only the licence types in use, with UNKNOWN for no licence', () => {
    expect(publisherLicenceText(named('city of example'), 'en')).toBe('Open licence: 2; Not on the reference list: 1');
    expect(publisherLicenceText(named(''), 'en')).toBe('Open licence: 1; UNKNOWN: 1');
    expect(lintFrench(publisherLicenceText(named('city of example'), 'fr'))).toEqual([]);
  });
  it('adds how many may be out of date only when some are', () => {
    expect(publisherCountText(named('city of example'), 'en')).toBe('3 (1 may be out of date)');
    expect(publisherCountText(named('transit agency'), 'en')).toBe('1');
  });
  it('sums up in sentences, with singular and plural', () => {
    expect(publishersSummary(d, 'en')).toEqual(['3 publishers are recorded.', '2 sources have no publisher recorded.']);
    expect(publishersSummary(buildPublishers(RECORDS, audit, 1), 'en').at(-1)).toBe('2 more publishers are not shown here.');
    const one = [{ id: 'x', name: 'X', kind: 'places' as const, sources: [src('a', 'Only'), src('b', null)] }];
    expect(publishersSummary(buildPublishers(one, auditRegistry(one, NOW, {})), 'en')).toEqual(['1 publisher is recorded.', '1 source has no publisher recorded.']);
    expect(publishersSummary(buildPublishers([], auditRegistry([], NOW, {})), 'en')).toEqual([]);
    for (const s of [...publishersSummary(d, 'fr'), ...publishersSummary(buildPublishers(RECORDS, audit, 2), 'fr')]) expect(lintFrench(s), s).toEqual([]);
  });
  it('gives one row of text per publisher, with UNKNOWN where there is no date', () => {
    const rows = publisherRows(d, 'en');
    expect(rows[0]).toEqual(['Publisher', 'Sources', 'Datasets', 'Licence types', 'Oldest retrieved date', 'Next review date']);
    expect(rows).toHaveLength(1 + d.publishers.length);
    expect(rows[1]?.slice(0, 3)).toEqual(['City of Example', '3 (1 may be out of date)', 'Places; Routes']);
    expect(rows[2]?.slice(4)).toEqual(['UNKNOWN', 'None coming up']);
    expect(rows.at(-1)?.[0]).toBe('UNKNOWN');
    for (const r of rows) expect(r.every((c) => c.trim() !== '')).toBe(true);
  });
});

describe('renderPublishersHtml', () => {
  it('says so when there is no source', () => {
    const html = renderPublishersHtml(buildPublishers([], auditRegistry([], NOW, {})), 'en');
    expect(html).not.toContain('<table');
    expect(visibleText(html)).toContain('There are no sources to group.');
  });
  it('has a row per publisher with a row header, and the other spellings under the name', () => {
    const html = renderPublishersHtml(d, 'en');
    expect(html).toContain('data-publishers="3"');
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(4);
    expect(html.match(/<caption>/g)).toHaveLength(1);
    expect(html.match(/<small>/g)).toHaveLength(1);
    expect(visibleText(html)).toContain('Also written: city of example; CITY OF EXAMPLE.');
  });
  it('escapes names', () => {
    const odd = [{ id: 'x', name: '<b>X</b>', kind: 'places' as const, sources: [src('a', '<script>alert(1)</script>'), src('b', '<SCRIPT>alert(1)</SCRIPT> ')] }];
    const html = renderPublishersHtml(buildPublishers(odd, auditRegistry(odd, NOW, {})), 'en');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<SCRIPT>');
    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('passes the audits in both languages, on its own and in the panel', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderPublishersHtml(d, locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html.replace(/<th scope="row">.*?<\/th>/g, '')))).toEqual([]);
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
      expect(page.match(/id="ds-publishers-title"/g)).toHaveLength(1);
      expect(page).toContain(html);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      for (let seed = 1; seed <= 5; seed++) {
        const records = randomRegistry(seed, NOW);
        const random = renderPublishersHtml(buildPublishers(records, auditRegistry(records, NOW, {})), locale);
        expect(structureProblems(random), `seed ${seed}`).toEqual([]);
      }
    }
  });
});
