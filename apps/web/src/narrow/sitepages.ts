import { parseHtml, type HtmlNode } from './htmllint.js';
import { ancestorsOf, attrOf, isHiddenNode, nodeLabel } from './markup.js';
import { HELP_WORDS, type PageFacts, type Region } from './probes.js';
import { normalizeRoute } from './routes.js';

/**
 * Several pages of one site read from their markup, so that checks can
 * compare them: where each link goes, what it is called, which region it sits
 * in, which ids a page holds, and which page it names as its other-language
 * version. Nothing is fetched and no script runs, so links and regions a
 * script adds are not seen.
 */

export interface SitePage {
  /** Route of the page on the site, such as `/` or `/fr/lieux`. */
  readonly route: string;
  readonly html: string;
}

export interface SiteLink {
  /** Route the link goes to, without its fragment. Null for a link that leaves the site or is not a page address. */
  readonly to: string | null;
  /** Fragment without the `#`, or an empty string. */
  readonly fragment: string;
  /** Accessible name from the markup: aria-label, else the text, else the alt of an image inside. */
  readonly name: string;
  readonly region: Region;
  /** Element label for the report, such as `a#help@L12`. */
  readonly id: string;
  readonly href: string;
}

export interface Alternate {
  readonly hreflang: string;
  readonly to: string | null;
  readonly href: string;
}

export interface PageCounts {
  readonly headings: number;
  readonly links: number;
  readonly fields: number;
  readonly images: number;
  readonly tables: number;
  readonly listItems: number;
  readonly buttons: number;
}

export interface PageInfo {
  readonly route: string;
  /** Primary language subtag of the html element in lower case, or an empty string. */
  readonly lang: string;
  readonly title: string;
  /** Text of each h1, in order. */
  readonly h1: readonly string[];
  /** Every id on the page, and every name of an anchor. */
  readonly ids: ReadonlySet<string>;
  readonly links: readonly SiteLink[];
  readonly alternates: readonly Alternate[];
  /** True when the page holds a search field or a search landmark. */
  readonly hasSearch: boolean;
  readonly counts: PageCounts;
}

/** A base address that exists only to resolve relative links. It is never requested. */
export const SITE_BASE = 'https://site.invalid';

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

const REGION_TAGS: Readonly<Record<string, Region>> = { header: 'header', nav: 'nav', main: 'main', aside: 'aside', footer: 'footer' };
const REGION_ROLES: Readonly<Record<string, Region>> = { banner: 'header', navigation: 'nav', main: 'main', complementary: 'aside', contentinfo: 'footer' };

/** The landmark region an element sits in, the nearest one first. */
export function regionOfNode(nodes: readonly HtmlNode[], n: HtmlNode): Region {
  for (const a of [n, ...ancestorsOf(nodes, n)]) {
    const byRole = REGION_ROLES[attrOf(a, 'role').toLowerCase()];
    if (byRole) return byRole;
    const byTag = REGION_TAGS[a.tag];
    if (byTag) return byTag;
  }
  return 'body';
}

/** The name a link or button gets from the markup alone. */
export function markupName(nodes: readonly HtmlNode[], n: HtmlNode): string {
  const label = collapse(attrOf(n, 'aria-label'));
  if (label !== '') return label;
  const text = collapse(n.text);
  if (text !== '') return text;
  const stack = [...n.children];
  while (stack.length > 0) {
    const child = nodes[stack.shift() as number];
    if (!child) continue;
    if (child.tag === 'img' && collapse(attrOf(child, 'alt')) !== '') return collapse(attrOf(child, 'alt'));
    if (child.tag === 'svg' && collapse(attrOf(child, 'aria-label')) !== '') return collapse(attrOf(child, 'aria-label'));
    stack.push(...child.children);
  }
  return collapse(attrOf(n, 'title'));
}

const FIELD_TAGS = new Set(['input', 'select', 'textarea']);
const NOT_FIELDS = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

