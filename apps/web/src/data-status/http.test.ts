import { describe, expect, it } from 'vitest';
import {
  MAX_URL_LENGTH,
  alternateHref,
  auditHtml,
  describeProblems,
  handleDataStatus,
  lintFrench,
  matchRoute,
  renderErrorPage,
  scanHtml,
  validateSummary,
  visibleText,
  type DatasetRecord,
  type DsRequest,
  type DsResponse,
} from './index';
import { NOW, RECORDS } from './testkit';

const ctx = (over: Partial<Parameters<typeof handleDataStatus>[1]> = {}) => ({ getRecords: () => RECORDS, now: () => NOW, ...over });
const get = (url: string, headers: Record<string, string> = {}, method = 'GET'): DsRequest => ({ method, url, headers });
const ok = async (req: DsRequest, c = ctx()): Promise<DsResponse> => {
  const res = await handleDataStatus(req, c);
  if (res === null) throw new Error('not handled');
  return res;
};

describe('matchRoute', () => {
  it('matches the base, the locale-prefixed base and the three downloads', () => {
    expect(matchRoute('/data-status')).toMatchObject({ locale: null, kind: 'html' });
    expect(matchRoute('/fr/data-status')).toMatchObject({ locale: 'fr', kind: 'html' });
    expect(matchRoute('/en/data-status/sources.csv?x=1')).toMatchObject({ locale: 'en', kind: 'csv', search: '?x=1' });
    expect(matchRoute('/fr/data-status/credits.txt')?.kind).toBe('credits');
    expect(matchRoute('/en/data-status/summary.json')?.kind).toBe('summary');
    expect(matchRoute('/en/data-status/')?.pathname).toBe('/en/data-status');
  });

  it('does not match other paths', () => {
    for (const u of ['/', '/other', '/data-statusx', '/de/data-status', '/fr/other/data-status', '/data-status/extra', '/en/data-status/sources.csv/x', 'http://[bad']) {
      expect(matchRoute(u), u).toBeNull();
    }
  });

  it('supports a custom base path', () => {
    expect(matchRoute('/fr/qa', '/qa')).toMatchObject({ locale: 'fr', kind: 'html' });
    expect(matchRoute('/fr/data-status', '/qa')).toBeNull();
  });
});

describe('handleDataStatus: routing', () => {
  it('returns null for paths that are not its own so the caller can carry on', async () => {
    expect(await handleDataStatus(get('/'), ctx())).toBeNull();
    expect(await handleDataStatus(get('/api/other'), ctx())).toBeNull();
  });

  it('redirects an unprefixed path to the visitor’s language, keeping the query', async () => {
    const fr = await ok(get('/data-status?state=stale', { 'Accept-Language': 'fr-CA,fr;q=0.9' }));
    expect(fr.status).toBe(302);
    expect(fr.headers.location).toBe('/fr/data-status?state=stale');
    expect(fr.headers.vary).toBe('Accept-Language');
    expect((await ok(get('/data-status'))).headers.location).toBe('/en/data-status');
    expect((await ok(get('/data-status/sources.csv', { 'accept-language': 'fr' }))).headers.location).toBe('/fr/data-status/sources.csv');
  });

  it('honours a custom base path', async () => {
    const res = await ok(get('/fr/qa'), ctx({ basePath: '/qa' }));
    expect(res.status).toBe(200);
    expect(res.body).toContain('action="/fr/qa"');
  });
});

describe('handleDataStatus: HTML page', () => {
  it('is a complete page with the right headers', async () => {
    const res = await ok(get('/en/data-status'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['content-language']).toBe('en');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).not.toContain('script-src');
    expect(res.headers['content-length']).toBe(String(new TextEncoder().encode(res.body).length));
    expect(res.headers.etag).toMatch(/^W\/"[0-9a-f]{8}-\d+"$/);
    for (const k of Object.keys(res.headers)) expect(k).toBe(k.toLowerCase());
  });

  it('works without scripts: filters are a GET form, downloads are links, no inline scripts', async () => {
    const { body } = await ok(get('/en/data-status'));
    expect(body).toContain('<form method="get" action="/en/data-status">');
    expect(body).toContain('type="submit"');
    expect(body).toContain('href="/en/data-status/sources.csv"');
    expect(body).toContain('href="/en/data-status/credits.txt"');
    expect(body).toContain('href="/en/data-status/summary.json"');
    expect(body).not.toContain('<script');
    expect(body).not.toContain('data-action=');
  });

  it('passes the HTML audit, the wording guard and (FR) the typography lint in both languages', async () => {
    for (const l of ['en', 'fr']) {
      const { body } = await ok(get(`/${l}/data-status`));
      expect(describeProblems(auditHtml(body, { document: true }))).toEqual([]);
      expect(scanHtml(body)).toEqual([]);
      if (l === 'fr') expect(lintFrench(visibleText(body))).toEqual([]);
    }
  });

  it('applies filters and staleness settings from the query', async () => {
    const stale = await ok(get('/en/data-status?state=stale'));
    expect(stale.body).toContain('1 of 3 sources shown');
    expect(stale.body).toContain('<option value="stale" selected>');
    const relaxed = await ok(get('/en/data-status?state=stale&stale_places=2000'));
    expect(relaxed.body).toContain('0 of 3 sources shown');
    expect(relaxed.body).toContain('<input type="hidden" name="stale_places" value="2000">');
    expect(relaxed.body).toContain('<td>Custom value</td>');
  });

  it('ignores junk in the query instead of failing', async () => {
    const res = await ok(get('/fr/data-status?state=zzz&kind=%00&q=' + 'x'.repeat(300) + '&stale_places=NaN&issues=maybe'));
    expect(res.status).toBe(200);
  });

  it('escapes dataset names, including script tags', async () => {
    const records: DatasetRecord[] = [{ id: 'x', name: '<script>alert(1)</script>', kind: 'places', sources: [{ id: '"><img src=x onerror=y>' }] }];
    const { body } = await ok(get('/en/data-status'), ctx({ getRecords: () => records }));
    expect(body).not.toContain('<script>alert');
    expect(body).not.toContain('<img src=x');
    expect(auditHtml(body, { document: true }).filter((p) => p.code === 'inline-event-handler')).toEqual([]);
  });

  it('accepts records from a promise and a trailing slash', async () => {
    const res = await ok(get('/en/data-status/'), ctx({ getRecords: async () => RECORDS }));
    expect(res.status).toBe(200);
  });

  it('shows what could not be read when the caller passes loader issues', async () => {
    const res = await ok(get('/fr/data-status'), ctx({ loadIssues: [{ severity: 'error', code: 'bad-kind', path: 'datasets[2].kind' }] }));
    expect(res.body).toContain('Certaines fiches n’ont pas pu être lues');
    expect(res.body).toContain('datasets[2].kind\u00A0: type de jeu de données inconnu');
  });
});

