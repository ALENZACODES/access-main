/**
 * Service worker source, generated from a validated config so it can be served from
 * /sw.js and tested by running the generated script against fake browser APIs.
 *
 * Strategy: page navigations go network-first with a timeout, fall back to the last
 * copy of that page, then to the localised offline page. Other same-origin GET requests
 * are cache-first. POST requests, cross-origin requests, error responses and responses
 * marked no-store are never cached or intercepted, so a suggestion or setting is never
 * replayed from a cache.
 */
import type { Locale } from "./stateCopy";

export interface SwConfig {
  /** Cache name suffix; change it to drop old caches on the next activation. */
  readonly version: string;
  readonly cachePrefix: string;
  /** Same-origin paths cached at install time. */
  readonly precache: readonly string[];
  readonly offlinePages: Readonly<Record<Locale, string>>;
  readonly navigationTimeoutMs: number;
}

const VERSION = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,31}$/;
const PREFIX = /^[a-z][a-z0-9-]{1,31}$/;
const PATH = /^\/(?!\/)[A-Za-z0-9\-._~/%]*$/;

export function validateSwConfig(c: SwConfig): void {
  if (!VERSION.test(c.version)) throw new Error("Invalid service worker version");
  if (!PREFIX.test(c.cachePrefix)) throw new Error("Invalid cache prefix");
  if (!Number.isInteger(c.navigationTimeoutMs) || c.navigationTimeoutMs < 500 || c.navigationTimeoutMs > 30_000) {
    throw new Error("navigationTimeoutMs must be between 500 and 30000");
  }
  for (const p of [...c.precache, c.offlinePages.en, c.offlinePages.fr]) {
    if (!PATH.test(p)) throw new Error(`Precache entries must be same-origin paths: ${p}`);
  }
  for (const l of ["en", "fr"] as const) {
    if (!c.precache.includes(c.offlinePages[l])) throw new Error(`The ${l} offline page must be precached`);
  }
}

export function buildServiceWorker(c: SwConfig): string {
  validateSwConfig(c);
  const j = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c");
  return `"use strict";
var PREFIX = ${j(c.cachePrefix)};
var CACHE = PREFIX + "-" + ${j(c.version)};
var PRECACHE = ${j(c.precache)};
var OFFLINE = ${j(c.offlinePages)};
var TIMEOUT_MS = ${j(c.navigationTimeoutMs)};

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX + "-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function interceptable(request) {
  if (request.method !== "GET") return false;
  try { return new URL(request.url).origin === self.location.origin; } catch (e) { return false; }
}

function storable(response) {
  if (!response || response.status !== 200) return false;
  var cc = response.headers && response.headers.get && response.headers.get("cache-control");
  return !(cc && /no-store/i.test(cc));
}

function offlinePageFor(request) {
  return new URL(request.url).pathname.indexOf("/fr/") === 0 ? OFFLINE.fr : OFFLINE.en;
}

function withTimeout(promise) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error("timeout")); }, TIMEOUT_MS);
    promise.then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
  });
}

function navigate(request) {
  return withTimeout(fetch(request)).then(function (response) {
    if (storable(response)) { var copy = response.clone(); caches.open(CACHE).then(function (c) { return c.put(request, copy); }); }
    return response;
  }).catch(function () {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(request).then(function (hit) {
        if (hit) return hit;
        return cache.match(offlinePageFor(request)).then(function (page) {
          return page || new Response("Offline", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
        });
      });
    });
  });
}

function cacheFirst(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (storable(response)) cache.put(request, response.clone());
        return response;
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (!interceptable(request)) return;
  event.respondWith(request.mode === "navigate" ? navigate(request) : cacheFirst(request));
});
`;
}

export const DEFAULT_SW_CONFIG: SwConfig = {
  version: "1",
  cachePrefix: "app-shell",
  precache: ["/en/offline", "/fr/hors-ligne", "/manifest.webmanifest"],
  offlinePages: { en: "/en/offline", fr: "/fr/hors-ligne" },
  navigationTimeoutMs: 4000,
};

/** Registration script, served as an external file so no inline script is needed. */
export const REGISTER_SCRIPT = `if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
  });
}
`;
