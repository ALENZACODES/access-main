/**
 * Connects the offline strategies to a service-worker scope. The scope is passed in
 * (the real `self` in sw.ts, a fake in tests).
 */
import { cleanOldCaches, handleFetch, precacheAll, type CacheStorageLike, type OfflineConfig, type RequestLike, type ResponseLike } from './offline';

export interface SwEventLike {
  waitUntil(p: Promise<unknown>): void;
  respondWith?(p: Promise<ResponseLike>): void;
  request?: RequestLike;
}

export interface SwScopeLike {
  addEventListener(type: 'install' | 'activate' | 'fetch', listener: (ev: SwEventLike) => void): void;
  skipWaiting?(): Promise<void>;
  clients?: { claim(): Promise<void> };
  caches: CacheStorageLike;
}

export function installServiceWorker(scope: SwScopeLike, config: OfflineConfig): void {
  scope.addEventListener('install', (ev) => {
    ev.waitUntil(precacheAll(scope.caches, config).then(() => scope.skipWaiting?.()));
  });
  scope.addEventListener('activate', (ev) => {
    ev.waitUntil(cleanOldCaches(scope.caches, config).then(() => scope.clients?.claim()));
  });
  scope.addEventListener('fetch', (ev) => {
    const req = ev.request;
    if (!req || !ev.respondWith) return;
    ev.respondWith(
      handleFetch(req, scope.caches, config).then((out) => {
        if (out.background) ev.waitUntil(out.background);
        return out.response;
      }),
    );
  });
}
