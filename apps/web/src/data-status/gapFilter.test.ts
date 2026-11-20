import { describe, expect, it } from 'vitest';
import { listActiveFilters, withoutFilter } from './activeFilters';
import { filterParts } from './announce';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { drillAction, drillFilters, drillLabel, parseDrillAction } from './drillDown';
import { applyFilters, GAP_FIELDS, hasActiveFilters, hasGap, isGapField, NO_FILTERS, parseFilters, serializeFilters, type Filters } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, renderFilterControls, scanHtml, visibleText } from './index';
import { buildRecordFacts, FACT_FIELDS, renderRecordFactsHtml } from './recordFacts';
import { randomRegistry } from './round7Kit';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const FULL = { source: 'Publisher', licence: 'OGL-Ontario', retrievedAt: '2026-11-01', tier: 0 } as const;
const MIXED: DatasetRecord[] = [
  {
    id: 'd',
    name: 'Set',
    kind: 'places',
    sources: [
      { id: 'ok', name: 'Complete', ...FULL },
      { id: 'nosrc', name: 'No source', ...FULL, source: null },
      { id: 'nolic', name: 'No licence', ...FULL, licence: '' },
      { id: 'nodate', name: 'No date', ...FULL, retrievedAt: null },
      { id: 'future', name: 'Future date', ...FULL, retrievedAt: '2031-01-01' },
      { id: 'notier', name: 'No tier', ...FULL, tier: 'gold' },
      { id: 'none', name: 'Nothing' },
    ],
  },
];
const audit = auditRegistry(MIXED, NOW, {});
const ids = (f: Filters) => applyFilters(audit.sources, f).map((s) => s.sourceId).sort();
const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };

describe('gap filter', () => {
  it('covers the same four facts as the facts section, in the same order', () => {
    expect([...GAP_FIELDS]).toEqual([...FACT_FIELDS]);
    for (const g of GAP_FIELDS) expect(isGapField(g)).toBe(true);
    for (const v of ['any', '', 'name', 'Source', null, 2]) expect(isGapField(v)).toBe(false);
  });
  it('keeps the sources where the chosen fact is unknown', () => {
    expect(ids({ ...NO_FILTERS, gap: 'source' })).toEqual(['none', 'nosrc']);
    expect(ids({ ...NO_FILTERS, gap: 'licence' })).toEqual(['nolic', 'none']);
    expect(ids({ ...NO_FILTERS, gap: 'tier' })).toEqual(['none', 'notier']);
  });
  it('treats a date in the future as unknown, as the tables do', () => {
    expect(ids({ ...NO_FILTERS, gap: 'date' })).toEqual(['future', 'nodate', 'none']);
  });
  it('agrees with the facts section on every fact, on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const records = randomRegistry(seed, NOW).map((r) => ({ ...r, sources: r.sources.map((s, i) => ({ ...s, tier: i % 3 === 0 ? null : i % 5 })) }));
      const a = auditRegistry(records, NOW, {});
      const facts = buildRecordFacts(records, a);
      for (const gap of GAP_FIELDS) expect(applyFilters(a.sources, { ...NO_FILTERS, gap }).length, `seed ${seed} ${gap}`).toBe(facts.missingBy[gap]);
    }
  });
  it('says for one source whether a fact is unknown', () => {
    const none = audit.sources.find((s) => s.sourceId === 'none');
    const ok = audit.sources.find((s) => s.sourceId === 'ok');
    if (!none || !ok) throw new Error('fixture');
    for (const g of GAP_FIELDS) {
      expect(hasGap(none, g)).toBe(true);
      expect(hasGap(ok, g)).toBe(false);
    }
  });
  it('combines with other filters', () => {
    expect(ids({ ...NO_FILTERS, gap: 'tier', query: 'nothing' })).toEqual(['none']);
    expect(ids({ ...NO_FILTERS, gap: 'tier', licence: 'open' })).toEqual(['notier']);
  });
  it('reads and writes the query string, ignoring anything else', () => {
    expect(parseFilters('?gap=tier').gap).toBe('tier');
    for (const q of ['?gap=any', '?gap=', '?gap=Tier', '?gap=name']) expect('gap' in parseFilters(q), q).toBe(false);
    expect(serializeFilters({ ...NO_FILTERS, gap: 'date' })).toBe('?gap=date');
    const full: Filters = { state: 'fresh', kind: 'routes', query: 'abc', onlyIssues: true, tier: '2', licence: 'terms', dataset: 'r', gap: 'source' };
    expect(parseFilters(serializeFilters(full))).toEqual(full);
  });
  it('counts as active, is listed in words, and can be removed alone', () => {
    const f: Filters = { ...NO_FILTERS, gap: 'date', tier: 'E' };
    expect(hasActiveFilters({ ...NO_FILTERS, gap: 'date' })).toBe(true);
    expect(listActiveFilters(f, 'en').map((a) => a.label)).toEqual(['Tier: E', 'UNKNOWN: Retrieved date']);
    expect(listActiveFilters(f, 'fr').map((a) => a.label)).toEqual(['Niveau : E', 'UNKNOWN : Date de récupération']);
    expect(withoutFilter(f, 'gap')).toEqual({ ...NO_FILTERS, tier: 'E' });
  });
  it('is spoken as "no ..." in both languages', () => {
    expect(filterParts({ ...NO_FILTERS, gap: 'source' }, 'en')).toEqual(['no source']);
    expect(filterParts({ ...NO_FILTERS, gap: 'date' }, 'en')).toEqual(['no retrieved date']);
    expect(filterParts({ ...NO_FILTERS, gap: 'tier' }, 'fr')).toEqual(['sans niveau']);
    expect(filterParts({ ...NO_FILTERS, gap: 'date' }, 'fr')).toEqual(['sans date de récupération']);
  });
});

