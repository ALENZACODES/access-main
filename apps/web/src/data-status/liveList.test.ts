import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { NO_FILTERS } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderFilterControls, renderResultsHtml, renderSourcesRegion, scanHtml, visibleText } from './index';
import {
  clampLimit,
  LIVE_STEP,
  nextStep,
  parseSortValue,
  renderShowMoreHtml,
  renderSortControl,
  SHOW_MORE_ACTION,
  showingText,
  SORT_CHOICES,
  SORT_NONE,
  sortChoiceLabel,
  sortValue,
} from './liveList';
import { quickFilterLabel } from './quickFilters';
import { SORT_KEYS } from './sorting';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const many = (n: number): DatasetRecord[] => [
  {
    id: 'd',
    name: 'Set',
    kind: 'places',
    sources: Array.from({ length: n }, (_, i) => ({ id: `s${String(i).padStart(3, '0')}`, name: `Name ${String(i).padStart(3, '0')}`, licence: 'OGL-Ontario', retrievedAt: '2026-11-01', tier: i % 2 === 0 ? 0 : 'E' })),
  },
];
const rowCount = (html: string) => (html.match(/<tr><th scope="row">/g) ?? []).length;
const firstRow = (html: string) => /<tbody><tr><th scope="row">([^<]*)</.exec(html)?.[1] ?? '';