export function readPage(page: SitePage): PageInfo {
  const { nodes } = parseHtml(page.html);
  const pageUrl = `${SITE_BASE}${page.route.startsWith('/') ? '' : '/'}${page.route}`;
  let base = pageUrl;
  const baseNode = nodes.find((n) => n.tag === 'base' && attrOf(n, 'href') !== '');
  if (baseNode) {
    try {
      base = new URL(attrOf(baseNode, 'href'), pageUrl).toString();
    } catch {
      base = pageUrl;
    }
  }
  const resolve = (href: string): { to: string | null; fragment: string } => {
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return { to: null, fragment: '' };
    }
    const route = normalizeRoute(url.toString(), SITE_BASE);
    if (route === null) return { to: null, fragment: '' };
    const hashRoute = url.hash.startsWith('#/') || url.hash.startsWith('#!/');
    let fragment = '';
    if (!hashRoute && url.hash.length > 1) {
      try {
        fragment = decodeURIComponent(url.hash.slice(1));
      } catch {
        fragment = url.hash.slice(1);
      }
    }
    return { to: route, fragment };
  };

  const htmlNode = nodes.find((n) => n.tag === 'html');
  const lang = (htmlNode ? attrOf(htmlNode, 'lang') : '').toLowerCase().split('-')[0] ?? '';
  const titleNode = nodes.find((n) => n.tag === 'title' && !ancestorsOf(nodes, n).some((a) => a.tag === 'svg'));
  const ids = new Set<string>();
  const links: SiteLink[] = [];
  const alternates: Alternate[] = [];
  const h1: string[] = [];
  let hasSearch = false;
  const counts = { headings: 0, links: 0, fields: 0, images: 0, tables: 0, listItems: 0, buttons: 0 };

  for (const n of nodes) {
    const id = attrOf(n, 'id');
    if (id !== '') ids.add(id);
    if (n.tag === 'a' && attrOf(n, 'name') !== '') ids.add(attrOf(n, 'name'));
    if (n.tag === 'link') {
      const rel = attrOf(n, 'rel').toLowerCase().split(/\s+/);
      const hreflang = attrOf(n, 'hreflang').toLowerCase();
      if (rel.includes('alternate') && hreflang !== '' && attrOf(n, 'href') !== '') {
        alternates.push({ hreflang, to: resolve(attrOf(n, 'href')).to, href: attrOf(n, 'href') });
      }
      continue;
    }
    if (isHiddenNode(nodes, n)) continue;
    if (/^h[1-6]$/.test(n.tag)) {
      counts.headings++;
      if (n.tag === 'h1') h1.push(collapse(n.text));
    } else if (n.tag === 'img') counts.images++;
    else if (n.tag === 'table') counts.tables++;
    else if (n.tag === 'li') counts.listItems++;
    else if (n.tag === 'button') counts.buttons++;
    else if (FIELD_TAGS.has(n.tag) && !NOT_FIELDS.has(attrOf(n, 'type').toLowerCase())) counts.fields++;
    if ((n.tag === 'input' && attrOf(n, 'type').toLowerCase() === 'search') || attrOf(n, 'role').toLowerCase() === 'search' || n.tag === 'search') hasSearch = true;
    if (n.tag !== 'a' && n.tag !== 'area') continue;
    const href = n.attrs['href'];
    if (href === undefined || href.trim() === '') continue;
    counts.links++;
    const raw = href.trim();
    const isPage = !/^[a-z][a-z0-9+.-]*:/i.test(raw) || /^https?:/i.test(raw);
    const target = isPage ? resolve(raw) : { to: null, fragment: '' };
    links.push({ to: target.to, fragment: target.fragment, name: markupName(nodes, n), region: regionOfNode(nodes, n), id: nodeLabel(n), href: raw });
  }
  return { route: page.route, lang, title: titleNode ? collapse(titleNode.text) : '', h1, ids, links, alternates, hasSearch, counts };
}

export function readSite(pages: readonly SitePage[]): PageInfo[] {
  const seen = new Set<string>();
  const out: PageInfo[] = [];
  for (const p of pages) {
    if (seen.has(p.route)) continue;
    seen.add(p.route);
    out.push(readPage(p));
  }
  return out;
}

/**
 * The facts the cross-page consistency check reads, taken from markup, so
 * that check can run on files as well as in a browser. Colours, sizes and
 * controls are left empty: markup does not hold them.
 */
export function factsFromMarkup(info: PageInfo): PageFacts {
  const nav = info.links.filter((l) => l.region === 'nav' && l.name !== '').map((l) => l.name);
  let help: PageFacts['help'] = null;
  let seenMain = false;
  for (const l of info.links) {
    if (l.region === 'main') seenMain = true;
    if (l.name !== '' && HELP_WORDS.test(l.name)) {
      help = { text: l.name.slice(0, 60), region: l.region, afterMain: seenMain && l.region !== 'main' };
      break;
    }
  }
  return { title: info.title, lang: info.lang, links: [], controls: [], draggables: [], nav, help, truncated: false };
}
