import { afterEach, describe, expect, it } from 'vitest';
import {
  auditHosts,
  auditResources,
  classifyHost,
  extractUrls,
  HOST_CLASSES,
  hostAllowed,
  hostOf,
  isInsecure,
  resourcesInPage,
  scanHosts,
} from './hostlint.js';
import { frTypographyIssues } from './i18n.js';

describe('hostOf', () => {
  it('reads the host of http, https and protocol-relative addresses', () => {
    expect(hostOf('https://Tile.OpenStreetMap.org/3/4/5.png')).toBe('tile.openstreetmap.org');
    expect(hostOf('http://example.com:8080/x')).toBe('example.com');
    expect(hostOf('//cdn.example.com/a.js')).toBe('cdn.example.com');
    expect(hostOf('https://example.com.')).toBe('example.com');
  });
  it('gives null for anything that is not a web address', () => {
    for (const u of ['/relative', 'data:image/png;base64,AAA', 'blob:https://x/1', 'mailto:a@b.c', 'tel:+1', '']) expect(hostOf(u), u).toBeNull();
  });
  it('isInsecure is only for http', () => {
    expect(isInsecure('http://a.com')).toBe(true);
    expect(isInsecure('https://a.com')).toBe(false);
    expect(isInsecure('//a.com')).toBe(false);
  });
});

describe('classifyHost', () => {
  it.each([
    ['tile.openstreetmap.org', 'tile-server'],
    ['a.tile.openstreetmap.org', 'tile-server'],
    ['api.mapbox.com', 'tile-server'],
    ['maps.googleapis.com', 'tile-server'],
    ['a.basemaps.cartocdn.com', 'tile-server'],
    ['mt1.google.com', 'tile-server'],
    ['www.google-analytics.com', 'tracker'],
    ['www.googletagmanager.com', 'tracker'],
    ['o1.ingest.sentry.io', 'tracker'],
    ['fonts.googleapis.com', 'font-cdn'],
    ['fonts.gstatic.com', 'font-cdn'],
    ['cdn.jsdelivr.net', 'cdn'],
    ['unpkg.com', 'cdn'],
    ['example.org', 'other'],
  ])('%s is %s', (host, cls) => {
    expect(classifyHost(host)).toBe(cls);
  });
  it('does not match a host that only ends in the same letters', () => {
    expect(classifyHost('notunpkg.com')).toBe('other');
    expect(classifyHost('mytile.openstreetmap.org.evil.example')).toBe('other');
  });
});

describe('hostAllowed', () => {
  it('uses * for any run and matches the whole host', () => {
    expect(hostAllowed('a.example.org', ['*.example.org'])).toBe(true);
    expect(hostAllowed('example.org', ['*.example.org'])).toBe(false);
    expect(hostAllowed('example.org', ['example.org'])).toBe(true);
    expect(hostAllowed('exampleXorg', ['example.org'])).toBe(false);
  });
});

describe('auditHosts', () => {
  const item = (url: string, id = 'f@L1') => ({ id, url });
  it('fails a third-party tile server', () => {
    const r = auditHosts([item('https://tile.openstreetmap.org/1/2/3.png')]);
    expect(r.entries).toEqual([expect.objectContaining({ check: 'external', status: 'fail', rule: 'tile-server' })]);
    expect(r.entries[0]?.message.en).toContain('own tiles');
  });
  it('fails plain http, and also names the tile server when it is both', () => {
    expect(auditHosts([item('http://example.org/x')]).entries[0]).toMatchObject({ status: 'fail', rule: 'insecure' });
    const both = auditHosts([item('http://tile.openstreetmap.org/1.png')]).entries;
    expect(both.map((e) => e.rule)).toEqual(['insecure', 'tile-server']);
  });
  it('leaves trackers, font and code CDNs and other hosts as unknown, never as a pass', () => {
    const r = auditHosts([item('https://www.google-analytics.com/a.js', 'a'), item('https://fonts.googleapis.com/css', 'b'), item('https://unpkg.com/x', 'c'), item('https://example.org/', 'd')]);
    expect(r.entries.map((e) => [e.rule, e.status])).toEqual([
      ['tracker', 'unknown'],
      ['font-cdn', 'unknown'],
      ['cdn', 'unknown'],
      ['other', 'unknown'],
    ]);
  });
  it('reports one entry per host and class, at the first place it is seen', () => {
    const r = auditHosts([item('https://example.org/a', 'one'), item('https://example.org/b', 'two'), item('https://other.org/', 'three')]);
    expect(r.entries.map((e) => e.id)).toEqual(['one', 'three']);
    expect(r.checked).toBe(3);
  });
  it('skips local hosts, namespaces and data addresses', () => {
    const r = auditHosts([
      item('http://localhost:5173/x'),
      item('http://127.0.0.1:3000/y'),
      item('http://www.w3.org/2000/svg'),
      item('https://json-schema.org/draft/2020-12/schema'),
      item('data:text/plain,hi'),
      item('/local/path'),
    ]);
    expect(r).toEqual({ checked: 0, entries: [] });
  });
  it('treats the page host as its own', () => {
    expect(auditHosts([item('https://app.example/a.js')], { selfHost: 'app.example' }).entries).toEqual([]);
    expect(auditHosts([item('http://app.example/a.js')], { selfHost: 'app.example' }).entries).toEqual([]);
    expect(auditHosts([item('http://app.example/a.js')], { selfHost: 'APP.example' }).entries).toEqual([]);
  });
  it('skips hosts the team allowed, but still fails a tile server it did not', () => {
    const r = auditHosts([item('https://api.example.org/x'), item('https://tile.openstreetmap.org/1.png')], { allow: ['api.example.org'] });
    expect(r.entries.map((e) => e.rule)).toEqual(['tile-server']);
  });
  it('has French text without typography problems for every class', () => {
    const urls: Record<string, string> = {
      'tile-server': 'https://tile.openstreetmap.org/a',
      insecure: 'http://example.org/a',
      tracker: 'https://www.google-analytics.com/a',
      'font-cdn': 'https://fonts.googleapis.com/a',
      cdn: 'https://unpkg.com/a',
      other: 'https://example.org/a',
    };
    for (const cls of HOST_CLASSES) {
      const e = auditHosts([{ id: 'x', url: urls[cls] as string }]).entries.find((x) => x.rule === cls);
      expect(e, cls).toBeDefined();
      expect(frTypographyIssues(e?.message.fr ?? ''), e?.message.fr).toEqual([]);
      expect(e?.message.en.length).toBeGreaterThan(10);
    }
  });
});

