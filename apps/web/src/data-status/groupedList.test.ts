import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, NO_FILTERS, type Filters } from './filters';
import {
  describeGrouping,
  drawGroups,
  GROUP_KEYS,
  groupCaption,
  groupHeading,
  groupKeyLabel,
  groupPartialText,
  groupSources,
  isGroupKey,
  parseGroup,
  renderGroupControl,
  type GroupKey,
} from './groupedList';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderFilterControls, renderSourcesRegion, scanHtml, visibleText } from './index';
import { LIVE_STEP } from './liveList';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { applySort } from './sorting';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const MIXED: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [src('a'), src('b', { tier: 'E', licence: 'Proprietary' }), src('c', { tier: null, retrievedAt: isoDayOffset(NOW, -400) }), src('d', { licence: null, retrievedAt: null })],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('e', { tier: 3 }), src('f', { tier: 'E', retrievedAt: isoDayOffset(NOW, -60) })] },
];
const audit = auditRegistry(MIXED, NOW, {});
const grouping = (key: GroupKey) => groupSources(audit.sources, key, 'en');
const shape = (key: GroupKey) => grouping(key).map((g) => [g.id, g.sources.map((s) => s.sourceId).sort().join('')]);
const GROUPED = GROUP_KEYS.filter((k) => k !== 'none');

describe('group keys', () => {
  it('knows its keys and reads them from the query string', () => {
    expect([...GROUP_KEYS]).toEqual(['none', 'dataset', 'status', 'tier', 'licence', 'age']);
    for (const k of GROUP_KEYS) expect(isGroupKey(k)).toBe(true);
    for (const v of ['', 'any', 'Tier', null, 1]) expect(isGroupKey(v)).toBe(false);
    expect(parseGroup('?group=tier')).toBe('tier');
    expect(parseGroup('group=age&tier=E')).toBe('age');
    for (const q of ['', '?group=', '?group=bogus', '?tier=E']) expect(parseGroup(q)).toBe('none');
  });
  it('names each key in both languages', () => {
    expect(GROUP_KEYS.map((k) => groupKeyLabel(k, 'en'))).toEqual(['No grouping', 'Dataset', 'Status', 'Tier', 'Licence type', 'Age of retrieved date']);
    for (const k of GROUP_KEYS) expect(groupKeyLabel(k, 'fr').length).toBeGreaterThan(0);
  });
});

describe('groupSources', () => {
  it('gives one group holding everything when there is no grouping', () => {
    const g = grouping('none');
    expect(g).toHaveLength(1);
    expect(g[0]?.sources).toHaveLength(6);
    expect(g[0]?.filter).toEqual({});
  });
  it('groups by dataset in the order datasets first appear', () => {
    expect(shape('dataset')).toEqual([['p', 'abcd'], ['r', 'ef']]);
    expect(grouping('dataset').map((g) => g.label)).toEqual(['Places', 'Routes']);
  });
  it('groups by status with items to look at first and Unknown last', () => {
    expect(shape('status')).toEqual([['stale', 'c'], ['fresh', 'abef'], ['unknown', 'd']]);
  });
  it('groups by tier in the fixed tier order, with no usable tier last', () => {
    expect(shape('tier')).toEqual([['0', 'ad'], ['3', 'e'], ['E', 'bf'], ['unknown', 'c']]);
    expect(grouping('tier').map((g) => g.label)).toEqual(['Tier 0', 'Tier 3', 'Tier E', 'Tier: Unknown']);
  });
  it('groups by licence type, with no licence last', () => {
    expect(shape('licence')).toEqual([['open', 'acef'], ['unrecognised', 'b'], ['unknown', 'd']]);
    expect(grouping('licence').at(-1)?.label).toBe('Licence: Unknown');
  });
  it('groups by age band, with no usable date last', () => {
    expect(shape('age')).toEqual([['d0_30', 'abe'], ['d31_90', 'f'], ['d366_plus', 'c'], ['unknown', 'd']]);
  });
  it('leaves out groups with no source and returns nothing for an empty list', () => {
    for (const k of GROUP_KEYS) {
      expect(groupSources([], k, 'en')).toEqual([]);
      for (const g of grouping(k)) expect(g.sources.length).toBeGreaterThan(0);
    }
  });
  it('puts every source in exactly one group, whatever the grouping, on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const k of GROUP_KEYS) {
        const groups = groupSources(a.sources, k, 'en');
        const seen = groups.flatMap((g) => g.sources);
        expect(seen, `seed ${seed} ${k}`).toHaveLength(a.sources.length);
        expect(new Set(seen).size).toBe(a.sources.length);
        expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
      }
    }
  });
  it('each group is exactly what its own filter lists', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const k of GROUPED) {
        for (const g of groupSources(a.sources, k, 'en')) {
          const listed = applyFilters(a.sources, { ...NO_FILTERS, ...g.filter } as Filters);
          // Datasets that share an id are told apart by the filter no better than by the group.
          expect(listed.map((s) => s.sourceId).sort(), `seed ${seed} ${k} ${g.id}`).toEqual(g.sources.map((s) => s.sourceId).sort());
        }
      }
    }
  });
  it('keeps the order it is given inside each group', () => {
    const sorted = applySort(audit.sources, { key: 'source', dir: 'desc' }, 'en');
    for (const g of groupSources(sorted, 'dataset', 'en')) {
      const names = g.sources.map((s) => s.name ?? '');
      expect(names).toEqual([...names].sort().reverse());
    }
  });
  it('labels groups in French with the right spacing', () => {
    const labels = GROUPED.flatMap((k) => groupSources(audit.sources, k, 'fr').map((g) => g.label));
    expect(labels).toContain('Niveau : Inconnu');
    for (const l of labels) expect(lintFrench(l)).toEqual([]);
  });
});

