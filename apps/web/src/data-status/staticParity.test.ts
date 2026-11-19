import { describe, expect, it } from 'vitest';
import { containsForbiddenOrg } from '../../../../packages/shared/test/forbiddenOrg.ts';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { buildFactsCsv } from './factsCsv';
import { NO_FILTERS, parseFilters } from './filters';
import { groupPageText, groupsOnPage, groupSources } from './groupedList';
import { auditHtml, describeProblems, EMPTY_VIEW, handleDataStatus, lintFrench, matchRoute, renderDataStatusPanel, scanCopy, scanHtml, visibleText, withSort, type DsRequest, type DsResponse } from './index';
import { buildChecklist, checklistToCsv, checklistToMarkdown } from './reviewChecklist';
import { isoDayOffset } from './round7Kit';
import { buildQuery, layoutParams, parseDetails, parseTableView } from './tableView';
import { buildTablesCsv } from './tablesCsv';
import { NOW, RECORDS, structureProblems, targetsBelow44 } from './testkit';
import { buildTextSummary } from './textSummary';

const src = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const MANY: DatasetRecord[] = [
  { id: 'p', name: 'Places', kind: 'places', sources: Array.from({ length: 30 }, (_, i) => src(`s${String(i).padStart(2, '0')}`, { tier: i < 18 ? 0 : i < 26 ? 'E' : null })) },
];
const ctx = (records: readonly DatasetRecord[] = RECORDS) => ({ getRecords: () => records, now: () => NOW });
const get = (url: string): DsRequest => ({ method: 'GET', url, headers: {} });
const ok = async (url: string, records: readonly DatasetRecord[] = RECORDS): Promise<DsResponse> => {
  const res = await handleDataStatus(get(url), ctx(records));
  if (res === null) throw new Error(`not handled: ${url}`);
  return res;
};
const sv = { action: '/en/data-status', csvHref: '/c', creditsHref: '/k', summaryHref: '/s' };
const page = (records: readonly DatasetRecord[], search: string, locale: 'en' | 'fr' = 'en') =>
  renderDataStatusPanel({ records, locale, now: NOW, staticView: sv, filters: parseFilters(search), table: parseTableView(search) });

describe('table view: grouping and details in the address', () => {
  it('reads details only from details=1', () => {
    expect(parseDetails('?details=1')).toBe(true);
    for (const q of ['', '?details=0', '?details=true', '?details=', '?detail=1']) expect(parseDetails(q)).toBe(false);
  });
  it('adds group and details to the table view only when set, so a plain view is unchanged', () => {
    expect(parseTableView('')).toEqual({ sort: null, paging: parseTableView('').paging });
    expect(Object.keys(parseTableView('?sort=tier')).sort()).toEqual(['paging', 'sort']);
    expect(parseTableView('?group=tier&details=1')).toMatchObject({ group: 'tier', details: true });
    expect('group' in parseTableView('?group=none')).toBe(false);
    expect('group' in parseTableView('?group=bogus')).toBe(false);
  });
  it('writes them back into links, after the filters and the order', () => {
    expect(layoutParams({})).toEqual([]);
    expect(layoutParams({ group: 'none' })).toEqual([]);
    expect(layoutParams({ group: 'age', details: true })).toEqual([['group', 'age'], ['details', '1']]);
    const table = parseTableView('?sort=tier&dir=desc&group=status&details=1');
    const q = buildQuery({ filters: { ...NO_FILTERS, tier: 'E' }, thresholds: {} }, table);
    expect(q).toContain('tier=E');
    expect(q).toContain('sort=tier');
    expect(q).toContain('group=status');
    expect(q).toContain('details=1');
    expect(parseTableView(q)).toEqual(table);
    expect(buildQuery(EMPTY_VIEW, parseTableView(''))).toBe('');
  });
  it('adds the order to a query string, or leaves it alone', () => {
    expect(withSort('', null)).toBe('');
    expect(withSort('?tier=E', null)).toBe('?tier=E');
    expect(withSort('', { key: 'tier', dir: 'asc' })).toBe('?sort=tier');
    expect(withSort('?tier=E', { key: 'source', dir: 'desc' })).toBe('?tier=E&sort=source&dir=desc');
  });
});

