import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { buildFacets, describeNarrowed, FACET_KINDS, facetAction, facetHeading, facetLabel, narrowFilters, parseFacetAction, renderFacetsHtml, type FacetTarget } from './facets';
import { applyFilters, FILTER_AGES, FILTER_KINDS, FILTER_LICENCE_KINDS, FILTER_STATES, FILTER_TIERS, GAP_FIELDS, NO_FILTERS, type Filters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW, structureProblems, targetsBelow44 } from './testkit';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const MIXED: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [
      src('a'),
      src('b', { tier: 'E' }),
      src('c', { retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary' }),
      src('d', { retrievedAt: null, licence: null, tier: null }),
    ],
  },
];
const audit = auditRegistry(MIXED, NOW, {});
const TWO_KINDS = auditRegistry(
  [
    { id: 'p', name: 'Places', kind: 'places', sources: [src('a'), src('b')] },
    { id: 'r', name: 'Routes', kind: 'routes', sources: [src('c')] },
  ],
  NOW,
  {},
);
const facetsFor = (f: Filters = NO_FILTERS) => buildFacets(applyFilters(audit.sources, f), f);
const shape = (f?: Filters) => Object.fromEntries(facetsFor(f).map((x) => [x.kind, x.options.map((o) => `${o.target.value}=${o.count}`)]));

