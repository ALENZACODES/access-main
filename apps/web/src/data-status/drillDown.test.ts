import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import {
  DRILL_KINDS,
  drillAction,
  drillColumnHeading,
  drillFilters,
  drillLabel,
  parseDrillAction,
  renderDrillControl,
  type DrillTarget,
} from './drillDown';
import { applyFilters, FILTER_LICENCE_KINDS, FILTER_TIERS, NO_FILTERS, parseFilters, serializeFilters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { randomRegistry } from './round7Kit';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';
import { buildTierBreakdown, renderTierBreakdownHtml } from './tiers';

const TARGETS: DrillTarget[] = [
  { kind: 'tier', value: 'E' },
  { kind: 'tier', value: 'unknown' },
  { kind: 'licence', value: 'unrecognised' },
  { kind: 'state', value: 'stale' },
  { kind: 'dataset', value: 'p' },
  { kind: 'gap', value: 'licence' },
];
const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };

describe('drill-down targets', () => {
  it('apply one filter and nothing else', () => {
    expect(drillFilters({ kind: 'tier', value: 'E' })).toEqual({ ...NO_FILTERS, tier: 'E' });
    expect(drillFilters({ kind: 'licence', value: 'open' })).toEqual({ ...NO_FILTERS, licence: 'open' });
    expect(drillFilters({ kind: 'state', value: 'unknown' })).toEqual({ ...NO_FILTERS, state: 'unknown' });
    expect(drillFilters({ kind: 'dataset', value: 'p' })).toEqual({ ...NO_FILTERS, dataset: 'p' });
  });
  it('covers every kind', () => {
    expect([...new Set(TARGETS.map((t) => t.kind))].sort()).toEqual([...DRILL_KINDS].sort());
  });
  it('round-trip through the action name', () => {
    for (const t of TARGETS) expect(parseDrillAction(drillAction(t))).toEqual(t);
    for (const value of FILTER_TIERS) expect(parseDrillAction(drillAction({ kind: 'tier', value }))).toEqual({ kind: 'tier', value });
    for (const value of FILTER_LICENCE_KINDS) expect(parseDrillAction(drillAction({ kind: 'licence', value }))).toEqual({ kind: 'licence', value });
  });
  it('carry a dataset id with awkward characters safely', () => {
    for (const id of ['a:b', 'with space', 'q"uote', '<tag>', 'é/ü', '100%']) {
      const action = drillAction({ kind: 'dataset', value: id });
      expect(action).not.toMatch(/["<> ]/);
      expect(parseDrillAction(action)).toEqual({ kind: 'dataset', value: id });
    }
  });
  it('reject anything malformed', () => {
    for (const a of ['show:', 'show:tier', 'show:tier:', 'show:tier:9', 'show:licence:any', 'show:state:old', 'show:dataset:', 'show:dataset:any', 'show:dataset:%E0%A4%A', 'show:other:x', 'tier:E', 'clear:tier', '', null, undefined]) {
      expect(parseDrillAction(a), String(a)).toBeNull();
    }
  });
  it('the filters survive a trip through the query string', () => {
    for (const t of TARGETS) expect(parseFilters(serializeFilters(drillFilters(t)))).toEqual(drillFilters(t));
  });
});

describe('wording and controls', () => {
  it('names the sources in the same words the filters use', () => {
    expect(drillLabel({ kind: 'tier', value: 'E' }, 'en')).toBe('List these sources. Tier: E');
    expect(drillLabel({ kind: 'tier', value: 'unknown' }, 'en')).toBe('List these sources. Tier: Unknown');
    expect(drillLabel({ kind: 'dataset', value: 'p' }, 'en', new Map([['p', 'Places']]))).toBe('List these sources. Dataset: Places');
    expect(drillLabel({ kind: 'tier', value: 'E' }, 'fr')).toBe('Afficher ces sources. Niveau : E');
    expect(drillColumnHeading('en')).toBe('In the source list');
    expect(drillColumnHeading('fr')).toBe('Dans la liste des sources');
  });
  it('renders a button by default and a link when given a link builder', () => {
    const button = renderDrillControl({ kind: 'tier', value: 'E' }, 'en');
    expect(button).toContain('<button type="button" data-action="show:tier:E"');
    const link = renderDrillControl({ kind: 'tier', value: 'E' }, 'en', { hrefFor: (f) => `/x${serializeFilters(f)}` });
    expect(link).toContain('<a href="/x?tier=E"');
    expect(link).not.toContain('<button');
  });
  it('escapes a dataset name', () => {
    const html = renderDrillControl({ kind: 'dataset', value: 'p' }, 'en', { datasetNames: new Map([['p', '<b>P</b>']]) });
    expect(html).not.toContain('<b>P</b>');
  });
  it('passes the markup, target and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const t of TARGETS) {
        for (const opts of [{}, { hrefFor: () => '/x' }]) {
          const html = renderDrillControl(t, locale, opts);
          expect(scanHtml(html)).toEqual([]);
          expect(describeProblems(auditHtml(html))).toEqual([]);
          expect(targetsBelow44(html)).toEqual([]);
          if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
        }
      }
    }
  });
});

