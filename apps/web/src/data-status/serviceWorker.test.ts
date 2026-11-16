import { describe, expect, it } from 'vitest';
import { installServiceWorker, registerOfflineSupport, type SwEventLike, type SwScopeLike } from './index';
import { FakeCacheStorage, FakeHeaders, FakeResponse } from './testkit';

const ORIGIN = 'https://app.example';

function fakeScope() {
  const listeners: Record<string, ((ev: SwEventLike) => void)[]> = {};
  const state = { skipped: false, claimed: false };
  const storage = new FakeCacheStorage();
  const scope: SwScopeLike = {
    addEventListener: (type, l) => void (listeners[type] ??= []).push(l),
    skipWaiting: async () => void (state.skipped = true),
    clients: { claim: async () => void (state.claimed = true) },
    caches: storage,
  };
  const fire = async (type: string, extra: Partial<SwEventLike> = {}) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<unknown> | undefined;
    const ev: SwEventLike = {
      waitUntil: (p) => void waits.push(p),
      respondWith: (p) => void (responded = p),
      ...extra,
    };
    for (const l of listeners[type] ?? []) l(ev);
    const value = responded ? await responded : undefined;
    await Promise.all(waits);
    return { waits: waits.length, responded: value, hadRespondWith: responded !== undefined };
  };
  return { scope, storage, state, fire, listeners };
}

const config = (fetcher = async () => new FakeResponse('ok') as never) => ({
  version: 'v1',
  origin: ORIGIN,
  precache: ['/a'],
  fetcher,
  makeResponse: (body: string, init: { status: number; headers: Record<string, string> }) => new FakeResponse(body, init.status, init.headers),
  wait: () => new Promise<'timeout'>(() => undefined),
});

describe('installServiceWorker', () => {
  it('registers install, activate and fetch listeners', () => {
    const f = fakeScope();
    installServiceWorker(f.scope, config());
    expect(Object.keys(f.listeners).sort()).toEqual(['activate', 'fetch', 'install']);
  });

  it('install: precaches, then takes over', async () => {
    const f = fakeScope();
    installServiceWorker(f.scope, config());
    await f.fire('install');
    expect([...(f.storage.caches.get('data-status-v1')?.entries.keys() ?? [])]).toEqual([`${ORIGIN}/a`]);
    expect(f.state.skipped).toBe(true);
  });

  it('activate: removes older caches of this feature, then claims clients', async () => {
    const f = fakeScope();
    await f.storage.open('data-status-v0');
    await f.storage.open('data-status-v1');
    await f.storage.open('unrelated');
    installServiceWorker(f.scope, config());
    await f.fire('activate');
    expect(await f.storage.keys()).toEqual(['data-status-v1', 'unrelated']);
    expect(f.state.claimed).toBe(true);
  });

  it('fetch: answers through the strategies and keeps background work alive', async () => {
    const f = fakeScope();
    let body = 'one';
    installServiceWorker(f.scope, config(async () => new FakeResponse(body) as never));
    const req = { url: `${ORIGIN}/en/data-status/sources.csv`, method: 'GET', headers: new FakeHeaders() };
    const first = await f.fire('fetch', { request: req });
    expect((first.responded as FakeResponse).body).toBe('one');
    body = 'two';
    const second = await f.fire('fetch', { request: req });
    expect((second.responded as FakeResponse).body).toBe('one');
    expect(second.waits).toBe(1); // background refresh handed to waitUntil
  });

  it('fetch without a request or respondWith is ignored', async () => {
    const f = fakeScope();
    installServiceWorker(f.scope, config());
    expect((await f.fire('fetch')).hadRespondWith).toBe(false);
    expect((await f.fire('fetch', {})).hadRespondWith).toBe(false);
  });

  it('works when skipWaiting and clients are not available', async () => {
    const f = fakeScope();
    delete (f.scope as { skipWaiting?: unknown }).skipWaiting;
    delete (f.scope as { clients?: unknown }).clients;
    installServiceWorker(f.scope, config());
    await expect(f.fire('install')).resolves.toBeDefined();
    await expect(f.fire('activate')).resolves.toBeDefined();
  });
});

describe('registerOfflineSupport', () => {
  it('registers when supported and secure', async () => {
    const calls: unknown[][] = [];
    const nav = { serviceWorker: { register: async (...a: unknown[]) => void calls.push(a) } };
    expect(await registerOfflineSupport(nav, { scriptUrl: 'sw.js', isSecureContext: true })).toBe('registered');
    expect(await registerOfflineSupport(nav, { scriptUrl: 'sw.js', isSecureContext: true, scope: '/fr/' })).toBe('registered');
    expect(calls).toEqual([['sw.js', undefined], ['sw.js', { scope: '/fr/' }]]);
  });

  it('reports unsupported, insecure and failed without throwing', async () => {
    expect(await registerOfflineSupport({}, { scriptUrl: 'sw.js', isSecureContext: true })).toBe('unsupported');
    const nav = { serviceWorker: { register: async () => undefined } };
    expect(await registerOfflineSupport(nav, { scriptUrl: 'sw.js', isSecureContext: false })).toBe('insecure');
    const bad = {
      serviceWorker: {
        register: async () => {
          throw new Error('SecurityError');
        },
      },
    };
    expect(await registerOfflineSupport(bad, { scriptUrl: 'sw.js', isSecureContext: true })).toBe('failed');
  });
});