describe('sort values', () => {
  it('writes and reads every choice', () => {
    expect(sortValue(null)).toBe(SORT_NONE);
    expect(SORT_CHOICES).toHaveLength(SORT_KEYS.length * 2);
    for (const spec of SORT_CHOICES) expect(parseSortValue(sortValue(spec))).toEqual(spec);
  });
  it('reads anything else as no sorting', () => {
    for (const v of [SORT_NONE, '', 'tier', 'tier:up', 'nope:asc', 'tier:asc:x', null, undefined]) expect(parseSortValue(v), String(v)).toBeNull();
  });
  it('labels each choice with the column name and the direction', () => {
    expect(sortChoiceLabel(null, 'en')).toBe('Order of the list');
    expect(sortChoiceLabel({ key: 'tier', dir: 'asc' }, 'en')).toBe('Tier, ascending');
    expect(sortChoiceLabel({ key: 'tier', dir: 'desc' }, 'fr')).toBe('Niveau, ordre décroissant');
    const labels = SORT_CHOICES.map((c) => sortChoiceLabel(c, 'en'));
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('how many rows to draw', () => {
  it('draws at least one step and never more than there are', () => {
    expect(clampLimit(LIVE_STEP, 500)).toBe(LIVE_STEP);
    expect(clampLimit(0, 500)).toBe(LIVE_STEP);
    expect(clampLimit(-5, 500)).toBe(LIVE_STEP);
    expect(clampLimit(NaN, 500)).toBe(LIVE_STEP);
    expect(clampLimit(120, 500)).toBe(120);
    expect(clampLimit(120.9, 500)).toBe(120);
    expect(clampLimit(120, 70)).toBe(70);
    expect(clampLimit(LIVE_STEP, 0)).toBe(0);
  });
  it('adds a full step, or what is left', () => {
    expect(nextStep(50, 500)).toBe(50);
    expect(nextStep(50, 60)).toBe(10);
    expect(nextStep(60, 60)).toBe(0);
    expect(nextStep(70, 60)).toBe(0);
  });
  it('says how many are shown, or that all are', () => {
    expect(showingText(50, 120, 'en')).toBe('Showing 50 of 120 listed sources.');
    expect(showingText(120, 120, 'en')).toBe('All 120 listed sources are shown.');
    expect(showingText(50, 120, 'fr')).toBe('Affichage de 50 des 120 sources de la liste.');
  });
});

describe('controls', () => {
  it('renders a labelled Sort by field with every choice and marks the current one', () => {
    const html = renderSortControl({ key: 'tier', dir: 'desc' }, 'en');
    expect(html).toContain('<label for="ds-f-sort">Sort by</label>');
    expect(html.match(/<option/g)).toHaveLength(SORT_CHOICES.length + 1);
    expect(html).toContain('<option value="tier:desc" selected>Tier, descending</option>');
    expect(renderSortControl(null, 'en')).toContain('<option value="none" selected>Order of the list</option>');
  });
  it('renders Show more only when rows are left, with the right count and plural', () => {
    expect(renderShowMoreHtml(50, 50, 'en')).toBe('');
    expect(renderShowMoreHtml(50, 51, 'en')).toContain('>Show 1 more source</button>');
    const html = renderShowMoreHtml(50, 500, 'en');
    expect(html).toContain(`data-action="${SHOW_MORE_ACTION}"`);
    expect(html).toContain('>Show 50 more sources</button>');
    expect(html).toContain('Showing 50 of 500 listed sources.');
    expect(renderShowMoreHtml(50, 52, 'fr')).toContain('>Afficher 2 sources de plus</button>');
  });
  it('pass the markup, target and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const html of [renderSortControl(null, locale), renderSortControl({ key: 'status', dir: 'asc' }, locale), renderShowMoreHtml(50, 120, locale)]) {
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        expect(targetsBelow44(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
  it('the Sort by field is in the live controls and not in the static form', () => {
    expect(renderFilterControls('en', NO_FILTERS, undefined, [], null)).toContain('id="ds-f-sort"');
    expect(renderFilterControls('en', NO_FILTERS)).not.toContain('id="ds-f-sort"');
    const page = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, live: { sort: null, limit: LIVE_STEP }, staticView: { action: '/x', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
    expect(page).not.toContain('id="ds-f-sort"');
    expect(page).not.toContain(`data-action="${SHOW_MORE_ACTION}"`);
  });
});

describe('the live list', () => {
  const audit = auditRegistry(many(120), NOW, {});

  it('draws the first step of a long list and offers the rest', () => {
    const html = renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: LIVE_STEP });
    expect(rowCount(html)).toBe(LIVE_STEP);
    expect(html).toContain('Showing 50 of 120 listed sources.');
    expect(html).toContain('>Show 50 more sources</button>');
  });
  it('draws everything, with no Show more, when the list is short or the limit covers it', () => {
    const short = renderSourcesRegion(auditRegistry(RECORDS, NOW, {}), 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: LIVE_STEP });
    expect(rowCount(short)).toBe(3);
    expect(short).not.toContain(SHOW_MORE_ACTION);
    const all = renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: 500 });
    expect(rowCount(all)).toBe(120);
    expect(all).not.toContain(SHOW_MORE_ACTION);
  });
  it('keeps drawing every row when no live state is given, as before', () => {
    expect(rowCount(renderSourcesRegion(audit, 'en', NO_FILTERS, NOW))).toBe(120);
  });
  it('sorts before cutting, so the first rows are the first in the chosen order', () => {
    const desc = renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: { key: 'source', dir: 'desc' }, limit: LIVE_STEP });
    expect(firstRow(desc)).toContain('Name 119');
    const asc = renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: { key: 'source', dir: 'asc' }, limit: LIVE_STEP });
    expect(firstRow(asc)).toContain('Name 000');
  });
  it('marks the sorted column on its heading, and no other', () => {
    const html = renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: { key: 'tier', dir: 'desc' }, limit: LIVE_STEP });
    expect(html.match(/aria-sort=/g)).toHaveLength(1);
    expect(html).toMatch(/<th scope="col" aria-sort="descending">Tier/);
    expect(renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: LIVE_STEP })).not.toContain('aria-sort');
  });
  it('the summary above the list still describes every listed source, not only the rows drawn', () => {
    const html = renderResultsHtml(audit, 'en', NO_FILTERS, NOW, undefined, undefined, { sort: null, limit: LIVE_STEP });
    expect(html).toContain('data-listed-summary="120"');
  });
  it('passes the audits with sorting and Show more on the panel, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderDataStatusPanel({ records: many(120), locale, now: NOW, live: { sort: { key: 'retrieved', dir: 'asc' }, limit: LIVE_STEP } });
      expect(html).toContain('id="ds-f-sort"');
      expect(scanHtml(html)).toEqual([]);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
});

