import { describe, expect, it } from 'vitest';
import { describeList, filterParts } from './announce';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, FILTER_TIERS, hasActiveFilters, isTierFilter, NO_FILTERS, parseFilters, serializeFilters, type Filters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderFilterControls, renderSourcesRegion, scanHtml, visibleText } from './index';
import { applySort, isSortKey, parseSort } from './sorting';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';
import { readTier, TIER_IDS, tierOf } from './tierValue';
import { tallyTiers } from './tiers';

const MIXED: DatasetRecord[] = [
  {
    id: 'd',
    name: 'Set',
    kind: 'places',
    sources: [
      { id: 'e', name: 'Echo', tier: 'E' },
      { id: 'n', name: 'None' },
      { id: 'z', name: 'Zero', tier: 0 },
      { id: 't', name: 'Three', tier: '3' },
      { id: 'x', name: 'Odd', tier: 'gold' },
    ],
  },
];
const audit = auditRegistry(MIXED, NOW, {});
const ids = (f: Filters) => applyFilters(audit.sources, f).map((s) => s.sourceId);

describe('tier on each audited source', () => {
  it('carries the tier, or null when none is usable', () => {
    const byId = Object.fromEntries(audit.sources.map((s) => [s.sourceId, s.tier]));
    expect(byId).toEqual({ e: 'E', n: null, z: '0', t: '3', x: null });
  });
  it('agrees with reading the tier directly', () => {
    for (const raw of [0, 4, 'e', 'x', null, undefined, 9, '']) {
      const read = readTier(raw);
      expect(tierOf(raw)).toBe(read.kind === 'tier' ? read.tier : null);
    }
  });
  it('tallies from the audit to the same counts as the sample registry', () => {
    const tally = tallyTiers(auditRegistry(RECORDS, NOW, {}).sources);
    expect(tally.counts['0']).toBe(1);
    expect(tally.counts.E).toBe(1);
    expect(tally.unknown).toBe(1);
    expect(tally.total).toBe(3);
  });
});

describe('tier filter', () => {
  it('offers every tier and Unknown', () => {
    expect(FILTER_TIERS).toEqual([...TIER_IDS, 'unknown']);
    for (const v of FILTER_TIERS) expect(isTierFilter(v)).toBe(true);
    for (const v of ['any', '', '5', 'e', null, 0]) expect(isTierFilter(v)).toBe(false);
  });
  it('keeps only the chosen tier', () => {
    expect(ids({ ...NO_FILTERS, tier: 'E' })).toEqual(['e']);
    expect(ids({ ...NO_FILTERS, tier: '0' })).toEqual(['z']);
    expect(ids({ ...NO_FILTERS, tier: '4' })).toEqual([]);
  });
  it('keeps records with no usable tier under Unknown, including text that is not a tier', () => {
    expect(ids({ ...NO_FILTERS, tier: 'unknown' }).sort()).toEqual(['n', 'x']);
  });
  it('keeps everything when no tier is chosen', () => {
    expect(ids(NO_FILTERS)).toHaveLength(5);
  });
  it('combines with the other filters', () => {
    expect(ids({ ...NO_FILTERS, tier: '3', query: 'three' })).toEqual(['t']);
    expect(ids({ ...NO_FILTERS, tier: '3', query: 'zero' })).toEqual([]);
  });
  it('counts as an active filter', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, tier: 'unknown' })).toBe(true);
  });
  it('reads the tier from the query string and ignores anything else', () => {
    expect(parseFilters('?tier=E').tier).toBe('E');
    expect(parseFilters('tier=unknown').tier).toBe('unknown');
    for (const q of ['?tier=e', '?tier=9', '?tier=', '?tier=any', '']) expect('tier' in parseFilters(q), q).toBe(false);
    expect(parseFilters('?tier=9')).toEqual(NO_FILTERS);
  });
  it('writes the tier to the query string only when one is chosen, and reads it back', () => {
    expect(serializeFilters(NO_FILTERS)).toBe('');
    expect(serializeFilters({ ...NO_FILTERS, tier: '2' })).toBe('?tier=2');
    for (const tier of FILTER_TIERS) {
      const f: Filters = { state: 'stale', kind: 'places', query: 'abc', onlyIssues: true, tier };
      expect(parseFilters(serializeFilters(f))).toEqual(f);
    }
  });
});

