import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, NO_FILTERS, parseFilters, serializeFilters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  buildQuickFilters,
  isQuickFilterActive,
  QUICK_FILTER_IDS,
  quickAction,
  quickFilterFor,
  quickFilterFromAction,
  quickFilterLabel,
  renderQuickFiltersHtml,
} from './quickFilters';
import { randomRegistry } from './round7Kit';
import { FakeHost, NOW, RECORDS, targetsBelow44 } from './testkit';

const audit = auditRegistry(RECORDS, NOW, {});
const CLEAN: DatasetRecord[] = [{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 's', source: 'P', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', tier: 0 }] }];
const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };

describe('quick filter presets', () => {
  it('gives a fresh copy each time, with every other filter cleared', () => {
    const a = quickFilterFor('stale');
    a.query = 'changed';
    expect(quickFilterFor('stale')).toEqual({ ...NO_FILTERS, state: 'stale' });
    expect(quickFilterFor('review')).toEqual({ ...NO_FILTERS, onlyIssues: true });
    expect(quickFilterFor('undated')).toEqual({ ...NO_FILTERS, state: 'unknown' });
    expect(quickFilterFor('noTier')).toEqual({ ...NO_FILTERS, tier: 'unknown' });
    expect(quickFilterFor('licence')).toEqual({ ...NO_FILTERS, licence: 'unrecognised' });
  });
  it('survives a trip through the query string', () => {
    for (const id of QUICK_FILTER_IDS) expect(parseFilters(serializeFilters(quickFilterFor(id)))).toEqual(quickFilterFor(id));
  });
  it('maps to and from the action name, and rejects anything else', () => {
    for (const id of QUICK_FILTER_IDS) expect(quickFilterFromAction(quickAction(id))).toBe(id);
    for (const a of ['quick:', 'quick:nope', 'review', 'reset-filters', '', null, undefined]) expect(quickFilterFromAction(a)).toBeNull();
  });
  it('is active only when the filters are exactly the preset', () => {
    expect(isQuickFilterActive('stale', { ...NO_FILTERS, state: 'stale' })).toBe(true);
    expect(isQuickFilterActive('stale', { ...NO_FILTERS, state: 'stale', query: 'x' })).toBe(false);
    expect(isQuickFilterActive('stale', NO_FILTERS)).toBe(false);
    expect(isQuickFilterActive('noTier', { ...NO_FILTERS, tier: 'unknown' })).toBe(true);
  });
});

describe('buildQuickFilters', () => {
  it('counts what each filter would list on the sample registry', () => {
    expect(buildQuickFilters(audit).map((q) => [q.id, q.count])).toEqual([['review', 2], ['stale', 1], ['dueSoon', 0], ['undated', 1], ['noTier', 1], ['licence', 1]]);
  });
  it('always agrees with applying the filter, on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const q of buildQuickFilters(a)) expect(q.count, `seed ${seed} ${q.id}`).toBe(applyFilters(a.sources, q.filters).length);
    }
  });
  it('gives zero for everything on an empty registry', () => {
    expect(buildQuickFilters(auditRegistry([], NOW, {})).every((q) => q.count === 0)).toBe(true);
  });
});

