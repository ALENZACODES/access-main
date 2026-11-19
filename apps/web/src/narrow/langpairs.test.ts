import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { noFrIssues } from './expect-fr.js';
import { LANG_PAIR_RULES, auditLangPairs, countDifferences, reciprocalPairs } from './langpairs.js';
import { SAMPLE_SITE_PAGES } from './samples.js';
import { alternate, sitePage, tidySite } from './site-testkit.js';
import { readSite, type PageCounts, type SitePage } from './sitepages.js';
import type { Entry } from './types.js';

const audit = (pages: readonly SitePage[]) => auditLangPairs(readSite(pages));
const rules = (entries: readonly Entry[], rule: string): Entry[] => entries.filter((e) => e.rule === rule);

const en = (main = '', head = alternate('fr', '/fr')): SitePage => sitePage('/', { title: 'Home', head, main: `${main}<a href="/fr" lang="fr">Français</a>` });
const fr = (main = '', head = alternate('en', '/')): SitePage => sitePage('/fr', { lang: 'fr', title: 'Accueil', head, main: `${main}<a href="/" lang="en">English</a>` });

const counts = (over: Partial<PageCounts> = {}): PageCounts => ({ headings: 3, links: 10, fields: 2, images: 4, tables: 1, listItems: 8, buttons: 2, ...over });

describe('auditLangPairs on a tidy site', () => {
  it('finds nothing to fail', () => {
    expect(audit(tidySite()).entries.filter((e) => e.status === 'fail')).toEqual([]);
  });

  it('asks only about the page that has no other version', () => {
    expect(audit(tidySite()).entries.map((e) => [e.id, e.rule])).toEqual([['/sitemap', 'no-alternate']]);
  });

  it('counts each page and each pair', () => {
    expect(audit(tidySite()).checked).toBe(7 + 3);
  });

  it('gives nothing for no pages, and nothing for a site with no alternate at all', () => {
    expect(audit([])).toEqual({ checked: 0, entries: [] });
    expect(audit([sitePage('/'), sitePage('/a')]).entries).toEqual([]);
  });
});

describe('alternate-one-way', () => {
  it('fails an alternate that is not returned', () => {
    const e = rules(audit([en(), fr('', '')]).entries, 'alternate-one-way');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ id: '/ hreflang=fr', status: 'fail', check: 'lang-pairs' });
    expect(e[0]?.message.en).toContain('names /fr as its fr version, and /fr does not name this page back');
  });

  it('fails an alternate that is returned to another page', () => {
    const e = rules(audit([en(), fr('', alternate('en', '/home'))]).entries, 'alternate-one-way');
    expect(e.map((x) => x.id)).toEqual(['/ hreflang=fr']);
  });

  it('accepts a pair that names each other, whatever else each page names', () => {
    const e = audit([en('', `${alternate('fr', '/fr')}${alternate('en', '/')}${alternate('x-default', '/')}`), fr('', `${alternate('en', '/')}${alternate('fr', '/fr')}`)]).entries;
    expect(rules(e, 'alternate-one-way')).toEqual([]);
  });
});

describe('alternate-lang', () => {
  it('fails a page announced in one language and marked in another', () => {
    const wrong = sitePage('/fr', { lang: 'en', title: 'Accueil', head: alternate('en', '/'), main: '<a href="/">English</a>' });
    const e = rules(audit([en(), wrong]).entries, 'alternate-lang');
    expect(e.map((x) => [x.id, x.status])).toEqual([['/ hreflang=fr', 'fail']]);
    expect(e[0]?.message.en).toBe('This page announces /fr as its fr version, and that page is marked lang="en".');
  });

  it('compares the primary language only', () => {
    const e = audit([en('', alternate('fr-CA', '/fr')), fr()]).entries;
    expect(rules(e, 'alternate-lang')).toEqual([]);
  });

  it('says nothing when the page named has no language at all', () => {
    const bare: SitePage = { route: '/fr', html: `<html><head>${alternate('en', '/')}</head><body><a href="/">English</a></body></html>` };
    expect(rules(audit([en(), bare]).entries, 'alternate-lang')).toEqual([]);
  });
});

