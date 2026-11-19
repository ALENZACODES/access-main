/**
 * Routes of a site as text, for planning which pages to audit. A site with
 * hundreds of thousands of place pages cannot be audited page by page, so the
 * first step is to see which pages share a template: `/places/123` and
 * `/places/456` are the same page with different data. Everything here works
 * on strings and never fetches anything.
 */

/** Placeholder written in a template where routes differ. */
export const WILD = ':x';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^\d+$/;
const HASH = /^[0-9a-f]{16,}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A URL or a path as a route of the site: the path and the query, with no
 * fragment, no doubled slashes and no trailing slash. Returns null for
 * another host, for a scheme that is not http or https, for empty text and
 * for text that is not a URL. A hash route (`#/map`) is kept, because the fragment is the
 * route there.
 */
export function normalizeRoute(input: string, base: string): string | null {
  let url: URL;
  let origin: URL;
  if (input.trim() === '') return null;
  try {
    origin = new URL(base);
    url = new URL(input.trim(), origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.host !== origin.host) return null;
  let path = url.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const hashRoute = url.hash.startsWith('#/') || url.hash.startsWith('#!/') ? url.hash : '';
  return `${path}${url.search}${hashRoute}`;
}

/** The path of a route cut into segments, without the query or the fragment. The root has none. */
export function segmentsOf(route: string): string[] {
  const path = route.split(/[?#]/)[0] ?? '';
  return path.split('/').filter((s) => s !== '');
}

/** True for a segment that is data by its shape alone: a number, a UUID, a long hexadecimal hash or a date. */
export function looksLikeData(segment: string): boolean {
  return NUMBER.test(segment) || UUID.test(segment) || HASH.test(segment) || DATE.test(segment);
}

/** The template of one route by the shape of its segments: `/places/123/photos` gives `/places/:x/photos`. A query is reduced to its parameter names, sorted. */
export function shapeOf(route: string): string {
  const segs = segmentsOf(route).map((s) => (looksLikeData(s) ? WILD : s));
  const query = route.includes('?') ? (route.split('?')[1] ?? '').split('#')[0] ?? '' : '';
  const names = [...new Set(query.split('&').map((p) => p.split('=')[0] ?? '').filter((n) => n !== ''))].sort();
  return `/${segs.join('/')}${names.length > 0 ? `?${names.join('&')}` : ''}`;
}

export interface TemplateOptions {
  /** Distinct values at one place in the path from which that place is read as data. */
  readonly minSiblings?: number;
  /** Sections whose pages are kept apart: a segment right after one of these names is not replaced on counts alone. */
  readonly literals?: readonly string[];
}

export const DEFAULT_MIN_SIBLINGS = 10;

/**
 * Templates for a list of routes. First each route is reduced by shape. Then,
 * wherever routes that are otherwise the same hold at least `minSiblings`
 * different values in one place, that place becomes a placeholder, which
 * finds slugs such as `/places/cn-tower` that carry no number. The first
 * segment is never replaced this way, so top-level pages stay apart.
 *
 * The second step is a guess from counts: a section with many hand-written
 * pages (`/help/...`) looks the same as a section with many data pages. Name
 * such segments in `literals` to keep their pages apart. Returns each
 * template with its routes, the largest first.
 */
export function groupByTemplate(routes: readonly string[], options: TemplateOptions = {}): { template: string; routes: string[] }[] {
  const min = Math.max(2, Math.floor(options.minSiblings ?? DEFAULT_MIN_SIBLINGS));
  const literals = new Set(options.literals ?? []);
  const unique = [...new Set(routes)];
  const shape = new Map<string, string>(unique.map((r) => [r, shapeOf(r)]));
  const depth = Math.max(0, ...[...shape.values()].map((s) => segmentsOf(s).length));

  for (let k = depth - 1; k >= 1; k--) {
    const values = new Map<string, Set<string>>();
    const keyOf = (s: string): string | null => {
      const segs = segmentsOf(s);
      if (k >= segs.length) return null;
      const query = s.includes('?') ? s.slice(s.indexOf('?')) : '';
      return `${segs.length}|${segs.map((x, i) => (i === k ? '\u0000' : x)).join('/')}|${query}`;
    };
    for (const s of new Set(shape.values())) {
      const key = keyOf(s);
      if (key === null) continue;
      const set = values.get(key) ?? new Set<string>();
      set.add(segmentsOf(s)[k] ?? '');
      values.set(key, set);
    }
    for (const [r, s] of shape) {
      const key = keyOf(s);
      if (key === null) continue;
      const set = values.get(key);
      if (!set || (set.size < min && !set.has(WILD))) continue;
      const segs = segmentsOf(s);
      if (literals.has(segs[k - 1] ?? '')) continue;
      segs[k] = WILD;
      const query = s.includes('?') ? s.slice(s.indexOf('?')) : '';
      shape.set(r, `/${segs.join('/')}${query}`);
    }
  }

  const groups = new Map<string, string[]>();
  for (const r of unique) {
    const t = shape.get(r) ?? r;
    groups.set(t, [...(groups.get(t) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([template, list]) => ({ template, routes: list.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.routes.length - a.routes.length || a.template.localeCompare(b.template));
}

/** The template a route belongs to among known templates, or null. A placeholder matches any one segment. */
export function matchTemplate(route: string, templates: readonly string[]): string | null {
  const segs = segmentsOf(route);
  const shaped = shapeOf(route);
  if (templates.includes(shaped)) return shaped;
  for (const t of templates) {
    const ts = segmentsOf(t);
    if (ts.length !== segs.length) continue;
    if (ts.every((x, i) => x === WILD || x === segs[i])) return t;
  }
  return null;
}
