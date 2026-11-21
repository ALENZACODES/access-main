import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { NO_FILTERS } from './filters';
import { DATASET_KINDS, DEFAULT_STALE_DAYS } from './freshnessPolicy';
import { handleDataStatus } from './http';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import {
  buildPeriodWhatIf,
  describePeriodChange,
  describePeriodKind,
  isUsablePeriod,
  parsePeriodKind,
  parsePeriodValue,
  PERIOD_PRESETS,
  periodChoices,
  periodNowText,
  periodUndatedNote,
  renderPeriodEditor,
  renderPeriodFields,
  renderPeriodWhatIfHtml,
  staleUnder,
  withPeriod,
} from './reviewPeriods';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW, structureProblems } from './testkit';
import { parseThresholds } from './thresholds';

const src = (id: string, days: number | null, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: days === null ? null : isoDayOffset(NOW, -days), tier: 0, ...over });
// Places default to 180 days, routes to 120.
const RECORDS: DatasetRecord[] = [
  { id: 'p', name: 'Places', kind: 'places', sources: [src('a', 10), src('b', 45), src('c', 100), src('d', 200), src('e', 400), src('f', null), src('g', -5)] },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('h', 61), src('i', 130)] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const places = audit.sources.filter((s) => s.kind === 'places');

describe('periods a person can choose', () => {
  it('accepts whole numbers of days in range only', () => {
    for (const ok of [1, 30, 3650]) expect(isUsablePeriod(ok)).toBe(true);
    for (const bad of [0, -3, 3651, 1.5, NaN, Infinity, '30', null]) expect(isUsablePeriod(bad)).toBe(false);
  });
  it('offers the presets, the default of the kind and the period in use, in order and once each', () => {
    expect(periodChoices('places')).toEqual([...PERIOD_PRESETS]);
    expect(periodChoices('places', { places: 45 })).toEqual([30, 45, 60, 90, 120, 180, 365, 730]);
    for (const kind of DATASET_KINDS) {
      const choices = periodChoices(kind, { [kind]: 77 });
      expect(choices).toContain(DEFAULT_STALE_DAYS[kind]);
      expect(choices).toContain(77);
      expect(choices).toEqual([...new Set(choices)].sort((a, b) => a - b));
    }
  });
  it('reads the value of the list: days, or the default', () => {
    expect(parsePeriodValue('90')).toBe(90);
    for (const v of ['default', '', '0', '-90', '9.5', '99999', '90 days', ' 90']) expect(parsePeriodValue(v), v).toBeNull();
    expect(parsePeriodKind('routes')).toBe('routes');
    for (const v of ['', 'any', 'Places', 'constructor']) expect(parsePeriodKind(v), v).toBeNull();
  });
  it('sets one kind, and removes the setting for the default or a value that cannot be used', () => {
    const start = { routes: 60 };
    expect(withPeriod(start, 'places', 90)).toEqual({ routes: 60, places: 90 });
    expect(withPeriod({ places: 90 }, 'places', 180)).toEqual({});
    expect(withPeriod({ places: 90 }, 'places', null)).toEqual({});
    expect(withPeriod({ places: 90 }, 'places', 0)).toEqual({});
    expect(withPeriod({ places: 90 }, 'places', 30)).toEqual({ places: 30 });
    expect(start).toEqual({ routes: 60 });
  });
});

describe('staleUnder', () => {
  it('counts sources retrieved more than the period ago, and never one with no usable date', () => {
    expect(staleUnder(places, 180)).toBe(2);
    expect(staleUnder(places, 30)).toBe(4);
    expect(staleUnder(places, 730)).toBe(0);
    expect(staleUnder(places, 0)).toBe(5);
  });
  it('uses "more than", so a source exactly at the period is not counted', () => {
    expect(staleUnder(places, 200)).toBe(1);
    expect(staleUnder(places, 199)).toBe(2);
    expect(staleUnder(places, 100)).toBe(2);
    expect(staleUnder(places, 99)).toBe(3);
  });
  it('agrees with the audit for the period in force, on random registries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const thresholds = seed % 3 === 0 ? { places: 60, routes: 365 } : {};
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, thresholds);
      const d = buildPeriodWhatIf(a, thresholds);
      expect(d.rows.reduce((n, r) => n + r.now, 0), `seed ${seed}`).toBe(a.sources.filter((s) => s.state === 'stale').length);
      expect(d.rows.reduce((n, r) => n + r.total, 0)).toBe(a.sources.length);
      for (const r of d.rows) {
        // A longer period never marks more sources.
        expect(r.counts).toEqual([...r.counts].sort((x, y) => y - x));
        expect(r.counts.every((c) => c <= r.total - r.undated)).toBe(true);
      }
    }
  });
});