describe('groups on one page', () => {
  const audit = auditRegistry(MANY, NOW, {});
  const groups = groupSources(audit.sources, 'tier', 'en');
  it('keeps only the sources on the page, under their groups, in order', () => {
    const pageItems = audit.sources.slice(10, 20);
    const on = groupsOnPage(groups, pageItems);
    expect(on.map((g) => [g.group.id, g.drawn.length])).toEqual([['0', 8], ['E', 2]]);
    expect(on.flatMap((g) => g.drawn)).toEqual(pageItems);
  });
  it('leaves out groups with nothing on the page, and is empty for an empty page', () => {
    expect(groupsOnPage(groups, audit.sources.slice(0, 5)).map((g) => g.group.id)).toEqual(['0']);
    expect(groupsOnPage(groups, [])).toEqual([]);
  });
  it('says how many of a group are on the page', () => {
    expect(groupPageText(8, 18, 'en')).toBe('8 of the 18 in this group are on this page.');
    expect(lintFrench(groupPageText(8, 18, 'fr'))).toEqual([]);
  });
});

describe('static page: grouping and details without scripts', () => {
  it('has the Group by and details controls inside the GET form, with names', () => {
    const html = page(MANY, '');
    const form = /<form method="get"[\s\S]*?<\/form>/.exec(html)?.[0] ?? '';
    expect(form).toContain('<select id="ds-f-group" name="group"');
    expect(form).toContain('<input type="checkbox" id="ds-f-details" name="details" value="1"');
    expect(form).toContain('<option value="none" selected>');
  });
  it('marks the chosen grouping and details in the form', () => {
    const html = page(MANY, '?group=tier&details=1');
    expect(html).toContain('<option value="tier" selected>');
    expect(html).toMatch(/id="ds-f-details"[^>]* checked/);
  });
  it('groups the rows of the page under headings with whole-group counts', () => {
    const html = page(MANY, '?group=tier&size=10&page=2');
    expect(html).toContain('Tier 0 (18 sources)');
    expect(html).toContain('8 of the 18 in this group are on this page.');
    expect(html).toContain('Tier E (8 sources)');
    expect(html).toContain('2 of the 8 in this group are on this page.');
    expect(html).not.toContain('Tier: Unknown (4 sources)');
    const groups = (html.match(/<section aria-labelledby="ds-group-\d+"[\s\S]*?<\/section>/g) ?? []).join('');
    expect((groups.match(/<tr><th scope="row">/g) ?? []).length).toBe(10);
  });
  it('keeps the pager and the sortable headings, and they carry the grouping and details', () => {
    const html = page(MANY, '?group=tier&details=1&size=10');
    expect(html).toMatch(/rel="next"/);
    const next = /<a href="([^"]*)" rel="next"/.exec(html)?.[1] ?? '';
    expect(next).toContain('group=tier');
    expect(next).toContain('details=1');
    expect(next).toContain('page=2');
    const sortLink = /<th scope="col"[^>]*><a href="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(sortLink).toContain('group=tier');
    expect(sortLink).toContain('details=1');
  });
  it('shows the facts under each row when details are on, and not otherwise', () => {
    expect(page(RECORDS, '')).not.toContain('data-row-detail');
    expect(page(RECORDS, '?details=1').match(/data-row-detail="7"/g)).toHaveLength(3);
  });
  it('is one table with no group sections when ungrouped, as before', () => {
    const html = page(RECORDS, '');
    expect(html).not.toContain('data-group=');
    expect(html).toContain('<caption>Sources</caption>');
  });
  it('passes the audits grouped, with details, on a later page, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const search of ['?group=tier&details=1&size=10&page=2', '?group=status', '?details=1', '?group=age&sort=tier&dir=desc']) {
        const html = page(MANY, search, locale);
        expect(scanHtml(html), `${locale} ${search}`).toEqual([]);
        expect(describeProblems(auditHtml(html)), `${locale} ${search}`).toEqual([]);
        expect(structureProblems(html)).toEqual([]);
        expect(targetsBelow44(html)).toEqual([]);
        if (locale === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
      }
    }
  });
});