describe('headings, captions and the row budget', () => {
  it('writes a heading with the count and the right plural', () => {
    const [stale, fresh] = grouping('status');
    expect(groupHeading(stale!, 'en')).toBe('May be out of date (1 source)');
    expect(groupHeading(fresh!, 'en')).toBe('Within its review period (4 sources)');
    const [staleFr, freshFr] = groupSources(audit.sources, 'status', 'fr');
    expect(groupHeading(freshFr!, 'fr')).toBe('Dans sa période de révision (4 sources)');
    expect(groupCaption(stale!, 'en')).toBe('Sources: May be out of date');
    expect(groupCaption(staleFr!, 'fr')).toBe('Sources\u00A0: Possiblement périmé');
    expect(groupPartialText(2, 9, 'en')).toBe('Showing the first 2 of 9 in this group.');
  });
  it('fills groups in order and never draws more than the budget', () => {
    const groups = grouping('tier');
    const drawn = drawGroups(groups, 3);
    expect(drawn.map((d) => [d.group.id, d.drawn.length])).toEqual([['0', 2], ['3', 1]]);
    expect(drawGroups(groups, 100).map((d) => d.drawn.length)).toEqual([2, 1, 2, 1]);
    for (const b of [0, -1, NaN]) expect(drawGroups(groups, b)).toEqual([]);
    expect(drawGroups(groups, 2.9).reduce((n, d) => n + d.drawn.length, 0)).toBe(2);
    for (let budget = 0; budget <= 7; budget++) {
      const total = drawGroups(groups, budget).reduce((n, d) => n + d.drawn.length, 0);
      expect(total).toBe(Math.min(budget, 6));
    }
  });
  it('says what the grouping is, or that it was removed', () => {
    expect(describeGrouping('tier', 4, 'en')).toBe('Grouped by tier, in 4 groups.');
    expect(describeGrouping('dataset', 1, 'en')).toBe('Grouped by dataset, in 1 group.');
    expect(describeGrouping('none', 1, 'en')).toBe('Grouping removed.');
    expect(describeGrouping('licence', 2, 'fr')).toBe('Regroupement par type de licence, en 2 groupes.');
  });
});

