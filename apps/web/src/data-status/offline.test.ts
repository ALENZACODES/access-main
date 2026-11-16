import { describe, expect, it } from 'vitest';
import {
  auditHtml,
  cacheKey,
  cacheName,
  classify,
  cleanOldCaches,
  describeProblems,
  handleFetch,
  lintFrench,
  precacheAll,
  renderOfflinePage,
  scanHtml,
  shouldCache,
  visibleText,
  type OfflineConfig,
  type RequestLike,
} from './index';
import { FakeCacheStorage, FakeHeaders, FakeResponse } from './testkit';

const ORIGIN = 'https://app.example';
const nav = (path: string, headers: Record<string, string> = {}): RequestLike => ({
  url: ORIGIN + path,
  method: 'GET',
  mode: 'navigate',
  headers: new FakeHeaders(headers),
});
const plainGet = (path: string): RequestLike => ({ url: ORIGIN + path, method: 'GET', headers: new FakeHeaders() });

function setup(handler: (req: RequestLike) => Promise<FakeResponse> | FakeResponse, over: Partial<OfflineConfig> = {}) {
  const storage = new FakeCacheStorage();
  const calls: string[] = [];
  const config: OfflineConfig = {
    version: 'v1',
    origin: ORIGIN,
    precache: [],
    fetcher: async (req) => {
      calls.push(`${req.method} ${req.url}`);
      return handler(req);
    },
    makeResponse: (body, init) => new FakeResponse(body, init.status, init.headers),
    wait: () => new Promise(() => undefined), // never times out unless a test says so
    ...over,
  };
  const cache = () => storage.caches.get('data-status-v1');
  return { storage, config, calls, cache };
}

const html = (body: string) => new FakeResponse(body, 200, { 'content-type': 'text/html' });
const down = () => Promise.reject(new Error('offline'));

describe('helpers', () => {
  it('cacheName is versioned and prefixed', () => {
    expect(cacheName({ version: 'v2' })).toBe('data-status-v2');
    expect(cacheName({ version: 'v2', prefix: 'x' })).toBe('x-v2');
  });

  it('cacheKey drops the fragment and keeps the query; bad URLs give null', () => {
    expect(cacheKey('/fr/data-status?state=stale#top', ORIGIN)).toBe(`${ORIGIN}/fr/data-status?state=stale`);
    expect(cacheKey('http://[bad', ORIGIN)).toBeNull();
  });

  it('classify: bypass, navigation, data, asset', () => {
    expect(classify({ url: ORIGIN + '/x', method: 'POST' }, ORIGIN)).toBe('bypass');
    expect(classify({ url: 'https://other.example/x', method: 'GET' }, ORIGIN)).toBe('bypass');
    expect(classify(nav('/fr/data-status'), ORIGIN)).toBe('navigation');
    expect(classify({ url: ORIGIN + '/p', method: 'GET', headers: new FakeHeaders({ accept: 'text/html,application/xhtml+xml' }) }, ORIGIN)).toBe('navigation');
    expect(classify(plainGet('/en/data-status/sources.csv'), ORIGIN)).toBe('data');
    expect(classify(plainGet('/registry.json'), ORIGIN)).toBe('data');
    expect(classify(plainGet('/app.js'), ORIGIN)).toBe('asset');
  });

  it('shouldCache: only complete, public, cookie-free 200 responses', () => {
    expect(shouldCache(new FakeResponse('x'))).toBe(true);
    expect(shouldCache(new FakeResponse('x', 404))).toBe(false);
    expect(shouldCache(new FakeResponse('x', 206))).toBe(false);
    expect(shouldCache(new FakeResponse('x', 200, { 'cache-control': 'private, No-Store' }))).toBe(false);
    expect(shouldCache(new FakeResponse('x', 200, { 'set-cookie': 'a=b' }))).toBe(false);
    expect(shouldCache(new FakeResponse('x', 200, { vary: '*' }))).toBe(false);
    expect(shouldCache(new FakeResponse('x', 200, { vary: 'Accept-Language' }))).toBe(true);
  });
});

