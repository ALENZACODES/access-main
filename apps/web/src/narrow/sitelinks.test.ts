import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { noFrIssues } from './expect-fr.js';
import { SAMPLE_SITE_PAGES } from './samples.js';
import { pageHtml, sitePage, tidySite } from './site-testkit.js';
import { DEFAULT_MIN_PAGES_FOR_WAYS, SITE_LINK_RULES, SITE_MAP_WORDS, auditSiteLinks, type SiteLinkOptions } from './sitelinks.js';
import { readSite, type SitePage } from './sitepages.js';
import type { Entry } from './types.js';

const audit = (pages: readonly SitePage[], options: SiteLinkOptions = {}) => auditSiteLinks(readSite(pages), options);
const rules = (entries: readonly Entry[], rule: string): Entry[] => entries.filter((e) => e.rule === rule);
const WAYS = '<a href="/sitemap">Site map</a>';

describe('auditSiteLinks on a tidy site', () => {
  it('finds nothing, as a whole site and as a sample', () => {
    expect(audit(tidySite(), { complete: true }).entries).toEqual([]);
    expect(audit(tidySite()).entries).toEqual([]);
  });

  it('counts what it looked at', () => {
    expect(audit(tidySite(), { complete: true }).checked).toBeGreaterThan(30);
  });

  it('has nothing to compare with fewer than two pages', () => {
    expect(audit([sitePage('/', { main: '<a href="/gone#x">x</a>' })], { complete: true })).toEqual({ checked: 0, entries: [] });
    expect(audit([])).toEqual({ checked: 0, entries: [] });
  });
});

describe('anchor-missing', () => {
  const pages = (fragment: string, target: string): SitePage[] => [sitePage('/', { main: `<a id="go" href="/places#${fragment}">Go</a>`, footer: WAYS }), sitePage('/places', { main: target })];

  it('fails a link to an id the other page does not have', () => {
    const e = rules(audit(pages('list', '<ul id="lists"><li>a</li></ul>')).entries, 'anchor-missing');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ check: 'site-links', status: 'fail' });
    expect(e[0]?.id).toMatch(/^\/ a#go@L\d+$/);
    expect(e[0]?.message.en).toContain('goes to #list on /places');
  });

  it.each([
    ['list', '<ul id="list"><li>a</li></ul>'],
    ['old', '<a name="old"></a>'],
    ['top', '<p>No id here</p>'],
  ])('accepts #%s', (fragment, target) => {
    expect(rules(audit(pages(fragment, target)).entries, 'anchor-missing')).toEqual([]);
  });

  it('matches an encoded fragment against the id as written', () => {
    expect(rules(audit(pages('caf%C3%A9', '<h2 id="café">Café</h2>')).entries, 'anchor-missing')).toEqual([]);
  });

  it('leaves links inside one page to the check that reads one page', () => {
    const same = [sitePage('/', { main: '<a href="#nowhere">x</a><a href="/#nowhere">y</a>', footer: WAYS }), sitePage('/b')];
    expect(rules(audit(same).entries, 'anchor-missing')).toEqual([]);
  });

  it('says nothing about a fragment on a page that was not read', () => {
    const e = audit([sitePage('/', { main: '<a href="/far#x">x</a>', footer: WAYS }), sitePage('/b')]).entries;
    expect(rules(e, 'anchor-missing')).toEqual([]);
  });
});