describe('sorting and Show more on the mounted panel', () => {
  const mount = (n = 120, initialSort: { key: 'tier'; dir: 'asc' | 'desc' } | null = null) => {
    const host = new FakeHost();
    const seen: string[] = [];
    const records = many(n);
    const panel = mountDataStatusPanel(host, { getRecords: () => records, getLocale: () => 'en', now: () => NOW, initialSort, onFiltersChange: (s) => seen.push(s) });
    return { host, seen, panel };
  };

  it('starts with the first step and the Sort by field', () => {
    const { host, panel } = mount();
    expect(host.innerHTML).toContain('id="ds-f-sort"');
    expect(host.innerHTML).toContain('Showing 50 of 120 listed sources.');
    expect(panel.getSort()).toBeNull();
  });
  it('sorts when the field changes, says so, and puts the order in the address', () => {
    const { host, seen, panel } = mount();
    host.filter('change', 'sort', 'source:desc');
    expect(panel.getSort()).toEqual({ key: 'source', dir: 'desc' });
    expect(firstRow(host.region.innerHTML)).toContain('Name 119');
    expect(host.announce.innerHTML).toContain('Sorted by source, descending.');
    expect(seen.at(-1)).toBe('?sort=source&dir=desc');
    host.filter('change', 'sort', 'none');
    expect(panel.getSort()).toBeNull();
    expect(host.announce.innerHTML).toContain('Sorting removed.');
    expect(seen.at(-1)).toBe('');
  });
  it('keeps the filters in the address next to the order', () => {
    const { host, seen } = mount();
    host.filter('change', 'tier', 'E');
    host.filter('change', 'sort', 'tier:asc');
    expect(seen.at(-1)).toContain('tier=E');
    expect(seen.at(-1)).toContain('sort=tier');
  });
  it('treats an unreadable choice as no sorting', () => {
    const { host, panel } = mount(120, { key: 'tier', dir: 'asc' });
    expect(panel.getSort()).toEqual({ key: 'tier', dir: 'asc' });
    host.filter('change', 'sort', 'bogus');
    expect(panel.getSort()).toBeNull();
  });
  it('starts in the order it is given', () => {
    const { host } = mount(120, { key: 'tier', dir: 'desc' });
    expect(host.innerHTML).toContain('<option value="tier:desc" selected>');
    expect(host.innerHTML).toMatch(/<th scope="col" aria-sort="descending">Tier/);
  });
  it('Show more adds a step each time, says how many are shown, and stops at the end', () => {
    const { host } = mount();
    host.click(SHOW_MORE_ACTION);
    expect(rowCount(host.region.innerHTML)).toBe(100);
    expect(host.announce.innerHTML).toContain('Showing 100 of 120 listed sources.');
    host.click(SHOW_MORE_ACTION);
    expect(rowCount(host.region.innerHTML)).toBe(120);
    expect(host.region.innerHTML).not.toContain(SHOW_MORE_ACTION);
    expect(host.announce.innerHTML).toContain('All 120 listed sources are shown.');
    host.click(SHOW_MORE_ACTION);
    expect(rowCount(host.region.innerHTML)).toBe(120);
  });
  it('goes back to the first step when the filters or the order change', () => {
    const { host } = mount();
    host.click(SHOW_MORE_ACTION);
    host.filter('change', 'sort', 'source:asc');
    expect(rowCount(host.region.innerHTML)).toBe(LIVE_STEP);
    host.click(SHOW_MORE_ACTION);
    host.filter('input', 'query', 'name');
    expect(rowCount(host.region.innerHTML)).toBe(LIVE_STEP);
  });
  it('does nothing on Show more when the whole list is already drawn', () => {
    const { host } = mount(3);
    const before = host.region.innerHTML;
    host.click(SHOW_MORE_ACTION);
    expect(host.region.innerHTML).toBe(before);
  });
  it('clearing the filters keeps the chosen order', () => {
    const { host, panel } = mount();
    host.filter('change', 'sort', 'tier:desc');
    host.filter('change', 'tier', 'E');
    host.click('reset-filters');
    expect(panel.getSort()).toEqual({ key: 'tier', dir: 'desc' });
    expect(host.innerHTML).toContain('<option value="tier:desc" selected>');
  });
});

describe('the Unknown word in the tier quick filter', () => {
  it('is the panel’s own Unknown word in both languages', () => {
    expect(quickFilterLabel({ id: 'noTier', count: 2 }, 'en')).toBe('Tier: UNKNOWN (2)');
    expect(quickFilterLabel({ id: 'noTier', count: 2 }, 'fr')).toBe('Niveau : UNKNOWN (2)');
  });
});