describe('buildPeriodWhatIf', () => {
  const d = buildPeriodWhatIf(audit);
  it('has a row for each kind of data in use, in the fixed order', () => {
    expect(d.rows.map((r) => r.kind)).toEqual(['places', 'routes']);
    expect(d.sourceCount).toBe(9);
  });
  it('gives the period in use, the count under it and the count under each preset', () => {
    expect(d.rows[0]).toEqual({ kind: 'places', current: 180, custom: false, total: 7, undated: 2, counts: [4, 3, 3, 2, 2, 1, 0], now: 2 });
    expect(d.rows[1]).toEqual({ kind: 'routes', current: 120, custom: false, total: 2, undated: 0, counts: [2, 2, 1, 1, 0, 0, 0], now: 1 });
  });
  it('follows a period chosen here', () => {
    const custom = buildPeriodWhatIf(auditRegistry(RECORDS, NOW, { places: 45 }), { places: 45 });
    expect(custom.rows[0]).toMatchObject({ current: 45, custom: true, now: 3 });
    expect(custom.rows[0]?.counts).toEqual(d.rows[0]?.counts);
  });
  it('is empty for an empty registry', () => {
    expect(buildPeriodWhatIf(auditRegistry([], NOW, {}))).toEqual({ rows: [], sourceCount: 0 });
  });
});

describe('the words', () => {
  const d = buildPeriodWhatIf(audit);
  it('says the period in use and how many it marks', () => {
    expect(periodNowText(d.rows[0]!, 'en')).toBe('180 days: 2 sources marked');
    expect(periodNowText(d.rows[1]!, 'en')).toBe('120 days: 1 source marked');
    expect(periodNowText({ ...d.rows[1]!, custom: true, current: 60, now: 2 }, 'en')).toBe('60 days, chosen here: 2 sources marked');
    expect(lintFrench(periodNowText(d.rows[0]!, 'fr'))).toEqual([]);
  });
  it('notes the sources no period can mark, or nothing', () => {
    expect(periodUndatedNote(d, 'en')).toBe('2 sources have no usable retrieved date, so no period can mark them.');
    expect(periodUndatedNote({ rows: [d.rows[1]!], sourceCount: 2 }, 'en')).toBeNull();
    expect(periodUndatedNote({ rows: [{ ...d.rows[1]!, undated: 1 }], sourceCount: 2 }, 'en')).toBe('1 source has no usable retrieved date, so no period can mark it.');
  });
  it('says what a change did, with the count before', () => {
    expect(describePeriodChange('places', 90, 3, 2, 'en')).toBe('Review period for Places set to 90 days. 3 sources of that kind are now marked possibly out of date (it was 2).');
    expect(describePeriodChange('places', 730, 1, 2, 'en')).toBe('Review period for Places set to 730 days. 1 source of that kind is now marked possibly out of date (it was 2).');
    expect(describePeriodChange('places', 180, 2, 3, 'en')).toBe('Review period for Places back to the default, 180 days. 2 sources of that kind are now marked possibly out of date (it was 3).');
    expect(describePeriodKind('routes', 120, 'en')).toBe('Review period for Routes: 120 days.');
    for (const text of [describePeriodChange('places', 90, 3, 2, 'fr'), describePeriodChange('routes', 120, 1, 0, 'fr'), describePeriodKind('routes', 120, 'fr')]) expect(lintFrench(text), text).toEqual([]);
  });
  it('never says how often a publisher updates', () => {
    for (const locale of ['en', 'fr'] as const) {
      const text = visibleText(renderPeriodWhatIfHtml(d, locale));
      expect(text).not.toMatch(/updates every|updated every|mis à jour tous les|mise à jour tous les/i);
    }
    expect(visibleText(renderPeriodWhatIfHtml(d, 'en'))).toContain('Trying another period changes no record.');
  });
});

