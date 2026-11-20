import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { buildPeriodDiff, MAX_PERIOD_DIFF_NAMES, periodDiffChangedText, renderPeriodDiffHtml } from './periodDiff';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW, structureProblems } from './testkit';

const src = (id: string, days: number | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: days === null ? null : isoDayOffset(NOW, -days), tier: 0, ...over });
// Places default to 180 days, routes to 120.
const RECORDS: DatasetRecord[] = [
  { id: 'p', name: 'Places', kind: 'places', sources: [src('a', 10), src('b', 100), src('c', 200), src('d', 400), src('e', null)] },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('f', 61), src('g', 130)] },
];
const diff = (thresholds: Record<string, number>, records: DatasetRecord[] = RECORDS) => buildPeriodDiff(records, NOW, thresholds);
const ids = (list: { sourceId: string }[]) => list.map((s) => s.sourceId).sort();

describe('buildPeriodDiff', () => {
  it('has nothing to list with the defaults, or with a value equal to the default', () => {
    expect(diff({})).toEqual({ changed: [], nowMarked: [], noLongerMarked: [] });
    expect(diff({ places: 180 })).toEqual({ changed: [], nowMarked: [], noLongerMarked: [] });
  });
  it('lists the sources a shorter period marks', () => {
    const d = diff({ places: 90 });
    expect(d.changed).toEqual([{ kind: 'places', days: 90, defaultDays: 180 }]);
    expect(ids(d.nowMarked)).toEqual(['b']);
    expect(d.noLongerMarked).toEqual([]);
  });
  it('lists the sources a longer period no longer marks', () => {
    const d = diff({ places: 365 });
    expect(d.nowMarked).toEqual([]);
    expect(ids(d.noLongerMarked)).toEqual(['c']);
  });
  it('handles several kinds at once, each in the fixed order', () => {
    const d = diff({ routes: 60, places: 730 });
    expect(d.changed.map((c) => c.kind)).toEqual(['places', 'routes']);
    expect(ids(d.nowMarked)).toEqual(['f']);
    expect(ids(d.noLongerMarked)).toEqual(['c', 'd']);
  });
  it('lists nothing when the chosen period marks the same sources', () => {
    const d = diff({ places: 190 });
    expect(d.changed).toHaveLength(1);
    expect(d.nowMarked).toEqual([]);
    expect(d.noLongerMarked).toEqual([]);
  });
  it('never lists a source with no usable date', () => {
    for (const days of [30, 60, 365, 730]) {
      const d = diff({ places: days });
      expect([...ids(d.nowMarked), ...ids(d.noLongerMarked)]).not.toContain('e');
    }
  });
  it('compares records that share both ids one with one', () => {
    const twice: DatasetRecord[] = [{ id: 'x', name: 'X', kind: 'places', sources: [src('same', 100), src('same', 100), src('same', 10)] }];
    const d = diff({ places: 90 }, twice);
    expect(d.nowMarked).toHaveLength(2);
  });
  it('agrees with two audits on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const records = randomRegistry(seed, NOW);
      const thresholds = { places: 30 + (seed % 5) * 60, routes: 365, transit: 730 };
      const chosen = auditRegistry(records, NOW, thresholds).sources.filter((s) => s.state === 'stale').length;
      const byDefault = auditRegistry(records, NOW, {}).sources.filter((s) => s.state === 'stale').length;
      const d = buildPeriodDiff(records, NOW, thresholds);
      expect(chosen - byDefault, `seed ${seed}`).toBe(d.nowMarked.length - d.noLongerMarked.length);
      for (const s of d.nowMarked) expect(s.state).toBe('stale');
      for (const s of d.noLongerMarked) expect(s.state).toBe('fresh');
    }
  });
});