describe('renderQuickFiltersHtml', () => {
  it('offers a button for each filter that lists something, with its count', () => {
    const html = renderQuickFiltersHtml(buildQuickFilters(audit), 'en', { active: NO_FILTERS });
    expect(html).toContain('data-action="quick:review" aria-pressed="false"');
    expect(html).toContain('>Needs review (2)</button>');
    expect(html).toContain('>Tier: Unknown (1)</button>');
    expect(html).toContain('>Licence not on the reference list (1)</button>');
    expect(html.match(/<button/g)).toHaveLength(5);
  });
  it('leaves out filters that would list nothing', () => {
    const items = buildQuickFilters(audit).map((q) => (q.id === 'stale' ? { ...q, count: 0 } : q));
    const html = renderQuickFiltersHtml(items, 'en', { active: NO_FILTERS });
    expect(html).not.toContain('quick:stale');
    expect(html.match(/<button/g)).toHaveLength(4);
  });
  it('says there is nothing to jump to when no filter lists anything', () => {
    const html = renderQuickFiltersHtml(buildQuickFilters(auditRegistry(CLEAN, NOW, {})), 'en', { active: NO_FILTERS });
    expect(html).toContain('No source needs review, so there is nothing to jump to.');
    expect(html).not.toContain('<button');
  });
  it('marks the filter in force as pressed', () => {
    const html = renderQuickFiltersHtml(buildQuickFilters(audit), 'en', { active: quickFilterFor('noTier') });
    expect(html).toContain('data-action="quick:noTier" aria-pressed="true"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
  it('renders links, not buttons, when given a link builder', () => {
    const html = renderQuickFiltersHtml(buildQuickFilters(audit), 'en', { active: quickFilterFor('stale'), hrefFor: (f) => `/x${serializeFilters(f)}` });
    expect(html).not.toContain('<button');
    expect(html).toContain('<a href="/x?state=stale" aria-current="true"');
    expect(html).toContain('<a href="/x?tier=unknown" style=');
  });
  it('labels in French', () => {
    expect(quickFilterLabel({ id: 'review', count: 3 }, 'fr')).toBe('À examiner (3)');
    expect(quickFilterLabel({ id: 'noTier', count: 1 }, 'fr')).toBe('Niveau\u00A0: Inconnu (1)');
  });
  it('passes the markup, target and wording audits in both languages, as buttons and as links', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const opts of [{ active: NO_FILTERS }, { active: NO_FILTERS, hrefFor: () => '/x' }]) {
        for (const a of [audit, auditRegistry(CLEAN, NOW, {})]) {
          const html = renderQuickFiltersHtml(buildQuickFilters(a), locale, opts);
          expect(scanHtml(html)).toEqual([]);
          expect(describeProblems(auditHtml(html))).toEqual([]);
          expect(targetsBelow44(html)).toEqual([]);
          if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
        }
      }
    }
  });
});

describe('quick filters on the panel', () => {
  it('sits before the filter controls and is in the contents list', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    expect(html.indexOf('id="ds-quick-title"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="ds-quick-title"')).toBeLessThan(html.indexOf('id="ds-f-state"'));
    expect(html).toContain('href="#ds-quick-title"');
  });
  it('applies the filter, re-renders the controls to match, tells the page and says what changed', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.click('quick:noTier');
    expect(host.innerHTML).toContain('<option value="unknown" selected>');
    expect(host.innerHTML).toContain('data-action="quick:noTier" aria-pressed="true"');
    expect(seen.at(-1)).toContain('tier=unknown');
    expect(host.announce.innerHTML).toContain('tier unknown');
    host.click('quick:stale');
    expect(host.innerHTML).toContain('data-action="quick:stale" aria-pressed="true"');
    expect(host.innerHTML).toContain('data-action="quick:noTier" aria-pressed="false"');
    expect(seen.at(-1)).toContain('state=stale');
    expect(seen.at(-1)).not.toContain('tier=');
  });
  it('replaces filters that were set by hand', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.filter('input', 'query', 'alpha');
    host.click('quick:review');
    expect(seen.at(-1)).toContain('issues=1');
    expect(seen.at(-1)).not.toContain('q=');
  });
  it('ignores an action that only looks like a quick filter', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.click('quick:bogus');
    expect(seen).toEqual([]);
  });
  it('uses links that keep the thresholds in the static view', () => {
    const page = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW, staticView: sv, thresholds: { places: 30 } });
    expect(page).toContain('href="/en/data-status?tier=unknown&amp;stale_places=30"');
    expect(page).not.toContain('data-action="quick:');
    expect(describeProblems(auditHtml(page))).toEqual([]);
  });
});
