import { describe, expect, it } from 'vitest';
import {
  PAGE_CSS,
  auditHtml,
  auditRegistry,
  classify,
  describeProblems,
  handleDataStatus,
  lintFrench,
  matchRoute,
  NO_FILTERS,
  parseTableView,
  renderDataStatusPage,
  renderDataStatusPanel,
  renderFilterControls,
  renderSourcesRegion,
  scanHtml,
  validateCatalogue,
  visibleText,
  type DatasetRecord,
  type DsRequest,
  type RegionNav,
} from './index';
import { FakeHeaders, NOW, RECORDS } from './testkit';

const many: DatasetRecord[] = [
  {
    id: 'big',
    name: 'Big',
    kind: 'places',
    sources: Array.from({ length: 60 }, (_, i) => ({
      id: `s${String(i + 1).padStart(2, '0')}`,
      name: `Source ${String(i + 1).padStart(2, '0')}`,
      source: 'Publisher',
      licence: i % 7 === 0 ? null : 'CC-BY-4.0',
      retrievedAt: i % 5 === 0 ? null : `2026-0${(i % 9) + 1}-15`,
    })),
  },
];

const req = (url: string, method = 'GET'): DsRequest => ({ method, url, headers: {} });
const ctx = (records: DatasetRecord[] = RECORDS) => ({ getRecords: () => records, now: () => NOW });
const get = async (url: string, records?: DatasetRecord[]) => {
  const r = await handleDataStatus(req(url), ctx(records));
  if (r === null) throw new Error('unhandled');
  return r;
};
const nav = (search: string, thresholds = {}): RegionNav => ({ action: '/en/data-status', thresholds, table: parseTableView(search) });
const region = (records: DatasetRecord[], locale: 'en' | 'fr', search: string, filters = NO_FILTERS) =>
  renderSourcesRegion(auditRegistry(records, NOW), locale, filters, NOW, { ...nav(search), action: `/${locale}/data-status` });

