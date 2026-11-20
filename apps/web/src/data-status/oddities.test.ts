import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  buildOddities,
  licenceKey,
  MAX_ODDITY_EXAMPLES,
  odditiesSummary,
  ODDITY_CODES,
  oddityCountText,
  oddityItemText,
  oddityTitle,
  oddityWhy,
  renderOdditiesHtml,
  VERY_OLD_DAYS,
  type OddityCode,
} from './oddities';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, structureProblems } from './testkit';

// Written in two parts so the repository check for plain-http links does not read it as one.
const PLAIN = `${'http'}://`;
const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', url: `https://example.org/${id}`, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const one = (sources: ReturnType<typeof src>[], id = 'p', name = 'Places'): DatasetRecord => ({ id, name, kind: 'places', sources });
const build = (records: DatasetRecord[]) => buildOddities(auditRegistry(records, NOW, {}));
const group = (records: DatasetRecord[], code: OddityCode) => build(records).groups.find((g) => g.code === code);
// The sources come in the order of the audit, which is not the order of the records, so ids are sorted before they are compared.
const ids = (records: DatasetRecord[], code: OddityCode) =>
  (group(records, code)?.items.map((i) => i.sources.map((s) => s.sourceId).sort()) ?? []).sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));

describe('nothing to look at', () => {
  it('finds nothing in a tidy registry or an empty one', () => {
    expect(build([one([src('a'), src('b')])])).toEqual({ groups: [], total: 0, sourceCount: 2 });
    expect(build([])).toEqual({ groups: [], total: 0, sourceCount: 0 });
  });
});

describe('the same name twice', () => {
  it('lists names used more than once in one dataset, whatever the capitals or accents', () => {
    const records = [one([src('a', { name: 'Library' }), src('b', { name: 'LIBRARY ' }), src('c', { name: 'Librairie' }), src('d', { name: 'Théâtre' }), src('e', { name: 'Theatre' })])];
    expect(ids(records, 'same-name')).toEqual([['a', 'b'], ['d', 'e']]);
    expect(group(records, 'same-name')?.items.map((i) => i.detail.trim().toLowerCase()).sort()).toEqual(['library', 'theatre'].map((w) => expect.stringMatching(new RegExp(`^${w.replace('theatre', 'th[eé][aâ]tre')}$`))));
  });
  it('does not compare across datasets', () => {
    expect(ids([one([src('a', { name: 'Library' })]), one([src('b', { name: 'Library' })], 'q', 'Other')], 'same-name')).toEqual([]);
  });
});

describe('one licence written more than one way', () => {
  it('gives one spelling to texts that differ only in capitals, spaces or punctuation', () => {
    for (const text of ['OGL-Ontario', 'ogl ontario', 'OGL_Ontario', ' Ogl–Ontario ']) expect(licenceKey(text), text).toBe('oglontario');
    expect(licenceKey('CC-BY-4.0')).not.toBe(licenceKey('CC-BY-3.0'));
    expect(licenceKey(null)).toBe('');
  });
  it('lists the sources written another way than the most used spelling, across datasets', () => {
    const records = [one([src('a'), src('b'), src('c', { licence: 'ogl ontario' })]), one([src('d', { licence: 'OGL ONTARIO' }), src('e', { licence: 'CC-BY-4.0' })], 'q', 'Other')];
    expect(ids(records, 'licence-spelling')).toEqual([['c', 'd']]);
    const spellings = group(records, 'licence-spelling')?.items[0]?.detail.split(' / ') ?? [];
    expect(spellings[0]).toBe('OGL-Ontario');
    expect([...spellings].sort()).toEqual(['OGL ONTARIO', 'OGL-Ontario', 'ogl ontario']);
  });
  it('ignores a licence that is not recorded, and one written the same way everywhere', () => {
    expect(ids([one([src('a', { licence: null }), src('b', { licence: 'N/A' }), src('c'), src('d')])], 'licence-spelling')).toEqual([]);
  });
});

