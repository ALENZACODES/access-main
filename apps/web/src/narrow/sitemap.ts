import { normalizeRoute } from './routes.js';

/**
 * Reads a sitemap that is already in hand, as XML or as plain text with one
 * address per line, and turns it into routes of the site. It reads the text
 * only: it does not fetch the sitemap or the sitemaps an index points to. The
 * sitemap protocol allows 50,000 addresses per file, and the reader stops
 * there and says so.
 */

export const MAX_SITEMAP_URLS = 50_000;

export interface SitemapEntry {
  readonly loc: string;
  readonly lastmod?: string;
}

export interface Sitemap {
  /** `index` lists other sitemaps, which have to be read one by one. */
  readonly kind: 'urlset' | 'index' | 'text';
  readonly entries: readonly SitemapEntry[];
  /** True when the file held more addresses than the limit. */
  readonly truncated: boolean;
}

export type ParsedSitemap = { readonly ok: true; readonly value: Sitemap } | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

function decodeXml(s: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(s.trim());
  if (cdata) return (cdata[1] ?? '').trim();
  return s
    .trim()
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

const tagText = (block: string, name: string): string | undefined => {
  const m = new RegExp(`<(?:[a-z0-9]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${name}\\s*>`, 'i').exec(block);
  return m ? decodeXml(m[1] ?? '') : undefined;
};

export function parseSitemap(text: string): ParsedSitemap {
  const bad = (en: string, fr: string): ParsedSitemap => ({ ok: false, error: { en, fr } });
  const body = text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
  if (body.trim() === '') return bad('The sitemap is empty.', 'Le plan du site est vide.');

  if (!body.includes('<')) {
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
    const notUrl = lines.find((l) => !/^https?:\/\/\S+$/i.test(l));
    if (notUrl !== undefined) {
      return bad(`A text sitemap needs one full address per line. This line is not one: ${notUrl.slice(0, 60)}`, `Un plan du site en texte demande une adresse complète par ligne. Cette ligne n’en est pas une\u00A0: ${notUrl.slice(0, 60)}`);
    }
    return { ok: true, value: { kind: 'text', entries: lines.slice(0, MAX_SITEMAP_URLS).map((loc) => ({ loc })), truncated: lines.length > MAX_SITEMAP_URLS } };
  }

  const isIndex = /<(?:[a-z0-9]+:)?sitemapindex\b/i.test(body);
  const isSet = /<(?:[a-z0-9]+:)?urlset\b/i.test(body);
  if (!isIndex && !isSet) return bad('The file is not a sitemap: it has no urlset and no sitemapindex element.', 'Le fichier n’est pas un plan du site\u00A0: il n’a ni élément urlset ni élément sitemapindex.');
  const item = isIndex ? 'sitemap' : 'url';
  const blocks = new RegExp(`<(?:[a-z0-9]+:)?${item}\\b[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${item}\\s*>`, 'gi');
  const entries: SitemapEntry[] = [];
  let truncated = false;
  for (const m of body.matchAll(blocks)) {
    const loc = tagText(m[1] ?? '', 'loc');
    if (loc === undefined || loc === '') continue;
    if (entries.length >= MAX_SITEMAP_URLS) {
      truncated = true;
      break;
    }
    const lastmod = tagText(m[1] ?? '', 'lastmod');
    entries.push(lastmod ? { loc, lastmod } : { loc });
  }
  return { ok: true, value: { kind: isIndex ? 'index' : 'urlset', entries, truncated } };
}

export interface SitemapRoutes {
  /** Routes of the site, each once, in the order of the sitemap. */
  readonly routes: readonly string[];
  /** Addresses on another host, or that are not http or https. */
  readonly skipped: number;
  /** Addresses that named a route already listed. */
  readonly duplicates: number;
}

/** The routes a sitemap names on the site at `base`. An index gives no routes: its entries are other sitemaps. */
export function routesFromSitemap(sitemap: Sitemap, base: string): SitemapRoutes {
  if (sitemap.kind === 'index') return { routes: [], skipped: 0, duplicates: 0 };
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  for (const e of sitemap.entries) {
    const route = normalizeRoute(e.loc, base);
    if (route === null) skipped++;
    else if (seen.has(route)) duplicates++;
    else seen.add(route);
  }
  return { routes: [...seen], skipped, duplicates };
}
