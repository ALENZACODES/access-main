/**
 * Framework-neutral request handler for the data-status routes. Plug it into any
 * server (Node http, Express, a worker) with one call; it returns null for paths
 * that are not its own so the caller can carry on to its normal routing.
 *
 *   GET /data-status                    -> 302 to /en/… or /fr/… (from Accept-Language)
 *   GET /{en|fr}/data-status            -> HTML page (works without scripts; filters are a GET form)
 *   GET /{en|fr}/data-status/sources.csv  -> CSV of the sources the filters show
 *   GET /{en|fr}/data-status/credits.txt  -> plain-text credits for every source
 *   GET /{en|fr}/data-status/summary.json -> language-neutral summary (unknown stays null)
 *   GET /{en|fr}/data-status/review.ics   -> calendar file of review dates (Unknown dates get no event)
 *   GET /{en|fr}/data-status/catalogue.json -> DCAT JSON-LD catalogue of datasets and sources
 *   GET /{en|fr}/data-status/review-checklist.md  -> review checklist for the sources the filters show (Markdown)
 *   GET /{en|fr}/data-status/review-checklist.csv -> the same checklist, one row for each step (CSV)
 *   GET /{en|fr}/data-status/record-facts.csv     -> source, licence, date and tier for each record
 *   GET /{en|fr}/data-status/planning-tables.csv  -> the planning tables
 *   GET /{en|fr}/data-status/summary.txt          -> short plain-text summary
 *   Page query: state, kind, q, issues, tier, lic, ds, gap, age, due, stale_<type>, sort, dir, page, size, group, details
 */
import { buildCompleteness, completenessToJson } from './completeness';
import { checkConsistency, consistencyToJson } from './consistency';
import { buildCatalogue, catalogueToJson } from './catalogue';
import { buildIcs } from './ics';
import { buildReviewQueue } from './reviewDue';
import { parseTableView } from './tableView';
import { buildAttributions, renderAttributionText } from './attribution';
import { auditedSourcesToCsv } from './csv';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { applyFilters } from './filters';
import { t } from './i18n';
import { otherLocale, resolveLocale } from './locale';
import { renderDataStatusPage } from './page';
import type { LoadIssue } from './registryLoader';
import { fnv1a32 } from './snapshot';
import { escapeHtml } from './sourceList';
import { buildSummary, summaryToJson } from './summary';
import { parseViewState } from './thresholds';
import { PAGE_CSS } from './page';
import { buildFactsCsv } from './factsCsv';
import { buildListedJsonFile } from './listedJson';
import { buildChecklist, buildChecklistFile } from './reviewChecklist';
import { parseSort } from './sorting';
import { buildTablesCsv } from './tablesCsv';
import { buildTextSummary } from './textSummary';

export interface DsRequest {
  method: string;
  /** Path and query, for example "/fr/data-status?state=stale". */
  url: string;
  headers?: Readonly<Record<string, string | undefined>>;
}

export interface DsResponse {
  status: number;
  /** Lower-case header names. */
  headers: Record<string, string>;
  body: string;
}

export interface HandlerContext {
  getRecords: () => readonly DatasetRecord[] | Promise<readonly DatasetRecord[]>;
  now?: () => Date;
  /** Route base without a locale prefix. Default "/data-status". */
  basePath?: string;
  loadIssues?: readonly LoadIssue[];
}

export const MAX_URL_LENGTH = 2000;
export const DEFAULT_BASE_PATH = '/data-status';

const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
} as const;

type Kind = 'html' | 'csv' | 'credits' | 'summary' | 'ics' | 'catalogue' | 'completeness' | 'consistency' | 'checklistMd' | 'checklistCsv' | 'facts' | 'tables' | 'textSummary' | 'listedJson';
const SUFFIX: Readonly<Record<string, Kind>> = {
  '': 'html',
  '/sources.csv': 'csv',
  '/credits.txt': 'credits',
  '/summary.json': 'summary',
  '/review.ics': 'ics',
  '/catalogue.json': 'catalogue',
  '/completeness.json': 'completeness',
  '/consistency.json': 'consistency',
  '/review-checklist.md': 'checklistMd',
  '/review-checklist.csv': 'checklistCsv',
  '/record-facts.csv': 'facts',
  '/planning-tables.csv': 'tables',
  '/summary.txt': 'textSummary',
  '/listed-sources.json': 'listedJson',
};