describe('the words and the markup', () => {
  it('names the periods chosen with the default beside each', () => {
    expect(periodDiffChangedText(diff({ places: 90, routes: 365 }), 'en')).toBe('Places, 90 days in place of 180; Routes, 365 days in place of 120');
    expect(lintFrench(periodDiffChangedText(diff({ places: 90, routes: 365 }), 'fr'))).toEqual([]);
  });
  it('says the defaults are in use', () => {
    const html = renderPeriodDiffHtml(diff({}), 'en');
    expect(html).toContain('data-period-diff="0"');
    expect(html).not.toContain('<ul');
    expect(visibleText(html)).toContain('The default review periods are in use');
  });
  it('says the same sources are marked when a period changes nothing', () => {
    const html = renderPeriodDiffHtml(diff({ places: 190 }), 'en');
    expect(visibleText(html)).toContain('Periods chosen here: Places, 190 days in place of 180.');
    expect(visibleText(html)).toContain('the same sources are marked possibly out of date as with the defaults');
    expect(html).not.toContain('<ul');
  });
  it('lists both directions under their own sentence', () => {
    const html = renderPeriodDiffHtml(diff({ routes: 60, places: 730 }), 'en');
    expect(html).toContain('data-period-diff="3"');
    expect(visibleText(html)).toContain('1 source is marked possibly out of date only because of a period chosen here:');
    expect(visibleText(html)).toContain('2 sources would be marked with the default periods and are not marked now:');
    expect(/<ul data-list="now">(.*?)<\/ul>/.exec(html)?.[1]?.match(/<li>/g)).toHaveLength(1);
    expect(/<ul data-list="gone">(.*?)<\/ul>/.exec(html)?.[1]?.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('<li>Routes / Name f</li>');
  });
  it('shows a few names and says how many more', () => {
    const many: DatasetRecord[] = [{ id: 'm', name: 'Many', kind: 'places', sources: Array.from({ length: 12 }, (_, i) => src(`s${i}`, 100 + i)) }];
    const html = renderPeriodDiffHtml(diff({ places: 90 }, many), 'en');
    expect(html.match(/<li>/g)).toHaveLength(MAX_PERIOD_DIFF_NAMES);
    expect(visibleText(html)).toContain(`And ${12 - MAX_PERIOD_DIFF_NAMES} more.`);
    expect(renderPeriodDiffHtml(diff({ places: 90 }, many), 'en', 11)).toContain('And 1 more.');
  });
  it('escapes names, and passes the audits in both languages', () => {
    const odd: DatasetRecord[] = [{ id: 'x', name: '<b>X</b>', kind: 'places', sources: [src('a', 100, { name: '<script>1</script>' })] }];
    expect(renderPeriodDiffHtml(diff({ places: 90 }, odd), 'en')).not.toContain('<script>');
    for (const locale of ['en', 'fr'] as const) {
      for (const thresholds of [{}, { places: 190 }, { routes: 60, places: 730 }] as Record<string, number>[]) {
        const html = renderPeriodDiffHtml(diff(thresholds), locale);
        expect(scanHtml(html)).toEqual([]);
        expect(structureProblems(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html.replace(/<li>.*?<\/li>/g, '')))).toEqual([]);
      }
    }
  });
});

describe('in the panel', () => {
  it('sits inside the review-periods section and follows the period chosen', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW });
    expect(host.innerHTML).toContain('data-period-diff="0"');
    host.filter('change', 'periodDays', '90');
    expect(host.innerHTML).toContain('data-period-diff="1"');
    expect(host.innerHTML).toContain('<li>Places / Name b</li>');
    host.filter('change', 'periodDays', 'default');
    expect(host.innerHTML).toContain('data-period-diff="0"');
    const section = /<section aria-labelledby="ds-periods-title".*?<\/section>\s*(?=<section aria-labelledby="ds-(?!perioddiff))/s.exec(host.innerHTML)?.[0] ?? '';
    expect(section).toContain('id="ds-perioddiff-title"');
  });
  it('is on the page without scripts too, and the whole panel passes the audits', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW, thresholds: { places: 90 }, staticView: { action: `/${locale}/data-status`, csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
      expect(page).toContain(renderPeriodDiffHtml(diff({ places: 90 }), locale));
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
});
