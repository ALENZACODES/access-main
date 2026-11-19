import { describe, expect, it } from 'vitest';
import { withoutFilter } from './activeFilters';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, NO_FILTERS, type Filters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderResultsHtml, scanHtml, visibleText } from './index';
import { buildNoMatchHints, hintLabel, renderNoMatchHintsHtml } from './noMatchHints';
import { randomRegistry } from './round7Kit';
import { FakeHost, NOW, targetsBelow44 } from './testkit';

const MIXED: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      { id: 'a', name: 'Alpha', licence: 'OGL-Ontario', tier: 0 },
      { id: 'b', name: 'Beta', licence: 'OGL-Ontario', tier: 0 },
      { id: 'c', name: 'Gamma', licence: 'Proprietary', tier: 'E' },
    ],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [{ id: 'd', name: 'Delta', licence: 'OGL-Ontario', tier: 'E' }] },
];
const audit = auditRegistry(MIXED, NOW, {});
const hints = (f: Filters, locale: 'en' | 'fr' = 'en') => buildNoMatchHints(audit.sources, f, locale);
const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };

describe('buildNoMatchHints', () => {
  it('is empty when the filters match something, or none is in force', () => {
    expect(hints(NO_FILTERS)).toEqual([]);
    expect(hints({ ...NO_FILTERS, tier: 'E' })).toEqual([]);
  });
  it('is empty when there are no sources at all', () => {
    expect(buildNoMatchHints([], { ...NO_FILTERS, tier: '4' }, 'en')).toEqual([]);
  });
  it('names the one filter in force when it alone matches nothing', () => {
    expect(hints({ ...NO_FILTERS, tier: '4' })).toEqual([{ filter: { key: 'tier', label: 'Tier: 4' }, count: 4 }]);
  });
  it('lists each filter whose removal alone would help, most sources first', () => {
    // Proprietary + tier 0 matches nothing: without the licence filter there are 2, without the tier filter 1.
    const out = hints({ ...NO_FILTERS, licence: 'unrecognised', tier: '0' });
    expect(out.map((h) => [h.filter.key, h.count])).toEqual([['licence', 2], ['tier', 1]]);
  });
  it('leaves out filters whose removal alone would still match nothing', () => {
    // Tier 4 is the only cause: dropping the dataset filter alone still matches nothing.
    const out = hints({ ...NO_FILTERS, tier: '4', dataset: 'p' });
    expect(out.map((h) => h.filter.key)).toEqual(['tier']);
    expect(out[0]?.count).toBe(3);
  });
  it('is empty when no single removal helps', () => {
    expect(hints({ ...NO_FILTERS, tier: '4', licence: 'terms' })).toEqual([]);
  });
  it('keeps the filter order when counts tie', () => {
    // Routes has no unlisted licence: without the licence filter there is 1 source, without the dataset filter also 1.
    const out = hints({ ...NO_FILTERS, dataset: 'r', licence: 'unrecognised' });
    expect(out.map((h) => [h.filter.key, h.count])).toEqual([['licence', 1], ['dataset', 1]]);
  });
  it('every count is what removing that filter really shows, on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const f: Filters = { ...NO_FILTERS, tier: '4', state: 'stale', query: 'zzzz-no-such-name' };
      const out = buildNoMatchHints(a.sources, f, 'en');
      for (const h of out) {
        expect(h.count).toBeGreaterThan(0);
        expect(h.count).toBe(applyFilters(a.sources, withoutFilter(f, h.filter.key)).length);
      }
      for (let i = 1; i < out.length; i++) expect(out[i - 1]!.count).toBeGreaterThanOrEqual(out[i]!.count);
    }
  });
});

