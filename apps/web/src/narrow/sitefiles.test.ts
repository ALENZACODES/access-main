import { describe, expect, it } from 'vitest';
import { totals } from './report.js';
import { SAMPLE_SITE_PAGES } from './samples.js';
import { pageHtml, sitePage, tidySite } from './site-testkit.js';
import { auditSitePages, routeOfFile, siteFromFiles, siteResults } from './sitefiles.js';
import { readSite } from './sitepages.js';

describe('routeOfFile', () => {
  it.each([
    ['dist/index.html', 'dist', '/'],
    ['dist/fr/index.html', 'dist', '/fr'],
    ['dist/about.html', 'dist', '/about'],
    ['dist/places/12/index.html', 'dist/', '/places/12'],
    ['dist/places/12.htm', 'dist', '/places/12'],
    ['./dist/a/b.html', 'dist', '/a/b'],
    ['dist\\fr\\index.html', 'dist', '/fr'],
    ['index.html', '', '/'],
    ['fr/index.html', '.', '/fr'],
    ['dist//fr//index.html', 'dist', '/fr'],
    ['dist/INDEX.HTML', 'dist', '/INDEX'],
    ['dist/data.json', 'dist', '/data.json'],
  ])('%s under %j is %s', (file, root, want) => {
    expect(routeOfFile(file, root)).toBe(want);
  });

  it.each([
    ['other/index.html', 'dist'],
    ['distribution/index.html', 'dist'],
    ['dist', 'dist'],
  ])('gives null for %s outside %s', (file, root) => {
    expect(routeOfFile(file, root)).toBeNull();
  });
});

describe('siteFromFiles', () => {
  it('turns files into pages and puts the entry page first', () => {
    const site = siteFromFiles(
      [
        { file: 'dist/about/index.html', html: 'a' },
        { file: 'dist/index.html', html: 'home' },
        { file: 'dist/fr/index.html', html: 'fr' },
      ],
      'dist',
    );
    expect(site.pages).toEqual([
      { route: '/', html: 'home' },
      { route: '/about', html: 'a' },
      { route: '/fr', html: 'fr' },
    ]);
    expect(site.left).toEqual([]);
  });

  it('leaves out files outside the root and a second file for the same route, and names them', () => {
    const site = siteFromFiles(
      [
        { file: 'dist/about.html', html: 'first' },
        { file: 'dist/about/index.html', html: 'second' },
        { file: 'tmp/x.html', html: 'x' },
      ],
      'dist',
    );
    expect(site.pages).toEqual([{ route: '/about', html: 'first' }]);
    expect(site.left).toEqual(['dist/about/index.html', 'tmp/x.html']);
  });

  it('keeps the order of the files when there is no entry page', () => {
    const site = siteFromFiles([{ file: 'dist/b.html', html: '' }, { file: 'dist/a.html', html: '' }], 'dist');
    expect(site.pages.map((p) => p.route)).toEqual(['/b', '/a']);
  });
});

describe('siteResults', () => {
  it('gives the two markup checks, and the consistency check only when asked', () => {
    const infos = readSite(tidySite());
    expect(Object.keys(siteResults(infos))).toEqual(['site-links', 'lang-pairs']);
    expect(Object.keys(siteResults(infos, { withConsistency: true }))).toEqual(['consistency', 'site-links', 'lang-pairs']);
  });

  it('passes the options on to the link check', () => {
    const infos = readSite([sitePage('/', { main: '<a href="/gone">x</a>' }), sitePage('/a')]);
    expect(siteResults(infos, { complete: true })['site-links'].entries.some((e) => e.rule === 'page-missing')).toBe(true);
    expect(siteResults(infos)['site-links'].entries.some((e) => e.rule === 'page-missing')).toBe(false);
  });
});

describe('auditSitePages', () => {
  it('gives a site route with three checks', () => {
    const audit = auditSitePages(tidySite(), { complete: true });
    expect(audit?.route).toBe('site');
    expect(audit?.viewportWidth).toBeNull();
    expect(audit?.checks.map((c) => c.check)).toEqual(['consistency', 'site-links', 'lang-pairs']);
  });

  it('has no failure on a tidy site', () => {
    const audit = auditSitePages(tidySite(), { complete: true });
    expect(audit?.entries.filter((e) => e.status === 'fail')).toEqual([]);
  });

  it('finds failures of all three kinds on a site that breaks the rules', () => {
    const audit = auditSitePages(SAMPLE_SITE_PAGES, { complete: true });
    const failed = new Set(audit?.entries.filter((e) => e.status === 'fail').map((e) => `${e.check}/${e.rule ?? ''}`));
    expect([...failed].sort()).toEqual(['lang-pairs/alternate-lang', 'lang-pairs/alternate-one-way', 'site-links/anchor-missing', 'site-links/page-missing']);
    expect(audit ? totals([audit]).failed : 0).toBeGreaterThan(3);
  });

  it('runs the consistency check from markup: a navigation that changes order fails', () => {
    const audit = auditSitePages([
      sitePage('/', { title: 'Home', nav: [['/m', 'Map'], ['/t', 'Tools'], ['/h', 'Help']] }),
      sitePage('/b', { title: 'B', nav: [['/t', 'Tools'], ['/m', 'Map'], ['/h', 'Help']] }),
    ]);
    expect(audit?.entries.filter((e) => e.check === 'consistency').map((e) => e.rule)).toEqual(['nav-order']);
  });

  it('gives null for fewer than two pages, and counts a repeated route once', () => {
    expect(auditSitePages([])).toBeNull();
    expect(auditSitePages([sitePage('/')])).toBeNull();
    expect(auditSitePages([{ route: '/', html: pageHtml() }, { route: '/', html: pageHtml() }])).toBeNull();
  });
});