function header(req: DsRequest, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers ?? {})) if (k.toLowerCase() === want) return v;
  return undefined;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export interface Route {
  locale: Locale | null;
  kind: Kind;
  pathname: string;
  search: string;
}

/** Match a request URL against the routes; null when it is not one of ours. */
export function matchRoute(url: string, basePath: string = DEFAULT_BASE_PATH): Route | null {
  let parsed: URL;
  try {
    parsed = new URL(url, 'http://localhost');
  } catch {
    return null;
  }
  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const m = /^(?:\/(en|fr))?(.*?)(\/sources\.csv|\/credits\.txt|\/summary\.json|\/review\.ics|\/catalogue\.json|\/completeness\.json|\/consistency\.json|\/review-checklist\.md|\/review-checklist\.csv|\/record-facts\.csv|\/planning-tables\.csv|\/summary\.txt|\/listed-sources\.json)?$/.exec(path);
  if (!m || (m[2] ?? '') !== basePath) return null;
  return { locale: (m[1] as Locale | undefined) ?? null, kind: SUFFIX[m[3] ?? ''] as Kind, pathname: path, search: parsed.search };
}

function respond(req: DsRequest, status: number, headers: Record<string, string>, body: string): DsResponse {
  const etag = `W/"${fnv1a32(body)}-${byteLength(body)}"`;
  const all: Record<string, string> = { ...BASE_HEADERS, ...headers };
  if (status === 200) {
    all['etag'] = etag;
    all['content-length'] = String(byteLength(body));
    const inm = header(req, 'if-none-match');
    if (inm && inm.split(',').some((v) => v.trim() === etag || v.trim() === '*')) {
      delete all['content-length'];
      delete all['content-disposition'];
      return { status: 304, headers: all, body: '' };
    }
  }
  return { status, headers: all, body: req.method.toUpperCase() === 'HEAD' ? '' : body };
}

function plain(req: DsRequest, status: number, locale: Locale, text: string, extra: Record<string, string> = {}): DsResponse {
  return respond(req, status, { 'content-type': 'text/plain; charset=utf-8', 'content-language': locale, 'cache-control': 'no-store', ...extra }, `${text}\n`);
}

