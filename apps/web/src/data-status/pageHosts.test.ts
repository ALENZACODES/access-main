import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { buildPageHosts, MAX_PAGE_HOSTS, pageHost, pageHostHttpsText, pageHostName, pageHostRows, pageHostsSummary, renderPageHostsHtml } from './pageHosts';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, structureProblems } from './testkit';

// Written in two parts so the repository check for plain-http links does not read it as one.
const PLAIN = `${'http'}://`;
const src = (id: string, url: string | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', url, licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [src('a', 'https://data.example.org/a'), src('b', 'https://www.data.example.org/a'), src('c', `${PLAIN}DATA.example.org/c`), src('d', null), src('e', 'not an address'), src('f', 'ftp://files.example.org/x')],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('g', 'https://data.example.org/g#part'), src('h', 'https://city.example.net/open')] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const d = buildPageHosts(audit);
const host = (name: string) => d.hosts.find((h) => h.host === name)!;

describe('pageHost', () => {
  it('reads the site in lower case, without a leading www', () => {
    expect(pageHost('https://Data.Example.org/a?x=1#y')).toBe('data.example.org');
    expect(pageHost('https://www.example.org')).toBe('example.org');
    expect(pageHost(`${PLAIN}example.org:8080/x`)).toBe('example.org');
    expect(pageHost(' https://example.org./ ')).toBe('example.org');
    expect(pageHost('https://wwwexample.org')).toBe('wwwexample.org');
  });
  it('gives null for what is not a web address', () => {
    for (const bad of [null, undefined, '', '  ', 'example.org/a', 'not an address', 'ftp://example.org', 'mailto:a@example.org', 'javascript:alert(1)']) expect(pageHost(bad), String(bad)).toBeNull();
  });
});

describe('buildPageHosts', () => {
  it('counts every source under exactly one site, or under none', () => {
    expect(d.sourceCount).toBe(8);
    expect(d.hosts.reduce((n, h) => n + h.sources.length, 0)).toBe(8);
    expect(d.named).toBe(2);
    expect(d.unknown).toBe(3);
  });
  it('puts the site with the most sources first and the row with no site last', () => {
    expect(d.hosts.map((h) => h.host)).toEqual(['data.example.org', 'city.example.net', '']);
    expect(d.hosts.map((h) => h.sources.length)).toEqual([4, 1, 3]);
  });
  it('lists the datasets, counts the different pages and the addresses that are not https', () => {
    expect(host('data.example.org')).toMatchObject({ datasets: ['Places', 'Routes'], pages: 4, notHttps: 1 });
    expect(host('city.example.net')).toMatchObject({ datasets: ['Routes'], pages: 1, notHttps: 0 });
    expect(host('')).toMatchObject({ pages: 0, notHttps: 0 });
  });
  it('counts one page once when two sources record the same address', () => {
    const same = buildPageHosts(auditRegistry([{ id: 'x', name: 'X', kind: 'places', sources: [src('a', 'https://example.org/p'), src('b', ' https://example.org/p '), src('c', 'https://example.org/q')] }], NOW, {}));
    expect(same.hosts[0]).toMatchObject({ host: 'example.org', pages: 2 });
    expect(same.hosts[0]?.sources).toHaveLength(3);
  });
  it('keeps the counts when the list is cut short, and always keeps the row with no site', () => {
    const cut = buildPageHosts(audit, 1);
    expect(cut.hosts.map((h) => h.host)).toEqual(['data.example.org', '']);
    expect(cut.named).toBe(2);
    expect(buildPageHosts(audit, 0).hosts.map((h) => h.host)).toEqual(['']);
    expect(d.hosts.length).toBeLessThanOrEqual(MAX_PAGE_HOSTS + 1);
  });
  it('does not carry working data out with the rows', () => {
    for (const h of d.hosts) expect(Object.keys(h).sort()).toEqual(['datasets', 'host', 'notHttps', 'pages', 'sources']);
  });
  it('is empty for an empty registry, and holds its promises on random ones', () => {
    expect(buildPageHosts(auditRegistry([], NOW, {}))).toEqual({ hosts: [], named: 0, unknown: 0, sourceCount: 0 });
    for (let seed = 1; seed <= 40; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const all = buildPageHosts(a, 10_000);
      expect(all.hosts.reduce((n, h) => n + h.sources.length, 0), `seed ${seed}`).toBe(a.sources.length);
      expect(all.unknown).toBe(a.sources.filter((s) => pageHost(s.url) === null).length);
      for (const h of all.hosts) {
        for (const s of h.sources) expect(pageHost(s.url) ?? '').toBe(h.host);
        expect(h.notHttps).toBeLessThanOrEqual(h.sources.length);
        expect(h.pages).toBeLessThanOrEqual(h.sources.length);
      }
    }
  });
});

describe('the words', () => {
  it('names the site, or UNKNOWN', () => {
    expect(pageHostName(host('data.example.org'))).toBe('data.example.org');
    expect(pageHostName(host(''))).toBe('UNKNOWN');
  });
  it('says whether every address starts with https', () => {
    expect(pageHostHttpsText(host('city.example.net'), 'en')).toBe('All start with https');
    expect(pageHostHttpsText(host('data.example.org'), 'en')).toBe('1 does not start with https');
    expect(pageHostHttpsText({ ...host('data.example.org'), notHttps: 2 }, 'en')).toBe('2 do not start with https');
    expect(pageHostHttpsText(host(''), 'en')).toBe('Does not apply');
  });
  it('sums up in sentences', () => {
    expect(pageHostsSummary(d, 'en')).toEqual(['The pages recorded are on 2 web sites.', '3 sources have no page address that can be read.']);
    expect(pageHostsSummary(buildPageHosts(audit, 1), 'en').at(-1)).toBe('1 more web site is not shown here.');
    expect(pageHostsSummary(buildPageHosts(auditRegistry([{ id: 'x', name: 'X', kind: 'places', sources: [src('a', null)] }], NOW, {})), 'en')).toEqual(['1 source has no page address that can be read.']);
    expect(pageHostsSummary(buildPageHosts(auditRegistry([], NOW, {})), 'en')).toEqual([]);
    for (const s of [...pageHostsSummary(d, 'fr'), ...pageHostsSummary(buildPageHosts(audit, 1), 'fr')]) expect(lintFrench(s), s).toEqual([]);
  });
  it('gives the table as rows of text', () => {
    const rows = pageHostRows(d, 'en');
    expect(rows[0]).toEqual(['Web site', 'Sources', 'Different pages', 'Datasets', 'Addresses']);
    expect(rows[1]).toEqual(['data.example.org', '4', '4', 'Places; Routes', '1 does not start with https']);
    expect(rows.at(-1)).toEqual(['UNKNOWN', '3', 'Does not apply', 'Places', 'Does not apply']);
  });
  it('says plainly that no page was opened', () => {
    expect(visibleText(renderPageHostsHtml(d, 'en'))).toContain('No page is opened to make this table, so it does not say whether a page still exists.');
    expect(visibleText(renderPageHostsHtml(d, 'fr'))).toContain('Aucune page n’est ouverte pour produire ce tableau');
  });
});

describe('renderPageHostsHtml', () => {
  it('says so when there is no source', () => {
    const html = renderPageHostsHtml(buildPageHosts(auditRegistry([], NOW, {})), 'en');
    expect(html).not.toContain('<table');
    expect(visibleText(html)).toContain('There are no sources to group.');
  });
  it('has a row per site, and links to none of them', () => {
    const html = renderPageHostsHtml(d, 'en');
    expect(html).toContain('data-page-hosts="2"');
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(3);
    expect(html).not.toContain('<a ');
  });
  it('passes the audits in both languages, on its own and in the panel', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderPageHostsHtml(d, locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
      expect(page.match(/id="ds-hosts-title"/g)).toHaveLength(1);
      expect(page).toContain(html);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      for (let seed = 1; seed <= 5; seed++) expect(structureProblems(renderPageHostsHtml(buildPageHosts(auditRegistry(randomRegistry(seed, NOW), NOW, {})), locale)), `seed ${seed}`).toEqual([]);
    }
  });
});