describe('extractUrls and scanHosts', () => {
  const css = `@import url("https://fonts.googleapis.com/css2?family=X");\nbody{background:url(//cdn.example.com/bg.png)}\n/* see https://example.org/docs. */`;
  it('finds full and protocol-relative addresses with their line numbers', () => {
    const urls = extractUrls('a.css', css);
    expect(urls.map((u) => [u.id, u.url])).toEqual([
      ['a.css@L1', 'https://fonts.googleapis.com/css2?family=X'],
      ['a.css@L2', '//cdn.example.com/bg.png'],
      ['a.css@L3', 'https://example.org/docs'],
    ]);
  });
  it('does not take a code comment for a protocol-relative address', () => {
    expect(extractUrls('a.js', 'const a = 1; // example.com is used\nx = 2 //foo.bar')).toEqual([]);
  });
  it('scans a service worker or script for tile servers', () => {
    const js = `const TILES = ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"];\nfetch('/api/places')`;
    const r = scanHosts('sw.js', js);
    expect(r.entries).toEqual([expect.objectContaining({ id: 'sw.js@L1', status: 'fail', rule: 'tile-server' })]);
  });
  it('a clean file has no entries', () => {
    expect(scanHosts('a.js', "fetch('/api'); import('./x.js');")).toEqual({ checked: 0, entries: [] });
  });
});

describe('auditResources', () => {
  it('compares what the page loaded with the page origin', () => {
    const r = auditResources({
      origin: 'https://app.example',
      urls: ['https://app.example/a.js', 'https://tile.openstreetmap.org/1.png', 'https://fonts.gstatic.com/f.woff2'],
    });
    expect(r.entries.map((e) => [e.id, e.rule, e.status])).toEqual([
      ['resource:tile.openstreetmap.org', 'tile-server', 'fail'],
      ['resource:fonts.gstatic.com', 'font-cdn', 'unknown'],
    ]);
  });
  it('without an origin every non-local host is external', () => {
    expect(auditResources({ origin: '', urls: ['https://app.example/a.js'] }).entries[0]?.rule).toBe('other');
  });
});

describe('resourcesInPage', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { location: g['location'], performance: g['performance'], document: g['document'] };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete g[k];
      else g[k] = v;
    }
  });
  it('merges the timing list with attributes and keeps only web addresses, once each', () => {
    g['location'] = { origin: 'https://app.example' };
    g['performance'] = { getEntriesByType: () => [{ name: 'https://app.example/a.js' }, { name: 'https://x.test/p.png' }, { name: 'data:image/png;base64,AA' }] };
    g['document'] = {
      querySelectorAll: () => [
        { getAttribute: (n: string) => (n === 'href' ? '//cdn.test/s.css' : null) },
        { getAttribute: (n: string) => (n === 'src' ? 'https://x.test/p.png' : null) },
        { getAttribute: (n: string) => (n === 'href' ? '/local.css' : null) },
      ],
    };
    const f = resourcesInPage({ max: 50 });
    expect(f.origin).toBe('https://app.example');
    expect(f.urls).toEqual(['https://app.example/a.js', 'https://x.test/p.png', '//cdn.test/s.css']);
  });
  it('stops at the limit and copes with no performance API', () => {
    g['location'] = undefined;
    g['performance'] = undefined;
    g['document'] = { querySelectorAll: () => [{ getAttribute: () => 'https://a.test/1' }, { getAttribute: () => 'https://a.test/2' }] };
    expect(resourcesInPage({ max: 1 }).urls).toEqual(['https://a.test/1']);
    expect(resourcesInPage({ max: 1 }).origin).toBe('');
  });
});