describe('renderNoMatchHintsHtml', () => {
  it('offers a button for each hint, with the count in words', () => {
    const html = renderNoMatchHintsHtml(hints({ ...NO_FILTERS, licence: 'unrecognised', tier: '0' }), 'en', { activeCount: 2 });
    expect(html).toContain('Removing one filter would bring sources back.');
    expect(html).toContain('data-action="clear:licence"');
    expect(html).toContain('Remove filter. Licence type: Not on the reference list (shows 2 sources)');
    expect(html).toContain('Remove filter. Tier: 0 (shows 1 source)');
  });
  it('says no single filter is the cause only when two or more are in force', () => {
    expect(renderNoMatchHintsHtml([], 'en', { activeCount: 2 })).toContain('No single filter is the cause.');
    expect(renderNoMatchHintsHtml([], 'en', { activeCount: 1 })).toBe('');
    expect(renderNoMatchHintsHtml([], 'en', { activeCount: 0 })).toBe('');
  });
  it('renders links when given a link builder', () => {
    const html = renderNoMatchHintsHtml(hints({ ...NO_FILTERS, tier: '4' }), 'en', { activeCount: 1, hrefFor: (k) => `/x?without=${k}` });
    expect(html).toContain('<a href="/x?without=tier"');
    expect(html).not.toContain('<button');
  });
  it('labels in French with the right plural', () => {
    const h = hints({ ...NO_FILTERS, licence: 'unrecognised', tier: '0' }, 'fr');
    const labels = h.map((x) => hintLabel(x, 'fr'));
    expect(labels.some((l) => l.endsWith('(présente 2 sources)'))).toBe(true);
    expect(labels.some((l) => l.endsWith('(présente 1 source)'))).toBe(true);
  });
  it('passes the markup, target and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const html of [
        renderNoMatchHintsHtml(hints({ ...NO_FILTERS, licence: 'unrecognised', tier: '0' }, locale), locale, { activeCount: 2 }),
        renderNoMatchHintsHtml(hints({ ...NO_FILTERS, tier: '4' }, locale), locale, { activeCount: 1, hrefFor: () => '/x' }),
        renderNoMatchHintsHtml([], locale, { activeCount: 3 }),
      ]) {
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        expect(targetsBelow44(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});

describe('hints on the panel', () => {
  it('appear under the list only when the filters match nothing', () => {
    expect(renderResultsHtml(audit, 'en', { ...NO_FILTERS, tier: 'E' }, NOW)).not.toContain('data-no-match');
    const html = renderResultsHtml(audit, 'en', { ...NO_FILTERS, tier: '4' }, NOW);
    expect(html).toContain('No sources match these filters.');
    expect(html).toContain('data-no-match="1"');
    expect(html.indexOf('data-no-match')).toBeGreaterThan(html.indexOf('No sources match'));
  });
  it('are not shown for an empty registry', () => {
    const empty = auditRegistry([], NOW, {});
    expect(renderResultsHtml(empty, 'en', { ...NO_FILTERS, tier: '4' }, NOW)).not.toContain('data-no-match');
  });
  it('removing the suggested filter brings the sources back', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.filter('change', 'licence', 'unrecognised');
    host.filter('change', 'tier', '0');
    expect(host.region.innerHTML).toContain('data-no-match="2"');
    host.click('clear:licence');
    expect(seen.at(-1)).toContain('tier=0');
    expect(seen.at(-1)).not.toContain('lic=');
    expect(host.innerHTML).not.toContain('data-no-match');
    expect(host.innerHTML).toContain('Alpha');
  });
  it('uses links in the static view and passes the audits', () => {
    const page = renderDataStatusPanel({ records: MIXED, locale: 'en', now: NOW, staticView: sv, filters: { ...NO_FILTERS, tier: '4', dataset: 'p' } });
    expect(page).toContain('data-no-match="1"');
    expect(page).toMatch(/<a href="\/en\/data-status\?ds=p"[^>]*>Remove filter\. Tier: 4 \(shows 3 sources\)<\/a>/);
    expect(describeProblems(auditHtml(page))).toEqual([]);
    expect(scanHtml(page)).toEqual([]);
  });
});
