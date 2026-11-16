import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { lintManifest, MANIFEST_RULES, type ManifestRule } from './manifestlint.js';
import { lintServiceWorker, stripComments, SW_RULES, type SwRule } from './swlint.js';

const GOOD = {
  id: '/?app=1',
  name: 'Access Guide',
  short_name: 'Access',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  lang: 'en',
  theme_color: '#0b4f9c',
  icons: [
    { src: '/i/192.png', sizes: '192x192', type: 'image/png' },
    { src: '/i/512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};
const man = (over: Record<string, unknown> = {}, drop: string[] = []): string => {
  const o: Record<string, unknown> = { ...GOOD, ...over };
  for (const k of drop) delete o[k];
  return JSON.stringify(o);
};
const rulesOf = (text: string): string[] => lintManifest(text).entries.map((e) => e.rule ?? '');

const FIXTURES: ReadonlyArray<readonly [ManifestRule, string, string]> = [
  ['invalid-json', '{', man()],
  ['name', man({}, ['name']), man()],
  ['short-name', man({}, ['short_name']), man()],
  ['short-name-length', man({ short_name: 'Access guide app' }), man()],
  ['start-url', man({}, ['start_url']), man()],
  ['start-url-origin', man({ start_url: 'https://other.example/' }), man()],
  ['scope', man({ start_url: '/home', scope: '/app/' }), man({ start_url: '/app/home', scope: '/app/' })],
  ['display', man({}, ['display']), man()],
  ['icons', man({ icons: [] }), man()],
  ['icon-size', man({ icons: [{ src: 'a.png', sizes: '48x48', purpose: 'maskable' }] }), man()],
  ['icon-maskable', man({ icons: GOOD.icons.map((i) => ({ src: i.src, sizes: i.sizes })) }), man()],
  ['lang', man({}, ['lang']), man({ lang: 'fr-CA' })],
  ['orientation', man({ orientation: 'portrait' }), man({ orientation: 'any' })],
  ['theme-color', man({ theme_color: 'blueish' }), man()],
  ['id', man({}, ['id']), man()],
  ['related-apps', man({ prefer_related_applications: true }), man()],
  ['shortcuts', man({ shortcuts: [{ name: 'Map' }] }), man({ shortcuts: [{ name: 'Map', url: '/map' }] })],
];

describe('lintManifest', () => {
  it('has a fixture for every rule', () => {
    expect(FIXTURES.map((f) => f[0]).sort()).toEqual([...MANIFEST_RULES].sort());
  });
  it.each(FIXTURES)('%s is reported for a broken manifest and not for a good one', (rule, bad, good) => {
    expect(rulesOf(bad)).toContain(rule);
    expect(rulesOf(good)).not.toContain(rule);
  });
  it('a good manifest has no entries', () => {
    expect(lintManifest(man()).entries).toEqual([]);
    expect(lintManifest(man()).checked).toBeGreaterThan(8);
  });
  it('judgement rules are unknown and hard rules fail', () => {
    const status = (rule: string): string | undefined => lintManifest(man({ short_name: 'Access guide app', icons: [], start_url: 'https://x.test/' })).entries.find((e) => e.rule === rule)?.status;
    expect(status('short-name-length')).toBe('unknown');
    expect(status('start-url-origin')).toBe('unknown');
    expect(status('icons')).toBe('fail');
  });
  it('rejects JSON that is not an object', () => {
    for (const text of ['[]', 'null', '"x"', '5']) expect(rulesOf(text)).toEqual(['invalid-json']);
  });
  it('accepts a scope with a sub path and a start_url with ../ inside it', () => {
    expect(rulesOf(man({ scope: '/app/', start_url: '/app/x/../home' }))).not.toContain('scope');
    expect(rulesOf(man({ scope: '/app/', start_url: '/app/../other' }))).toContain('scope');
  });
  it('reads sizes lists and purposes with several words', () => {
    const icons = [{ src: 'a', sizes: '48x48 192x192', purpose: 'monochrome maskable' }, { src: 'b', sizes: '512X512' }];
    expect(rulesOf(man({ icons }))).toEqual([]);
  });
  it('every message has both languages and French typography is right', () => {
    for (const [, bad] of FIXTURES.map((f) => [f[0], f[1]] as const)) {
      for (const e of lintManifest(bad).entries) {
        expect(e.message.en.length).toBeGreaterThan(10);
        expect(frTypographyIssues(e.message.fr), e.message.fr).toEqual([]);
      }
    }
  });
});

const SW = `
const CACHE = 'access-v3';
const OFFLINE = '/offline.html';
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', OFFLINE]))));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE))); });
`;
const swRules = (src: string): string[] => lintServiceWorker('sw.js', src).entries.map((e) => e.rule ?? '');

const SW_FIXTURES: ReadonlyArray<readonly [SwRule, string, string]> = [
  ['no-fetch-handler', SW.replace("addEventListener('fetch'", "addEventListener('message'"), SW],
  ['no-cache', "self.addEventListener('fetch', () => {}); /* offline */", SW],
  ['no-precache', SW.replace("addEventListener('install'", "addEventListener('push'"), SW],
  ['no-fallback', SW.replace(/offline/gi, 'x').replace(/OFFLINE/g, 'X'), SW],
  ['cache-version', SW.replace("'access-v3'", "'access'"), SW],
  ['no-cleanup', SW.replace('caches.delete(k)', 'k'), SW],
  ['no-catch', SW.replace('.catch(() => caches.match(OFFLINE))', ''), SW],
];

describe('lintServiceWorker', () => {
  it('has a fixture for every rule', () => {
    expect(SW_FIXTURES.map((f) => f[0]).sort()).toEqual([...SW_RULES].sort());
  });
  it.each(SW_FIXTURES)('%s is reported for a broken worker and not for a good one', (rule, bad, good) => {
    expect(swRules(bad)).toContain(rule);
    expect(swRules(good)).not.toContain(rule);
  });
  it('a good worker has no entries', () => {
    expect(lintServiceWorker('sw.js', SW).entries).toEqual([]);
  });
  it('only the first two rules fail. The rest ask for a look', () => {
    const e = lintServiceWorker('sw.js', 'console.log(1)').entries;
    expect(Object.fromEntries(e.map((x) => [x.rule, x.status]))).toMatchObject({ 'no-fetch-handler': 'fail', 'no-cache': 'fail', 'no-fallback': 'unknown' });
  });
  it('reads a version from a constant that holds the cache name', () => {
    expect(swRules(SW.replace("'access-v3'", "'access-cache'"))).toContain('cache-version');
    expect(swRules(SW.replace("'access-v3'", "'access-cache-2026-11'"))).not.toContain('cache-version');
  });
  it('gives the line of an unversioned name', () => {
    const e = lintServiceWorker('sw.js', "\n\ncaches.open('plain');").entries.find((x) => x.rule === 'cache-version');
    expect(e?.id).toBe('sw.js@L3');
  });
  it('ignores code that only appears in comments', () => {
    const r = swRules('// self.addEventListener("fetch", () => {})\n/* caches.open("v1") */');
    expect(r).toContain('no-fetch-handler');
    expect(r).toContain('no-cache');
  });
  it('does not flag a Workbox worker for what it hides in a library', () => {
    const r = swRules("importScripts('/workbox-sw.js'); workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);");
    expect(r).not.toContain('no-fetch-handler');
    expect(r).not.toContain('no-cache');
    expect(r).not.toContain('no-fallback');
  });
  it('messages have both languages and French typography is right', () => {
    for (const [, bad] of SW_FIXTURES.map((f) => [f[0], f[1]] as const)) {
      for (const e of lintServiceWorker('sw.js', bad).entries) {
        expect(frTypographyIssues(e.message.fr), e.message.fr).toEqual([]);
      }
    }
  });
});

describe('stripComments', () => {
  it('removes line and block comments, keeps strings and line breaks', () => {
    expect(stripComments("a // x\nb /* y\nz */ c 'd // e' \"f /* g */\"")).toBe("a \nb \n c 'd // e' \"f /* g */\"");
  });
  it('handles escaped quotes inside strings', () => {
    expect(stripComments("x = 'it\\'s // fine'; // gone")).toBe("x = 'it\\'s // fine'; ");
  });
});
