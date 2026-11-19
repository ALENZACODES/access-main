import { describe, expect, it } from 'vitest';
import {
  ACTIVE_FILTER_KEYS,
  clearAction,
  clearKeyFromAction,
  listActiveFilters,
  removeLabel,
  renderActiveFiltersHtml,
  withoutFilter,
} from './activeFilters';
import { auditRegistry } from './datasetRegistry';
import { hasActiveFilters, NO_FILTERS, serializeFilters, type Filters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderResultsHtml, scanHtml, visibleText } from './index';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const ALL: Filters = { state: 'stale', kind: 'places', query: 'Alpha', onlyIssues: true, tier: 'unknown', licence: 'open', dataset: 'p', gap: 'source' };
const audit = auditRegistry(RECORDS, NOW, {});
const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };

describe('listActiveFilters', () => {
  it('is empty when no filter is in force', () => {
    expect(listActiveFilters(NO_FILTERS, 'en')).toEqual([]);
    expect(listActiveFilters({ ...NO_FILTERS, query: '   ' }, 'en')).toEqual([]);
  });
  it('lists every filter in force, in a fixed order, in words', () => {
    expect(listActiveFilters(ALL, 'en', new Map([['p', 'Places']]))).toEqual([
      { key: 'state', label: 'Status: May be out of date' },
      { key: 'kind', label: 'Dataset type: Places' },
      { key: 'query', label: 'Name contains “alpha”' },
      { key: 'issues', label: 'Needs review only' },
      { key: 'tier', label: 'Tier: Unknown' },
      { key: 'licence', label: 'Licence type: Open licence' },
      { key: 'dataset', label: 'Dataset: Places' },
      { key: 'gap', label: 'Unknown: Source' },
    ]);
  });
  it('falls back to the dataset id when no name is known', () => {
    expect(listActiveFilters({ ...NO_FILTERS, dataset: 'zz' }, 'en')).toEqual([{ key: 'dataset', label: 'Dataset: zz' }]);
  });
  it('is written in French with the right spacing', () => {
    const labels = listActiveFilters(ALL, 'fr').map((a) => a.label);
    expect(labels).toContain('Niveau : Inconnu');
    expect(labels).toContain('Le nom contient « alpha »');
    for (const l of labels) expect(lintFrench(l)).toEqual([]);
  });
  it('has one entry for each key when everything is set', () => {
    expect(listActiveFilters(ALL, 'en').map((a) => a.key)).toEqual([...ACTIVE_FILTER_KEYS]);
  });
});

describe('withoutFilter', () => {
  it('removes just the one filter and leaves the input alone', () => {
    for (const key of ACTIVE_FILTER_KEYS) {
      const next = withoutFilter(ALL, key);
      expect(listActiveFilters(next, 'en').map((a) => a.key)).toEqual(ACTIVE_FILTER_KEYS.filter((k) => k !== key));
    }
    expect(listActiveFilters(ALL, 'en')).toHaveLength(ACTIVE_FILTER_KEYS.length);
  });
  it('reaches the defaults once every filter has been removed', () => {
    let f = ALL;
    for (const key of ACTIVE_FILTER_KEYS) f = withoutFilter(f, key);
    expect(f).toEqual(NO_FILTERS);
    expect(hasActiveFilters(f)).toBe(false);
  });
  it('does nothing when the filter was not in force', () => {
    for (const key of ACTIVE_FILTER_KEYS) expect(withoutFilter(NO_FILTERS, key)).toEqual(NO_FILTERS);
  });
});

describe('remove actions', () => {
  it('map to and from the action name, and reject anything else', () => {
    for (const key of ACTIVE_FILTER_KEYS) expect(clearKeyFromAction(clearAction(key))).toBe(key);
    for (const a of ['clear:', 'clear:all', 'tier', 'reset-filters', 'quick:stale', '', null, undefined]) expect(clearKeyFromAction(a)).toBeNull();
  });
  it('are worded so the filter is named', () => {
    expect(removeLabel({ key: 'tier', label: 'Tier: E' }, 'en')).toBe('Remove filter. Tier: E');
    expect(removeLabel({ key: 'tier', label: 'Niveau : E' }, 'fr')).toBe('Retirer le filtre. Niveau : E');
  });
});