describe('navigation: network first, saved copy when the network fails', () => {
  it('serves the network response and saves it', async () => {
    const t = setup(() => html('live'));
    const out = await handleFetch(nav('/fr/data-status'), t.storage, t.config);
    expect(out.source).toBe('network');
    expect((out.response as FakeResponse).body).toBe('live');
    expect(t.cache()?.entries.has(`${ORIGIN}/fr/data-status`)).toBe(true);
  });

  it('falls back to the saved copy when the network fails', async () => {
    let online = true;
    const t = setup(() => (online ? html('saved page') : down()));
    await handleFetch(nav('/en/data-status'), t.storage, t.config);
    online = false;
    const out = await handleFetch(nav('/en/data-status'), t.storage, t.config);
    expect(out.source).toBe('cache');
    expect((out.response as FakeResponse).body).toBe('saved page');
  });

  it('keeps separate copies per query (filters change the page)', async () => {
    const t = setup((r) => html(r.url));
    await handleFetch(nav('/en/data-status?state=stale'), t.storage, t.config);
    await handleFetch(nav('/en/data-status'), t.storage, t.config);
    expect(t.cache()?.entries.size).toBe(2);
  });

  it('a server error falls back to the saved copy, or is shown as is when there is none', async () => {
    let fail = false;
    const t = setup(() => (fail ? new FakeResponse('err', 503) : html('ok')));
    const first = setup(() => new FakeResponse('err', 503));
    expect((await handleFetch(nav('/en/data-status'), first.storage, first.config)).source).toBe('network');
    await handleFetch(nav('/en/data-status'), t.storage, t.config);
    fail = true;
    const out = await handleFetch(nav('/en/data-status'), t.storage, t.config);
    expect(out.source).toBe('cache');
    expect(first.cache()?.entries.size ?? 0).toBe(0);
  });

  it('offline with nothing saved: a localized offline page (503), by path then by Accept-Language', async () => {
    const t = setup(() => down());
    const fr = await handleFetch(nav('/fr/data-status'), t.storage, t.config);
    expect(fr.source).toBe('offline-page');
    expect((fr.response as FakeResponse).status).toBe(503);
    expect((fr.response as FakeResponse).body).toContain('Vous êtes hors ligne');
    const byHeader = await handleFetch(nav('/other', { 'accept-language': 'fr-CA' }), t.storage, t.config);
    expect((byHeader.response as FakeResponse).body).toContain('Vous êtes hors ligne');
    const en = await handleFetch(nav('/en/data-status'), t.storage, t.config);
    expect((en.response as FakeResponse).body).toContain('You are offline');
    expect(t.cache()?.entries.size ?? 0).toBe(0);
  });

  it('a slow network uses the saved copy and still updates it in the background', async () => {
    let slow = false;
    let release: (r: FakeResponse) => void = () => undefined;
    const t = setup(
      () => (slow ? new Promise<FakeResponse>((r) => (release = r)) : html('v1')),
      { wait: async () => 'timeout' as const },
    );
    // First request: wait() resolves at once, but the fast network wins the race only if it settled first.
    await handleFetch(nav('/en/data-status'), t.storage, { ...t.config, wait: () => new Promise(() => undefined) });
    slow = true;
    const out = await handleFetch(nav('/en/data-status'), t.storage, t.config);
    expect(out.source).toBe('cache');
    expect((out.response as FakeResponse).body).toBe('v1');
    release(html('v2'));
    await out.background;
    expect(((await t.cache()?.match(`${ORIGIN}/en/data-status`)) as FakeResponse).body).toBe('v2');
  });

  it('a slow network with nothing saved shows the offline page', async () => {
    const t = setup(() => new Promise<FakeResponse>(() => undefined), { wait: async () => 'timeout' as const });
    const out = await handleFetch(nav('/en/data-status'), t.storage, t.config);
    expect(out.source).toBe('offline-page');
  });

  it('never saves no-store responses', async () => {
    const t = setup(() => new FakeResponse('secret', 200, { 'cache-control': 'no-store' }));
    await handleFetch(nav('/en/data-status'), t.storage, t.config);
    expect(t.cache()?.entries.size ?? 0).toBe(0);
  });

  it('a full storage does not break serving', async () => {
    const t = setup(() => html('live'));
    (await t.storage.open('data-status-v1')) && (t.cache()!.failPut = true);
    const out = await handleFetch(nav('/en/data-status'), t.storage, t.config);
    expect((out.response as FakeResponse).body).toBe('live');
  });
});