describe('alternate-not-given, no-alternate and no-switch-link', () => {
  it('says so when the other version was not read, and compares nothing', () => {
    const e = audit([en(), sitePage('/a', { head: alternate('fr', '/fr/a'), main: '<a href="/fr/a">Français</a>' })]).entries;
    expect(e.map((x) => [x.id, x.rule, x.status])).toEqual([
      ['/ hreflang=fr', 'alternate-not-given', 'unknown'],
      ['/a hreflang=fr', 'alternate-not-given', 'unknown'],
    ]);
    expect(e[0]?.message.en).toBe('The fr version named here, /fr, is not among the pages read, so the pair was not compared.');
  });

  it('asks about a page with no other version when other pages have one', () => {
    const e = rules(audit([en(), fr(), sitePage('/only')]).entries, 'no-alternate');
    expect(e.map((x) => [x.id, x.status])).toEqual([['/only', 'unknown']]);
  });

  it('does not take a page that names only itself as having another version', () => {
    const e = rules(audit([en(), fr(), sitePage('/self', { head: `${alternate('en', '/self')}${alternate('x-default', '/self')}` })]).entries, 'no-alternate');
    expect(e.map((x) => x.id)).toEqual(['/self']);
  });

  it('asks how to switch language when no link goes to the other version', () => {
    const noLink = sitePage('/', { title: 'Home', head: alternate('fr', '/fr'), main: '<p>No switch here.</p>' });
    const e = rules(audit([noLink, fr()]).entries, 'no-switch-link');
    expect(e.map((x) => [x.id, x.status])).toEqual([['/ hreflang=fr', 'unknown']]);
  });

  it('is content with a link to the other version anywhere on the page', () => {
    expect(rules(audit([en(), fr()]).entries, 'no-switch-link')).toEqual([]);
  });

  it('does not compare with a version on another host, and still counts it as a version', () => {
    const e = audit([sitePage('/', { head: alternate('fr', 'https://fr.example/') }), sitePage('/a')]).entries;
    expect(e.map((x) => [x.id, x.rule])).toEqual([['/a', 'no-alternate']]);
  });
});

describe('countDifferences', () => {
  it('finds none between equal counts', () => {
    expect(countDifferences(counts(), counts())).toEqual([]);
  });

  it.each([['headings'], ['fields'], ['tables'], ['buttons']] as const)('counts any difference in %s', (part) => {
    expect(countDifferences(counts(), counts({ [part]: counts()[part] + 1 }))).toEqual([{ part, a: counts()[part], b: counts()[part] + 1 }]);
  });

  it.each([
    ['links', 10, 11, false],
    ['links', 10, 12, false],
    ['links', 10, 13, true],
    ['images', 4, 5, false],
    ['images', 4, 6, true],
    ['listItems', 8, 10, false],
    ['listItems', 8, 11, true],
    ['images', 0, 2, true],
  ] as const)('%s %i and %i differ enough: %s', (part, a, b, want) => {
    expect(countDifferences(counts({ [part]: a }), counts({ [part]: b })).length > 0).toBe(want);
  });

  it('takes the tolerance from the caller', () => {
    expect(countDifferences(counts({ links: 10 }), counts({ links: 12 }), 0.1)).toHaveLength(1);
  });
});

describe('structure-differs', () => {
  it('asks a person when the two versions hold different parts', () => {
    const e = rules(audit([en('<h2>Hours</h2><h2>Prices</h2><button type="button">Save</button>'), fr('<h2>Horaires</h2>')]).entries, 'structure-differs');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ id: '/ | /fr', status: 'unknown' });
    expect(e[0]?.message.en).toBe('The two versions do not hold the same parts (/ and /fr): headings 3 and 2, buttons 1 and 0. A person has to say whether something is missing in one language.');
    expect(e[0]?.message.fr).toContain('titres 3 et 2, boutons 1 et 0');
  });

  it('says nothing when the counts match, and does not claim the words match', () => {
    const e = audit([en('<h2>Hours</h2>'), fr('<h2>Horaires</h2>')]).entries;
    expect(e).toEqual([]);
  });

  it('reports a pair once', () => {
    expect(rules(audit([en('<h2>Only here</h2>'), fr()]).entries, 'structure-differs')).toHaveLength(1);
  });

  it('compares only pairs that name each other', () => {
    const e = audit([en('<h2>Only here</h2>'), fr('', '')]).entries;
    expect(rules(e, 'structure-differs')).toEqual([]);
  });
});

describe('reciprocalPairs', () => {
  it('gives each pair once, in the order of the pages', () => {
    const pairs = reciprocalPairs(readSite(tidySite()));
    expect(pairs.map((p) => [p.a.route, p.b.route])).toEqual([
      ['/', '/fr'],
      ['/places', '/fr/lieux'],
      ['/help', '/fr/aide'],
    ]);
  });

  it('gives none when nothing is returned', () => {
    expect(reciprocalPairs(readSite([en(), fr('', '')]))).toEqual([]);
  });
});

describe('messages of the lang-pairs check', () => {
  const entries = audit(SAMPLE_SITE_PAGES).entries;

  it('has a sample finding for every rule', () => {
    expect([...new Set(entries.map((e) => e.rule))].sort()).toEqual([...LANG_PAIR_RULES].sort());
  });

  it('gives both languages with French typography', () => {
    noFrIssues(entries);
  });

  it('fails only what was measured', () => {
    for (const e of entries) expect(e.status, e.rule).toBe(e.rule === 'alternate-one-way' || e.rule === 'alternate-lang' ? 'fail' : 'unknown');
  });

  it('raises nothing in the copy check', () => {
    expect(auditCopy(entries.flatMap((e) => [{ id: `${e.rule}-en`, text: e.message.en }, { id: `${e.rule}-fr`, text: e.message.fr }])).entries).toEqual([]);
  });
});
