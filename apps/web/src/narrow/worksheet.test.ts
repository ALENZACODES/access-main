import { describe, expect, it } from 'vitest';
import { auditCopy } from './copylint.js';
import { coverage } from './coverage.js';
import { htmlTextItems, lintHtml, parseHtml } from './htmllint.js';
import { frTypographyIssues } from './i18n.js';
import { found, reportOf, route, smallSite } from './report-fixtures.js';
import { markupResults } from './run.js';
import type { Entry } from './types.js';
import { WORKSHEET_CSS, blockId, renderWorksheet, worksheetItems } from './worksheet.js';

function ownFindings(html: string): Entry[] {
  const results = { ...markupResults(html), 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) };
  return Object.values(results).flatMap((r) => [...(r?.entries ?? [])]);
}

function textOf(html: string): string[] {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .split(/<[^>]+>/)
    .map((s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
    .filter((s) => s.trim() !== '');
}

const keyboardOnly = reportOf([route('/', { keyboard: { checked: 12, entries: [] }, contrast: { checked: 9, entries: [] } })]);

describe('worksheetItems', () => {
  it('gives one block per Level A and AA criterion, in the order of WCAG', () => {
    const items = worksheetItems(smallSite(), 'en');
    expect(items.map((i) => i.sc)).toEqual(coverage().map((r) => r.criterion.sc));
    expect(items).toHaveLength(55);
  });

  it('carries the step, what it needs and what the report says', () => {
    const item = worksheetItems(smallSite(), 'en').find((i) => i.sc === '1.4.3');
    expect(item).toMatchObject({ needs: 'a browser', row: { state: 'found', failed: 2, unknown: 1 } });
    expect(item?.action).toContain('Measure the contrast of text placed on images');
    expect(worksheetItems(smallSite(), 'fr').find((i) => i.sc === '2.1.1')?.needs).toBe('un clavier');
  });

  it('filters like the by-hand script', () => {
    expect(worksheetItems(smallSite(), 'en', { level: 'A' })).toHaveLength(31);
    expect(worksheetItems(smallSite(), 'en', { since: '2.2' }).map((i) => i.sc)).toEqual(['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']);
    for (const i of worksheetItems(smallSite(), 'en', { onlyByHand: true })) expect(i.row.state).toBe('by-hand');
    for (const i of worksheetItems(smallSite(), 'en', { needs: ['screen-reader'] })) expect(i.needs).toBe('a screen reader');
  });

  it('can leave out the criteria whose checks ran and found nothing, and only those', () => {
    const all = worksheetItems(keyboardOnly, 'en');
    const open = worksheetItems(keyboardOnly, 'en', { onlyOpen: true });
    const quiet = all.filter((i) => i.row.state === 'nothing-found').map((i) => i.sc);
    expect(quiet).toEqual(['1.4.3', '2.1.1']);
    expect(open).toHaveLength(all.length - quiet.length);
    expect(open.map((i) => i.sc)).not.toContain('1.4.3');
    expect(open.map((i) => i.sc)).toContain('2.1.2');
  });
});

describe('renderWorksheet under its own checks', () => {
  for (const lang of ['en', 'fr'] as const) {
    it(`raises nothing in ${lang}`, () => {
      expect(ownFindings(renderWorksheet(smallSite(), lang)).map((e) => `${e.status} ${e.check}/${e.rule ?? ''} ${e.id}`)).toEqual([]);
    });
    it(`raises nothing for a short worksheet and for an empty one in ${lang}`, () => {
      expect(ownFindings(renderWorksheet(reportOf([]), lang, { since: '2.2' }))).toEqual([]);
      expect(ownFindings(renderWorksheet(reportOf([]), lang, { since: '2.2', needs: ['media'] }))).toEqual([]);
    });
  }

  it('follows French typography in every piece of text', () => {
    for (const piece of textOf(renderWorksheet(smallSite(), 'fr'))) expect(frTypographyIssues(piece), piece).toEqual([]);
  });
});

describe('renderWorksheet structure', () => {
  const html = renderWorksheet(smallSite(), 'en');
  const { nodes } = parseHtml(html);
  const tags = (tag: string) => nodes.filter((n) => n.tag === tag);
  const ids = nodes.map((n) => n.attrs['id']).filter((id): id is string => id !== undefined);

  it('is a whole document in the language asked, with one h1 and one main', () => {
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(renderWorksheet(smallSite(), 'fr')).toContain('<html lang="fr">');
    expect(tags('h1')).toHaveLength(1);
    expect(tags('main')).toHaveLength(1);
    expect(html).toContain('<title>By-hand worksheet, WCAG 2.2 Level A and AA</title>');
  });

  it('has a block per criterion, named by its heading', () => {
    const articles = tags('article');
    expect(articles).toHaveLength(55);
    expect(articles[0]?.attrs['aria-labelledby']).toBe('sc-1-1-1-h');
    expect(html).toContain('<h3 id="sc-1-4-10-h">1.4.10 Reflow (Level AA)</h3>');
    expect(blockId('1.4.10')).toBe('sc-1-4-10');
  });

  it('groups the blocks under the four principles and links to each from the contents', () => {
    expect(tags('h2').map((h) => h.text)).toEqual(['Contents', 'How to use this page', '1. Perceivable', '2. Operable', '3. Understandable', '4. Robust']);
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect((nav.match(/href="#[^"]+"/g) ?? []).map((h) => h.slice(7, -1))).toEqual(['how-h', 'p1-h', 'p2-h', 'p3-h', 'p4-h']);
  });

  it('repeats no id and points every in-page link at an id that exists', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of tags('a')) {
      const href = a.attrs['href'] ?? '';
      expect(href.startsWith('#'), href).toBe(true);
      expect(ids, href).toContain(href.slice(1));
    }
  });

  it('labels every box and every notes field with the criterion it belongs to', () => {
    const labels = new Map(tags('label').map((l) => [l.attrs['for'], l.text]));
    const boxes = tags('input');
    const notes = tags('textarea');
    expect(boxes).toHaveLength(55);
    expect(notes).toHaveLength(55);
    for (const box of boxes) {
      expect(box.attrs['type']).toBe('checkbox');
      expect(labels.get(box.attrs['id']), box.attrs['id']).toMatch(/^A person has looked: \d/);
    }
    for (const n of notes) expect(labels.get(n.attrs['id']), n.attrs['id']).toMatch(/^Notes for \d/);
    expect(new Set([...labels.values()]).size).toBe(110);
  });

  it('carries no script, no form that sends anything and no outside resource', () => {
    expect(html).not.toMatch(/<script|<form|<link|<img|<iframe|@import|url\(|https?:/i);
  });

  it('gives boxes a 44 pixel target and a focus ring, and keeps blocks whole in print', () => {
    expect(WORKSHEET_CSS).toContain('.tick input{width:44px;height:44px');
    expect(WORKSHEET_CSS).toContain('.tick input:focus-visible,textarea:focus-visible{outline:3px solid');
    expect(WORKSHEET_CSS).toContain('@media print{article{break-inside:avoid}');
    expect(WORKSHEET_CSS).not.toMatch(/outline:\s*(none|0)/);
  });
});

describe('renderWorksheet content', () => {
  const html = renderWorksheet(smallSite(), 'en');

  it('says the page saves nothing and what a ticked box records', () => {
    expect(html).toContain('This page saves nothing. A ticked box and typed notes are lost when the page is closed.');
    expect(html).toContain('A ticked box records that someone looked. It does not record that the criterion is met.');
    expect(html).toContain('looks at part of it, never at the whole');
    const fr = renderWorksheet(smallSite(), 'fr');
    expect(fr).toContain('Cette page n’enregistre rien.');
    expect(fr).toContain('Elle ne note pas que le critère est respecté.');
  });

  it('shows the step and what the report says for a criterion with findings', () => {
    const block = html.slice(html.indexOf('id="sc-1-4-3-h"'), html.indexOf('id="sc-1-4-4-h"'));
    expect(block).toContain('<dt>Do</dt><dd>Measure the contrast of text placed on images, gradients and maps.</dd>');
    expect(block).toContain('<dt>Needs</dt><dd>a browser</dd>');
    expect(block).toContain('<dt>In this report</dt><dd>something found: 2 to fix, 1 UNKNOWN</dd>');
    expect(block).toContain('<dt>Related checks</dt><dd><code>contrast</code></dd>');
  });

  it('says by hand only, checks not run, and nothing found where they apply', () => {
    expect(html.slice(html.indexOf('id="sc-1-2-1-h"'), html.indexOf('id="sc-1-2-2-h"'))).toContain('<dt>In this report</dt><dd>by hand only</dd>');
    expect(html.slice(html.indexOf('id="sc-2-5-8-h"'), html.indexOf('id="sc-3-1-1-h"'))).toContain('<dd>checks not run</dd>');
    const quiet = renderWorksheet(keyboardOnly, 'en');
    expect(quiet.slice(quiet.indexOf('id="sc-2-1-1-h"'), quiet.indexOf('id="sc-2-1-2-h"'))).toContain('<dd>checks ran, nothing found</dd>');
    expect(quiet.slice(quiet.indexOf('id="sc-2-1-2-h"'), quiet.indexOf('id="sc-2-1-4-h"'))).toContain('<dd>a related check ran, read its findings</dd>');
  });

  it('uses the UNKNOWN token and French names in French', () => {
    const fr = renderWorksheet(smallSite(), 'fr');
    expect(fr).toContain('<dt>Dans ce rapport</dt><dd>anomalies trouvées\u00A0: 2 à corriger, 1 UNKNOWN</dd>');
    expect(fr).toContain('<h3 id="sc-1-4-10-h">1.4.10 Redistribution (Niveau AA)</h3>');
    expect(fr).toContain('Une personne a regardé\u00A0: 1.4.10 Redistribution');
  });

  it('counts the criteria on the page and by what the report says', () => {
    expect(html).toContain('55 criteria on this page. In this report: 3 with something found, ');
    expect(renderWorksheet(smallSite(), 'en', { since: '2.2' })).toContain('6 criteria on this page.');
  });

  it('skips the principles that have no block', () => {
    const short = renderWorksheet(smallSite(), 'en', { since: '2.2' });
    expect(parseHtml(short).nodes.filter((n) => n.tag === 'h2').map((h) => h.text)).toEqual(['Contents', 'How to use this page', '2. Operable', '3. Understandable']);
  });

  it('says so when no step matches', () => {
    const none = renderWorksheet(smallSite(), 'en', { since: '2.2', needs: ['media'] });
    expect(none).toContain('<p>No step matches these options.</p>');
    expect(none).not.toContain('<article');
  });

  it('never words the page as a result', () => {
    expect(textOf(renderWorksheet(smallSite(), 'en')).join(' ')).not.toMatch(/\bpass(es|ed)?\b|compliant|\bverif/i);
    expect(textOf(renderWorksheet(smallSite(), 'fr')).join(' ')).not.toMatch(/vérif|a réussi/i);
  });

  it('escapes a finding that is not there to escape: the page holds no page text at all', () => {
    const nasty = reportOf([route('/<b>', { contrast: { checked: 1, entries: [found('contrast', 'low', 'fail', '<i>x</i>', '<script>1</script>', '<script>2</script>')] } })]);
    const out = renderWorksheet(nasty, 'en');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<i>x</i>');
    expect(out).not.toContain('/<b>');
  });
});
