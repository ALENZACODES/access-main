import { auditConsistency } from './consistency.js';
import { auditLangPairs } from './langpairs.js';
import { buildRouteAudit, type RouteAudit } from './report.js';
import { auditSiteLinks, type SiteLinkOptions } from './sitelinks.js';
import { factsFromMarkup, readSite, type PageInfo, type SitePage } from './sitepages.js';
import type { CheckResult } from './types.js';

/**
 * The cross-page checks for a set of pages in hand, either built files or
 * pages a browser has loaded. One call gives the `site` part of a report.
 */

/** Route of a built file: `dist/fr/index.html` under the root `dist` is `/fr`, and `dist/about.html` is `/about`. Null for a file outside the root. */
export function routeOfFile(file: string, root: string): string | null {
  const clean = (s: string): string => s.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '');
  const f = clean(file);
  const r = clean(root).replace(/\/+$/, '');
  let rest: string;
  if (r === '' || r === '.') rest = f;
  else if (f.startsWith(`${r}/`)) rest = f.slice(r.length + 1);
  else return null;
  rest = rest.replace(/^\/+/, '');
  if (rest === 'index.html' || rest === 'index.htm') return '/';
  rest = rest.replace(/\/index\.html?$/i, '').replace(/\.html?$/i, '');
  return `/${rest}`;
}

export interface FilePage {
  readonly file: string;
  readonly html: string;
}

export interface SiteFromFiles {
  readonly pages: readonly SitePage[];
  /** Files outside the root, or that give a route another file already gave. */
  readonly left: readonly string[];
}

/** Built files as pages of a site. The entry page `/` is put first when it is there, because the checks take the first page as the way in. */
export function siteFromFiles(files: readonly FilePage[], root: string): SiteFromFiles {
  const pages: SitePage[] = [];
  const left: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const route = routeOfFile(f.file, root);
    if (route === null || seen.has(route)) {
      left.push(f.file);
      continue;
    }
    seen.add(route);
    pages.push({ route, html: f.html });
  }
  pages.sort((a, b) => Number(b.route === '/') - Number(a.route === '/'));
  return { pages, left };
}

export interface SiteResults {
  readonly consistency?: CheckResult;
  readonly 'site-links': CheckResult;
  readonly 'lang-pairs': CheckResult;
}

/** The results of the two markup checks across pages. With `withConsistency` the consistency check is run from the markup too; a browser run leaves it off, because it has measured facts for that check. */
export function siteResults(infos: readonly PageInfo[], options: SiteLinkOptions & { readonly withConsistency?: boolean } = {}): SiteResults {
  const links = auditSiteLinks(infos, options);
  const pairs = auditLangPairs(infos);
  if (!options.withConsistency) return { 'site-links': links, 'lang-pairs': pairs };
  return { consistency: auditConsistency(infos.map((info) => ({ route: info.route, facts: factsFromMarkup(info) }))), 'site-links': links, 'lang-pairs': pairs };
}

/** The `site` route of a report for pages read from files. Null for fewer than two pages: there is nothing to compare. */
export function auditSitePages(pages: readonly SitePage[], options: SiteLinkOptions = {}): RouteAudit | null {
  const infos = readSite(pages);
  if (infos.length < 2) return null;
  return buildRouteAudit('site', null, siteResults(infos, { ...options, withConsistency: true }));
}