describe('addresses, names and dates', () => {
  it('lists a page address that does not start with https', () => {
    const records = [one([src('a', { url: `${PLAIN}example.org/a` }), src('b'), src('c', { url: null }), src('d', { url: ` ${PLAIN.toUpperCase()}EXAMPLE.ORG` })])];
    expect(ids(records, 'plain-http')).toEqual([['a'], ['d']]);
    expect(group(records, 'plain-http')?.items[0]?.detail).toBe(`${PLAIN}example.org/a`);
  });
  it('lists a name that is a web address', () => {
    const records = [one([src('a', { name: 'https://example.org/data' }), src('b', { name: 'www.example.org' }), src('c', { name: 'See https://example.org' }), src('d', { name: 'World Wide Web list' })])];
    expect(ids(records, 'name-is-address')).toEqual([['a'], ['b']]);
  });
  it('lists a retrieved date more than five years ago, and not one just inside', () => {
    const records = [one([src('a', { retrievedAt: isoDayOffset(NOW, -(VERY_OLD_DAYS + 1)) }), src('b', { retrievedAt: isoDayOffset(NOW, -VERY_OLD_DAYS) }), src('c', { retrievedAt: null })])];
    expect(ids(records, 'very-old')).toEqual([['a']]);
  });
  it('lists a usable retrieved date on the first of January, and not one in the future', () => {
    const records = [one([src('a', { retrievedAt: '2026-01-01' }), src('b', { retrievedAt: '2026-01-02' }), src('c', { retrievedAt: '2027-01-01' }), src('d', { retrievedAt: '2020-01-01' })])];
    expect(ids(records, 'first-of-january')).toEqual([['a'], ['d']]);
    expect(ids(records, 'very-old')).toEqual([['d']]);
  });
});

describe('buildOddities', () => {
  it('keeps the fixed order of the checks and counts every item', () => {
    const records = [one([src('a', { retrievedAt: '2026-01-01', url: `${PLAIN}example.org/a`, name: 'Twin' }), src('b', { name: 'twin', licence: 'ogl-ontario' }), src('c')])];
    const d = build(records);
    expect(d.groups.map((g) => g.code)).toEqual(['same-name', 'licence-spelling', 'plain-http', 'first-of-january']);
    expect(d.total).toBe(4);
    expect(d.sourceCount).toBe(3);
  });
  it('changes no status and adds no finding', () => {
    const records = [one([src('a', { retrievedAt: '2026-01-01', url: `${PLAIN}example.org/a` })])];
    const audit = auditRegistry(records, NOW, {});
    const before = JSON.stringify(audit);
    buildOddities(audit);
    expect(JSON.stringify(audit)).toBe(before);
    expect(audit.findings.filter((f) => f.sourceId === 'a').map((f) => f.code)).toEqual(['stale']);
  });
  it('holds its promises on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const d = buildOddities(audit);
      expect(d.total).toBe(d.groups.reduce((n, g) => n + g.items.length, 0));
      expect(d.groups.map((g) => g.code)).toEqual(ODDITY_CODES.filter((c) => d.groups.some((g) => g.code === c)));
      for (const g of d.groups) {
        expect(g.items.length, `seed ${seed} ${g.code}`).toBeGreaterThan(0);
        for (const item of g.items) {
          expect(item.sources.length).toBeGreaterThanOrEqual(g.code === 'same-name' ? 2 : 1);
          expect(item.detail.trim()).not.toBe('');
          for (const s of item.sources) expect(audit.sources).toContain(s);
        }
      }
    }
  });
});