describe('the extra column on the tier table', () => {
  it('is absent unless asked for', () => {
    const html = renderTierBreakdownHtml(buildTierBreakdown(RECORDS), 'en');
    expect(html.match(/<th scope="col">/g)).toHaveLength(3 + 4);
  });
  it('adds a heading and one cell per tier row, including Unknown', () => {
    const html = renderTierBreakdownHtml(buildTierBreakdown(RECORDS), 'en', { heading: 'Extra', cell: (tier) => `[${tier ?? 'none'}]` });
    expect(html).toContain('<th scope="col">Extra</th></tr></thead>');
    expect(html).toContain('<td>[0]</td></tr>');
    expect(html).toContain('<td>[E]</td></tr>');
    expect(html).toContain('<td>[none]</td></tr>');
  });
});

describe('drill-down on the panel', () => {
  it('each tier row and each dataset row has a control that lists its sources', () => {
    const html = renderDataStatusPanel({ records: RECORDS, locale: 'en', now: NOW });
    for (const a of ['show:tier:0', 'show:tier:E', 'show:tier:unknown', 'show:dataset:p', 'show:dataset:r']) expect(html, a).toContain(`data-action="${a}"`);
    expect(html).toContain('List these sources. Dataset: Places &lt;A&gt;');
    expect(structureProblems(html)).toEqual([]);
    expect(targetsBelow44(html)).toEqual([]);
  });
  it('the number of rows listed is the count beside the control, for every tier and dataset', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const pool = [0, 1, 'E', null, 'x', 3];
      const records = randomRegistry(seed, NOW).map((r, ri) => ({ ...r, sources: r.sources.map((s, si) => ({ ...s, tier: pool[(seed + ri + si) % pool.length] as never })) }));
      const audit = auditRegistry(records, NOW, {});
      const b = buildTierBreakdown(records);
      for (const value of FILTER_TIERS) {
        const listed = applyFilters(audit.sources, drillFilters({ kind: 'tier', value })).length;
        expect(listed, `seed ${seed} tier ${value}`).toBe(value === 'unknown' ? b.unknown : b.counts[value]);
      }
      for (const d of b.datasets) expect(applyFilters(audit.sources, drillFilters({ kind: 'dataset', value: d.datasetId })).length).toBe(d.total);
    }
  });
  it('leaves the control out for a dataset with no sources', () => {
    const records: DatasetRecord[] = [...RECORDS, { id: 'empty', name: 'Empty set', kind: 'reference', sources: [] }];
    const html = renderDataStatusPanel({ records, locale: 'en', now: NOW });
    expect(html).not.toContain('show:dataset:empty');
    expect(describeProblems(auditHtml(html))).toEqual([]);
  });
  it('clicking one sets that filter alone, updates the controls and the address, and says what is listed', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.filter('change', 'licence', 'open');
    host.click('show:tier:E');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, tier: 'E' });
    expect(seen.at(-1)).toBe('?tier=E');
    expect(host.innerHTML).toContain('<option value="E" selected>');
    expect(host.innerHTML).toContain('data-active-filters="1"');
    expect(host.announce.innerHTML).toContain('1 source shown.');
    host.click('show:dataset:r');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, dataset: 'r' });
    expect(seen.at(-1)).toBe('?ds=r');
  });
  it('ignores an action that only looks like one', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    mountDataStatusPanel(host, { getRecords: () => RECORDS, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.click('show:tier:9');
    host.click('show:nothing:x');
    expect(seen).toEqual([]);
  });
  it('uses links that keep the thresholds in the static view, and passes the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: RECORDS, locale, now: NOW, staticView: sv, thresholds: { places: 30 } });
      expect(page).toContain('href="/en/data-status?tier=E&amp;stale_places=30"');
      expect(page).toContain('href="/en/data-status?ds=p&amp;stale_places=30"');
      expect(page).not.toContain('data-action="show:');
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(page))).toEqual([]);
    }
  });
});

describe('drill-down from the licence table', () => {
  const TWO_OPEN: DatasetRecord[] = [
    {
      id: 'd',
      name: 'Set',
      kind: 'places',
      sources: [
        { id: 'a', licence: 'OGL-Ontario' },
        { id: 'b', licence: 'CC BY 4.0' },
        { id: 'c', licence: 'Proprietary' },
        { id: 'e' },
      ],
    },
  ];
  it('has one control for each licence type, on the first row of that type', () => {
    const html = renderDataStatusPanel({ records: TWO_OPEN, locale: 'en', now: NOW });
    expect(html.match(/data-action="show:licence:open"/g)).toHaveLength(1);
    expect(html.match(/data-action="show:licence:unrecognised"/g)).toHaveLength(1);
    expect(html.match(/data-action="show:licence:unknown"/g)).toHaveLength(1);
    expect(html).not.toContain('data-action="show:licence:terms"');
    expect(describeProblems(auditHtml(html))).toEqual([]);
  });
  it('lists every source of that type, not only the row it sits on', () => {
    const host = new FakeHost();
    const panel = mountDataStatusPanel(host, { getRecords: () => TWO_OPEN, getLocale: () => 'en', now: () => NOW });
    host.click('show:licence:open');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, licence: 'open' });
    expect(host.innerHTML).toContain('data-listed-summary="2"');
  });
  it('keeps every licence row the same width', () => {
    const html = renderDataStatusPanel({ records: TWO_OPEN, locale: 'en', now: NOW });
    const table = /<table><caption>Sources by licence<\/caption>[\s\S]*?<\/table>/.exec(html)?.[0] ?? '';
    const rows = table.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
    expect(rows.length).toBe(5);
    for (const r of rows) expect((r.match(/<t[hd][ >]/g) ?? []).length).toBe(4);
  });
});