/** Minimal localized error page; scripts are not needed. */
export function renderErrorPage(locale: Locale, retryHref: string): string {
  const title = escapeHtml(t(locale, 'err.title'));
  return (
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${PAGE_CSS}</style></head><body>` +
    `<a class="ds-skip" href="#main">${escapeHtml(t(locale, 'page.skip'))}</a>` +
    `<main id="main" tabindex="-1"><h1>${title}</h1><p>${escapeHtml(t(locale, 'err.body'))}</p>` +
    `<p><a href="${escapeHtml(retryHref)}" style="display:inline-flex;align-items:center;min-width:44px;min-height:44px">${escapeHtml(t(locale, 'err.retry'))}</a></p></main></body></html>`
  );
}

export async function handleDataStatus(req: DsRequest, ctx: HandlerContext): Promise<DsResponse | null> {
  const base = ctx.basePath ?? DEFAULT_BASE_PATH;
  const route = matchRoute(req.url, base);
  if (route === null) return null;

  const accept = resolveLocale(header(req, 'accept-language') ?? null, 'en');
  const locale = route.locale ?? accept;

  if (req.url.length > MAX_URL_LENGTH) return plain(req, 414, locale, t(locale, 'err.tooLong'));
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return plain(req, 405, locale, t(locale, 'err.method'), { allow: 'GET, HEAD' });

  if (route.locale === null) {
    return { status: 302, headers: { ...BASE_HEADERS, location: `/${locale}${route.pathname}${route.search}`, vary: 'Accept-Language', 'cache-control': 'no-store' }, body: '' };
  }

  let records: readonly DatasetRecord[];
  try {
    records = await ctx.getRecords();
  } catch {
    return respond(
      req,
      503,
      { 'content-type': 'text/html; charset=utf-8', 'content-language': locale, 'cache-control': 'no-store', 'retry-after': '60', 'content-security-policy': HTML_CSP },
      renderErrorPage(locale, `${route.pathname}${route.search}`),
    );
  }

  const now = (ctx.now ?? (() => new Date()))();
  const view = parseViewState(route.search);
  const audit = auditRegistry(records, now, view.thresholds);
  const common = { 'content-language': locale, 'cache-control': 'no-cache' };
  const prefix = `/${locale}${base}`;

  switch (route.kind) {
    case 'csv':
      return respond(
        req,
        200,
        { ...common, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="data-sources.csv"' },
        auditedSourcesToCsv(applyFilters(audit.sources, view.filters), locale),
      );
    case 'credits':
      return respond(req, 200, { ...common, 'content-type': 'text/plain; charset=utf-8' }, `${renderAttributionText(buildAttributions(audit.sources, locale), locale)}\n`);
    case 'ics':
      return respond(
        req,
        200,
        { ...common, 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="review-dates.ics"' },
        buildIcs(buildReviewQueue(audit, now), now, locale),
      );
    case 'catalogue':
      return respond(req, 200, { ...common, 'content-type': 'application/ld+json; charset=utf-8' }, catalogueToJson(buildCatalogue(audit, now)));
    case 'completeness':
      return respond(req, 200, { ...common, 'content-type': 'application/json; charset=utf-8' }, completenessToJson(buildCompleteness(audit), now));
    case 'consistency': {
      const result = checkConsistency(records, now, { thresholds: view.thresholds });
      return respond(req, 200, { ...common, 'content-type': 'application/json; charset=utf-8' }, consistencyToJson(result, now));
    }
    case 'checklistMd':
    case 'checklistCsv': {
      const format = route.kind === 'checklistMd' ? 'md' : 'csv';
      const checklist = buildChecklist(audit, view.filters, locale, parseSort(route.search));
      const names = new Map(audit.datasets.map((d) => [d.id, d.name] as const));
      const file = buildChecklistFile(checklist, format, view.filters, now, locale, { datasetNames: names });
      return respond(req, 200, { ...common, 'content-type': file.mime.replace(';charset=', '; charset='), 'content-disposition': `attachment; filename="${file.filename}"` }, file.text);
    }
    case 'listedJson': {
      const file = buildListedJsonFile(audit, view.filters, now, locale, parseSort(route.search));
      return respond(req, 200, { ...common, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${file.filename}"` }, file.text);
    }
    case 'facts':
      return respond(
        req,
        200,
        { ...common, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="record-facts.csv"' },
        buildFactsCsv(records, audit, locale),
      );
    case 'tables':
      return respond(
        req,
        200,
        { ...common, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="planning-tables.csv"' },
        buildTablesCsv(audit, now, locale),
      );
    case 'textSummary':
      return respond(req, 200, { ...common, 'content-type': 'text/plain; charset=utf-8' }, buildTextSummary(records, audit, now, locale));
    case 'summary':
      return respond(req, 200, { ...common, 'content-type': 'application/json; charset=utf-8' }, summaryToJson(buildSummary(audit, now)));
    default:
      return respond(
        req,
        200,
        { ...common, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': HTML_CSP },
        renderDataStatusPage({
          records,
          locale,
          now,
          pathname: prefix,
          filters: view.filters,
          thresholds: view.thresholds,
          table: parseTableView(route.search),
          loadIssues: ctx.loadIssues,
          staticView: { action: prefix, csvHref: `${prefix}/sources.csv`, creditsHref: `${prefix}/credits.txt`, summaryHref: `${prefix}/summary.json`, icsHref: `${prefix}/review.ics`,
            catalogueHref: `${prefix}/catalogue.json`,
            checklistMdHref: `${prefix}/review-checklist.md`,
            checklistCsvHref: `${prefix}/review-checklist.csv`,
            factsHref: `${prefix}/record-facts.csv`,
            tablesHref: `${prefix}/planning-tables.csv`,
            textSummaryHref: `${prefix}/summary.txt`,
            listedJsonHref: `${prefix}/listed-sources.json`,
          },
        }),
      );
  }
}

/** The language-switch target for a locale-prefixed route. */
export function alternateHref(route: Route): string | null {
  return route.locale === null ? null : `/${otherLocale(route.locale)}${route.pathname.replace(/^\/(en|fr)/, '')}${route.search}`;
}
