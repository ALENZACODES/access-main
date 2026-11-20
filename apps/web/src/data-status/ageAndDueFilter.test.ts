import { describe, expect, it } from 'vitest';
import { listActiveFilters, dueWindowLabel, withoutFilter } from './activeFilters';
import { AGE_BANDS, ageValueLabel, buildAgeDistribution, renderAgeBandsHtml } from './ageBands';
import { filterParts } from './announce';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { drillAction, drillFilters, drillLabel, parseDrillAction } from './drillDown';
import {
  ageFilterOf,
  applyFilters,
  daysUntilReview,
  DUE_WINDOW_DAYS,
  DUE_WINDOWS,
  FILTER_AGES,
  hasActiveFilters,
  isAgeFilter,
  isDueWindow,
  isDueWithin,
  NO_FILTERS,
  parseFilters,
  serializeFilters,
  type Filters,
} from './filters';
import { auditHtml, buildReviewQueue, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderFilterControls, scanHtml, visibleText } from './index';
import { buildQuickFilters, quickFilterFor, quickFilterLabel } from './quickFilters';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW, structureProblems, targetsBelow44 } from './testkit';

// Places are reviewed 180 days after retrieval, so an age of 170 days leaves 10 days.
const aged = (id: string, days: number | null) => ({ id, name: `Aged ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: days === null ? null : isoDayOffset(NOW, -days), tier: 0 });
const MIXED: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [aged('new', 3), aged('month', 60), aged('due5', 175), aged('due25', 155), aged('due80', 100), aged('today', 180), aged('past', 181), aged('old', 400), aged('none', null), { ...aged('future', 0), retrievedAt: '2031-01-01' }],
  },
];
const audit = auditRegistry(MIXED, NOW, {});
const ids = (f: Filters) => applyFilters(audit.sources, f).map((s) => s.sourceId).sort();
const byId = (id: string) => {
  const s = audit.sources.find((x) => x.sourceId === id);
  if (!s) throw new Error(id);
  return s;
};
const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };

describe('age filter', () => {
  it('offers every band and Unknown, and nothing else', () => {
    expect(FILTER_AGES).toEqual([...AGE_BANDS.map((b) => b.id), 'unknown']);
    for (const a of FILTER_AGES) expect(isAgeFilter(a)).toBe(true);
    for (const v of ['any', '', 'd0', 'D0_30', null, 30]) expect(isAgeFilter(v)).toBe(false);
  });
  it('puts each source in its band, and sources with no usable date under Unknown', () => {
    expect(ageFilterOf(byId('new'))).toBe('d0_30');
    expect(ageFilterOf(byId('month'))).toBe('d31_90');
    expect(ageFilterOf(byId('old'))).toBe('d366_plus');
    expect(ageFilterOf(byId('none'))).toBe('unknown');
    expect(ageFilterOf(byId('future'))).toBe('unknown');
  });
  it('keeps only the chosen band', () => {
    expect(ids({ ...NO_FILTERS, age: 'd0_30' })).toEqual(['new']);
    expect(ids({ ...NO_FILTERS, age: 'd91_180' })).toEqual(['due25', 'due5', 'due80', 'today']);
    expect(ids({ ...NO_FILTERS, age: 'unknown' })).toEqual(['future', 'none']);
  });
  it('lists exactly what the age table counts, for every row, on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const d = buildAgeDistribution(a, NOW);
      for (const b of d.bands) expect(applyFilters(a.sources, { ...NO_FILTERS, age: b.id }).length, `seed ${seed} ${b.id}`).toBe(b.count);
      expect(applyFilters(a.sources, { ...NO_FILTERS, age: 'unknown' }).length).toBe(d.unknown);
      expect(FILTER_AGES.reduce((n, age) => n + applyFilters(a.sources, { ...NO_FILTERS, age }).length, 0)).toBe(a.sources.length);
    }
  });
  it('reads and writes the query string, ignoring anything else', () => {
    expect(parseFilters('?age=d31_90').age).toBe('d31_90');
    expect(parseFilters('?age=unknown').age).toBe('unknown');
    for (const q of ['?age=any', '?age=', '?age=30', '?age=d31-90']) expect('age' in parseFilters(q), q).toBe(false);
    expect(serializeFilters({ ...NO_FILTERS, age: 'd366_plus' })).toBe('?age=d366_plus');
  });
  it('is named in words in both languages', () => {
    expect(ageValueLabel('d0_30', 'en')).toBe('0 to 30 days');
    expect(ageValueLabel('unknown', 'fr')).toBe('Date UNKNOWN');
    expect(ageValueLabel('nope', 'en')).toBeNull();
    expect(listActiveFilters({ ...NO_FILTERS, age: 'd0_30' }, 'en')).toEqual([{ key: 'age', label: 'Age of retrieved date: 0 to 30 days' }]);
    expect(filterParts({ ...NO_FILTERS, age: 'd0_30' }, 'en')).toEqual(['age of retrieved date 0 to 30 days']);
    const fr = listActiveFilters({ ...NO_FILTERS, age: 'unknown' }, 'fr')[0]?.label ?? '';
    expect(fr).toBe('Âge de la date de récupération : Date UNKNOWN');
    expect(lintFrench(fr)).toEqual([]);
  });
});

describe('review-date filter', () => {
  it('knows its windows', () => {
    expect([...DUE_WINDOWS]).toEqual(['d7', 'd30', 'd90']);
    expect(DUE_WINDOW_DAYS).toEqual({ d7: 7, d30: 30, d90: 90 });
    for (const w of DUE_WINDOWS) expect(isDueWindow(w)).toBe(true);
    for (const v of ['any', '', '30', 'd60', null]) expect(isDueWindow(v)).toBe(false);
  });
  it('counts days to the review date from the limit and the age, and gives nothing without a usable date', () => {
    expect(daysUntilReview(byId('due5'))).toBe(5);
    expect(daysUntilReview(byId('today'))).toBe(0);
    expect(daysUntilReview(byId('past'))).toBe(-1);
    expect(daysUntilReview(byId('none'))).toBeNull();
    expect(daysUntilReview(byId('future'))).toBeNull();
  });
  it('agrees with the review schedule for every source, on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const queue = new Map(buildReviewQueue(a, NOW).map((q) => [`${q.datasetId}|${q.sourceId}|${q.retrievedIso}`, q.daysUntil]));
      for (const s of a.sources) {
        const key = `${s.datasetId}|${s.sourceId}|${s.state === 'unknown' ? null : s.retrievedIso}`;
        if (queue.has(key)) expect(daysUntilReview(s), `seed ${seed} ${key}`).toBe(queue.get(key));
      }
    }
  });
  it('keeps sources whose review date is within the window and has not passed', () => {
    expect(ids({ ...NO_FILTERS, due: 'd7' })).toEqual(['due5', 'today']);
    expect(ids({ ...NO_FILTERS, due: 'd30' })).toEqual(['due25', 'due5', 'today']);
    expect(ids({ ...NO_FILTERS, due: 'd90' })).toEqual(['due25', 'due5', 'due80', 'today']);
  });
  it('never keeps a source that is past its date or has no usable date', () => {
    for (const w of DUE_WINDOWS) {
      for (const id of ['past', 'old', 'none', 'future']) expect(isDueWithin(byId(id), w), `${w} ${id}`).toBe(false);
    }
  });
  it('a wider window never lists fewer sources', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const n = DUE_WINDOWS.map((due) => applyFilters(a.sources, { ...NO_FILTERS, due }).length);
      expect(n[0]).toBeLessThanOrEqual(n[1] ?? 0);
      expect(n[1]).toBeLessThanOrEqual(n[2] ?? 0);
      expect(applyFilters(a.sources, { ...NO_FILTERS, due: 'd90', state: 'stale' })).toEqual([]);
    }
  });
  it('follows a changed review limit', () => {
    const shorter = auditRegistry(MIXED, NOW, { places: 70 });
    expect(applyFilters(shorter.sources, { ...NO_FILTERS, due: 'd30' }).map((s) => s.sourceId)).toEqual(['month']);
  });
  it('reads and writes the query string, and round-trips with every other filter', () => {
    expect(parseFilters('?due=d30').due).toBe('d30');
    for (const q of ['?due=any', '?due=', '?due=30']) expect('due' in parseFilters(q), q).toBe(false);
    const full: Filters = { state: 'fresh', kind: 'routes', query: 'abc', onlyIssues: true, tier: '2', licence: 'terms', dataset: 'r', gap: 'source', age: 'd31_90', due: 'd7' };
    expect(parseFilters(serializeFilters(full))).toEqual(full);
  });
  it('is named in words, counts as active, and can be removed alone', () => {
    const f: Filters = { ...NO_FILTERS, due: 'd7', age: 'd91_180' };
    expect(hasActiveFilters({ ...NO_FILTERS, due: 'd7' })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, age: 'unknown' })).toBe(true);
    expect(dueWindowLabel('d7', 'en')).toBe('Review due within 7 days');
    expect(dueWindowLabel('d90', 'fr')).toBe('Révision prévue d’ici 90 jours');
    expect(filterParts({ ...NO_FILTERS, due: 'd30' }, 'en')).toEqual(['review due within 30 days']);
    expect(filterParts({ ...NO_FILTERS, due: 'd30' }, 'fr')).toEqual(['révision prévue d’ici 30 jours']);
    expect(withoutFilter(f, 'due')).toEqual({ ...NO_FILTERS, age: 'd91_180' });
    expect(withoutFilter(f, 'age')).toEqual({ ...NO_FILTERS, due: 'd7' });
  });
});

describe('controls, quick filter and drill-down', () => {
  it('has labelled selects for age and review date in both languages', () => {
    const en = renderFilterControls('en', { ...NO_FILTERS, age: 'd31_90', due: 'd30' });
    expect(en).toContain('<label for="ds-f-age">Age of retrieved date</label>');
    expect(en).toContain('<option value="d31_90" selected>31 to 90 days</option>');
    expect(en).toContain('<label for="ds-f-due">Review date</label>');
    expect(en).toContain('<option value="d30" selected>Review due within 30 days</option>');
    const fr = renderFilterControls('fr', NO_FILTERS);
    expect(fr).toContain('<label for="ds-f-age">Âge de la date de récupération</label>');
    expect(fr).toContain('<label for="ds-f-due">Date de révision</label>');
  });
  it('offers a quick filter for reviews due within 30 days, with its count', () => {
    expect(quickFilterFor('dueSoon')).toEqual({ ...NO_FILTERS, due: 'd30' });
    const q = buildQuickFilters(audit).find((x) => x.id === 'dueSoon');
    expect(q?.count).toBe(3);
    expect(quickFilterLabel({ id: 'dueSoon', count: 3 }, 'en')).toBe('Review due within 30 days (3)');
    expect(quickFilterLabel({ id: 'dueSoon', count: 3 }, 'fr')).toBe('Révision prévue d’ici 30 jours (3)');
    expect(renderDataStatusPanel({ records: MIXED, locale: 'en', now: NOW })).toContain('data-action="quick:dueSoon"');
  });
  it('an age row is a drill-down target, named in words', () => {
    for (const value of FILTER_AGES) expect(parseDrillAction(drillAction({ kind: 'age', value }))).toEqual({ kind: 'age', value });
    expect(parseDrillAction('show:age:d1')).toBeNull();
    expect(drillFilters({ kind: 'age', value: 'unknown' })).toEqual({ ...NO_FILTERS, age: 'unknown' });
    expect(drillLabel({ kind: 'age', value: 'd0_30' }, 'en')).toBe('List these sources. Age of retrieved date: 0 to 30 days');
  });
  it('the age table offers a control on each row that counts a source, and none on an empty row', () => {
    const html = renderDataStatusPanel({ records: MIXED, locale: 'en', now: NOW });
    for (const id of FILTER_AGES) expect(html, id).toContain(`data-action="show:age:${id}"`);
    const one = renderDataStatusPanel({ records: [{ id: 'p', name: 'Places', kind: 'places', sources: [aged('new', 3)] }], locale: 'en', now: NOW });
    expect(one.match(/data-action="show:age:[^"]*"/g)).toEqual(['data-action="show:age:d0_30"']);
  });
  it('the extra column is absent unless asked for, and keeps every row the same width', () => {
    const d = buildAgeDistribution(audit, NOW);
    expect(renderAgeBandsHtml(d, 'en')).not.toContain('[x]');
    const html = renderAgeBandsHtml(d, 'en', { heading: 'Extra', cell: () => '[x]' });
    const rows = (/<table>[\s\S]*?<\/table>/.exec(html)?.[0] ?? '').match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
    expect(rows).toHaveLength(AGE_BANDS.length + 2);
    for (const r of rows) expect((r.match(/<t[hd][ >]/g) ?? []).length).toBe(4);
  });
  it('clicking an age control lists exactly the count beside it', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.click('show:age:d91_180');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, age: 'd91_180' });
    expect(seen.at(-1)).toBe('?age=d91_180');
    expect(host.innerHTML).toContain('data-listed-summary="4"');
    expect(host.innerHTML).toContain('<option value="d91_180" selected>');
    expect(host.focused.at(-1)).toBe('[data-action="show:age:d91_180"]');
  });
  it('the selects filter the list, combine, and can be cleared', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW });
    const rows = () => (host.region.innerHTML.match(/<tr><th scope="row">/g) ?? []).length;
    host.filter('change', 'due', 'd90');
    expect(rows()).toBe(4);
    expect(host.announce.innerHTML).toContain('review due within 90 days');
    host.filter('change', 'age', 'd91_180');
    expect(rows()).toBe(4);
    host.filter('change', 'due', 'd7');
    expect(rows()).toBe(2);
    host.filter('change', 'due', 'bogus');
    host.filter('change', 'age', 'bogus');
    expect(rows()).toBe(10);
  });
  it('are in the static form with links, and pass the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: MIXED, locale, now: NOW, staticView: sv, filters: { ...NO_FILTERS, age: 'd91_180', due: 'd30' } });
      expect(page).toContain('<select id="ds-f-age" name="age"');
      expect(page).toContain('<select id="ds-f-due" name="due"');
      expect(page).toContain('href="/en/data-status?age=unknown"');
      expect(page).toContain('href="/en/data-status?due=d30"');
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      expect(structureProblems(page)).toEqual([]);
      expect(targetsBelow44(page)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(page))).toEqual([]);
    }
  });
});