describe('links to pages outside the set', () => {
  const pages = [sitePage('/', { main: '<a href="/gone">Gone</a><a href="/also-gone">Also</a><a href="/b">B</a>', footer: WAYS }), sitePage('/b', { main: '<a href="/gone">Gone again</a><a href="/">Home</a>' })];

  it('fails each missing page once when the set is the whole site', () => {
    const e = rules(audit(pages, { complete: true }).entries, 'page-missing');
    expect(e.map((x) => [x.id, x.status])).toEqual([
      ['/gone', 'fail'],
      ['/also-gone', 'fail'],
      ['/sitemap', 'fail'],
    ]);
    expect(e[0]?.message.en).toBe('2 pages link to /gone (/, /b), and the site has no such page.');
    expect(e[1]?.message.en).toBe('A page links to /also-gone (/), and the site has no such page.');
    expect(e[0]?.message.fr).toBe('2 pages mènent à /gone (/, /b), et le site n’a pas de page à cette adresse.');
  });

  it('gives one UNKNOWN entry for all of them when only some pages were read', () => {
    const all = audit(pages).entries;
    expect(rules(all, 'page-missing')).toEqual([]);
    const e = rules(all, 'page-not-given');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ id: 'site', status: 'unknown' });
    expect(e[0]?.message.en).toBe('Links on the pages read go to 3 pages that were not read (/gone, /also-gone, /sitemap). Whether they exist was not looked at.');
  });

  it('shortens a long list of pages that were not read', () => {
    const links = Array.from({ length: 6 }, (_v, i) => `<a href="/p${i}">p${i}</a>`).join('');
    const e = rules(audit([sitePage('/', { main: links }), sitePage('/b')]).entries, 'page-not-given');
    expect(e[0]?.message.en).toContain('go to 6 pages that were not read (/p0, /p1, /p2, ...)');
  });

  it('uses the singular for one page', () => {
    const e = rules(audit([sitePage('/', { main: '<a href="/x">x</a><a href="/b">b</a>' }), sitePage('/b')]).entries, 'page-not-given');
    expect(e[0]?.message.en).toContain('go to 1 page that was not read (/x).');
    expect(e[0]?.message.fr).toContain('mènent à 1 page qui n’a pas été lue (/x).');
  });

  it('does not count links that leave the site', () => {
    const e = audit([sitePage('/', { main: '<a href="https://www.ontario.ca/">Ontario</a><a href="/b">b</a>', footer: WAYS }), sitePage('/b', { main: '<a href="/">Home</a>' }), sitePage('/sitemap', { main: '<a href="/">Home</a>' })], { complete: true }).entries;
    expect(rules(e, 'page-missing')).toEqual([]);
  });
});

describe('name-varies and target-varies', () => {
  it('asks a person when one destination has two names in the repeated regions', () => {
    const pages = [sitePage('/', { nav: [['/help', 'Help'], ['/', 'Home']], footer: WAYS }), sitePage('/b', { nav: [['/help', 'Support'], ['/', 'Home']] }), sitePage('/help')];
    const e = rules(audit(pages).entries, 'name-varies');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ id: '/help', status: 'unknown' });
    expect(e[0]?.message.en).toContain('carry 2 different names: “Help” (/), “Support” (/b).');
    expect(e[0]?.message.fr).toContain('portent 2 noms différents\u00A0: «\u202FHelp\u202F» (/), «\u202FSupport\u202F» (/b).');
  });

  it('treats names that differ only by case or spacing as one name', () => {
    const pages = [sitePage('/', { nav: [['/help', 'Help']], footer: WAYS }), sitePage('/b', { nav: [['/help', '  HELP ']] })];
    expect(rules(audit(pages).entries, 'name-varies')).toEqual([]);
  });

  it('asks a person when one name goes to two places', () => {
    const pages = [sitePage('/', { nav: [['/help', 'Help']], footer: WAYS }), sitePage('/b', { nav: [['/contact', 'Help']] })];
    const e = rules(audit(pages).entries, 'target-varies');
    expect(e).toHaveLength(1);
    expect(e[0]?.id).toBe('“Help”');
    expect(e[0]?.message.en).toContain('goes to 2 different pages: /help (/), /contact (/b).');
  });

  it('looks only at the header, the navigation and the footer', () => {
    const pages = [sitePage('/', { main: '<a href="/help">Help</a><a href="/b">b</a>', footer: WAYS }), sitePage('/b', { main: '<a href="/help">Read more</a><a href="/">Home</a>' })];
    const e = audit(pages).entries;
    expect(rules(e, 'name-varies')).toEqual([]);
    expect(rules(e, 'target-varies')).toEqual([]);
  });

  it('compares pages of one language with each other, not across languages', () => {
    const pages = [
      sitePage('/', { nav: [['/help', 'Help']], footer: WAYS }),
      sitePage('/b', { nav: [['/help', 'Help']] }),
      sitePage('/fr', { lang: 'fr', nav: [['/help', 'Aide']] }),
    ];
    expect(rules(audit(pages).entries, 'name-varies')).toEqual([]);
  });
});

describe('h1-repeat', () => {
  it('asks a person about the same main heading on two pages, and keeps its spelling', () => {
    const pages = [sitePage('/', { title: 'Home', main: '<h1>Find a Place</h1>', footer: WAYS }), sitePage('/b', { title: 'Other', main: '<h1>find a  place</h1>' }), sitePage('/c', { title: 'Third' })];
    const e = rules(audit(pages).entries, 'h1-repeat');
    expect(e.map((x) => [x.id, x.status])).toEqual([['/b', 'unknown']]);
    expect(e[0]?.message.en).toContain('The main heading “Find a Place” is the same as on /.');
  });

  it('does not compare headings across languages or pages with no heading', () => {
    const pages = [sitePage('/', { title: 'Menu', footer: WAYS }), sitePage('/fr', { lang: 'fr', title: 'Menu' }), { route: '/x', html: '<html lang="en"><body><p>None</p></body></html>' }, { route: '/y', html: '<html lang="en"><body><p>None</p></body></html>' }];
    expect(rules(audit(pages).entries, 'h1-repeat')).toEqual([]);
  });
});

