import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { DEFAULT_MAX_SHARED, DETAIL_CSS, DETAIL_HEADING_IDS, renderDetail } from './detail.js';
import { htmlTextItems, lintHtml, parseHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { found, nov, reportOf, route, smallSite } from './report-fixtures.js';
import { buildRouteAudit, makeReport, type AuditReport } from './report.js';
import { markupResults } from './run.js';
import type { Entry } from './types.js';

/** Every finding this module's own markup, static and copy checks raise on a page. */
function ownFindings(html: string): Entry[] {
  const results = { ...markupResults(html), 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) };
  return Object.values(results).flatMap((r) => [...(r?.entries ?? [])]);
}

/** The text of a page with tags removed and entities decoded, keeping no-break spaces as they are. */
function textOf(html: string): string[] {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .split(/<[^>]+>/)
    .map((s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
    .filter((s) => s.trim() !== '');
}

const repeated = (): AuditReport =>
  reportOf(
    ['/', '/help', '/about'].map((path) =>
      route(path, {
        contrast: { checked: 5, entries: [found('contrast', 'low', 'fail', 'a#nav', 'Contrast is 2.1.', 'Le contraste est de 2,1.')] },
        images: { checked: 2, entries: path === '/' ? [found('images', 'alt-generic', 'unknown', 'img#logo', 'The alt text reads “image”.', 'Le texte de remplacement indique «\u202Fimage\u202F».')] : [] },
      }),
    ),
  );

const withExtras = (): AuditReport => ({
  ...smallSite(),
  skipped: ['keyboard'],
  waived: [{ route: '/old', entry: found('contrast', 'low', 'fail', 'p[9]'), reason: 'Page retires in December.', expires: '2026-12-15' }],
});

describe('renderDetail under its own checks', () => {
  const cases: [string, AuditReport][] = [
    ['a small site', smallSite()],
    ['repeated findings', repeated()],
    ['no route', reportOf([])],
    ['skipped checks and waivers', withExtras()],
  ];

  for (const [name, report] of cases) {
    for (const lang of ['en', 'fr'] as const) {
      it(`raises nothing for ${name} in ${lang}`, () => {
        expect(ownFindings(renderDetail(report, lang)).map((e) => `${e.status} ${e.check}/${e.rule ?? ''} ${e.id}`)).toEqual([]);
      });
    }
  }

  it('follows French typography in every piece of text', () => {
    for (const report of [smallSite(), repeated(), reportOf([]), withExtras()]) {
      for (const piece of textOf(renderDetail(report, 'fr'))) {
        if (piece.includes('Texte français pour') || piece.includes('Page retires')) continue;
        expect(frTypographyIssues(piece), piece).toEqual([]);
      }
    }
  });

  it('uses the UNKNOWN token in French', () => {
    const html = renderDetail(smallSite(), 'fr');
    expect(html).toContain('<strong>UNKNOWN</strong>');
    expect(html).toContain('<strong>À CORRIGER</strong>');
    expect(html).toContain('UNKNOWN, à regarder par une personne');
  });
});

describe('renderDetail structure', () => {
  const html = renderDetail(smallSite(), 'en');
  const { nodes } = parseHtml(html);
  const tags = (tag: string) => nodes.filter((n) => n.tag === tag);

  it('is a whole document in the language asked', () => {
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(renderDetail(smallSite(), 'fr')).toContain('<html lang="fr">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<title>Narrow-screen audit, detailed report</title>');
  });

  it('has one h1, one main, one nav and a header', () => {
    for (const tag of ['h1', 'main', 'nav', 'header']) expect(tags(tag), tag).toHaveLength(1);
  });

  it('starts with a skip link to the first section', () => {
    const first = tags('a')[0];
    expect(first?.attrs['class']).toBe('skip');
    expect(first?.attrs['href']).toBe('#summary-h');
  });

  it('links the table of contents to every section heading, in order', () => {
    const navLinks = html.slice(html.indexOf('<nav'), html.indexOf('</nav>')).match(/href="#[^"]+"/g) ?? [];
    expect(navLinks.map((h) => h.slice(7, -1))).toEqual(DETAIL_HEADING_IDS);
    const ids = new Set(nodes.map((n) => n.attrs['id']).filter((id): id is string => id !== undefined));
    for (const id of DETAIL_HEADING_IDS) expect(ids.has(id), id).toBe(true);
  });

  it('points every in-page link at an id that exists, and repeats no id', () => {
    const ids = nodes.map((n) => n.attrs['id']).filter((id): id is string => id !== undefined);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of tags('a')) {
      const href = a.attrs['href'] ?? '';
      if (href.startsWith('#')) expect(ids, href).toContain(href.slice(1));
    }
  });

  it('names each section by its heading', () => {
    const sections = tags('section');
    expect(sections).toHaveLength(DETAIL_HEADING_IDS.length);
    expect(sections.map((s) => s.attrs['aria-labelledby'])).toEqual(DETAIL_HEADING_IDS);
  });

  it('gives every table a caption, column headers and a row header', () => {
    const tables = tags('table');
    expect(tables.length).toBeGreaterThanOrEqual(2);
    expect(tags('caption')).toHaveLength(tables.length);
    for (const th of tags('th')) expect(['col', 'row']).toContain(th.attrs['scope']);
    expect(html).not.toMatch(/<tr><td/);
  });

  it('needs no scrolling region: tables have a fixed layout and wrap', () => {
    expect(nodes.filter((n) => n.attrs['role'] === 'region' || n.attrs['tabindex'] !== undefined)).toEqual([]);
    expect(DETAIL_CSS).toContain('table{border-collapse:collapse;width:100%;table-layout:fixed}');
  });

  it('keeps the skip link visible, with no rule that hides or moves it', () => {
    expect(DETAIL_CSS).not.toMatch(/\.skip\{[^}]*(position|clip|left|width:1px)/);
    expect(DETAIL_CSS).toContain('.skip,.sources a{display:inline-block;min-height:44px');
  });

  it('carries no script and no outside resource', () => {
    expect(html).not.toMatch(/<script|<link|<img|<iframe|@import|url\(/i);
    const outside = tags('a').map((a) => a.attrs['href'] ?? '').filter((h) => !h.startsWith('#'));
    expect(outside).toEqual(['https://www.w3.org/TR/WCAG22/']);
  });

  it('styles focus, targets, dark mode and print', () => {
    expect(DETAIL_CSS).toContain(':focus-visible{outline:3px solid');
    expect(DETAIL_CSS).toContain('min-height:44px');
    expect(DETAIL_CSS).toContain('@media (prefers-color-scheme:dark)');
    expect(DETAIL_CSS).toContain('@media print');
    expect(DETAIL_CSS).toContain('overflow-wrap:anywhere');
    expect(DETAIL_CSS).not.toMatch(/outline:\s*(none|0)/);
  });
});

describe('renderDetail content', () => {
  it('gives the totals in the header and in the summary', () => {
    const html = renderDetail(smallSite(), 'en');
    expect(html).toContain('<p>2 to fix, 3 UNKNOWN, on 3 routes audited.</p>');
    expect(html).toContain('<dt>Routes audited</dt><dd>3</dd>');
    expect(html).toContain('<dt>To fix</dt><dd>2</dd>');
    expect(html).toContain('<dt>UNKNOWN, for a person to look at</dt><dd>3</dd>');
    expect(html).toContain('<dt>Elements checked</dt><dd>44</dd>');
  });

  it('counts a route audited in two profiles once in the summary', () => {
    const report = reportOf([route('/', { contrast: { checked: 1, entries: [] } }, 320), route('/', { contrast: { checked: 1, entries: [] } }, 1280)]);
    expect(renderDetail(report, 'en')).toContain('<dt>Routes audited</dt><dd>1</dd>');
  });

  it('gives the date as a time element', () => {
    expect(renderDetail(reportOf([], 19), 'en')).toContain('<time datetime="2026-11-19T10:00:00.000Z">2026-11-19T10:00:00.000Z</time>');
    expect(nov(19).toISOString()).toBe('2026-11-19T10:00:00.000Z');
  });

  it('lists the findings by criterion with their level', () => {
    const html = renderDetail(smallSite(), 'en');
    expect(html).toContain('<tr><th scope="row">1.4.3 Contrast (Minimum) (AA)</th><td><code>contrast</code></td><td class="n">2</td><td class="n">1</td></tr>');
    expect(html).toContain('<tr><th scope="row">Level AA</th><td class="n">2</td><td class="n">1</td></tr>');
    expect(html).not.toContain('Level AAA');
  });

  it('shows a Level AAA row only when a check of that level found something', () => {
    const report = reportOf([route('/', { typography: { checked: 3, entries: [found('typography', 'justified', 'unknown', 'p[1]')] } })]);
    expect(renderDetail(report, 'en')).toContain('<th scope="row">Level AAA</th>');
  });

  it('puts checks outside WCAG in their own row', () => {
    const report = reportOf([route('/', { copy: { checked: 3, entries: [found('copy', 'banned', 'fail', 'p[1]')] } })]);
    const html = renderDetail(report, 'en');
    expect(html).toContain('<th scope="row">Checks outside WCAG</th>');
    expect(html).toContain('<tr><th scope="row">Not a WCAG criterion</th><td class="n">1</td><td class="n">0</td></tr>');
  });

  it('lists every route with its findings, failures first', () => {
    const html = renderDetail(smallSite(), 'en');
    expect(html).toContain('<h3 id="route-0">/ (320 px)</h3>');
    expect(html).toContain('<h3 id="route-1">/help (320 px)</h3>');
    const home = html.slice(html.indexOf('id="route-0"'), html.indexOf('id="route-1"'));
    expect(home.match(/<li class="(fail|unknown)">/g)).toEqual(['<li class="fail">', '<li class="fail">', '<li class="unknown">', '<li class="unknown">']);
    expect(home).toContain('<code>contrast/low</code> <code>a#nav-help</code>');
  });

  it('never words a route with no finding as conforming', () => {
    const en = renderDetail(smallSite(), 'en');
    expect(en).toContain('The checks that ran reported nothing on this route. That is not a statement that the route conforms.');
    expect(renderDetail(smallSite(), 'fr')).toContain('Cela ne dit pas que la route est conforme.');
    expect(en).not.toMatch(/\bpass(ed|es)?\b|compliant/i);
  });

  it('leaves the width out for a route that is not a page', () => {
    const report = reportOf([route('html:dist/index.html', { 'static-html': { checked: 1, entries: [] } }, null)]);
    expect(renderDetail(report, 'en')).toContain('<h3 id="route-0">html:dist/index.html</h3>');
  });

  it('says when only the first elements of a route were read', () => {
    const report = makeReport([buildRouteAudit('/', 320, { contrast: { checked: 1, entries: [] } }, 0, true)], nov(19));
    expect(renderDetail(report, 'en')).toContain('Only the first elements were read on this route.');
  });

  it('tables the findings that repeat, with their routes', () => {
    const html = renderDetail(repeated(), 'en');
    expect(html).toContain('3 of the 4 findings come from 1 repeated finding.');
    expect(renderDetail(repeated(), 'fr')).toContain('3 des 4 anomalies viennent de 1 anomalie répétée.');
    expect(html).toContain('<tr><th scope="row"><code>contrast/low</code> <code>a#nav</code></th><td>FAIL</td><td class="n">3</td><td>/, /help, /about</td></tr>');
    expect(html).not.toContain('No finding repeats across routes.');
  });

  it('cuts the repeated findings at the limit and says how many are left', () => {
    const entries = Array.from({ length: 4 }, (_v, i) => found('contrast', 'low', 'fail', `p[${i}]`));
    const report = reportOf(['/a', '/b'].map((path) => route(path, { contrast: { checked: 9, entries } })));
    const html = renderDetail(report, 'en', { maxShared: 3 });
    const table = html.slice(html.indexOf('id="rep-cap"'), html.indexOf('id="routes-h"'));
    expect(table.match(/<tr><th scope="row">/g)).toHaveLength(3);
    expect(html).toContain('And 1 more, in the routes below.');
    expect(renderDetail(report, 'fr', { maxShared: 3 })).toContain('Et 1 de plus, dans les routes ci-dessous.');
    expect(DEFAULT_MAX_SHARED).toBe(25);
  });

  it('adds who a check matters to and how to look by hand', () => {
    const html = renderDetail(smallSite(), 'en');
    expect(html).toContain('<strong>Who it matters to:</strong>');
    expect(html).toContain('<strong>To look by hand:</strong>');
    expect(html).toContain('Looking by hand does not make a page conform. It shows where to look.');
    expect(renderDetail(smallSite(), 'fr')).toContain('<strong>Qui est concerné\u00A0:</strong>');
  });

  it('says so when there is nothing to point to', () => {
    const html = renderDetail(reportOf([]), 'en');
    expect(html).toContain('No route was audited.');
    expect(html).toContain('The report has no finding, so there is no check to point to.');
    expect(html).toContain('<p>No findings.</p>');
  });

  it('lists skipped checks and waived failures', () => {
    const html = renderDetail(withExtras(), 'en');
    expect(html).toContain('Checks not run in this run, so nothing is said about them: ');
    expect(html).toContain('<h3 id="waived">Failures covered by a dated waiver</h3>');
    expect(html).toContain('(until 2026-12-15): Page retires in December.');
  });

  it('repeats the scope note and names the source and the tool', () => {
    const html = renderDetail(smallSite(), 'en');
    expect(html.split('A clean result is not a conformance statement.').length - 1).toBe(2);
    expect(html).toContain('Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation, 2023-10-05, <a href="https://www.w3.org/TR/WCAG22/">');
    expect(html).toContain('<p>narrow-audit ');
  });

  it('escapes page text in ids, messages, routes and waiver reasons', () => {
    const nasty = '<script>alert("x")</script>';
    const report: AuditReport = {
      ...reportOf([route(`/q?x=${nasty}`, { contrast: { checked: 1, entries: [found('contrast', 'low', 'fail', `p#${nasty}`, `Text ${nasty}.`, `Texte ${nasty}.`)] } })]),
      waived: [{ route: nasty, entry: found('contrast', 'low', 'fail', 'p'), reason: nasty, expires: '2026-12-15' }],
    };
    for (const lang of ['en', 'fr'] as const) {
      const html = renderDetail(report, lang);
      expect(html).not.toContain('<script');
      expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    }
  });
});
