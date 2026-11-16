/**
 * Offline support: cache strategies for the data-status page and its downloads.
 * Everything is injected (fetch, cache storage, response factory), so the logic is
 * testable without a browser. A cached page is shown only when the network fails
 * or is slow; the offline page says plainly when nothing has been saved yet.
 */
import type { Locale } from './dataStatus';
import { t } from './i18n';
import { localeFromPath, resolveLocale } from './locale';
import { PAGE_CSS } from './page';
import { escapeHtml } from './sourceList';

export interface HeadersLike {
  get(name: string): string | null;
}
export interface RequestLike {
  url: string;
  method: string;
  mode?: string;
  headers?: HeadersLike;
}
export interface ResponseLike {
  ok: boolean;
  status: number;
  headers: HeadersLike;
  clone(): ResponseLike;
}
export interface CacheLike {
  match(key: string): Promise<ResponseLike | undefined>;
  put(key: string, res: ResponseLike): Promise<void>;
}
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface OfflineConfig {
  /** Bump to drop older caches on the next activation. */
  version: string;
  prefix?: string;
  /** Only requests to this origin are cached, for example "https://example.org". */
  origin: string;
  /** URLs fetched and saved at install time (resolved against the origin). */
  precache: readonly string[];
  fetcher: (req: RequestLike) => Promise<ResponseLike>;
  makeResponse: (body: string, init: { status: number; headers: Record<string, string> }) => ResponseLike;
  /** How long a page request may wait for the network before a saved copy is used. Default 4000. */
  networkTimeoutMs?: number;
  /** Resolves "timeout" after ms. Injectable for tests. */
  wait?: (ms: number) => Promise<'timeout'>;
}

export const DEFAULT_PREFIX = 'data-status';
export const DEFAULT_TIMEOUT_MS = 4000;
const DATA_PATH = /(\/(sources\.csv|credits\.txt|summary\.json)|\/registry\.json)$/;

export type RequestClass = 'bypass' | 'navigation' | 'data' | 'asset';

export function cacheName(c: Pick<OfflineConfig, 'version' | 'prefix'>): string {
  return `${c.prefix ?? DEFAULT_PREFIX}-${c.version}`;
}