describe('gap control and drill-down', () => {
  it('has a labelled select with the four facts in both languages', () => {
    const en = renderFilterControls('en', { ...NO_FILTERS, gap: 'tier' });
    expect(en).toContain('<label for="ds-f-gap">Fact that is UNKNOWN</label>');
    expect(en).toContain('<option value="tier" selected>Tier</option>');
    expect(en.match(/<select id="ds-f-gap"[\s\S]*?<\/select>/)?.[0].match(/<option/g)).toHaveLength(GAP_FIELDS.length + 1);
    expect(renderFilterControls('fr', NO_FILTERS)).toContain('<label for="ds-f-gap">Élément UNKNOWN</label>');
  });
  it('round-trips as a drill-down target and is named in words', () => {
    for (const value of GAP_FIELDS) expect(parseDrillAction(drillAction({ kind: 'gap', value }))).toEqual({ kind: 'gap', value });
    expect(parseDrillAction('show:gap:name')).toBeNull();
    expect(drillFilters({ kind: 'gap', value: 'licence' })).toEqual({ ...NO_FILTERS, gap: 'licence' });
    expect(drillLabel({ kind: 'gap', value: 'licence' }, 'en')).toBe('List these sources. UNKNOWN: Licence');
  });
  it('the facts section offers a control beside each fact that is unknown somewhere, and none beside a zero', () => {
    const records: DatasetRecord[] = [{ id: 'd', name: 'Set', kind: 'places', sources: [{ id: 'a', ...FULL, tier: null }] }];
    const html = renderDataStatusPanel({ records, locale: 'en', now: NOW });
    expect(html).toContain('data-action="show:gap:tier"');
    for (const g of ['source', 'licence', 'date']) expect(html).not.toContain(`data-action="show:gap:${g}"`);
    expect(describeProblems(auditHtml(html))).toEqual([]);
  });
  it('the extra column is absent unless asked for, and every row keeps the same width with it', () => {
    const facts = buildRecordFacts(RECORDS, auditRegistry(RECORDS, NOW, {}));
    expect(renderRecordFactsHtml(facts, 'en')).not.toContain('[x]');
    const html = renderRecordFactsHtml(facts, 'en', { heading: 'Extra', cell: () => '[x]' });
    const table = /<table><caption>Records missing each fact<\/caption>[\s\S]*?<\/table>/.exec(html)?.[0] ?? '';
    const rows = table.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
    expect(rows).toHaveLength(5);
    for (const r of rows) expect((r.match(/<t[hd][ >]/g) ?? []).length).toBe(3);
  });
  it('clicking a control lists exactly the count beside it', () => {
    const host = new FakeHost();
    const seen: string[] = [];
    const panel = mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW, onFiltersChange: (s) => seen.push(s) });
    host.click('show:gap:date');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, gap: 'date' });
    expect(seen.at(-1)).toBe('?gap=date');
    expect(host.innerHTML).toContain('data-listed-summary="3"');
    expect(host.innerHTML).toContain('<option value="date" selected>');
    expect(host.announce.innerHTML).toContain('no retrieved date');
  });
  it('the select filters the list and can be cleared', () => {
    const host = new FakeHost();
    mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW });
    host.filter('change', 'gap', 'source');
    expect((host.region.innerHTML.match(/<tr><th scope="row">/g) ?? []).length).toBe(2);
    expect(host.region.innerHTML).toContain('Remove filter. UNKNOWN: Source');
    host.filter('change', 'gap', 'bogus');
    expect((host.region.innerHTML.match(/<tr><th scope="row">/g) ?? []).length).toBe(7);
  });
  it('is in the static form with links, and passes the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: MIXED, locale, now: NOW, staticView: sv, filters: { ...NO_FILTERS, gap: 'tier' } });
      expect(page).toContain('<select id="ds-f-gap" name="gap"');
      expect(page).toContain('href="/en/data-status?gap=date"');
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      expect(structureProblems(page)).toEqual([]);
      expect(targetsBelow44(page)).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(page))).toEqual([]);
    }
  });
});