describe('buildFacets', () => {
  it('counts the listed sources under each value of every unset filter', () => {
    expect(shape()).toEqual({
      state: ['fresh=2', 'stale=1', 'unknown=1'],
      tier: ['0=2', 'E=1', 'unknown=1'],
      licence: ['open=2', 'unrecognised=1', 'unknown=1'],
      age: ['d0_30=2', 'd366_plus=1', 'unknown=1'],
      gap: ['licence=1', 'date=1', 'tier=1'],
    });
  });
  it('leaves out a filter that is already set, and counts within the list as filtered', () => {
    const f: Filters = { ...NO_FILTERS, state: 'fresh' };
    expect(shape(f)).toEqual({ tier: ['0=1', 'E=1'] });
  });
  it('offers nothing for a list of fewer than two sources', () => {
    expect(facetsFor({ ...NO_FILTERS, state: 'stale' })).toEqual([]);
    expect(buildFacets([], NO_FILTERS)).toEqual([]);
  });
  it('offers nothing when every listed source shares each value', () => {
    const same = auditRegistry([{ id: 'p', name: 'Places', kind: 'places', sources: [src('a'), src('b'), src('c')] }], NOW, {});
    expect(buildFacets(same.sources, NO_FILTERS)).toEqual([]);
  });
  it('splits by kind of data when the list holds more than one', () => {
    const facets = buildFacets(TWO_KINDS.sources, NO_FILTERS);
    expect(facets).toEqual([{ kind: 'kind', options: [{ target: { kind: 'kind', value: 'places' }, count: 2 }, { target: { kind: 'kind', value: 'routes' }, count: 1 }] }]);
    expect(buildFacets(applyFilters(TWO_KINDS.sources, { ...NO_FILTERS, kind: 'places' }), { ...NO_FILTERS, kind: 'places' })).toEqual([]);
  });
  it('counts a source under each of its unknown facts, and not at all when it has none', () => {
    const gap = facetsFor().find((x) => x.kind === 'gap');
    expect(gap?.options.map((o) => o.target.value)).toEqual(['licence', 'date', 'tier']);
    expect(gap?.options.reduce((n, o) => n + o.count, 0)).toBe(3);
    expect(applyFilters(audit.sources, narrowFilters(NO_FILTERS, { kind: 'gap', value: 'tier' })).map((s) => s.sourceId)).toEqual(['d']);
    expect(facetsFor({ ...NO_FILTERS, gap: 'tier' })).toEqual([]);
  });
  it('keeps the fixed order of filters and of values', () => {
    expect(facetsFor().map((x) => x.kind)).toEqual(FACET_KINDS.filter((k) => k !== 'kind'));
    expect(buildFacets(TWO_KINDS.sources, NO_FILTERS).map((x) => x.kind)).toEqual(['kind']);
    const order: Record<string, readonly string[]> = { state: FILTER_STATES, tier: FILTER_TIERS, licence: FILTER_LICENCE_KINDS, age: FILTER_AGES, gap: GAP_FIELDS };
    for (const facet of facetsFor()) {
      const positions = facet.options.map((o) => order[facet.kind]!.indexOf(o.target.value));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
  it('on random registries every option keeps exactly its count, at least one and fewer than the list', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      for (const f of [NO_FILTERS, { ...NO_FILTERS, onlyIssues: true }, { ...NO_FILTERS, state: 'stale' as const }]) {
        const listed = applyFilters(a.sources, f);
        for (const facet of buildFacets(listed, f)) {
          // Every source has exactly one value of each filter, except the unknown facts, where it can have several or none.
          if (facet.kind !== 'gap') expect(facet.options.reduce((n, o) => n + o.count, 0), `seed ${seed} ${facet.kind}`).toBe(listed.length);
          for (const o of facet.options) {
            const after = applyFilters(a.sources, narrowFilters(f, o.target));
            expect(after.length, `seed ${seed} ${facetAction(o.target)}`).toBe(o.count);
            expect(o.count).toBeGreaterThan(0);
            expect(o.count).toBeLessThan(listed.length);
          }
        }
      }
    }
  });
});

describe('narrowFilters and actions', () => {
  it('adds the filter and leaves the others, and the input, alone', () => {
    const f: Filters = { ...NO_FILTERS, query: 'bus', dataset: 'p' };
    const copy = { ...f };
    expect(narrowFilters(f, { kind: 'state', value: 'stale' })).toEqual({ ...f, state: 'stale' });
    expect(narrowFilters(f, { kind: 'tier', value: 'E' })).toEqual({ ...f, tier: 'E' });
    expect(narrowFilters(f, { kind: 'licence', value: 'open' })).toEqual({ ...f, licence: 'open' });
    expect(narrowFilters(f, { kind: 'age', value: 'd0_30' })).toEqual({ ...f, age: 'd0_30' });
    expect(narrowFilters(f, { kind: 'kind', value: 'routes' })).toEqual({ ...f, kind: 'routes' });
    expect(narrowFilters(f, { kind: 'gap', value: 'date' })).toEqual({ ...f, gap: 'date' });
    expect(f).toEqual(copy);
  });
  it('round-trips every target through its action', () => {
    const targets: FacetTarget[] = [
      ...FILTER_STATES.map((value) => ({ kind: 'state' as const, value })),
      ...FILTER_TIERS.map((value) => ({ kind: 'tier' as const, value })),
      ...FILTER_LICENCE_KINDS.map((value) => ({ kind: 'licence' as const, value })),
      ...FILTER_AGES.map((value) => ({ kind: 'age' as const, value })),
      ...FILTER_KINDS.map((value) => ({ kind: 'kind' as const, value })),
      ...GAP_FIELDS.map((value) => ({ kind: 'gap' as const, value })),
    ];
    for (const target of targets) expect(parseFacetAction(facetAction(target))).toEqual(target);
  });
  it('rejects anything else', () => {
    for (const bad of [null, undefined, '', 'narrow:', 'narrow:tier', 'narrow:tier:', 'narrow:tier:9', 'narrow:state:any', 'narrow:licence:closed', 'narrow:age:d1', 'narrow:kind:any', 'narrow:kind:toString', 'narrow:gap:name', 'narrow:dataset:p', 'narrow:constructor:x', 'show:tier:E', 'NARROW:tier:E']) {
      expect(parseFacetAction(bad), String(bad)).toBeNull();
    }
  });
});

describe('the words', () => {
  it('names each filter as the list of filters in force does', () => {
    expect(facetLabel({ kind: 'tier', value: 'E' }, 'en')).toBe('Tier: E');
    expect(facetLabel({ kind: 'state', value: 'stale' }, 'en')).toBe('Status: May be out of date');
    expect(facetLabel({ kind: 'tier', value: 'E' }, 'fr')).toBe('Niveau\u00A0: E');
    for (const locale of ['en', 'fr'] as const) {
      for (const value of FILTER_KINDS) expect(facetLabel({ kind: 'kind', value }, locale)).not.toContain(`kind: ${value}`);
      for (const value of GAP_FIELDS) expect(facetLabel({ kind: 'gap', value }, locale)).not.toContain(`gap: ${value}`);
    }
  });
  it('writes a tier that is not known as the token UNKNOWN in both languages', () => {
    expect(facetLabel({ kind: 'tier', value: 'unknown' }, 'en')).toBe('Tier: UNKNOWN');
    expect(facetLabel({ kind: 'tier', value: 'unknown' }, 'fr')).toBe('Niveau\u00A0: UNKNOWN');
  });
  it('has a heading for each filter and says what was added', () => {
    for (const locale of ['en', 'fr'] as const) {
      expect(new Set(FACET_KINDS.map((k) => facetHeading(k, locale))).size).toBe(FACET_KINDS.length);
      expect(describeNarrowed({ kind: 'tier', value: 'E' }, 1, locale)).toContain(facetLabel({ kind: 'tier', value: 'E' }, locale));
    }
    expect(describeNarrowed({ kind: 'tier', value: 'E' }, 1, 'en')).toBe('Filter added. Tier: E. 1 source listed.');
    expect(describeNarrowed({ kind: 'tier', value: 'E' }, 4, 'en')).toBe('Filter added. Tier: E. 4 sources listed.');
    expect(lintFrench(describeNarrowed({ kind: 'state', value: 'stale' }, 2, 'fr'))).toEqual([]);
  });
});

describe('renderFacetsHtml', () => {
  it('is empty when nothing would narrow the list', () => {
    expect(renderFacetsHtml([], 'en')).toBe('');
  });
  it('has one named list per filter and one button per value, with its count', () => {
    const html = renderFacetsHtml(facetsFor(), 'en');
    expect(html).toContain('data-facets="5"');
    expect(html.match(/<ul aria-labelledby="ds-facet-/g)).toHaveLength(5);
    expect(html.match(/<button /g)).toHaveLength(15);
    expect(html).toContain('data-action="narrow:tier:E"');
    expect(visibleText(html)).toContain('Tier: E (1)');
    expect(visibleText(html)).toContain('Tier: UNKNOWN (1)');
    for (const id of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(html).toContain(`id="${id[1]}"`);
  });
  it('uses links on static pages', () => {
    const html = renderFacetsHtml(facetsFor(), 'en', { hrefFor: (t) => `/x?k=${t.kind}&v=${t.value}` });
    expect(html).not.toContain('<button');
    expect(html).toContain('href="/x?k=tier&amp;v=E"');
    expect(targetsBelow44(html)).toEqual([]);
  });
  it('passes the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const html = renderFacetsHtml(facetsFor(), locale);
      expect(scanHtml(html)).toEqual([]);
      expect(structureProblems(html)).toEqual([]);
      expect(targetsBelow44(html)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
});

describe('in the panel', () => {
  const mount = () => {
    const host = new FakeHost();
    const changes: unknown[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, onFiltersChange: (v) => changes.push(v) });
    return { host, panel, changes };
  };
  it('offers ways to narrow under the list, and adds the chosen filter to the ones set', () => {
    const { host, panel, changes } = mount();
    expect(host.innerHTML).toContain('data-facets="5"');
    host.filter('change', 'licence', 'open');
    expect(host.region.innerHTML).toContain('data-facets="1"');
    host.click('narrow:tier:E');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, licence: 'open', tier: 'E' });
    expect(host.announce.innerHTML).toContain('Filter added. Tier: E. 1 source listed.');
    expect(host.innerHTML).not.toContain('data-facets');
    expect(host.focused.at(-1)).toBe('#ds-f-state');
    expect(changes).toHaveLength(2);
  });
  it('moves focus to the next way to narrow when one is left', () => {
    const { host } = mount();
    host.click('narrow:state:fresh');
    expect(host.innerHTML).toContain('data-facets="1"');
    expect(host.focused.at(-1)).toBe('[data-action^="narrow:"]');
  });
  it('ignores an action it does not know', () => {
    const { host, panel, changes } = mount();
    host.click('narrow:tier:9');
    expect(panel.getFilters()).toEqual(NO_FILTERS);
    expect(changes).toHaveLength(0);
  });
  it('the static page links to the narrowed list and passes the audits', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: MIXED, locale, now: NOW, filters: { ...NO_FILTERS, licence: 'open' }, staticView: { action: `/${locale}/data-status`, csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
      expect(page).toContain('data-facets="1"');
      expect(page).not.toContain('data-action="narrow:');
      expect(page).toMatch(new RegExp(`href="/${locale}/data-status\\?[^"]*lic=open[^"]*tier=E[^"]*"|href="/${locale}/data-status\\?[^"]*tier=E[^"]*lic=open[^"]*"`));
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
    }
  });
});