describe('tier column and sort', () => {
  it('accepts tier as a sort key', () => {
    expect(isSortKey('tier')).toBe(true);
    expect(parseSort('?sort=tier&dir=desc')).toEqual({ key: 'tier', dir: 'desc' });
  });
  it('sorts in the fixed tier order with Unknown last, in both directions', () => {
    const asc = applySort(audit.sources, { key: 'tier', dir: 'asc' }, 'en').map((s) => s.tier);
    expect(asc).toEqual(['0', '3', 'E', null, null]);
    const desc = applySort(audit.sources, { key: 'tier', dir: 'desc' }, 'en').map((s) => s.tier);
    expect(desc).toEqual(['E', '3', '0', null, null]);
  });
  it('keeps the original order among records with the same tier', () => {
    const unknown = applySort(audit.sources, { key: 'tier', dir: 'desc' }, 'en').filter((s) => s.tier === null).map((s) => s.sourceId);
    expect(unknown).toEqual(audit.sources.filter((s) => s.tier === null).map((s) => s.sourceId));
  });
  it('shows the tier in the last cell of each row', () => {
    const html = renderSourcesRegion(audit, 'en', NO_FILTERS, NOW);
    expect(html).toMatch(/<th scope="col"[^>]*>Tier<\/th><\/tr>/);
    expect(html.match(/<td>E<\/td><\/tr>/g)).toHaveLength(1);
    expect(html.match(/<td>Unknown<\/td><\/tr>/g)).toHaveLength(2);
    expect(renderSourcesRegion(audit, 'fr', NO_FILTERS, NOW).match(/<td>Inconnu<\/td><\/tr>/g)).toHaveLength(2);
  });
  it('shows only the matching rows when a tier is chosen', () => {
    const html = renderSourcesRegion(audit, 'en', { ...NO_FILTERS, tier: 'E' }, NOW);
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(1);
    expect(html).toContain('Echo');
  });
});

describe('tier control on the panel', () => {
  it('has a labelled tier select with every option, and marks the chosen one', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderFilterControls(locale, { ...NO_FILTERS, tier: 'E' });
      expect(html).toContain(`<label for="ds-f-tier">${locale === 'en' ? 'Tier' : 'Niveau'}</label>`);
      expect(html).toContain('<option value="E" selected>E</option>');
      expect(html).toContain(`<option value="unknown">${locale === 'en' ? 'Unknown' : 'Inconnu'}</option>`);
      expect(html.match(/<select id="ds-f-tier"[\s\S]*?<\/select>/)?.[0].match(/<option/g)).toHaveLength(FILTER_TIERS.length + 1);
    }
    expect(renderFilterControls('en', NO_FILTERS)).toMatch(/<select id="ds-f-tier"[^>]*><option value="any" selected>/);
  });
  it('is part of the GET form in the static view, and survives in the sort links', () => {
    const page = renderDataStatusPanel({
      records: MIXED,
      locale: 'en',
      now: NOW,
      filters: { ...NO_FILTERS, tier: '0' },
      staticView: { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' },
      table: { sort: null, paging: { page: 1, size: 25 } },
    });
    expect(page).toContain('<select id="ds-f-tier" name="tier"');
    expect(page).toMatch(/href="[^"]*tier=0[^"]*sort=tier/);
    expect(scanHtml(page)).toEqual([]);
    expect(describeProblems(auditHtml(page))).toEqual([]);
  });
  it('passes the audits with a tier chosen, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderDataStatusPanel({ records: MIXED, locale, now: NOW, filters: { ...NO_FILTERS, tier: 'unknown' } });
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
  it('filters the list when the select changes, tells the page, and says what changed', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, onFiltersChange: (search) => seen.push(search) });
    host.filter('change', 'tier', 'E');
    expect(host.region.innerHTML.match(/<tr><th scope="row">/g)).toHaveLength(1);
    expect(seen.at(-1)).toContain('tier=E');
    expect(host.announce.innerHTML).toContain('tier E');
    host.filter('change', 'tier', 'unknown');
    expect(host.region.innerHTML.match(/<tr><th scope="row">/g)).toHaveLength(2);
    expect(host.announce.innerHTML).toContain('tier unknown');
    host.filter('change', 'tier', 'any');
    expect(host.region.innerHTML.match(/<tr><th scope="row">/g)).toHaveLength(5);
    expect(seen.at(-1)).not.toContain('tier=');
  });
  it('ignores a value that is not a tier, and clears the tier with the other filters', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW });
    host.filter('change', 'tier', '3');
    host.filter('change', 'tier', 'bogus');
    expect(host.region.innerHTML.match(/<tr><th scope="row">/g)).toHaveLength(5);
    host.filter('change', 'tier', '3');
    host.click('reset-filters');
    expect(host.innerHTML).toMatch(/<select id="ds-f-tier"[^>]*><option value="any" selected>/);
    expect(host.innerHTML).not.toContain('<option value="3" selected>');
  });
});

describe('spoken description of a tier filter', () => {
  it('names the tier, or says it is unknown, in both languages', () => {
    expect(filterParts({ ...NO_FILTERS, tier: '2' }, 'en')).toEqual(['tier 2']);
    expect(filterParts({ ...NO_FILTERS, tier: 'unknown' }, 'en')).toEqual(['tier unknown']);
    expect(filterParts({ ...NO_FILTERS, tier: 'E' }, 'fr')).toEqual(['niveau E']);
    expect(filterParts({ ...NO_FILTERS, tier: 'unknown' }, 'fr')).toEqual(['niveau inconnu']);
    expect(filterParts(NO_FILTERS, 'en')).toEqual([]);
  });
  it('includes the tier in the full description of the list', () => {
    const text = describeList({ shown: 1, total: 5, filters: { ...NO_FILTERS, tier: 'E' }, sort: { key: 'tier', dir: 'asc' }, page: 1, pages: 1 }, 'en');
    expect(text).toContain('tier E');
    expect(text).toContain('tier');
  });
});