describe('routes: review.ics and catalogue.json', () => {
  it('match locale-prefixed paths only through the handler’s base', () => {
    expect(matchRoute('/fr/data-status/review.ics')?.kind).toBe('ics');
    expect(matchRoute('/en/data-status/catalogue.json')?.kind).toBe('catalogue');
    expect(matchRoute('/en/data-status/review.ics/x')).toBeNull();
    expect(matchRoute('/en/data-status/catalogue.jsonx')).toBeNull();
  });

  it('serves a calendar file as an attachment', async () => {
    const res = await get('/en/data-status/review.ics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="review-dates.ics"');
    expect(res.body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(res.body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('the calendar follows the staleness settings in the query', async () => {
    const res = await get('/en/data-status/review.ics?stale_places=30');
    expect(res.body).toContain('DTSTART;VALUE=DATE:20261201');
  });

  it('French calendar text', async () => {
    expect((await get('/fr/data-status/review.ics')).body).toContain('SUMMARY:Réviser la source de données\u00A0: Places <A> / Alpha');
  });

  it('serves the catalogue as JSON-LD that validates and keeps Unknown out', async () => {
    const res = await get('/fr/data-status/catalogue.json');
    expect(res.headers['content-type']).toBe('application/ld+json; charset=utf-8');
    const json = JSON.parse(res.body);
    expect(validateCatalogue(json)).toEqual([]);
    expect(res.body).not.toContain('"dct:license": ""');
  });

  it('both support HEAD, ETag/304 and the usual rejections', async () => {
    for (const path of ['review.ics', 'catalogue.json']) {
      const url = `/en/data-status/${path}`;
      const first = await get(url);
      const head = await handleDataStatus(req(url, 'HEAD'), ctx());
      expect(head?.body).toBe('');
      expect(head?.headers['etag']).toBe(first.headers['etag']);
      const cond = await handleDataStatus({ method: 'GET', url, headers: { 'if-none-match': first.headers['etag'] ?? '' } }, ctx());
      expect(cond?.status).toBe(304);
      expect((await handleDataStatus(req(url, 'POST'), ctx()))?.status).toBe(405);
      const redirect = await handleDataStatus(req('/data-status/review.ics'), ctx());
      expect(redirect?.headers['location']).toBe('/en/data-status/review.ics');
    }
  });

  it('the service worker treats both as downloads (saved copy, refreshed in the background)', () => {
    for (const p of ['/en/data-status/review.ics', '/fr/data-status/catalogue.json']) {
      expect(classify({ url: `https://app.example${p}`, method: 'GET', headers: new FakeHeaders() }, 'https://app.example')).toBe('data');
    }
  });
});

describe('page: download links and review schedule', () => {
  it('links to every download and keeps the staleness settings on them', async () => {
    const { body } = await get('/en/data-status?stale_places=90&state=stale');
    expect(body).toContain('href="/en/data-status/review.ics?stale_places=90"');
    expect(body).toContain('href="/en/data-status/catalogue.json?stale_places=90"');
    expect(body).toContain('href="/en/data-status/summary.json?stale_places=90"');
    expect(body).toContain('href="/en/data-status/sources.csv?state=stale&amp;stale_places=90"');
    expect(body).toContain('<h2 id="ds-due-title">Review schedule</h2>');
  });

  it('passes the HTML audit and wording rules in both languages, with sorting and paging active', async () => {
    for (const l of ['en', 'fr']) {
      const { body } = await get(`/${l}/data-status?sort=retrieved&dir=desc&size=10&page=2`, many);
      expect(describeProblems(auditHtml(body, { document: true }))).toEqual([]);
      expect(scanHtml(body)).toEqual([]);
      if (l === 'fr') expect(lintFrench(visibleText(body))).toEqual([]);
    }
  });
});

describe('sorting links in the sources table', () => {
  it('headings are links with 44px targets; the sorted one has aria-sort and a hidden arrow', () => {
    const html = region(many, 'en', '?sort=retrieved');
    expect(html).toContain('<th scope="col" aria-sort="ascending"><a href="/en/data-status?sort=retrieved&amp;dir=desc"');
    expect(html).toContain('<span aria-hidden="true"> ▲</span>');
    expect(html.match(/aria-sort=/g)).toHaveLength(1);
    expect(describeProblems(auditHtml(html))).toEqual([]);
  });

  it('other headings start an ascending sort and reset to page 1', () => {
    const html = region(many, 'en', '?sort=retrieved&page=3');
    expect(html).toContain('<a href="/en/data-status?sort=licence"');
    expect(html).not.toMatch(/href="[^"]*sort=licence[^"]*page=/);
  });

  it('headings keep filters, staleness settings and page size', () => {
    const r = renderSourcesRegion(auditRegistry(many, NOW), 'en', { ...NO_FILTERS, state: 'stale', query: 'source' }, NOW, nav('?size=10', { places: 90 }));
    expect(r).toContain('href="/en/data-status?state=stale&amp;q=source&amp;stale_places=90&amp;sort=source&amp;size=10"');
  });

  it('without navigation options the table has plain headings (live mode)', () => {
    const html = renderSourcesRegion(auditRegistry(many, NOW), 'en', NO_FILTERS, NOW);
    expect(html).not.toContain('aria-sort');
    expect(html).not.toContain('<nav');
    expect(html.match(/<tr>/g)).toHaveLength(61);
  });

  it('actually sorts the rows, Unknown dates last', () => {
    const html = region(many, 'en', '?sort=retrieved&size=100');
    const bodyRows = html.split('<tbody>')[1] ?? '';
    const firstUnknown = bodyRows.indexOf('<td>UNKNOWN</td><td>UNKNOWN</td>');
    const lastDate = bodyRows.lastIndexOf('<time datetime=');
    expect(firstUnknown).toBeGreaterThan(lastDate);
  });
});

describe('pager', () => {
  it('shows 25 rows, page status and a next link on page 1', () => {
    const html = region(many, 'en', '');
    expect(html.match(/<tr>/g)).toHaveLength(26);
    expect(html).toContain('<nav aria-label="Pages of results">');
    expect(html).toContain('Page 1 of 3');
    expect(html).toContain('rel="next"');
    expect(html).toContain('<span aria-disabled="true"');
    expect(html).not.toContain('rel="prev"');
  });

  it('middle page has both links, and links keep sort and size', () => {
    const html = region(many, 'fr', '?sort=source&size=10&page=3');
    expect(html).toContain('Page 3 de 6');
    expect(html).toContain('href="/fr/data-status?sort=source&amp;size=10&amp;page=2" rel="prev"');
    expect(html).toContain('href="/fr/data-status?sort=source&amp;size=10&amp;page=4" rel="next"');
    expect(html).toContain('Page précédente');
  });

  it('page 2 link on page 1 has no page parameter for page 1 itself', () => {
    const html = region(many, 'en', '?page=2');
    expect(html).toContain('href="/en/data-status" rel="prev"');
  });

  it('an out-of-range page shows the last page, not an empty table', () => {
    const html = region(many, 'en', '?page=999');
    expect(html).toContain('Page 3 of 3');
    expect(html.match(/<tr>/g)).toHaveLength(11);
  });

  it('no pager for a single page', () => {
    expect(region(RECORDS, 'en', '')).not.toContain('<nav');
  });

  it('counts still describe all matching rows, not the page', () => {
    expect(region(many, 'en', '')).toContain('60 of 60 sources shown');
  });

  it('pager targets are at least 44px and pass the audit in both languages', () => {
    for (const l of ['en', 'fr'] as const) {
      const html = region(many, l, '?page=2');
      expect(describeProblems(auditHtml(html))).toEqual([]);
      if (l === 'fr') expect(lintFrench(visibleText(html))).toEqual([]);
    }
  });
});

describe('filter form keeps the table arrangement', () => {
  it('adds a labelled page-size select and hidden sort fields; the page number restarts', () => {
    const html = renderFilterControls('en', NO_FILTERS, { action: '/en/data-status', table: parseTableView('?sort=retrieved&dir=desc&size=50&page=4') });
    expect(html).toContain('<label for="ds-f-size">Rows per page</label>');
    expect(html).toContain('<option value="50" selected>50</option>');
    expect(html).toContain('<input type="hidden" name="sort" value="retrieved"><input type="hidden" name="dir" value="desc">');
    expect(html).not.toContain('name="page"');
  });

  it('without a table the form is as before', () => {
    expect(renderFilterControls('en', NO_FILTERS, { action: '/x' })).not.toContain('ds-f-size');
  });
});

describe('panel in the two modes', () => {
  it('live mode shows the review schedule but no download links or pager', () => {
    const html = renderDataStatusPanel({ records: many, locale: 'en', now: NOW });
    expect(html).toContain('Review schedule');
    expect(html).not.toContain('review.ics');
    expect(html).not.toContain('aria-sort');
  });

  it('static page with a table view sorts and pages', () => {
    const html = renderDataStatusPage({
      records: many,
      locale: 'en',
      now: NOW,
      table: parseTableView('?size=10'),
      staticView: { action: '/en/data-status', csvHref: '/c', creditsHref: '/t', summaryHref: '/s' },
    });
    expect(html).toContain('Page 1 of 6');
    expect(html).not.toContain('review.ics'); // optional links appear only when given
  });
});

describe('print, contrast and motion CSS', () => {
  it('has print rules that keep tables readable and hide controls', () => {
    expect(PAGE_CSS).toContain('@media print');
    expect(PAGE_CSS).toContain('thead{display:table-header-group}');
    expect(PAGE_CSS).toContain('.ds-scroll{overflow:visible}');
  });
  it('respects reduced motion and forced colors', () => {
    expect(PAGE_CSS).toContain('prefers-reduced-motion:reduce');
    expect(PAGE_CSS).toContain('forced-colors:active');
  });
  it('still never removes the focus outline', () => {
    expect(PAGE_CSS).toContain(':focus-visible{outline:3px solid');
    expect(PAGE_CSS).not.toMatch(/outline:\s*(none|0)/);
  });
});