describe('markup', () => {
  const d = buildPeriodWhatIf(audit);
  it('has a row per kind, a column per preset, and the note', () => {
    const html = renderPeriodWhatIfHtml(d, 'en');
    expect(html).toContain('data-period-rows="2"');
    expect(html.match(/<th scope="col">/g)).toHaveLength(2 + PERIOD_PRESETS.length);
    expect(html).toContain('<tr data-kind="places"><th scope="row">Places</th><td>180 days: 2 sources marked</td><td>4</td><td>3</td><td>3</td><td>2</td><td>2</td><td>1</td><td>0</td></tr>');
    expect(visibleText(html)).toContain('so no period can mark them');
  });
  it('says so when there is no source, and still shows the controls it is given', () => {
    const html = renderPeriodWhatIfHtml(buildPeriodWhatIf(auditRegistry([], NOW, {})), 'en', '<p data-x>controls</p>');
    expect(html).not.toContain('<table');
    expect(html).toContain('<p data-x>controls</p>');
    expect(visibleText(html)).toContain('There are no sources, so there is nothing to compare.');
  });
  it('the editor has two labelled lists and selects the kind and its period', () => {
    const html = renderPeriodEditor('routes', { routes: 60 }, 'en');
    expect(html.match(/<select /g)).toHaveLength(2);
    expect(html).toContain('<option value="routes" selected>Routes</option>');
    expect(html).toContain('<option value="60" selected>60 days</option>');
    expect(html).toContain('<option value="default">120 days (the default)</option>');
    expect(renderPeriodEditor('places', {}, 'en')).toContain('<option value="default" selected>180 days (the default)</option>');
    expect(renderPeriodEditor('places', { places: 45 }, 'en')).toContain('<option value="45" selected>45 days</option>');
    expect(html.match(/ selected>/g)).toHaveLength(2);
  });
  it('the fields for a page without scripts are one list per kind, named as the address names them', () => {
    const html = renderPeriodFields({ places: 90 }, 'en');
    expect(html.match(/<select /g)).toHaveLength(DATASET_KINDS.length);
    for (const kind of DATASET_KINDS) expect(html).toContain(`name="stale_${kind}"`);
    expect(html).toMatch(/name="stale_places"[^>]*>.*?<option value="90" selected>90 days<\/option>/s);
    expect(html).toMatch(/name="stale_routes"[^>]*>.*?<option value="" selected>120 days \(the default\)<\/option>/s);
  });
  it('passes the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderPeriodWhatIfHtml(d, locale, renderPeriodEditor('places', {}, locale));
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      expect(structureProblems(renderPeriodFields({ transit: 30 }, locale))).toEqual([]);
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW });
      expect(page.match(/id="ds-periods-title"/g)).toHaveLength(1);
      expect(page).toContain('id="ds-rp-kind"');
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
});