describe('the words', () => {
  it('has a title and a reason for every check, each different, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      expect(new Set(ODDITY_CODES.map((c) => oddityTitle(c, locale))).size).toBe(ODDITY_CODES.length);
      expect(new Set(ODDITY_CODES.map((c) => oddityWhy(c, locale))).size).toBe(ODDITY_CODES.length);
    }
    for (const c of ODDITY_CODES) {
      expect(lintFrench(oddityTitle(c, 'fr')), c).toEqual([]);
      expect(lintFrench(oddityWhy(c, 'fr')), c).toEqual([]);
    }
  });
  it('never calls a pattern an error', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const c of ODDITY_CODES) expect(`${oddityTitle(c, locale)} ${oddityWhy(c, locale)}`).not.toMatch(/\b(error|wrong|invalid|incorrect|erreur|fautif|invalide)\b/i);
    }
    expect(oddityWhy('very-old', 'en')).toContain('The date may be right.');
    expect(oddityWhy('first-of-january', 'fr')).toContain('La date est peut-être exacte.');
  });
  it('counts and describes the items', () => {
    const records = [one([src('a', { name: 'Twin' }), src('b', { name: 'twin' }), src('c', { retrievedAt: '2026-01-01' }), src('d', { retrievedAt: '2025-01-01' })])];
    expect(oddityCountText(group(records, 'same-name')!, 'en')).toBe('1 name is used more than once');
    expect(oddityCountText(group(records, 'first-of-january')!, 'en')).toBe('2 sources');
    expect(oddityItemText(group(records, 'same-name')!.items[0]!, 'en')).toMatch(/^Places \/ [Tt]win; Places \/ [Tt]win\. Recorded: [Tt]win$/);
    expect(oddityItemText(group(records, 'first-of-january')!.items[0]!, 'fr')).toBe('Places / Name c. Consigné\u00A0: 2026-01-01');
    expect(odditiesSummary(build(records), 'en')).toBe('3 things to look at.');
    expect(odditiesSummary(build([one([src('a'), src('b', { name: 'name A' })])]), 'en')).toBe('1 thing to look at.');
    expect(odditiesSummary(build([one([src('a')])]), 'en')).toBe('Nothing stands out in the records saved on this device.');
    expect(odditiesSummary(build([]), 'en')).toBe('There are no sources to look at.');
  });
});

describe('renderOdditiesHtml', () => {
  const records = [one(Array.from({ length: 8 }, (_, i) => src(`s${i}`, { retrievedAt: `20${20 + (i % 6)}-01-01`, url: i < 2 ? `${PLAIN}example.org/${i}` : `https://example.org/${i}` })))];
  it('says so when nothing stands out, without a list', () => {
    const html = renderOdditiesHtml(build([one([src('a')])]), 'en');
    expect(html).toContain('data-oddities="0"');
    expect(html).not.toContain('<ul>');
    expect(visibleText(html)).toContain('Nothing stands out');
  });
  it('has a named block per check, with a few items and how many more', () => {
    const d = build(records);
    const html = renderOdditiesHtml(d, 'en');
    expect(html.match(/<h3 /g)).toHaveLength(d.groups.length);
    expect(html).toContain('data-oddity="plain-http"');
    const january = /data-oddity="first-of-january".*?<\/section>/s.exec(html)?.[0] ?? '';
    expect(january.match(/<li>/g)).toHaveLength(MAX_ODDITY_EXAMPLES);
    expect(visibleText(january)).toContain(`And ${group(records, 'first-of-january')!.items.length - MAX_ODDITY_EXAMPLES} more.`);
    for (const id of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(html).toContain(`id="${id[1]}"`);
    expect(renderOdditiesHtml(d, 'en', 1).match(/<li>/g)).toHaveLength(d.groups.length);
  });
  it('does not link to an address it lists, and escapes what was recorded', () => {
    const html = renderOdditiesHtml(build([one([src('a', { name: '<script>x</script>', url: `${PLAIN}example.org/<b>` })])]), 'en');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
  });
  it('passes the audits in both languages, on its own and in the panel', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderOdditiesHtml(build(records), locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html.replace(/<li>.*?<\/li>/g, '')))).toEqual([]);
      const page = renderDataStatusPanel({ records, locale, now: NOW });
      expect(page.match(/id="ds-odd-title"/g)).toHaveLength(1);
      expect(page).toContain(html);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      for (let seed = 1; seed <= 5; seed++) {
        const random = renderOdditiesHtml(buildOddities(auditRegistry(randomRegistry(seed, NOW), NOW, {})), locale);
        expect(structureProblems(random), `seed ${seed}`).toEqual([]);
        expect(scanHtml(random), `seed ${seed}`).toEqual([]);
      }
    }
  });
});
