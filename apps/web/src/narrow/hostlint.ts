import { t, type CheckResult, type Entry } from './types.js';

/**
 * Finds the outside hosts a page or a source file talks to. A third-party map
 * tile server is a failure, as is any plain http address. Trackers, font and
 * script CDNs and other hosts are UNKNOWN: they may be fine, but each one is a
 * place the App stops working offline or shares a visit, so a person decides.
 * Nothing here makes a network request.
 */

export type HostClass = 'tile-server' | 'insecure' | 'tracker' | 'font-cdn' | 'cdn' | 'other';

interface Known {
  readonly id: Exclude<HostClass, 'insecure' | 'other'>;
  readonly pattern: RegExp;
}

const KNOWN: readonly Known[] = [
  {
    id: 'tile-server',
    pattern:
      /(^|\.)(tile\.openstreetmap\.(org|de|fr)|tiles\.mapbox\.com|api\.mapbox\.com|maps\.googleapis\.com|maps\.gstatic\.com|tile\.thunderforest\.com|basemaps\.cartocdn\.com|api\.maptiler\.com|tiles\.stadiamaps\.com|stamen-tiles[a-z0-9-]*\.a\.ssl\.fastly\.net|tile\.stamen\.com|mt[0-3]\.google\.com|khms[0-3]\.google\.com|tiles\.wmflabs\.org|tiles\.arcgis\.com|server\.arcgisonline\.com|api\.tomtom\.com|tiles\.[a-z0-9-]+\.here\.com)$/,
  },
  {
    id: 'tracker',
    pattern:
      /(^|\.)(google-analytics\.com|googletagmanager\.com|doubleclick\.net|googlesyndication\.com|facebook\.net|connect\.facebook\.com|hotjar\.com|cdn\.segment\.com|segment\.io|mixpanel\.com|fullstory\.com|clarity\.ms|amplitude\.com|heapanalytics\.com|plausible\.io|matomo\.cloud|sentry\.io|bugsnag\.com|datadoghq\.com)$/,
  },
  { id: 'font-cdn', pattern: /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|use\.fontawesome\.com|kit\.fontawesome\.com|fonts\.bunny\.net)$/ },
  { id: 'cdn', pattern: /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|code\.jquery\.com|ajax\.googleapis\.com|stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com|esm\.sh|cdn\.skypack\.dev)$/ },
];

const MESSAGES: Readonly<Record<HostClass, { en: (h: string) => string; fr: (h: string) => string }>> = {
  'tile-server': {
    en: (h) => `The map tiles come from a third-party server (${h}). The App only uses its own tiles.`,
    fr: (h) => `Les tuiles de carte viennent d’un serveur tiers (${h}). L’application n’utilise que ses propres tuiles.`,
  },
  insecure: {
    en: (h) => `${h} is reached over plain http. Use https.`,
    fr: (h) => `${h} est joint en http simple. Utilisez https.`,
  },
  tracker: {
    en: (h) => `${h} is an analytics or tracking host. Decide whether it is needed and say so in the privacy notice.`,
    fr: (h) => `${h} est un hôte d’analyse ou de suivi. Décidez s’il est nécessaire et indiquez-le dans l’avis de confidentialité.`,
  },
  'font-cdn': {
    en: (h) => `Fonts load from ${h}, which stops working offline. Serve the fonts from the App.`,
    fr: (h) => `Des polices se chargent depuis ${h}, ce qui ne fonctionne pas hors ligne. Servez les polices depuis l’application.`,
  },
  cdn: {
    en: (h) => `Code loads from ${h}, which stops working offline. Bundle it with the App.`,
    fr: (h) => `Du code se charge depuis ${h}, ce qui ne fonctionne pas hors ligne. Intégrez-le à l’application.`,
  },
  other: {
    en: (h) => `The page uses ${h}. Check that it is needed, works offline and is named in the privacy notice.`,
    fr: (h) => `La page utilise ${h}. Contrôlez qu’il est nécessaire, qu’il fonctionne hors ligne et qu’il figure dans l’avis de confidentialité.`,
  },
};

export const HOST_CLASSES: readonly HostClass[] = ['tile-server', 'insecure', 'tracker', 'font-cdn', 'cdn', 'other'];

const FAILS: ReadonlySet<HostClass> = new Set<HostClass>(['tile-server', 'insecure']);

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|[a-z0-9-]+\.localhost)$/;

/** Namespace and schema addresses that are names, not requests. */
const NAMESPACES = /^(?:https?:)?\/\/(?:www\.w3\.org\/(?:2000\/svg|1999\/xhtml|1999\/xlink|XML\/1998\/namespace|1998\/Math\/MathML|2000\/xmlns)|json-schema\.org\/|schemas\.microsoft\.com\/|ns\.adobe\.com\/)/i;

