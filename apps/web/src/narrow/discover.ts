import { parseHtml } from './htmllint.js';
import { attrOf } from './markup.js';
import { normalizeRoute } from './routes.js';

/**
 * The links of one page of markup, sorted into routes of the same site, other
 * hosts and files. It is for finding the routes to audit from pages already
 * in hand, for example the built HTML files. It reads markup and follows
 * nothing, so links that a script adds are not seen.
 */

/** Extensions of links that open or download a file, not a page. */
export const FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf', 'zip', 'gz', 'csv', 'json', 'xml', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg',
  'mp3', 'mp4', 'webm', 'ogg', 'wav', 'ics', 'gpx', 'geojson', 'pmtiles', 'woff', 'woff2',
]);

export interface PageLinks {
  /** Routes of the same site, each once, in the order of the page. */
  readonly routes: readonly string[];
  /** Hosts of links that leave the site, each once. */
  readonly externalHosts: readonly string[];
  /** Same-site links to files, each once. */
  readonly files: readonly string[];
  /** Links that are not addresses of pages: mail, phone, scripts, and text that is not a URL. */
  readonly other: number;
}

function extensionOf(path: string): string {
  const last = path.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : '';
}

/** The links of a page. `pageUrl` is the full address the markup was served from, used to resolve relative links. */
export function linksIn(html: string, pageUrl: string): PageLinks {
  const { nodes } = parseHtml(html);
  let base = pageUrl;
  const baseNode = nodes.find((n) => n.tag === 'base' && attrOf(n, 'href') !== '');
  if (baseNode) {
    try {
      base = new URL(attrOf(baseNode, 'href'), pageUrl).toString();
    } catch {
      base = pageUrl;
    }
  }
  const routes = new Set<string>();
  const hosts = new Set<string>();
  const files = new Set<string>();
  let other = 0;
  for (const n of nodes) {
    if (n.tag !== 'a' && n.tag !== 'area') continue;
    const href = n.attrs['href'];
    if (href === undefined) continue;
    const raw = href.trim();
    if (raw === '' || raw.startsWith('#')) continue;
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      other++;
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      other++;
      continue;
    }
    const route = normalizeRoute(url.toString(), pageUrl);
    if (route === null) {
      hosts.add(url.host);
      continue;
    }
    if (n.attrs['download'] !== undefined || FILE_EXTENSIONS.has(extensionOf(url.pathname))) files.add(route);
    else routes.add(route);
  }
  return { routes: [...routes], externalHosts: [...hosts], files: [...files], other };
}

export interface Discovery {
  /** Every route found, each once, sorted. */
  readonly routes: readonly string[];
  /** Routes that were linked to and whose markup was not among the pages given. */
  readonly notRead: readonly string[];
  readonly externalHosts: readonly string[];
  readonly files: readonly string[];
}

/** Joins the links of several pages. `pages` maps the full address of each page to its markup. */
export function discoverRoutes(pages: ReadonlyMap<string, string> | Readonly<Record<string, string>>): Discovery {
  const list: [string, string][] = pages instanceof Map ? [...pages.entries()] : Object.entries(pages);
  const routes = new Set<string>();
  const read = new Set<string>();
  const hosts = new Set<string>();
  const files = new Set<string>();
  for (const [url, html] of list) {
    const self = normalizeRoute(url, url);
    if (self !== null) {
      routes.add(self);
      read.add(self);
    }
    const links = linksIn(html, url);
    for (const r of links.routes) routes.add(r);
    for (const h of links.externalHosts) hosts.add(h);
    for (const f of links.files) files.add(f);
  }
  const sorted = [...routes].sort((a, b) => a.localeCompare(b));
  return { routes: sorted, notRead: sorted.filter((r) => !read.has(r)), externalHosts: [...hosts].sort(), files: [...files].sort() };
}