describe('server routes for the new downloads', () => {
  it('matches each new path and nothing longer', () => {
    expect(matchRoute('/en/data-status/review-checklist.md')?.kind).toBe('checklistMd');
    expect(matchRoute('/fr/data-status/review-checklist.csv')?.kind).toBe('checklistCsv');
    expect(matchRoute('/en/data-status/record-facts.csv')?.kind).toBe('facts');
    expect(matchRoute('/en/data-status/planning-tables.csv')?.kind).toBe('tables');
    expect(matchRoute('/en/data-status/summary.txt')?.kind).toBe('textSummary');
    for (const u of ['/en/data-status/review-checklist.pdf', '/en/data-status/summary.txt/x', '/en/data-status/record-facts']) expect(matchRoute(u), u).toBeNull();
  });
  it('serves the Markdown checklist for the filters and the order in the address', async () => {
    const res = await ok('/en/data-status/review-checklist.md?tier=unknown&sort=source&dir=desc');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="review-checklist.md"');
    const audit = auditRegistry(RECORDS, NOW, {});
    const filters = parseFilters('?tier=unknown');
    const names = new Map(audit.datasets.map((d) => [d.id, d.name] as const));
    expect(res.body).toBe(checklistToMarkdown(buildChecklist(audit, filters, 'en', { key: 'source', dir: 'desc' }), filters, NOW, 'en', { datasetNames: names }));
    expect(res.body).toContain('Filters: Tier: Unknown.');
  });
  it('serves the CSV checklist, in French when asked', async () => {
    const res = await ok('/fr/data-status/review-checklist.csv');
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-language']).toBe('fr');
    expect(res.body).toBe(checklistToCsv(buildChecklist(auditRegistry(RECORDS, NOW, {}), NO_FILTERS, 'fr'), 'fr'));
  });
  it('serves the record facts, the planning tables and the text summary', async () => {
    const audit = auditRegistry(RECORDS, NOW, {});
    const facts = await ok('/en/data-status/record-facts.csv');
    expect(facts.body).toBe(buildFactsCsv(RECORDS, audit, 'en'));
    expect(facts.headers['content-disposition']).toBe('attachment; filename="record-facts.csv"');
    const tables = await ok('/en/data-status/planning-tables.csv');
    expect(tables.body).toBe(buildTablesCsv(audit, NOW, 'en'));
    const summary = await ok('/fr/data-status/summary.txt');
    expect(summary.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(summary.body).toBe(buildTextSummary(RECORDS, auditRegistry(RECORDS, NOW, {}), NOW, 'fr'));
  });
  it('follows a review period given in the address', async () => {
    const a = await ok('/en/data-status/review-checklist.csv', MANY);
    const b = await ok('/en/data-status/review-checklist.csv?stale_places=2', MANY);
    expect(b.body.length).toBeGreaterThan(a.body.length);
  });
  it('gives each download an ETag, answers a matching one with 304, and sends no body for HEAD', async () => {
    for (const path of ['/en/data-status/review-checklist.md', '/en/data-status/record-facts.csv', '/en/data-status/summary.txt']) {
      const first = await ok(path);
      expect(first.headers['etag']).toBeTruthy();
      const again = await handleDataStatus({ method: 'GET', url: path, headers: { 'if-none-match': first.headers['etag'] ?? '' } }, ctx());
      expect(again?.status).toBe(304);
      const head = await handleDataStatus({ method: 'HEAD', url: path, headers: {} }, ctx());
      expect(head?.status).toBe(200);
      expect(head?.body).toBe('');
    }
  });
  it('the page links to every new download, the checklist links carrying the filters and the order', async () => {
    const res = await ok('/en/data-status?tier=E&sort=source&dir=desc&group=tier');
    expect(res.body).toContain('href="/en/data-status/review-checklist.md?tier=E&amp;sort=source&amp;dir=desc"');
    expect(res.body).toContain('href="/en/data-status/review-checklist.csv?tier=E&amp;sort=source&amp;dir=desc"');
    expect(res.body).toContain('href="/en/data-status/record-facts.csv"');
    expect(res.body).toContain('href="/en/data-status/planning-tables.csv"');
    expect(res.body).toContain('href="/en/data-status/summary.txt"');
    expect(res.body).toContain('data-group="E"');
  });
  it('every link on the page that points at a download is answered', async () => {
    const res = await ok('/fr/data-status?details=1');
    const hrefs = [...res.body.matchAll(/href="(\/fr\/data-status\/[^"]+)"/g)].map((m) => (m[1] ?? '').replace(/&amp;/g, '&'));
    expect(hrefs.length).toBeGreaterThanOrEqual(8);
    for (const href of new Set(hrefs)) {
      const got = await handleDataStatus(get(href), ctx());
      expect(got?.status, href).toBe(200);
    }
  });
  it('the grouped, detailed page from the server passes the audits and wording checks in both languages', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const res = await ok(`/${locale}/data-status?group=licence&details=1`);
      expect(res.status).toBe(200);
      expect(scanHtml(res.body)).toEqual([]);
      expect(describeProblems(auditHtml(res.body))).toEqual([]);
      if (locale === 'fr') expect(lintFrench(visibleText(res.body))).toEqual([]);
      expect(containsForbiddenOrg(res.body)).toBe(false);
    }
    for (const path of ['/en/data-status/review-checklist.md', '/fr/data-status/review-checklist.md', '/fr/data-status/summary.txt']) {
      const res = await ok(path);
      expect(scanCopy(res.body)).toEqual([]);
      expect(containsForbiddenOrg(res.body)).toBe(false);
    }
  });
});
