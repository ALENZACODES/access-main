/**
 * The page the server sends, followed as a person without scripts would: every link under
 * "Narrow this list", every suggested spelling and the JSON download is fetched from the same
 * handler, and what comes back has to agree with what the link promised.
 */
import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { applyFilters, NO_FILTERS, parseFilters } from './filters';
import { handleDataStatus, matchRoute, type DsResponse } from './http';
import { auditHtml, describeProblems, lintFrench, scanHtml, visibleText } from './index';
import type { ListedJson } from './listedJson';
import { isoDayOffset } from './round7Kit';
import { NOW } from './testkit';
import { englishInFrenchHtml } from './untranslated';

const src = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -3), tier: 0, ...over });
const RECORDS: DatasetRecord[] = [
  {
    id: 'p',
    name: 'Places',
    kind: 'places',
    sources: [src('a', 'Library ramps'), src('b', 'Market hall', { tier: 'E' }), src('c', 'Harbour lift', { retrievedAt: isoDayOffset(NOW, -400), licence: 'Proprietary' }), src('d', 'Ferry dock', { retrievedAt: null, licence: null, tier: null })],
  },
  { id: 'r', name: 'Routes', kind: 'routes', sources: [src('e', 'Transit stops'), src('f', 'Transit shelters', { tier: 3 })] },
];
const audit = auditRegistry(RECORDS, NOW, {});
const ctx = { getRecords: () => RECORDS, now: () => NOW };
const fetchOk = async (url: string, headers: Record<string, string> = {}, method = 'GET'): Promise<DsResponse> => {
  const res = await handleDataStatus({ method, url, headers }, ctx);
  if (res === null) throw new Error(`not handled: ${url}`);
  return res;
};
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/** The href and visible text of each link inside the first element that carries the given attribute. */
function linksIn(html: string, attr: string): { href: string; text: string }[] {
  const start = html.indexOf(`${attr}="`);
  if (start < 0) return [];
  const open = html.lastIndexOf('<', start);
  const tag = /^<(\w+)/.exec(html.slice(open))?.[1] ?? 'div';
  const end = html.indexOf(`</${tag}>`, start);
  return [...html.slice(start, end).matchAll(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map((m) => ({ href: unescape(m[1] ?? ''), text: unescape(m[2] ?? '') }));
}
const listedCount = (html: string) => Number(/data-listed-summary="(\d+)"/.exec(html)?.[1] ?? '0');

describe('narrowing links on the page the server sends', () => {
  it('each link lists exactly the number of sources it shows, in both languages', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = await fetchOk(`/${locale}/data-status`);
      const links = linksIn(page.body, 'data-facets');
      expect(links.length).toBeGreaterThan(8);
      for (const link of links) {
        const promised = Number(/\((\d+)\)$/.exec(link.text)?.[1]);
        const route = matchRoute(link.href);
        expect(route?.kind, link.href).toBe('html');
        expect(applyFilters(audit.sources, parseFilters(route?.search ?? '')).length, link.href).toBe(promised);
        const next = await fetchOk(link.href);
        expect(next.status).toBe(200);
        expect(listedCount(next.body), link.href).toBe(promised);
      }
    }
  });
  it('a narrowed page keeps the filter that was set and offers only filters not yet set', async () => {
    const page = await fetchOk('/en/data-status?kind=places');
    const links = linksIn(page.body, 'data-facets');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const f = parseFilters(matchRoute(link.href)?.search ?? '');
      expect(f.kind, link.href).toBe('places');
      expect(Object.keys(f).length, link.href).toBe(Object.keys(NO_FILTERS).length + (f.state === 'any' ? 1 : 0));
    }
    expect(visibleText(page.body)).not.toContain('By kind of data');
  });
  it('following links until none is left always ends on a list of at least one source', async () => {
    let url = '/en/data-status';
    for (let step = 0; step < 8; step++) {
      const page = await fetchOk(url);
      expect(listedCount(page.body)).toBeGreaterThan(0);
      const links = linksIn(page.body, 'data-facets');
      if (links.length === 0) return;
      url = links[links.length - 1]!.href;
    }
    throw new Error('narrowing did not end');
  });
  it('the narrowed pages pass the audits in both languages', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = await fetchOk(`/${locale}/data-status?state=fresh`);
      expect(scanHtml(page.body)).toEqual([]);
      expect(describeProblems(auditHtml(page.body))).toEqual([]);
      if (locale === 'fr') {
        const section = page.body.slice(page.body.indexOf('data-facets='), page.body.indexOf('</section>', page.body.indexOf('data-facets=')));
        expect(lintFrench(visibleText(`<section ${section}</section>`))).toEqual([]);
        expect(englishInFrenchHtml(`<section ${section}</section>`, ['Places', 'Routes'])).toEqual([]);
      }
    }
  });
});

