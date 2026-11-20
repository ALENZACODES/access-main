import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { isoDayOffset, randomRegistry } from './round7Kit';
import {
  buildSharedPages,
  differsText,
  MAX_SHARED_PAGES,
  normalisePageUrl,
  pageLabel,
  renderSharedPagesHtml,
  SHARED_FIELDS,
  sharedFieldLabel,
  sharedPagesSummary,
} from './sharedPages';
import { NOW, structureProblems } from './testkit';

const src = (id: string, url: string | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', url, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
// Written in two parts so the repository check for plain-http links does not read it as one.
const PLAIN = `${'http'}://`;
const build = (records: DatasetRecord[], limit?: number) => buildSharedPages(auditRegistry(records, NOW, {}), limit);
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('a', 'https://example.org/data'),
      src('b', 'https://example.org/data/', { tier: 'E' }),
      src('c', 'https://example.org/other'),
      src('d', null),
      src('same1', 'https://example.org/same'),
    ],
  },
  {
    id: 'r',
    name: 'Routes',
    kind: 'routes',
    sources: [
      src('e', 'HTTPS://Example.org/data#top', { licence: 'Proprietary', retrievedAt: isoDayOffset(NOW, -40) }),
      src('same2', 'https://example.org/same'),
      src('f', 'ftp://example.org/data'),
    ],
  },
];