describe('handleDataStatus: downloads', () => {
  it('CSV: attachment, follows the filters, localized headers', async () => {
    const all = await ok(get('/en/data-status/sources.csv'));
    expect(all.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(all.headers['content-disposition']).toBe('attachment; filename="data-sources.csv"');
    expect(all.body).toContain('Alpha');
    expect(all.body).toContain('Beta');
    const filtered = await ok(get('/fr/data-status/sources.csv?q=beta'));
    expect(filtered.body).toContain('Jeu de données');
    expect(filtered.body).toContain('Beta');
    expect(filtered.body).not.toContain('Alpha');
  });

  it('credits: plain text, one line per source, unfiltered', async () => {
    const res = await ok(get('/en/data-status/credits.txt?q=beta'));
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.body.trim().split('\n')).toHaveLength(3);
    expect(res.body).toContain('Open Government Licence – Ontario');
  });

  it('summary: valid JSON that keeps unknown values null and applies thresholds', async () => {
    const res = await ok(get('/en/data-status/summary.json?stale_places=2000'));
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    const json = JSON.parse(res.body);
    expect(validateSummary(json)).toEqual([]);
    expect(json.sources.find((s: any) => s.sourceId === 'c')).toMatchObject({ licence: null, retrieved: null, state: 'unknown' });
    expect(json.sources.find((s: any) => s.sourceId === 'b').state).toBe('fresh');
    expect(json.datasets.find((d: any) => d.id === 'p').staleAfterDays).toBe(2000);
  });
});

describe('handleDataStatus: HTTP behaviour', () => {
  it('HEAD returns the headers and no body', async () => {
    const get1 = await ok(get('/en/data-status'));
    const head = await ok(get('/en/data-status', {}, 'HEAD'));
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe(get1.headers['content-length']);
    expect(head.headers.etag).toBe(get1.headers.etag);
  });

  it('rejects other methods with 405 and an Allow header, localized', async () => {
    const res = await ok(get('/fr/data-status', {}, 'POST'));
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
    expect(res.body).toContain('Cette page n’accepte que les requêtes GET et HEAD.');
  });

  it('answers 304 when If-None-Match matches, 200 when it does not', async () => {
    const first = await ok(get('/en/data-status'));
    const etag = first.headers.etag!;
    const hit = await ok(get('/en/data-status', { 'If-None-Match': etag }));
    expect(hit.status).toBe(304);
    expect(hit.body).toBe('');
    expect(hit.headers.etag).toBe(etag);
    expect((await ok(get('/en/data-status', { 'if-none-match': `W/"other", ${etag}` }))).status).toBe(304);
    expect((await ok(get('/en/data-status', { 'if-none-match': '*' }))).status).toBe(304);
    expect((await ok(get('/en/data-status', { 'if-none-match': 'W/"nope"' }))).status).toBe(200);
  });

  it('the ETag changes when the content changes', async () => {
    const a = await ok(get('/en/data-status'));
    const b = await ok(get('/en/data-status'), ctx({ now: () => new Date('2027-06-01T00:00:00Z') }));
    expect(a.headers.etag).not.toBe(b.headers.etag);
  });

  it('rejects very long URLs with 414', async () => {
    const res = await ok(get(`/en/data-status?q=${'x'.repeat(MAX_URL_LENGTH)}`));
    expect(res.status).toBe(414);
    expect(res.body).toContain('The address is too long.');
  });

  it('answers 503 with a retry hint and a localized, accessible page when the data cannot be loaded', async () => {
    for (const getRecords of [
      () => {
        throw new Error('db down');
      },
      async () => {
        throw new Error('db down');
      },
    ]) {
      const res = await ok(get('/fr/data-status?state=stale'), ctx({ getRecords }));
      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers.etag).toBeUndefined();
      expect(res.body).toContain('Les données n’ont pas pu être chargées');
      expect(res.body).toContain('href="/fr/data-status?state=stale"');
      expect(describeProblems(auditHtml(res.body, { document: true }))).toEqual([]);
      expect(lintFrench(visibleText(res.body))).toEqual([]);
    }
  });
});

describe('renderErrorPage / alternateHref', () => {
  it('error page escapes the retry link', () => {
    expect(renderErrorPage('en', '/x?a="b"')).toContain('href="/x?a=&quot;b&quot;"');
  });

  it('alternateHref swaps the locale and keeps the rest', () => {
    expect(alternateHref(matchRoute('/fr/data-status/sources.csv?q=a')!)).toBe('/en/data-status/sources.csv?q=a');
    expect(alternateHref(matchRoute('/data-status')!)).toBeNull();
  });
});