describe('suggested spellings on the page the server sends', () => {
  it('the link searches for the close spelling and lists what it promised', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const page = await fetchOk(`/${locale}/data-status?q=transt`);
      expect(listedCount(page.body)).toBe(0);
      const links = linksIn(page.body, 'data-name-suggestions');
      expect(links).toHaveLength(1);
      expect(parseFilters(matchRoute(links[0]!.href)?.search ?? '')).toEqual({ ...NO_FILTERS, query: 'transit' });
      const next = await fetchOk(links[0]!.href);
      expect(listedCount(next.body)).toBe(2);
      expect(next.body).not.toContain('data-name-suggestions');
    }
  });
  it('keeps the other filters in the link, and offers nothing when they rule the spelling out', async () => {
    const kept = await fetchOk('/en/data-status?q=sheltrs&tier=3');
    const links = linksIn(kept.body, 'data-name-suggestions');
    expect(links).toHaveLength(1);
    expect(parseFilters(matchRoute(links[0]!.href)?.search ?? '')).toEqual({ ...NO_FILTERS, query: 'shelters', tier: '3' });
    const none = await fetchOk('/en/data-status?q=sheltrs&tier=E');
    expect(none.body).not.toContain('data-name-suggestions');
  });
  it('escapes search text that looks like markup', async () => {
    const page = await fetchOk(`/en/data-status?q=${encodeURIComponent('<script>alert(1)</script>')}`);
    expect(page.body).not.toContain('<script>alert');
    expect(describeProblems(auditHtml(page.body))).toEqual([]);
  });
});

describe('the JSON download on the page the server sends', () => {
  it('the link carries the filters of the page and the file holds the same sources as the list', async () => {
    for (const search of ['', '?state=stale', '?kind=routes&sort=source&dir=desc', '?q=transit', '?gap=tier']) {
      const page = await fetchOk(`/en/data-status${search}`);
      const href = unescape(/href="([^"]*listed-sources\.json[^"]*)"/.exec(page.body)?.[1] ?? '');
      expect(href, search).not.toBe('');
      const file = await fetchOk(href);
      const doc = JSON.parse(file.body) as ListedJson;
      expect(doc.listed, search).toBe(listedCount(page.body));
      expect(doc.total).toBe(audit.sources.length);
      expect(parseFilters(doc.filters)).toEqual(parseFilters(search));
      expect(doc.sources.map((s) => `${s.datasetId}/${s.sourceId}`).sort()).toEqual(
        applyFilters(audit.sources, parseFilters(search))
          .map((s) => `${s.datasetId}/${s.sourceId}`)
          .sort(),
      );
    }
  });
  it('follows the order asked for', async () => {
    const up = JSON.parse((await fetchOk('/en/data-status/listed-sources.json?sort=source')).body) as ListedJson;
    const down = JSON.parse((await fetchOk('/en/data-status/listed-sources.json?sort=source&dir=desc')).body) as ListedJson;
    expect(down.sources.map((s) => s.sourceId)).toEqual(up.sources.map((s) => s.sourceId).reverse());
  });
  it('has an ETag, answers a matching one with 304 and sends no body for HEAD', async () => {
    const url = '/fr/data-status/listed-sources.json?state=fresh';
    const first = await fetchOk(url);
    expect(first.headers['etag']).toBeTruthy();
    expect(first.headers['content-language']).toBe('fr');
    expect((await fetchOk(url, { 'if-none-match': first.headers['etag'] ?? '' })).status).toBe(304);
    const head = await fetchOk(url, {}, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    const other = await fetchOk('/fr/data-status/listed-sources.json?state=stale');
    expect(other.headers['etag']).not.toBe(first.headers['etag']);
  });
  it('writes UNKNOWN for what is not known and no localized word for it', async () => {
    for (const locale of ['en', 'fr'] as const) {
      const doc = JSON.parse((await fetchOk(`/${locale}/data-status/listed-sources.json?gap=tier`)).body) as ListedJson;
      expect(doc.sources).toHaveLength(1);
      expect(doc.sources[0]).toMatchObject({ sourceId: 'd', tier: 'UNKNOWN', licence: 'UNKNOWN', retrieved: 'UNKNOWN', reviewDate: 'UNKNOWN' });
      expect(JSON.stringify(doc)).not.toMatch(/Inconnu|"Unknown"/);
    }
  });
});