describe('orphan', () => {
  const pages = [sitePage('/', { main: '<a href="/a">a</a>', footer: WAYS }), sitePage('/a', { main: '<a href="/a">self</a>' }), sitePage('/lost'), sitePage('/sitemap')];

  it('asks a person about a page nothing links to, for a whole site', () => {
    const e = rules(audit(pages, { complete: true }).entries, 'orphan');
    expect(e.map((x) => [x.id, x.status])).toEqual([['/lost', 'unknown']]);
  });

  it('does not count a link from a page to itself', () => {
    const self = [sitePage('/', { footer: WAYS }), sitePage('/a', { main: '<a href="/a">self</a>' }), sitePage('/sitemap', { main: '<a href="/">Home</a>' })];
    expect(rules(audit(self, { complete: true }).entries, 'orphan').map((x) => x.id)).toEqual(['/a']);
  });

  it('takes the first page as the way in', () => {
    expect(rules(audit(pages, { complete: true }).entries, 'orphan').map((x) => x.id)).not.toContain('/');
  });

  it('says nothing when only some pages were read', () => {
    expect(rules(audit(pages).entries, 'orphan')).toEqual([]);
  });
});

describe('few-ways', () => {
  const three = (extra: string): SitePage[] => [sitePage('/', { main: `<a href="/a">a</a><a href="/b">b</a>${extra}` }), sitePage('/a', { main: '<a href="/">Home</a>' }), sitePage('/b', { main: '<a href="/">Home</a>' })];

  it('asks a person when no page has a search or a link to a site map', () => {
    const e = rules(audit(three('')).entries, 'few-ways');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ id: 'site', status: 'unknown' });
    expect(e[0]?.message.en).toContain('None of the 3 pages read has a search field or a link to a site map.');
  });

  it.each([['<input type="search" name="q" aria-label="Search">'], ['<a href="/sitemap">Site map</a>'], ['<a href="/plan">Plan du site</a>'], ['<a href="/all">All pages</a>']])('is content with %s', (extra) => {
    expect(rules(audit(three(extra)).entries, 'few-ways')).toEqual([]);
  });

  it('leaves a site of two pages alone, and takes the limit from the options', () => {
    const two = [sitePage('/', { main: '<a href="/a">a</a>' }), sitePage('/a', { main: '<a href="/">Home</a>' })];
    expect(rules(audit(two).entries, 'few-ways')).toEqual([]);
    expect(rules(audit(two, { minPagesForWays: 2 }).entries, 'few-ways')).toHaveLength(1);
    expect(rules(audit(three(''), { minPagesForWays: 4 }).entries, 'few-ways')).toEqual([]);
    expect(DEFAULT_MIN_PAGES_FOR_WAYS).toBe(3);
  });

  it('knows the names of a site map in both languages', () => {
    for (const name of ['Site map', 'Sitemap', 'Plan du site', 'Toutes les pages']) expect(SITE_MAP_WORDS.test(name), name).toBe(true);
    expect(SITE_MAP_WORDS.test('Map')).toBe(false);
  });
});

describe('messages of the site-links check', () => {
  const entries = [...audit(SAMPLE_SITE_PAGES, { complete: true }).entries, ...audit(SAMPLE_SITE_PAGES).entries];

  it('has a sample finding for every rule', () => {
    expect([...new Set(entries.map((e) => e.rule))].sort()).toEqual([...SITE_LINK_RULES].sort());
  });

  it('gives both languages with French typography', () => {
    noFrIssues(entries);
  });

  it('fails only what was measured', () => {
    for (const e of entries) expect(e.status, e.rule).toBe(e.rule === 'anchor-missing' || e.rule === 'page-missing' ? 'fail' : 'unknown');
  });

  it('raises nothing in the copy check and never words a result as a pass', () => {
    expect(auditCopy(entries.flatMap((e) => [{ id: `${e.rule}-en`, text: e.message.en }, { id: `${e.rule}-fr`, text: e.message.fr }])).entries).toEqual([]);
    for (const e of entries) expect(`${e.message.en} ${e.message.fr}`).not.toMatch(/\bpass(es|ed)?\b|conforme?s?\b|réussi/i);
  });

  it('reads pages that are only fragments of markup', () => {
    expect(() => audit([{ route: '/', html: '<a href="/b#x">x' }, { route: '/b', html: pageHtml() }])).not.toThrow();
  });
});