describe('in the panel', () => {
  const mount = (thresholds?: Record<string, number>) => {
    const host = new FakeHost();
    const changes: string[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (v) => changes.push(v), ...(thresholds ? { thresholds } : {}) });
    return { host, panel, changes };
  };
  const staleCount = (html: string) => Number(/data-listed-summary="\d+">In this list: (\d+) possibly out of date/.exec(html)?.[1] ?? '0');
  it('starts with the defaults and the editor on the first kind', () => {
    const { host, panel } = mount();
    expect(panel.getThresholds()).toEqual({});
    expect(host.innerHTML).toContain('<option value="places" selected>');
    expect(staleCount(host.innerHTML)).toBe(3);
  });
  it('works every status out again when a period is chosen, says so, keeps focus and puts it in the address', () => {
    const { host, panel, changes } = mount();
    host.filter('change', 'periodDays', '30');
    expect(panel.getThresholds()).toEqual({ places: 30 });
    expect(staleCount(host.innerHTML)).toBe(5);
    expect(host.announce.innerHTML).toContain('Review period for Places set to 30 days. 4 sources of that kind are now marked possibly out of date (it was 2).');
    expect(host.focused.at(-1)).toBe('#ds-rp-days');
    expect(changes.at(-1)).toBe('?stale_places=30');
    expect(host.innerHTML).toContain('<option value="30" selected>30 days</option>');
    expect(host.innerHTML).toContain('30 days, chosen here: 4 sources marked');
  });
  it('goes back to the default', () => {
    const { host, panel, changes } = mount({ places: 30 });
    expect(staleCount(host.innerHTML)).toBe(5);
    host.filter('change', 'periodDays', 'default');
    expect(panel.getThresholds()).toEqual({});
    expect(staleCount(host.innerHTML)).toBe(3);
    expect(host.announce.innerHTML).toContain('back to the default, 180 days. 2 sources of that kind are now marked possibly out of date (it was 4).');
    expect(changes.at(-1)).toBe('');
  });
  it('changes the kind the editor shows without changing any period', () => {
    const { host, panel, changes } = mount({ routes: 60 });
    host.filter('change', 'periodKind', 'routes');
    expect(panel.getThresholds()).toEqual({ routes: 60 });
    expect(host.innerHTML).toContain('<option value="routes" selected>');
    expect(host.innerHTML).toContain('<option value="60" selected>60 days</option>');
    expect(host.announce.innerHTML).toContain('Review period for Routes: 60 days.');
    expect(host.focused.at(-1)).toBe('#ds-rp-kind');
    expect(changes).toEqual([]);
    host.filter('change', 'periodDays', '365');
    expect(panel.getThresholds()).toEqual({ routes: 365 });
    expect(host.announce.innerHTML).toContain('Review period for Routes set to 365 days. 0 sources of that kind are now marked possibly out of date (it was 2).');
  });
  it('ignores a kind it does not know, and treats a period it cannot use as the default', () => {
    const { host, panel } = mount({ places: 30 });
    host.filter('change', 'periodKind', 'nope');
    expect(host.innerHTML).toContain('<option value="places" selected>');
    host.filter('change', 'periodDays', '99999');
    expect(panel.getThresholds()).toEqual({});
  });
  it('keeps the filters in force', () => {
    const { host, panel } = mount();
    host.filter('change', 'state', 'stale');
    host.filter('change', 'periodDays', '30');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, state: 'stale' });
    expect(host.innerHTML).toContain('data-listed-summary="5"');
  });
});

describe('on the page the server sends', () => {
  const ctx = { getRecords: () => RECORDS, now: () => NOW };
  const get = async (url: string) => (await handleDataStatus({ method: 'GET', url, headers: {} }, ctx))!;
  it('shows the table and puts a list per kind in the form, with no editor', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = await get(`/${locale}/data-status`);
      expect(page.body).toContain('data-period-rows="2"');
      expect(page.body).toContain('data-periods');
      expect(page.body).not.toContain('id="ds-rp-kind"');
      expect(describeProblems(auditHtml(page.body))).toEqual([]);
    }
  });
  it('a submitted form sets the periods, and an empty value means the default', async () => {
    const page = await get('/en/data-status?stale_places=30&stale_routes=&stale_transit=');
    expect(parseThresholds('?stale_places=30&stale_routes=&stale_transit=')).toEqual({ places: 30 });
    expect(page.body).toContain('30 days, chosen here: 4 sources marked');
    expect(page.body).toMatch(/name="stale_places"[^>]*>.*?<option value="30" selected>/s);
    expect(page.body).toMatch(/name="stale_routes"[^>]*>.*?<option value="" selected>/s);
    expect(page.body).not.toContain('<input type="hidden" name="stale_');
  });
  it('keeps a period that is not one of the presets as a choice', async () => {
    const page = await get('/en/data-status?stale_places=45');
    expect(page.body).toMatch(/name="stale_places"[^>]*>.*?<option value="45" selected>45 days<\/option>/s);
  });
});