describe('renderActiveFiltersHtml', () => {
  it('renders nothing when no filter is in force', () => {
    expect(renderActiveFiltersHtml([], 'en')).toBe('');
  });
  it('renders a button for each filter, with the count in words', () => {
    const html = renderActiveFiltersHtml(listActiveFilters(ALL, 'en'), 'en');
    expect(html).toContain('<p>8 filters in force</p>');
    expect(html.match(/<button type="button" data-action="clear:/g)).toHaveLength(8);
    expect(html).toContain('data-action="clear:tier"');
    expect(renderActiveFiltersHtml(listActiveFilters({ ...NO_FILTERS, tier: 'E' }, 'en'), 'en')).toContain('<p>1 filter in force</p>');
  });
  it('renders links when given a link builder', () => {
    const html = renderActiveFiltersHtml(listActiveFilters({ ...NO_FILTERS, tier: 'E', licence: 'open' }, 'en'), 'en', { hrefFor: (key) => `/x?without=${key}` });
    expect(html).not.toContain('<button');
    expect(html).toContain('<a href="/x?without=tier"');
    expect(html).toContain('<a href="/x?without=licence"');
  });
  it('escapes the search text', () => {
    const html = renderActiveFiltersHtml(listActiveFilters({ ...NO_FILTERS, query: '<b>x</b>' }, 'en'), 'en');
    expect(html).not.toContain('<b>x</b>');
  });
  it('passes the markup, target and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const opts of [{}, { hrefFor: () => '/x' }]) {
        const html = renderActiveFiltersHtml(listActiveFilters(ALL, locale), locale, opts);
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        expect(targetsBelow44(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});

describe('filters in force on the panel', () => {
  it('sit above the list inside the results region, and are absent with no filters', () => {
    expect(renderResultsHtml(audit, 'en', NO_FILTERS, NOW)).not.toContain('data-active-filters');
    const html = renderResultsHtml(audit, 'en', { ...NO_FILTERS, dataset: 'p' }, NOW);
    expect(html.startsWith('<div data-active-filters="1">')).toBe(true);
    expect(html).toContain('Dataset: Places &lt;A&gt;');
    const panel = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, filters: { ...NO_FILTERS, tier: 'E' } });
    expect(panel.indexOf('data-active-filters')).toBeGreaterThan(panel.indexOf('data-region="sources"'));
    expect(structureProblems(panel)).toEqual([]);
  });
  it('appear as soon as a filter is chosen, without re-rendering the controls', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    const before = host.innerHTML;
    host.filter('change', 'tier', 'E');
    expect(host.innerHTML).toBe(before);
    expect(host.region.innerHTML).toContain('data-action="clear:tier"');
    expect(host.region.innerHTML).toContain('Remove filter. Tier: E');
  });
  it('removing one keeps the others, re-renders the controls, tells the page and says what changed', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.filter('change', 'tier', 'E');
    host.filter('change', 'licence', 'unrecognised');
    host.click('clear:tier');
    expect(seen.at(-1)).toContain('lic=unrecognised');
    expect(seen.at(-1)).not.toContain('tier=');
    expect(host.innerHTML).toContain('<option value="unrecognised" selected>');
    expect(host.innerHTML).toMatch(/<select id="ds-f-tier"[^>]*><option value="any" selected>/);
    expect(host.innerHTML).toContain('data-active-filters="1"');
    expect(host.announce.innerHTML).toContain('licence type');
    host.click('clear:licence');
    expect(host.innerHTML).not.toContain('data-active-filters');
    expect(seen.at(-1)).toBe(serializeFilters(NO_FILTERS));
  });
  it('ignores an action that only looks like a remove action', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.click('clear:everything');
    expect(seen).toEqual([]);
  });
  it('uses links that keep the other filters and the thresholds in the static view', () => {
    const page = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, staticView: sv, thresholds: { places: 30 }, filters: { ...NO_FILTERS, tier: 'E', licence: 'unrecognised' } });
    expect(page).toContain('href="/en/data-status?lic=unrecognised&amp;stale_places=30"');
    expect(page).toContain('href="/en/data-status?tier=E&amp;stale_places=30"');
    expect(page).not.toContain('data-action="clear:');
    expect(describeProblems(auditHtml(page))).toEqual([]);
  });
});

describe('tier in the per-source details', () => {
  it('shows the tier, or Unknown, for each source with a finding', () => {
    const en = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(en).toContain('<dt>Tier</dt><dd>E</dd>');
    expect(en).toContain('<dt>Tier</dt><dd>Unknown</dd>');
    expect(renderDataStatusPanel({ records: RECORDS, locale: 'fr', now: NOW })).toContain('<dt>Niveau</dt><dd>Inconnu</dd>');
  });
});