/** The host of an http, https or protocol-relative address, lowercase, without the port. */
export function hostOf(url: string): string | null {
  const m = /^(?:(https?):)?\/\/([^/:?#\s]+)/i.exec(url.trim());
  return m ? (m[2] ?? '').toLowerCase().replace(/\.$/, '') : null;
}

export function isInsecure(url: string): boolean {
  return /^http:\/\//i.test(url.trim());
}

export function classifyHost(host: string): HostClass {
  for (const k of KNOWN) if (k.pattern.test(host)) return k.id;
  return 'other';
}

/** * matches any run of characters, so "*.example.org" covers every subdomain but not example.org itself. */
export function hostAllowed(host: string, allow: readonly string[]): boolean {
  return allow.some((p) => new RegExp('^' + p.toLowerCase().split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(host));
}

export interface UrlItem {
  readonly id: string;
  readonly url: string;
}

export interface HostOptions {
  /** Host of the page itself. Addresses on it are not external. */
  readonly selfHost?: string;
  /** Host patterns the team has decided are fine. They are skipped, never reported as passing. */
  readonly allow?: readonly string[];
}

/** One entry per host and class, naming the first place it was seen. */
export function auditHosts(items: readonly UrlItem[], opts: HostOptions = {}): CheckResult {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let checked = 0;
  for (const item of items) {
    if (NAMESPACES.test(item.url)) continue;
    const host = hostOf(item.url);
    if (host === null || LOCAL.test(host)) continue;
    checked++;
    if (opts.selfHost && host === opts.selfHost.toLowerCase()) continue;
    if (opts.allow && hostAllowed(host, opts.allow)) continue;
    const insecure = isInsecure(item.url);
    const cls: HostClass = insecure ? 'insecure' : classifyHost(host);
    const key = `${cls}|${host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const msg = MESSAGES[cls];
    entries.push({
      check: 'external',
      id: item.id,
      status: FAILS.has(cls) ? 'fail' : 'unknown',
      rule: cls,
      message: t(msg.en(host), msg.fr(host)),
    });
    // A tile server over http is two problems, and the second is the one that is not a judgement call.
    if (insecure && classifyHost(host) === 'tile-server') {
      const m = MESSAGES['tile-server'];
      entries.push({ check: 'external', id: item.id, status: 'fail', rule: 'tile-server', message: t(m.en(host), m.fr(host)) });
    }
  }
  return { checked, entries };
}

const FULL = /https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#][^\s"'`)<>\\]*)?/gi;
const RELATIVE = /(?<=["'(=])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#][^\s"'`)<>\\]*)?/gi;

/** Addresses in a text file (HTML, CSS, JavaScript, JSON), with the line each is on. */
export function extractUrls(file: string, text: string): UrlItem[] {
  const out: UrlItem[] = [];
  const lineAt = (index: number): number => text.slice(0, index).split('\n').length;
  for (const re of [FULL, RELATIVE]) {
    for (const m of text.matchAll(re)) {
      const url = m[0].replace(/[.,;]+$/, '');
      out.push({ id: `${file}@L${lineAt(m.index ?? 0)}`, url });
    }
  }
  return out.sort((a, b) => Number(a.id.split('@L')[1]) - Number(b.id.split('@L')[1]));
}

export function scanHosts(file: string, text: string, opts: HostOptions = {}): CheckResult {
  return auditHosts(extractUrls(file, text), opts);
}

// ---------------------------------------------------------------- in the page

export interface ResourceFacts {
  readonly origin: string;
  /** Addresses of what the page loaded, from the browser's own timing list. */
  readonly urls: readonly string[];
}

/** Runs in the page. Reads the resource timing list and the links that name other hosts. */
export function resourcesInPage(args: { readonly max: number }): ResourceFacts {
  interface G {
    location?: { origin?: string; href?: string };
    performance?: { getEntriesByType?(t: string): ArrayLike<{ name: string }> };
    document?: { querySelectorAll?(s: string): ArrayLike<{ getAttribute(n: string): string | null }> };
  }
  const g = globalThis as unknown as G;
  const urls: string[] = [];
  const add = (u: string | null): void => {
    if (u && /^(https?:)?\/\//i.test(u) && urls.length < args.max && !urls.includes(u)) urls.push(u);
  };
  const entries = g.performance?.getEntriesByType?.('resource');
  for (let i = 0; entries && i < entries.length; i++) add(entries[i]?.name ?? null);
  const nodes = g.document?.querySelectorAll?.('link[href], script[src], img[src], iframe[src], source[src], form[action]');
  for (let i = 0; nodes && i < nodes.length; i++) {
    const n = nodes[i];
    if (n) add(n.getAttribute('href') ?? n.getAttribute('src') ?? n.getAttribute('action'));
  }
  return { origin: g.location?.origin ?? '', urls };
}

export function auditResources(facts: ResourceFacts, opts: Omit<HostOptions, 'selfHost'> = {}): CheckResult {
  const selfHost = hostOf(facts.origin) ?? undefined;
  const items = facts.urls.map((url) => ({ id: `resource:${hostOf(url) ?? url}`, url }));
  return auditHosts(items, { ...opts, ...(selfHost ? { selfHost } : {}) });
}
