import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { drillAction, drillFilters, parseDrillAction } from './drillDown';
import { buildDueSummary, DUE_ROW_IDS, dueRowLabel, renderDueSummaryHtml } from './dueSummary';
import { applyFilters, DUE_WINDOWS, NO_FILTERS } from './filters';
import { auditHtml, describeProblems, lintFrench, mountDataStatusPanel, renderDataStatusPanel, scanHtml, visibleText } from './index';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { FakeHost, NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';

const aged = (id: string, days: number | null) => ({ id, name: `Aged ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: days === null ? null : isoDayOffset(NOW, -days), tier: 0 });
// Places are reviewed 180 days after retrieval.
const MIXED: DatasetRecord[] = [
  { id: 'p', name: 'Places', kind: 'places', sources: [aged('new', 3), aged('due5', 175), aged('due25', 155), aged('due80', 100), aged('today', 180), aged('past', 181), aged('old', 400), aged('none', null)] },
];
const audit = auditRegistry(MIXED, NOW, {});
const count = (id: string) => buildDueSummary(audit).rows.find((r) => r.id === id)?.count;

describe('buildDueSummary', () => {
  it('has a row for past, each window and unscheduled, in that order', () => {
    expect(buildDueSummary(audit).rows.map((r) => r.id)).toEqual([...DUE_ROW_IDS]);
    expect([...DUE_ROW_IDS]).toEqual(['past', 'd7', 'd30', 'd90', 'unscheduled']);
  });
  it('counts each row', () => {
    expect(count('past')).toBe(2);
    expect(count('d7')).toBe(2);
    expect(count('d30')).toBe(3);
    expect(count('d90')).toBe(4);
    expect(count('unscheduled')).toBe(1);
    expect(buildDueSummary(audit).later).toBe(1);
    expect(buildDueSummary(audit).total).toBe(8);
  });
  it('past, the widest window, later and unscheduled together are every source, once', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const d = buildDueSummary(a);
      const get = (id: string) => d.rows.find((r) => r.id === id)?.count ?? 0;
      expect(get('past') + get('d90') + d.later + get('unscheduled'), `seed ${seed}`).toBe(d.total);
      expect(get('d7')).toBeLessThanOrEqual(get('d30'));
      expect(get('d30')).toBeLessThanOrEqual(get('d90'));
    }
  });
  it('each count is what its filter lists, on random registries', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = auditRegistry(randomRegistry(seed, NOW), NOW, {});
      const d = buildDueSummary(a);
      const get = (id: string) => d.rows.find((r) => r.id === id)?.count;
      for (const due of DUE_WINDOWS) expect(get(due), `seed ${seed} ${due}`).toBe(applyFilters(a.sources, { ...NO_FILTERS, due }).length);
      expect(get('past')).toBe(applyFilters(a.sources, { ...NO_FILTERS, state: 'stale' }).length);
      expect(get('unscheduled')).toBe(applyFilters(a.sources, { ...NO_FILTERS, state: 'unknown' }).length);
    }
  });
  it('is all zeros for an empty registry', () => {
    const d = buildDueSummary(auditRegistry([], NOW, {}));
    expect(d.rows.every((r) => r.count === 0)).toBe(true);
    expect(d).toMatchObject({ total: 0, later: 0 });
  });
  it('follows a changed review limit', () => {
    const shorter = buildDueSummary(auditRegistry(MIXED, NOW, { places: 10 }));
    expect(shorter.rows.find((r) => r.id === 'd7')?.count).toBe(1);
    expect(shorter.rows.find((r) => r.id === 'past')?.count).toBe(6);
  });
});

describe('renderDueSummaryHtml', () => {
  it('labels every row in both languages', () => {
    expect(DUE_ROW_IDS.map((id) => dueRowLabel(id, 'en'))).toEqual(['Already passed', 'Within 7 days', 'Within 30 days', 'Within 90 days', 'Not scheduled (retrieved date UNKNOWN)']);
    for (const id of DUE_ROW_IDS) expect(dueRowLabel(id, 'fr')).not.toBe(dueRowLabel(id, 'en'));
  });
  it('shows the counts, explains the overlap, and mentions later reviews with the right plural', () => {
    const html = renderDueSummaryHtml(buildDueSummary(audit), 'en');
    expect(html).toContain('<th scope="row">Within 30 days</th><td>3</td></tr>');
    expect(html).toContain('The three windows overlap');
    expect(html).toContain('1 source has a review date more than 90 days away.');
    const two = renderDueSummaryHtml({ ...buildDueSummary(audit), later: 2 }, 'en');
    expect(two).toContain('2 sources have a review date more than 90 days away.');
    expect(renderDueSummaryHtml({ ...buildDueSummary(audit), later: 0 }, 'en')).not.toContain('days away');
  });
  it('says so when there are no sources', () => {
    const html = renderDueSummaryHtml(buildDueSummary(auditRegistry([], NOW, {})), 'en');
    expect(html).toContain('There are no sources to schedule.');
    expect(html).not.toContain('<table');
  });
  it('adds the extra column only when asked, with an empty cell on a row that counts nothing', () => {
    const d = buildDueSummary(auditRegistry([{ id: 'p', name: 'Places', kind: 'places', sources: [aged('new', 3)] }], NOW, {}));
    expect(renderDueSummaryHtml(d, 'en')).not.toContain('[');
    const html = renderDueSummaryHtml(d, 'en', { heading: 'Extra', cell: (id) => `[${id}]` });
    expect(html).toContain('<th scope="col">Extra</th>');
    expect(html.match(/\[[a-z0-9]+\]/g)).toBeNull();
    const all = renderDueSummaryHtml(buildDueSummary(audit), 'en', { heading: 'Extra', cell: (id) => `[${id}]` });
    expect(all.match(/\[[a-z0-9]+\]/g)).toEqual(['[past]', '[d7]', '[d30]', '[d90]', '[unscheduled]']);
  });
  it('passes the markup and wording audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const a of [audit, auditRegistry(RECORDS, NOW, {}), auditRegistry([], NOW, {})]) {
        const html = renderDueSummaryHtml(buildDueSummary(a), locale);
        expect(html).toContain('aria-labelledby="ds-duesoon-title"');
        expect(scanHtml(html)).toEqual([]);
        expect(describeProblems(auditHtml(html))).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});

describe('reviews coming up on the panel', () => {
  it('is there once, after the review workload, and in the contents list', () => {
    const html = renderDataStatusPanel({ records: MIXED, locale: 'en', now: NOW });
    expect(html.match(/id="ds-duesoon-title"/g)).toHaveLength(1);
    expect(html.indexOf('id="ds-duesoon-title"')).toBeGreaterThan(html.indexOf('id="ds-workload-title"'));
    expect(html).toContain('<option value="ds-duesoon-title">');
    expect(structureProblems(html)).toEqual([]);
    expect(targetsBelow44(html)).toEqual([]);
  });
  it('each row with sources has a control, and the review-date window is a drill-down target', () => {
    const html = renderDataStatusPanel({ records: MIXED, locale: 'en', now: NOW });
    for (const a of ['show:due:d7', 'show:due:d30', 'show:due:d90', 'show:state:stale', 'show:state:unknown']) expect(html, a).toContain(`data-action="${a}"`);
    for (const value of DUE_WINDOWS) expect(parseDrillAction(drillAction({ kind: 'due', value }))).toEqual({ kind: 'due', value });
    expect(parseDrillAction('show:due:d60')).toBeNull();
    expect(drillFilters({ kind: 'due', value: 'd7' })).toEqual({ ...NO_FILTERS, due: 'd7' });
  });
  it('clicking a window lists exactly its count', () => {
    const host = new FakeHost();
    const panel = mountDataStatusPanel(host, { getRecords: () => MIXED, getLocale: () => 'en', now: () => NOW });
    host.click('show:due:d30');
    expect(panel.getFilters()).toEqual({ ...NO_FILTERS, due: 'd30' });
    expect(host.innerHTML).toContain('data-listed-summary="3"');
    expect(host.announce.innerHTML).toContain('review due within 30 days');
  });
  it('uses links in the static view and passes the audits in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = renderDataStatusPanel({ records: MIXED, locale, now: NOW, staticView: { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' } });
      expect(page).toContain('href="/en/data-status?due=d7"');
      expect(page).not.toContain('data-action="show:due:');
      expect(scanHtml(page)).toEqual([]);
      expect(describeProblems(auditHtml(page))).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(page))).toEqual([]);
    }
  });
});