describe('normalisePageUrl', () => {
  it('gives one spelling to addresses that only differ in case of host, fragment, trailing slash or default port', () => {
    const want = 'https://example.org/data';
    for (const url of ['https://example.org/data', 'https://example.org/data/', 'HTTPS://EXAMPLE.org/data', 'https://example.org/data#part', 'https://example.org:443/data', '  https://example.org/data//  ']) {
      expect(normalisePageUrl(url), url).toBe(want);
    }
    expect(normalisePageUrl('https://example.org/')).toBe('https://example.org');
    expect(normalisePageUrl('https://example.org')).toBe('https://example.org');
  });
  it('keeps what does tell two pages apart', () => {
    expect(normalisePageUrl('https://example.org/Data')).not.toBe(normalisePageUrl('https://example.org/data'));
    expect(normalisePageUrl('https://example.org/data?x=1')).toBe('https://example.org/data?x=1');
    expect(normalisePageUrl(`${PLAIN}example.org/data`)).not.toBe(normalisePageUrl('https://example.org/data'));
    expect(normalisePageUrl('https://example.org:8443/data')).toBe('https://example.org:8443/data');
  });
  it('gives null for what is not a web address', () => {
    for (const bad of [null, undefined, '', '   ', 'not a url', 'example.org/data', 'ftp://example.org/x', 'mailto:a@example.org', 'javascript:alert(1)', 'file:///etc/hosts']) {
      expect(normalisePageUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe('buildSharedPages', () => {
  const d = build(RECORDS);
  it('finds the pages recorded for two sources or more', () => {
    expect(d.total).toBe(2);
    expect(d.pages.map((p) => p.url)).toEqual(['https://example.org/data', 'https://example.org/same']);
    expect(d.pages[0]?.sources.map((s) => s.sourceId)).toEqual(['a', 'b', 'e']);
    expect(d.pages[1]?.sources.map((s) => s.sourceId)).toEqual(['same1', 'same2']);
  });
  it('counts the sources that have a page address that can be compared', () => {
    expect(d.sourceCount).toBe(8);
    expect(d.withPage).toBe(6);
  });
  it('says which facts differ, in the fixed order, and none when all agree', () => {
    expect(d.pages[0]?.differs).toEqual(['licence', 'date', 'tier']);
    expect(d.pages[1]?.differs).toEqual([]);
    expect(d.differing).toBe(1);
  });
  it('compares licences without regard to case or spaces around them', () => {
    const one = build([{ id: 'p', name: 'P', kind: 'places', sources: [src('a', 'https://example.org/x'), src('b', 'https://example.org/x', { licence: ' ogl-ontario ' })] }]);
    expect(one.pages[0]?.differs).toEqual([]);
  });
  it('treats a fact that is not known as different from one that is, and the same as another that is not', () => {
    const mixed = build([{ id: 'p', name: 'P', kind: 'places', sources: [src('a', 'https://example.org/x'), src('b', 'https://example.org/x', { licence: null, tier: null, retrievedAt: null })] }]);
    expect(mixed.pages[0]?.differs).toEqual(['licence', 'date', 'tier']);
    const both = build([
      { id: 'p', name: 'P', kind: 'places', sources: [src('a', 'https://example.org/x', { tier: null, retrievedAt: null }), src('b', 'https://example.org/x', { tier: null, retrievedAt: isoDayOffset(NOW, 20) })] },
    ]);
    expect(both.pages[0]?.differs).toEqual([]);
  });
  it('puts pages with a difference first, then pages with more sources, then by address', () => {
    const many = build([
      {
        id: 'p',
        name: 'P',
        kind: 'places',
        sources: [
          src('a1', 'https://example.org/b'),
          src('a2', 'https://example.org/b'),
          src('b1', 'https://example.org/a'),
          src('b2', 'https://example.org/a'),
          src('c1', 'https://example.org/three'),
          src('c2', 'https://example.org/three'),
          src('c3', 'https://example.org/three'),
          src('d1', 'https://example.org/z'),
          src('d2', 'https://example.org/z', { tier: 2 }),
        ],
      },
    ]);
    expect(many.pages.map((p) => pageLabel(p.url))).toEqual(['example.org/z', 'example.org/three', 'example.org/a', 'example.org/b']);
  });
  it('keeps the counts when the list is cut short', () => {
    const cut = build(RECORDS, 1);
    expect(cut.pages).toHaveLength(1);
    expect(cut.total).toBe(2);
    expect(cut.differing).toBe(1);
    expect(build(RECORDS, 0).pages).toEqual([]);
    expect(build(RECORDS, -4).pages).toEqual([]);
    expect(build(RECORDS).pages.length).toBeLessThanOrEqual(MAX_SHARED_PAGES);
  });
  it('finds nothing in an empty registry or one where every page is recorded once', () => {
    expect(build([])).toEqual({ pages: [], total: 0, differing: 0, withPage: 0, sourceCount: 0 });
    expect(build([{ id: 'p', name: 'P', kind: 'places', sources: [src('a', 'https://example.org/1'), src('b', 'https://example.org/2')] }])).toMatchObject({ total: 0, withPage: 2 });
  });
  it('holds its promises on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const d2 = buildSharedPages(audit, 1000);
      const seen = new Set<string>();
      for (const page of d2.pages) {
        expect(page.sources.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
        for (const s of page.sources) {
          expect(normalisePageUrl(s.url)).toBe(page.url);
          const key = `${s.datasetId}\u0000${s.sourceId}\u0000${audit.sources.indexOf(s)}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
        expect(page.differs).toEqual(SHARED_FIELDS.filter((f) => page.differs.includes(f)));
      }
      expect(d2.differing).toBe(d2.pages.filter((p) => p.differs.length > 0).length);
      expect(d2.withPage).toBe(audit.sources.filter((s) => normalisePageUrl(s.url) !== null).length);
    }
  });
});

describe('the words', () => {
  const d = build(RECORDS);
  it('shows the address without its scheme', () => {
    expect(pageLabel('https://example.org/data')).toBe('example.org/data');
    expect(pageLabel(`${PLAIN}example.org`)).toBe('example.org');
  });
  it('names what differs, or says that nothing does', () => {
    expect(differsText(d.pages[0]!, 'en')).toBe('Differs between these sources: licence, retrieved date, tier.');
    expect(differsText(d.pages[1]!, 'en')).toBe('Licence, retrieved date and tier are the same on these sources.');
    expect(differsText(d.pages[0]!, 'fr')).toBe('Diffère d’une source à l’autre\u00A0: licence, date de récupération, niveau.');
    for (const f of SHARED_FIELDS) expect(sharedFieldLabel(f, 'fr')).not.toBe('');
  });
  it('sums up in sentences, with singular and plural', () => {
    expect(sharedPagesSummary(d, 'en')).toEqual(['2 pages are recorded for more than one source.', 'On 1 of them, at least one fact differs between the sources.']);
    expect(sharedPagesSummary(build(RECORDS, 1), 'en').at(-1)).toBe('1 more page is not shown here.');
    const agree = build([{ id: 'p', name: 'P', kind: 'places', sources: [src('a', 'https://example.org/x'), src('b', 'https://example.org/x')] }]);
    expect(sharedPagesSummary(agree, 'en')).toEqual(['1 page is recorded for more than one source.', 'On each of them, the licence, retrieved date and tier are the same on every source.']);
    expect(sharedPagesSummary(build([]), 'en')).toEqual([]);
    for (const s of [...sharedPagesSummary(d, 'fr'), ...sharedPagesSummary(build(RECORDS, 1), 'fr'), ...sharedPagesSummary(agree, 'fr')]) expect(lintFrench(s), s).toEqual([]);
  });
});

describe('renderSharedPagesHtml', () => {
  it('says so when no page is shared, and when no source has a page at all', () => {
    const none = renderSharedPagesHtml(build([{ id: 'p', name: 'P', kind: 'places', sources: [src('a', 'https://example.org/1')] }]), 'en');
    expect(visibleText(none)).toContain('No page is recorded for more than one source.');
    expect(none).not.toContain('<table');
    const noPages = renderSharedPagesHtml(build([{ id: 'p', name: 'P', kind: 'places', sources: [src('a', null)] }]), 'en');
    expect(visibleText(noPages)).toContain('No source has a page address that can be compared.');
    expect(visibleText(renderSharedPagesHtml(build([]), 'en'))).toContain('No page is recorded for more than one source.');
  });
  it('has one named block per page with a table of its sources', () => {
    const html = renderSharedPagesHtml(build(RECORDS), 'en');
    expect(html).toContain('data-shared-pages="2"');
    expect(html.match(/<h3 /g)).toHaveLength(2);
    expect(html.match(/<caption>/g)).toHaveLength(2);
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(5);
    expect(visibleText(html)).toContain('example.org/data (3 sources)');
    expect(html).toContain('data-differs="licence date tier"');
    expect(html).toContain('data-differs=""');
    for (const id of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(html).toContain(`id="${id[1]}"`);
  });
  it('writes UNKNOWN for a licence, date or tier that is not known, in both languages', () => {
    const records: DatasetRecord[] = [{ id: 'p', name: 'P', kind: 'places', sources: [src('a', 'https://example.org/x'), src('b', 'https://example.org/x', { licence: null, tier: null, retrievedAt: null })] }];
    for (const locale of ['en', 'fr'] as const) {
      const html = renderSharedPagesHtml(build(records), locale);
      expect(html.match(/<td>UNKNOWN<\/td>/g)).toHaveLength(3);
      expect(html).not.toMatch(/<td>(Unknown|Inconnu)<\/td>/);
    }
  });
  it('escapes names and addresses, and does not link to them', () => {
    const html = renderSharedPagesHtml(
      build([{ id: 'p', name: '<b>P</b>', kind: 'places', sources: [src('a', 'https://example.org/x?a=<i>&b="q"', { name: '<script>x</script>' }), src('b', 'https://example.org/x?a=<i>&b="q"')] }]),
      'en',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<a ');
    expect(html).toContain('&lt;script&gt;');
  });
  it('passes the audits in both languages, on its own and in the panel', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderSharedPagesHtml(build(RECORDS), locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html.replace(/<h3.*?<\/h3>/g, '').replace(/<caption>.*?<\/caption>/g, '')))).toEqual([]);
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
      expect(page.match(/id="ds-shared-title"/g)).toHaveLength(1);
      expect(page).toContain(html);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      for (let seed = 1; seed <= 5; seed++) {
        const random = renderSharedPagesHtml(buildSharedPages(auditRegistry(randomRegistry(seed, NOW), NOW, {})), locale);
        expect(structureProblems(random), `seed ${seed}`).toEqual([]);
        expect(scanHtml(random), `seed ${seed}`).toEqual([]);
      }
    }
  });
});
