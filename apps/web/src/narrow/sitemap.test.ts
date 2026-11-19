import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { MAX_SITEMAP_URLS, parseSitemap, routesFromSitemap, type Sitemap } from './sitemap.js';

const BASE = 'https://app.example/';
const NS = 'xmlns="https://www.sitemaps.org/schemas/sitemap/0.9"';

function value(text: string): Sitemap {
  const parsed = parseSitemap(text);
  if (!parsed.ok) throw new Error(parsed.error.en);
  return parsed.value;
}

describe('parseSitemap', () => {
  it('reads the addresses and dates of a urlset', () => {
    const s = value(`<?xml version="1.0" encoding="UTF-8"?>
<urlset ${NS}>
  <url><loc>https://app.example/a</loc><lastmod>2026-11-01</lastmod></url>
  <url>
    <loc>
      https://app.example/b
    </loc>
  </url>
</urlset>`);
    expect(s.kind).toBe('urlset');
    expect(s.entries).toEqual([{ loc: 'https://app.example/a', lastmod: '2026-11-01' }, { loc: 'https://app.example/b' }]);
    expect(s.truncated).toBe(false);
  });

  it('decodes entities and CDATA', () => {
    const s = value(`<urlset ${NS}><url><loc>https://app.example/s?a=1&amp;b=2</loc></url><url><loc><![CDATA[https://app.example/t?x=1&y=2]]></loc></url><url><loc>https://app.example/caf&#233;&#x2F;menu</loc></url></urlset>`);
    expect(s.entries.map((e) => e.loc)).toEqual(['https://app.example/s?a=1&b=2', 'https://app.example/t?x=1&y=2', 'https://app.example/café/menu']);
  });

  it('does not decode an entity twice', () => {
    const s = value(`<urlset ${NS}><url><loc>https://app.example/s?q=&amp;lt;</loc></url></urlset>`);
    expect(s.entries[0]?.loc).toBe('https://app.example/s?q=&lt;');
  });

  it('reads prefixed elements', () => {
    const s = value('<sm:urlset xmlns:sm="https://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc>https://app.example/a</sm:loc></sm:url></sm:urlset>');
    expect(s.entries).toEqual([{ loc: 'https://app.example/a' }]);
  });

  it('skips comments and entries with no address', () => {
    const s = value(`<urlset ${NS}><!-- <url><loc>https://app.example/old</loc></url> --><url><lastmod>2026-01-01</lastmod></url><url><loc></loc></url><url><loc>https://app.example/a</loc></url></urlset>`);
    expect(s.entries.map((e) => e.loc)).toEqual(['https://app.example/a']);
  });

  it('reads an index as a list of other sitemaps', () => {
    const s = value(`<sitemapindex ${NS}><sitemap><loc>https://app.example/sitemap-1.xml</loc><lastmod>2026-11-02</lastmod></sitemap><sitemap><loc>https://app.example/sitemap-2.xml</loc></sitemap></sitemapindex>`);
    expect(s.kind).toBe('index');
    expect(s.entries).toHaveLength(2);
    expect(routesFromSitemap(s, BASE)).toEqual({ routes: [], skipped: 0, duplicates: 0 });
  });

  it('reads a text sitemap, with a byte order mark, blank lines and comments', () => {
    const s = value('\uFEFFhttps://app.example/a\r\n\r\n# note\nhttps://app.example/b\n');
    expect(s.kind).toBe('text');
    expect(s.entries.map((e) => e.loc)).toEqual(['https://app.example/a', 'https://app.example/b']);
  });

  it('stops at the limit of the protocol and says so', () => {
    const lines = Array.from({ length: MAX_SITEMAP_URLS + 2 }, (_v, i) => `https://app.example/p/${i}`).join('\n');
    const text = value(lines);
    expect(text.entries).toHaveLength(MAX_SITEMAP_URLS);
    expect(text.truncated).toBe(true);

    const xml = value(`<urlset ${NS}>${Array.from({ length: MAX_SITEMAP_URLS + 1 }, (_v, i) => `<url><loc>https://app.example/p/${i}</loc></url>`).join('')}</urlset>`);
    expect(xml.entries).toHaveLength(MAX_SITEMAP_URLS);
    expect(xml.truncated).toBe(true);
  });

  it.each([
    ['', 'empty', 'vide'],
    ['   \n ', 'empty', 'vide'],
    ['https://app.example/a\nnot an address', 'one full address per line', 'une adresse complète par ligne'],
    ['/relative/path', 'one full address per line', 'une adresse complète par ligne'],
    ['<html><body>Not found</body></html>', 'not a sitemap', 'n’est pas un plan du site'],
  ])('refuses %j', (text, en, fr) => {
    const parsed = parseSitemap(text);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.en).toContain(en);
    expect(parsed.error.fr).toContain(fr);
    expect(frTypographyIssues(parsed.error.fr)).toEqual([]);
  });

  it('accepts a urlset with no entries', () => {
    expect(value(`<urlset ${NS}></urlset>`).entries).toEqual([]);
  });
});

describe('routesFromSitemap', () => {
  it('gives each route once and counts what it leaves out', () => {
    const s = value(['https://app.example/a', 'https://app.example/a/', 'https://app.example/b#top', 'https://cdn.example/c', 'https://app.example/b'].join('\n'));
    expect(routesFromSitemap(s, BASE)).toEqual({ routes: ['/a', '/b'], skipped: 1, duplicates: 2 });
  });

  it('keeps the order of the sitemap', () => {
    const s = value(['https://app.example/z', 'https://app.example/a', 'https://app.example/m'].join('\n'));
    expect(routesFromSitemap(s, BASE).routes).toEqual(['/z', '/a', '/m']);
  });

  it('skips every address when the base is another host', () => {
    const s = value('https://app.example/a\nhttps://app.example/b');
    expect(routesFromSitemap(s, 'https://staging.example/')).toEqual({ routes: [], skipped: 2, duplicates: 0 });
  });
});