/** Cache key: the URL without its fragment (the query is kept: filters change the page). */
export function cacheKey(url: string, origin: string): string | null {
  try {
    const u = new URL(url, origin);
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

export function classify(req: RequestLike, origin: string): RequestClass {
  if (req.method.toUpperCase() !== 'GET') return 'bypass';
  const key = cacheKey(req.url, origin);
  if (key === null || new URL(key).origin !== new URL(origin).origin) return 'bypass';
  const path = new URL(key).pathname;
  if (DATA_PATH.test(path)) return 'data';
  if (req.mode === 'navigate' || (req.headers?.get('accept') ?? '').includes('text/html')) return 'navigation';
  return 'asset';
}

/** Only complete, public, cookie-free 200 responses are saved. */
export function shouldCache(res: ResponseLike): boolean {
  if (!res.ok || res.status !== 200) return false;
  if (/no-store/i.test(res.headers.get('cache-control') ?? '')) return false;
  if (res.headers.get('set-cookie') !== null) return false;
  if ((res.headers.get('vary') ?? '').includes('*')) return false;
  return true;
}

export function renderOfflinePage(locale: Locale, retryHref: string): string {
  const title = escapeHtml(t(locale, 'offline.title'));
  return (
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${PAGE_CSS}</style></head><body>` +
    `<a class="ds-skip" href="#main">${escapeHtml(t(locale, 'page.skip'))}</a>` +
    `<main id="main" tabindex="-1"><h1>${title}</h1><p>${escapeHtml(t(locale, 'offline.body'))}</p>` +
    `<p><a href="${escapeHtml(retryHref)}" style="display:inline-flex;align-items:center;min-width:44px;min-height:44px">${escapeHtml(t(locale, 'err.retry'))}</a></p></main></body></html>`
  );
}

function localeFor(req: RequestLike, origin: string): Locale {
  const key = cacheKey(req.url, origin);
  const fromPath = key === null ? null : localeFromPath(new URL(key).pathname);
  return fromPath ?? resolveLocale(req.headers?.get('accept-language') ?? null, 'en');
}

const defaultWait = (ms: number): Promise<'timeout'> => new Promise((r) => setTimeout(() => r('timeout'), ms));

async function save(storage: CacheStorageLike, c: OfflineConfig, req: RequestLike, res: ResponseLike): Promise<void> {
  const key = cacheKey(req.url, c.origin);
  if (key === null || !shouldCache(res)) return;
  try {
    await (await storage.open(cacheName(c))).put(key, res.clone());
  } catch {
    /* storage full or unavailable: serving still works */
  }
}

async function saved(storage: CacheStorageLike, c: OfflineConfig, req: RequestLike): Promise<ResponseLike | undefined> {
  const key = cacheKey(req.url, c.origin);
  if (key === null) return undefined;
  try {
    return await (await storage.open(cacheName(c))).match(key);
  } catch {
    return undefined;
  }
}

export interface FetchOutcome {
  response: ResponseLike;
  source: 'network' | 'cache' | 'offline-page' | 'bypass';
  /** Work that may continue after the response is sent (pass to waitUntil). */
  background?: Promise<void>;
}

export async function handleFetch(req: RequestLike, storage: CacheStorageLike, c: OfflineConfig): Promise<FetchOutcome> {
  const kind = classify(req, c.origin);
  if (kind === 'bypass') return { response: await c.fetcher(req), source: 'bypass' };

  if (kind === 'asset') {
    const hit = await saved(storage, c, req);
    if (hit) return { response: hit, source: 'cache' };
    const res = await c.fetcher(req);
    await save(storage, c, req, res);
    return { response: res, source: 'network' };
  }

  if (kind === 'data') {
    const hit = await saved(storage, c, req);
    const revalidate = (async () => {
      try {
        await save(storage, c, req, await c.fetcher(req));
      } catch {
        /* offline: keep the saved copy */
      }
    })();
    if (hit) return { response: hit, source: 'cache', background: revalidate };
    try {
      const res = await c.fetcher(req);
      await save(storage, c, req, res);
      return { response: res, source: 'network' };
    } catch {
      return {
        response: c.makeResponse(`${t(localeFor(req, c.origin), 'offline.title')}\n`, {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
        }),
        source: 'offline-page',
      };
    }
  }

  // navigation: network first, saved copy when the network fails or is slow
  const wait = c.wait ?? defaultWait;
  const network = c.fetcher(req);
  const first = await Promise.race([network.then((r) => r, () => null), wait(c.networkTimeoutMs ?? DEFAULT_TIMEOUT_MS)]);
  if (first !== null && first !== 'timeout') {
    if (first.ok) {
      await save(storage, c, req, first);
      return { response: first, source: 'network' };
    }
    const fallback = await saved(storage, c, req);
    return fallback ? { response: fallback, source: 'cache' } : { response: first, source: 'network' };
  }
  const hit = await saved(storage, c, req);
  if (hit) {
    const background =
      first === 'timeout'
        ? network.then((r) => save(storage, c, req, r)).catch(() => undefined)
        : undefined;
    return { response: hit, source: 'cache', background };
  }
  const locale = localeFor(req, c.origin);
  return {
    response: c.makeResponse(renderOfflinePage(locale, new URL(req.url, c.origin).pathname), {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-language': locale, 'cache-control': 'no-store' },
    }),
    source: 'offline-page',
  };
}

export async function precacheAll(storage: CacheStorageLike, c: OfflineConfig): Promise<{ cached: string[]; failed: string[] }> {
  const cached: string[] = [];
  const failed: string[] = [];
  for (const url of c.precache) {
    const key = cacheKey(url, c.origin);
    if (key === null) {
      failed.push(url);
      continue;
    }
    try {
      const res = await c.fetcher({ url: key, method: 'GET' });
      if (!shouldCache(res)) {
        failed.push(url);
        continue;
      }
      await (await storage.open(cacheName(c))).put(key, res.clone());
      cached.push(url);
    } catch {
      failed.push(url);
    }
  }
  return { cached, failed };
}

/** Delete this feature's older caches (other prefixes are never touched). */
export async function cleanOldCaches(storage: CacheStorageLike, c: OfflineConfig): Promise<string[]> {
  const keep = cacheName(c);
  const prefix = `${c.prefix ?? DEFAULT_PREFIX}-`;
  const deleted: string[] = [];
  for (const name of await storage.keys()) {
    if (name.startsWith(prefix) && name !== keep && (await storage.delete(name))) deleted.push(name);
  }
  return deleted;
}