describe('data downloads: saved copy first, refreshed in the background', () => {
  it('first request goes to the network and is saved', async () => {
    const t = setup(() => new FakeResponse('a,b'));
    const out = await handleFetch(plainGet('/en/data-status/sources.csv'), t.storage, t.config);
    expect(out.source).toBe('network');
    expect(t.cache()?.entries.size).toBe(1);
  });

  it('later requests return the saved copy at once and update it in the background', async () => {
    let body = 'old';
    const t = setup(() => new FakeResponse(body));
    await handleFetch(plainGet('/registry.json'), t.storage, t.config);
    body = 'new';
    const out = await handleFetch(plainGet('/registry.json'), t.storage, t.config);
    expect(out.source).toBe('cache');
    expect((out.response as FakeResponse).body).toBe('old');
    await out.background;
    expect(((await t.cache()?.match(`${ORIGIN}/registry.json`)) as FakeResponse).body).toBe('new');
  });

  it('a failing background refresh keeps the saved copy', async () => {
    let up = true;
    const t = setup(() => (up ? new FakeResponse('kept') : down()));
    await handleFetch(plainGet('/registry.json'), t.storage, t.config);
    up = false;
    const out = await handleFetch(plainGet('/registry.json'), t.storage, t.config);
    await expect(out.background).resolves.toBeUndefined();
    expect(((await t.cache()?.match(`${ORIGIN}/registry.json`)) as FakeResponse).body).toBe('kept');
  });

  it('offline with nothing saved: a plain 503, not an empty success', async () => {
    const t = setup(() => down());
    const out = await handleFetch(plainGet('/fr/data-status/summary.json'), t.storage, t.config);
    expect(out.source).toBe('offline-page');
    expect((out.response as FakeResponse).status).toBe(503);
    expect((out.response as FakeResponse).body).toContain('Vous êtes hors ligne');
  });
});

describe('other requests', () => {
  it('assets are cache-first', async () => {
    let n = 0;
    const t = setup(() => new FakeResponse(`v${++n}`));
    await handleFetch(plainGet('/app.js'), t.storage, t.config);
    const out = await handleFetch(plainGet('/app.js'), t.storage, t.config);
    expect(out.source).toBe('cache');
    expect(t.calls).toHaveLength(1);
  });

  it('non-GET and cross-origin requests bypass the cache entirely', async () => {
    const t = setup(() => new FakeResponse('x'));
    const post = await handleFetch({ url: ORIGIN + '/en/data-status', method: 'POST' }, t.storage, t.config);
    const cross = await handleFetch({ url: 'https://other.example/a.js', method: 'GET' }, t.storage, t.config);
    expect([post.source, cross.source]).toEqual(['bypass', 'bypass']);
    expect(t.cache()?.entries.size ?? 0).toBe(0);
  });

  it('bypass errors propagate (the page is not hiding a failed form post)', async () => {
    const t = setup(() => down());
    await expect(handleFetch({ url: ORIGIN + '/x', method: 'POST' }, t.storage, t.config)).rejects.toThrow('offline');
  });
});

describe('precacheAll / cleanOldCaches', () => {
  it('saves what it can and reports what failed', async () => {
    const t = setup(
      (r) => (r.url.endsWith('/missing') ? new FakeResponse('x', 404) : r.url.endsWith('/boom') ? (down() as never) : new FakeResponse('ok')),
      { precache: ['/a', '/b', '/missing', '/boom', 'http://[bad'] },
    );
    const result = await precacheAll(t.storage, t.config);
    expect(result.cached).toEqual(['/a', '/b']);
    expect(result.failed).toEqual(['/missing', '/boom', 'http://[bad']);
    expect([...(t.cache()?.entries.keys() ?? [])]).toEqual([`${ORIGIN}/a`, `${ORIGIN}/b`]);
  });

  it('deletes only this feature’s older caches', async () => {
    const t = setup(() => new FakeResponse('x'));
    for (const n of ['data-status-v0', 'data-status-v1', 'data-status-v2', 'other-app-v1', 'data-statusx']) await t.storage.open(n);
    expect(await cleanOldCaches(t.storage, t.config)).toEqual(['data-status-v0', 'data-status-v2']);
    expect(await t.storage.keys()).toEqual(['data-status-v1', 'other-app-v1', 'data-statusx']);
  });
});

describe('renderOfflinePage', () => {
  it('is accessible, honest and clean in EN and FR', () => {
    for (const l of ['en', 'fr'] as const) {
      const page = renderOfflinePage(l, '/en/data-status?q=a');
      expect(describeProblems(auditHtml(page, { document: true }))).toEqual([]);
      expect(scanHtml(page)).toEqual([]);
      if (l === 'fr') expect(lintFrench(visibleText(page))).toEqual([]);
      expect(page).toContain('href="/en/data-status?q=a"');
    }
    expect(renderOfflinePage('en', '/x')).toContain('This page has not been saved on this device yet.');
  });
});