describe('the Group by control', () => {
  it('has a label, every key as an option, and marks the current one', () => {
    const html = renderGroupControl('tier', 'en');
    expect(html).toContain('<label for="ds-f-group">Group by</label>');
    expect(html.match(/<option/g)).toHaveLength(GROUP_KEYS.length);
    expect(html).toContain('<option value="tier" selected>Tier</option>');
    expect(renderGroupControl('none', 'fr')).toContain('<option value="none" selected>Aucun regroupement</option>');
  });
  it('is in the live controls only', () => {
    expect(renderFilterControls('en', NO_FILTERS, undefined, [], null, { group: 'none', details: false })).toContain('id="ds-f-group"');
    expect(renderFilterControls('en', NO_FILTERS, undefined, [], null)).not.toContain('id="ds-f-group"');
    const page = renderDataStatusPanel({ records: MIXED, locale: 'en', now: NOW, live: { sort: null, limit: LIVE_STEP, group: 'tier' }, staticView: { action: '/x', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
    expect(page).not.toContain('id="ds-f-group"');
    expect(page).not.toContain('data-group=');
  });
  it('passes the markup, target and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderGroupControl('age', locale);
      expect(scanHtml(html)).toEqual([]);
      expect(describeProblems(auditHtml(html))).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
});

describe('the grouped list', () => {
  const region = (key: GroupKey, limit = LIVE_STEP, filters: Filters = NO_FILTERS) => renderSourcesRegion(audit, 'en', filters, NOW, undefined, { sort: null, limit, group: key });

  it('is one table when there is no grouping, as before', () => {
    const html = region('none');
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(html).not.toContain('data-group=');
    expect(renderSourcesRegion(audit, 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: LIVE_STEP })).toBe(html);
  });
  it('has a section, a heading with the count and a captioned table for each group', () => {
    const html = region('tier');
    expect(html.match(/<section aria-labelledby="ds-group-\d+" data-group="/g)).toHaveLength(4);
    expect(html).toContain('<h3 id="ds-group-1">Tier 0 (2 sources)</h3>');
    expect(html).toContain('<caption>Sources: Tier E</caption>');
    expect(html.match(/<table>/g)).toHaveLength(4);
    expect((html.match(/<tr><th scope="row">/g) ?? []).length).toBe(6);
  });
  it('says for each group what in it needs attention', () => {
    const html = region('dataset');
    expect(html).toContain('In this list: 1 possibly out of date, 1 with no usable date, 1 with no tier, 2 with a licence to review.');
  });
  it('groups only what the filters list', () => {
    const html = region('tier', LIVE_STEP, { ...NO_FILTERS, dataset: 'r' });
    expect(html.match(/data-group="/g)).toHaveLength(2);
    expect(html).toContain('Tier 3 (1 source)');
    expect(html).not.toContain('Tier 0');
  });
  it('shares Show more across groups: counts in headings are whole, drawn rows stop at the limit', () => {
    const big: DatasetRecord[] = [
      { id: 'p', name: 'Places', kind: 'places', sources: Array.from({ length: 80 }, (_, i) => src(`s${String(i).padStart(2, '0')}`, { tier: i < 60 ? 0 : 'E' })) },
    ];
    const a = auditRegistry(big, NOW, {});
    const html = renderSourcesRegion(a, 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: LIVE_STEP, group: 'tier' });
    expect(html).toContain('Tier 0 (60 sources)');
    expect(html).toContain('Showing the first 50 of 60 in this group.');
    expect(html).not.toContain('Tier E (20 sources)');
    expect((html.match(/<tr><th scope="row">/g) ?? []).length).toBe(50);
    expect(html).toContain('Showing 50 of 80 listed sources.');
    const more = renderSourcesRegion(a, 'en', NO_FILTERS, NOW, undefined, { sort: null, limit: 100, group: 'tier' });
    expect(more).toContain('Tier E (20 sources)');
    expect(more).not.toContain('in this group');
    expect((more.match(/<tr><th scope="row">/g) ?? []).length).toBe(80);
  });
  it('passes the audits for every grouping in both languages, with unique ids', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const k of GROUPED) {
        const html = renderDataStatusPanel({ records: MIXED, locale, now: NOW, live: { sort: { key: 'tier', dir: 'asc' }, limit: LIVE_STEP, group: k, details: true } });
        expect(scanHtml(html), `${locale} ${k}`).toEqual([]);
        expect(describeProblems(auditHtml(html)), `${locale} ${k}`).toEqual([]);
        expect(structureProblems(html)).toEqual([]);
        expect(targetsBelow44(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});

describe('grouping on the mounted panel', () => {
  const mount = (initialGroup?: GroupKey) => {
    const host = new FakeHost();
    const seen: string[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, initialGroup, onFiltersChange: (s) => seen.push(s) });
    return { host, seen, panel };
  };
  it('starts ungrouped, with the control', () => {
    const { host, panel } = mount();
    expect(panel.getGroup()).toBe('none');
    expect(host.innerHTML).toContain('<option value="none" selected>No grouping</option>');
  });
  it('groups when the control changes, says so, and puts the grouping in the address', () => {
    const { host, seen, panel } = mount();
    const before = host.innerHTML;
    host.filter('change', 'group', 'tier');
    expect(panel.getGroup()).toBe('tier');
    expect(host.innerHTML).toBe(before);
    expect(host.region.innerHTML.match(/data-group="/g)).toHaveLength(4);
    expect(host.announce.innerHTML).toBe('Grouped by tier, in 4 groups.');
    expect(seen.at(-1)).toBe('?group=tier');
    host.filter('change', 'group', 'none');
    expect(host.region.innerHTML).not.toContain('data-group=');
    expect(host.announce.innerHTML).toBe('Grouping removed.');
    expect(seen.at(-1)).toBe('');
  });
  it('keeps the grouping while filters and the order change, and through a full redraw', () => {
    const { host, seen, panel } = mount();
    host.filter('change', 'group', 'status');
    host.filter('change', 'tier', 'E');
    expect(host.region.innerHTML.match(/data-group="/g)).toHaveLength(1);
    expect(seen.at(-1)).toContain('group=status');
    expect(seen.at(-1)).toContain('tier=E');
    host.filter('change', 'sort', 'source:desc');
    host.click('reset-filters');
    expect(panel.getGroup()).toBe('status');
    expect(host.innerHTML).toContain('<option value="status" selected>');
    expect(host.innerHTML.match(/data-group="/g)).toHaveLength(3);
  });
  it('treats an unreadable choice as no grouping', () => {
    const { host, panel } = mount('tier');
    expect(panel.getGroup()).toBe('tier');
    expect(host.innerHTML).toContain('data-group="E"');
    host.filter('change', 'group', 'bogus');
    expect(panel.getGroup()).toBe('none');
  });
  it('does not move focus or change which sources are listed', () => {
    const { host, panel } = mount();
    host.filter('change', 'tier', 'E');
    const filters = panel.getFilters();
    host.filter('change', 'group', 'dataset');
    expect(panel.getFilters()).toEqual(filters);
    expect(host.focused).toEqual([]);
  });
  it('works on the sample registry too', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'fr', now: () => NOW });
    host.filter('change', 'group', 'licence');
    expect(host.announce.innerHTML).toBe('Regroupement par type de licence, en 3 groupes.');
  });
});
