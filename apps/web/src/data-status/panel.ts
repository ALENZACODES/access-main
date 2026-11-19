/**
 * Data-status panel: QA report, changes since the saved copy, dataset and source tables
 * with filters, optional attribute coverage, credits, offline saved copy and CSV export.
 * `mountDataStatusPanel` is the integration point for an app shell; everything else is
 * pure and testable.
 */
import { badgeInlineStyle, buttonInlineStyle } from './a11y';
import { buildAttributions, renderAttributionHtml } from './attribution';
import { coverageTable, type AttributeDef } from './coverage';
import { buildCompleteness, renderCompletenessHtml } from './completeness';
import { renderBasisHtml } from './statusBasis';
import { ageLabel } from './age';
import { auditRegistry, type AuditResult, type DatasetRecord } from './datasetRegistry';
import type { FreshnessState, Locale } from './dataStatus';
import { auditedSourcesToCsv } from './csv';
import { applyFilters, FILTER_KINDS, FILTER_STATES, hasActiveFilters, normaliseQuery, MAX_QUERY_LENGTH, NO_FILTERS, type Filters } from './filters';
import { entryFromAudit, renderHistoryHtml, type HistoryEntry, type HistoryStore } from './history';
import { tCount } from './plural';
import { isDatasetKind } from './freshnessPolicy';
import { t, type MessageKey } from './i18n';
import { formatDisplayDate } from './locale';
import { buildQaReport, renderQaReportHtml } from './qaReport';
import { diffRegistries, renderChangesHtml, type Change } from './registryDiff';
import { createSnapshot, type Snapshot, type SnapshotStore } from './snapshot';
import { escapeHtml } from './sourceList';
import { renderThresholdsHtml, serializeViewState, type Thresholds } from './thresholds';
import { buildReviewQueue, renderReviewHtml } from './reviewDue';
import { ariaSort, applySort, nextSort, type SortKey } from './sorting';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, paginate } from './paging';
import { buildQuery, type TableView } from './tableView';
import {
  buildAgeDistribution,
  buildActions,
  buildChecksumFile,
  buildLicenceBreakdown,
  buildFactsFile,
  buildMarkdownFile,
  buildRecordFacts,
  buildSummaryFile,
  buildSourceDetails,
  buildTablesFile,
  buildTierBreakdown,
  buildToc,
  buildWorkload,
  createAnnouncer,
  describeListChange,
  describeVerify,
  extraLabel,
  renderActionsHtml,
  renderAgeBandsHtml,
  renderGlanceHtml,
  renderGlossaryHtml,
  renderLicenceBreakdownHtml,
  renderRecordFactsHtml,
  renderSelfCheckHtml,
  renderSourceDetailsHtml,
  renderTierBreakdownHtml,
  renderTocHtml,
  renderWorkloadHtml,
  runSelfCheck,
  type ListState,
} from './extras';
import { buildExportFiles } from './exportFiles';

export type SnapshotNote = 'none' | 'unreadable' | null;

export interface PanelState {
  records: readonly DatasetRecord[];
  locale: Locale;
  now: Date;
  /** Set only when the shown data came from the saved copy. */
  snapshotSavedAt?: string | null | undefined;
  snapshotNote?: SnapshotNote | undefined;
  attributes?: readonly AttributeDef[] | undefined;
  /** Raw attribute values per record, used for the coverage table. */
  attributeRecords?: readonly Readonly<Record<string, unknown>>[] | undefined;
  filters?: Filters | undefined;
  /** Changes against the saved copy; null or undefined hides the section. */
  changes?: readonly Change[] | null | undefined;
  /** Plain-text notices shown at the top (already localized). */
  notices?: readonly string[] | undefined;
  /** Staleness thresholds in days per dataset type (defaults apply to the rest). */
  thresholds?: Thresholds | undefined;
  /** Saved totals from earlier visits; shown when present. */
  history?: readonly HistoryEntry[] | null | undefined;
  /**
   * Server-rendered mode: filters become a GET form and downloads become links,
   * so the page works without scripts. Hrefs are paths without a query string.
   */
  staticView?: { action: string; csvHref: string; creditsHref: string; summaryHref: string; icsHref?: string; catalogueHref?: string };
  /** Sort and page of the sources table; used in server-rendered mode, where headings and pager are links. */
  table?: TableView | undefined;
  /**
   * For hosts that already control page width: tables wrap their text to fit instead of
   * scrolling, so no focusable scroll container is added. Default false (scrolling regions).
   */
  plainTables?: boolean | undefined;
}

const esc = escapeHtml;

/** Visually hidden but still read aloud: the short status sentence for list changes. */
const HIDDEN_STYLE = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

function statusBadge(state: FreshnessState, locale: Locale): string {
  return `<span style="${badgeInlineStyle(state)}">${esc(t(locale, `state.${state}`))}</span>`;
}

/** Wide tables scroll inside a focusable, named region so the page itself never scrolls sideways. */
function scrollable(label: string, table: string): string {
  return `<div class="ds-scroll" role="region" tabindex="0" aria-label="${esc(label)}">${table}</div>`;
}

const SCROLL_OPEN = /<div class="ds-scroll" role="region" tabindex="0" aria-label="[^"]*">/g;

/** Swaps each focusable scroll region for a plain wrapper whose text wraps. Table content is untouched. */
export function plainTables(html: string): string {
  return html.replace(SCROLL_OPEN, '<div class="ds-wrap" style="overflow-wrap:anywhere">');
}

function datasetTable(audit: AuditResult, locale: Locale): string {
  const rows = audit.datasets
    .map(
      (d) =>
        `<tr><th scope="row">${esc(d.name)}</th><td>${esc(t(locale, `kind.${d.kind}`))}</td><td>${d.sourceCount}</td><td>${statusBadge(d.state, locale)}</td></tr>`,
    )
    .join('');
  const table =
    `<table><caption>${esc(t(locale, 'tbl.datasets'))}</caption><thead><tr>` +
    `<th scope="col">${esc(t(locale, 'tbl.dataset'))}</th><th scope="col">${esc(t(locale, 'flt.kind'))}</th>` +
    `<th scope="col">${esc(t(locale, 'tbl.sourceCount'))}</th><th scope="col">${esc(t(locale, 'tbl.status'))}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
  return scrollable(t(locale, 'tbl.datasets'), table);
}

export interface RegionNav {
  /** Page path (no query); headings and pager links point here. */
  action: string;
  thresholds: Thresholds;
  table: TableView;
}

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';

function sortHeading(locale: Locale, key: SortKey, label: MessageKey, nav: RegionNav | undefined, filters: Filters): string {
  const text = esc(t(locale, label));
  if (!nav) return `<th scope="col">${text}</th>`;
  const current = nav.table.sort;
  const next = nextSort(current, key);
  const href = nav.action + buildQuery({ filters, thresholds: nav.thresholds }, { sort: next, paging: { ...nav.table.paging, page: 1 } });
  const dir = ariaSort(current, key);
  const arrow = dir === null ? '' : `<span aria-hidden="true">${dir === 'ascending' ? ' \u25B2' : ' \u25BC'}</span>`;
  return `<th scope="col"${dir === null ? '' : ` aria-sort="${dir}"`}><a href="${esc(href)}" style="${LINK_STYLE}">${text}${arrow}</a></th>`;
}

function pager(locale: Locale, nav: RegionNav, filters: Filters, page: number, pages: number): string {
  if (pages <= 1) return '';
  const go = (n: number) => esc(nav.action + buildQuery({ filters, thresholds: nav.thresholds }, { ...nav.table, paging: { ...nav.table.paging, page: n } }));
  const prev =
    page > 1
      ? `<a href="${go(page - 1)}" rel="prev" style="${LINK_STYLE}">${esc(t(locale, 'pg.prev'))}</a>`
      : `<span aria-disabled="true" style="${LINK_STYLE};color:#4B5563">${esc(t(locale, 'pg.prev'))}</span>`;
  const next =
    page < pages
      ? `<a href="${go(page + 1)}" rel="next" style="${LINK_STYLE}">${esc(t(locale, 'pg.next'))}</a>`
      : `<span aria-disabled="true" style="${LINK_STYLE};color:#4B5563">${esc(t(locale, 'pg.next'))}</span>`;
  return `<nav aria-label="${esc(t(locale, 'pg.nav'))}">${prev} <span>${esc(t(locale, 'pg.status', { page, pages }))}</span> ${next}</nav>`;
}

export function renderSourcesRegion(audit: AuditResult, locale: Locale, filters: Filters, now?: Date, nav?: RegionNav): string {
  const unknown = t(locale, 'unknown');
  const matched = applyFilters(audit.sources, filters);
  const total = audit.sources.length;
  const count = `<p>${esc(tCount(locale, 'flt.result', locale === 'fr' ? matched.length : total, { shown: matched.length, total }))}</p>`;
  if (matched.length === 0) {
    return count + (audit.sources.length === 0 ? '' : `<p>${esc(t(locale, 'flt.noMatch'))}</p>`);
  }
  const sorted = nav ? applySort(matched, nav.table.sort, locale) : matched;
  const slice = nav ? paginate(sorted, nav.table.paging) : null;
  const shown = slice ? slice.items : sorted;
  const rows = shown
    .map((s) => {
      const label = esc(`${s.datasetName} / ${s.name ?? t(locale, 'unknownName')}`);
      const name =
        s.url === null
          ? label
          : `<a href="${esc(s.url)}" rel="noopener noreferrer" style="display:inline-block;min-width:44px;min-height:44px;line-height:44px">${label}</a>`;
      const date =
        s.retrievedIso === null
          ? esc(unknown)
          : `<time datetime="${esc(s.retrievedIso)}">${esc(formatDisplayDate(s.retrievedIso, locale))}</time>` +
            (now ? ` (${esc(ageLabel(s.retrievedIso, now, locale))})` : '');
      return (
        `<tr><th scope="row">${name}</th><td>${esc(s.licence ?? unknown)}</td><td>${date}</td>` +
        `<td>${statusBadge(s.state, locale)}</td></tr>`
      );
    })
    .join('');
  const heads =
    sortHeading(locale, 'source', 'tbl.source', nav, filters) +
    sortHeading(locale, 'licence', 'tbl.licence', nav, filters) +
    sortHeading(locale, 'retrieved', 'tbl.retrieved', nav, filters) +
    sortHeading(locale, 'status', 'tbl.status', nav, filters);
  const table =
    `<table><caption>${esc(t(locale, 'tbl.sources'))}</caption><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
  const help = nav ? `<p>${esc(t(locale, 'sort.help'))}</p>` : '';
  return count + help + scrollable(t(locale, 'tbl.sources'), table) + (nav && slice ? pager(locale, nav, filters, slice.page, slice.pages) : '');
}

const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';

function option(value: string, label: string, selected: boolean): string {
  return `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
}

export interface FilterFormOptions {
  action: string;
  thresholds?: Thresholds;
  /** Sort and page size are kept when filters change; the page number restarts. */
  table?: TableView;
}

export function renderFilterControls(locale: Locale, f: Filters, form?: FilterFormOptions): string {
  const stateOpts =
    option('any', t(locale, 'flt.any'), f.state === 'any') +
    FILTER_STATES.map((s) => option(s, t(locale, `state.${s}`), f.state === s)).join('');
  const kindOpts =
    option('any', t(locale, 'flt.any'), f.kind === 'any') +
    FILTER_KINDS.map((k) => option(k, t(locale, `kind.${k}`), f.kind === k)).join('');
  const field = (id: string, key: MessageKey, control: string) =>
    `<div><label for="${id}">${esc(t(locale, key))}</label> ${control}</div>`;
  const controls =
    `<fieldset><legend>${esc(t(locale, 'flt.legend'))}</legend>` +
    field('ds-f-state', 'flt.state', `<select id="ds-f-state" name="state" data-filter="state" style="${FIELD_STYLE}">${stateOpts}</select>`) +
    field('ds-f-kind', 'flt.kind', `<select id="ds-f-kind" name="kind" data-filter="kind" style="${FIELD_STYLE}">${kindOpts}</select>`) +
    field(
      'ds-f-q',
      'flt.query',
      `<input id="ds-f-q" name="q" type="search" data-filter="query" maxlength="${MAX_QUERY_LENGTH}" autocomplete="off" value="${esc(f.query)}" style="${FIELD_STYLE}">`,
    ) +
    `<div><label style="display:inline-flex;align-items:center;gap:8px;min-height:44px">` +
    `<input type="checkbox" id="ds-f-issues" name="issues" value="1" data-filter="onlyIssues" style="width:24px;height:24px"${f.onlyIssues ? ' checked' : ''}>` +
    `${esc(t(locale, 'flt.onlyIssues'))}</label></div>`;
  if (!form) {
    return controls + `<button type="button" data-action="reset-filters" style="${buttonInlineStyle()}">${esc(t(locale, 'flt.reset'))}</button></fieldset>`;
  }
  const sort = form.table?.sort ?? null;
  const size = form.table?.paging.size ?? DEFAULT_PAGE_SIZE;
  const hidden =
    Object.entries(form.thresholds ?? {})
      .map(([k, v]) => `<input type="hidden" name="stale_${esc(k)}" value="${esc(String(v))}">`)
      .join('') +
    (sort ? `<input type="hidden" name="sort" value="${esc(sort.key)}">` + (sort.dir === 'desc' ? '<input type="hidden" name="dir" value="desc">' : '') : '');
  const sizeField = form.table
    ? field('ds-f-size', 'pg.size', `<select id="ds-f-size" name="size" style="${FIELD_STYLE}">${PAGE_SIZES.map((n) => option(String(n), String(n), n === size)).join('')}</select>`)
    : '';
  return (
    `<form method="get" action="${esc(form.action)}">${controls}${sizeField}${hidden}` +
    `<button type="submit" style="${buttonInlineStyle()}">${esc(t(locale, 'flt.apply'))}</button> ` +
    `<a href="${esc(form.action)}" style="display:inline-flex;align-items:center;min-width:44px;min-height:44px">${esc(t(locale, 'flt.reset'))}</a>` +
    `</fieldset></form>`
  );
}

function coverageSection(state: PanelState): string {
  if (!state.attributes || state.attributes.length === 0 || !state.attributeRecords) return '';
  const { locale } = state;
  const rows = coverageTable(state.attributeRecords, state.attributes, locale)
    .map(
      (c) =>
        `<tr><th scope="row">${esc(c.label)}</th><td>${c.tally.yes}</td><td>${c.tally.no}</td>` +
        `<td>${c.tally.unknown}</td><td>${esc(c.unknownShare.text)}</td><td>${esc(c.yesOfKnown.text)}</td></tr>`,
    )
    .join('');
  const th = (k: MessageKey) => `<th scope="col">${esc(t(locale, k))}</th>`;
  const caption = `${t(locale, 'cov.title')} (${t(locale, 'cov.records')}${locale === 'fr' ? '\u00A0' : ''}: ${state.attributeRecords.length})`;
  return scrollable(
    caption,
    `<table><caption>${esc(caption)}</caption>` +
      `<thead><tr>${th('cov.attribute')}${th('cov.yes')}${th('cov.no')}${th('cov.unknown')}${th('cov.unknownShare')}${th('cov.yesOfKnown')}</tr></thead>` +
      `<tbody>${rows}</tbody></table>`,
  );
}

function snapshotLine(state: PanelState): string {
  const { locale } = state;
  if (state.snapshotSavedAt) {
    return (
      `<p role="status">${esc(t(locale, 'app.offline'))} ` +
      `${esc(t(locale, 'snap.savedOn', { date: formatDisplayDate(state.snapshotSavedAt, locale) }))}</p>`
    );
  }
  if (state.snapshotNote === 'none') return `<p role="status">${esc(t(locale, 'snap.none'))}</p>`;
  if (state.snapshotNote === 'unreadable') return `<p role="status">${esc(t(locale, 'snap.unreadable'))}</p>`;
  return '';
}

function downloadLink(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-flex;align-items:center;min-width:44px;min-height:44px">${esc(label)}</a>`;
}

export function renderDataStatusPanel(state: PanelState): string {
  const { locale } = state;
  const filters = state.filters ?? NO_FILTERS;
  const thresholds = state.thresholds ?? {};
  const audit = auditRegistry(state.records, state.now, thresholds);
  const btn = (action: string, label: string) =>
    `<button type="button" data-action="${action}" style="${buttonInlineStyle()}">${esc(label)}</button>`;
  const notices = (state.notices ?? []).map((n) => `<p role="status">${esc(n)}</p>`).join('');
  const sv = state.staticView;
  const query = serializeViewState({ filters, thresholds });
  const thrQuery = serializeViewState({ filters: NO_FILTERS, thresholds });
  const actions = sv
    ? `<div>${downloadLink(sv.csvHref + query, t(locale, 'act.exportCsv'))} ${downloadLink(sv.creditsHref, t(locale, 'dl.credits'))} ${downloadLink(sv.summaryHref + thrQuery, t(locale, 'dl.summary'))}` +
      (sv.icsHref ? ` ${downloadLink(sv.icsHref + thrQuery, t(locale, 'dl.ics'))}` : '') +
      (sv.catalogueHref ? ` ${downloadLink(sv.catalogueHref + thrQuery, t(locale, 'dl.catalogue'))}` : '') +
      `</div>`
    : `<div>${btn('recalculate', t(locale, 'act.recalculate'))} ${btn('export-csv', t(locale, 'act.exportCsv'))} ${btn('export-report', extraLabel('markdown', locale))} ${btn('export-checksums', extraLabel('checksums', locale))} ${btn('export-tables', extraLabel('tables', locale))} ${btn('export-facts', extraLabel('facts', locale))} ${btn('export-summary', extraLabel('summary', locale))}</div>`;
  const head = notices + snapshotLine(state) + actions + renderGlanceHtml(audit, locale);
  const body =
    renderQaReportHtml(buildQaReport(audit, locale), locale) +
    renderActionsHtml(buildActions(audit), locale) +
    renderSourceDetailsHtml(buildSourceDetails(audit), locale) +
    (state.changes ? renderChangesHtml(state.changes, locale) : '') +
    (state.history ? renderHistoryHtml(state.history, locale) : '') +
    datasetTable(audit, locale) +
    renderReviewHtml(buildReviewQueue(audit, state.now), locale) +
    renderWorkloadHtml(buildWorkload(audit, state.now), locale) +
    renderThresholdsHtml(thresholds, locale) +
    renderBasisHtml(audit, locale) +
    renderFilterControls(locale, filters, sv ? { action: sv.action, thresholds, ...(state.table ? { table: state.table } : {}) } : undefined) +
    (sv ? '' : `<div data-region="announce" role="status" aria-live="polite" aria-atomic="true" style="${HIDDEN_STYLE}"></div>`) +
    `<div data-region="sources">${renderSourcesRegion(audit, locale, filters, state.now, sv && state.table ? { action: sv.action, thresholds, table: state.table } : undefined)}</div>` +
    coverageSection(state) +
    renderCompletenessHtml(buildCompleteness(audit), locale) +
    renderLicenceBreakdownHtml(buildLicenceBreakdown(audit), locale) +
    renderTierBreakdownHtml(buildTierBreakdown(state.records), locale) +
    renderRecordFactsHtml(buildRecordFacts(state.records, audit), locale) +
    renderAgeBandsHtml(buildAgeDistribution(audit, state.now), locale) +
    renderSelfCheckHtml(runSelfCheck(state.records, state.now, thresholds), locale) +
    renderGlossaryHtml(locale) +
    scrollable(t(locale, 'attr.title'), renderAttributionHtml(buildAttributions(audit.sources, locale), locale));
  const html = head + renderTocHtml(buildToc(body), locale) + body;
  return state.plainTables === true ? plainTables(html) : html;
}

type EventTarget = {
  closest?: (sel: string) => { getAttribute?: (n: string) => string | null } | null;
  getAttribute?: (n: string) => string | null;
  value?: string;
  checked?: boolean;
};

/** The slice of a DOM element the panel needs (also easy to fake in tests). */
export interface PanelHost {
  innerHTML: string;
  setAttribute(name: string, value: string): void;
  addEventListener(type: 'click' | 'change' | 'input', listener: (ev: unknown) => void): void;
  removeEventListener(type: 'click' | 'change' | 'input', listener: (ev: unknown) => void): void;
  /** Optional: lets filter changes update only the results, so typing keeps focus. */
  querySelector?(selector: string): { innerHTML: string } | null;
}

export interface MountOptions {
  getRecords: () => readonly DatasetRecord[];
  getLocale: () => Locale;
  now?: (() => Date) | undefined;
  store?: SnapshotStore | undefined;
  attributes?: readonly AttributeDef[] | undefined;
  getAttributeRecords?: (() => readonly Readonly<Record<string, unknown>>[]) | undefined;
  /** Called with the CSV text and a file name when the export button is used. */
  onExport?: ((csv: string, filename: string) => void) | undefined;
  /** Called with a text file (Markdown report, checksum list) when its button is used. */
  onExportFile?: ((file: { text: string; filename: string; mime: string }) => void) | undefined;
  /** Starting filters (for example parsed from the URL). */
  initialFilters?: Filters | undefined;
  /** Staleness thresholds in days per dataset type (for example parsed from the URL). */
  thresholds?: Thresholds | undefined;
  /** On-device history of totals; today's totals are recorded when live data loads. */
  history?: HistoryStore | undefined;
  /** Called with the new query string ('' or '?state=…', thresholds included) after filters change. */
  onFiltersChange?: ((search: string) => void) | undefined;
  /** Extra localized notices, for example files that could not be read. */
  getNotices?: ((locale: Locale) => readonly string[]) | undefined;
  /** See PanelState.plainTables. */
  plainTables?: boolean | undefined;
}

export interface MountedPanel {
  refresh(): void;
  getFilters(): Filters;
  destroy(): void;
}

export function mountDataStatusPanel(host: PanelHost, opts: MountOptions): MountedPanel {
  let lastRecords: readonly DatasetRecord[] = [];
  let filters: Filters = { ...(opts.initialFilters ?? NO_FILTERS) };
  let baseline: Snapshot | null | undefined; // undefined until the first refresh
  const thresholds: Thresholds = { ...(opts.thresholds ?? {}) };
  const view = (): string => serializeViewState({ filters: { ...filters, query: normaliseQuery(filters.query) }, thresholds });

  const nowFn = opts.now ?? (() => new Date());

  // Short spoken status for list changes. The sources table is not a live region itself: re-reading
  // every row on each keystroke would bury the answer. The announcer writes one sentence instead.
  const announceEl = () => host.querySelector?.('[data-region="announce"]') ?? null;
  const announcer = createAnnouncer({
    get textContent() {
      return announceEl()?.innerHTML ?? null;
    },
    set textContent(value: string | null) {
      const el = announceEl();
      if (el !== null) el.innerHTML = esc(value ?? '');
    },
  });
  let lastList: ListState | null = null;
  const listState = (audit: AuditResult): ListState => ({
    shown: applyFilters(audit.sources, filters).length,
    total: audit.sources.length,
    filters: { ...filters },
    sort: null,
    page: 1,
    pages: 1,
  });

  const refresh = (): void => {
    const locale = opts.getLocale();
    const now = nowFn();
    let records: readonly DatasetRecord[] | null = null;
    let snapshotSavedAt: string | null = null;
    let snapshotNote: SnapshotNote = null;
    let changes: Change[] | null = null;
    let history: readonly HistoryEntry[] | null = null;

    if (baseline === undefined) {
      const first = opts.store?.load();
      baseline = first && first.ok ? first.snapshot : null;
    }
    try {
      records = opts.getRecords();
    } catch {
      records = null;
    }
    if (records !== null) {
      if (baseline) changes = diffRegistries(baseline.records, records);
      opts.store?.save(createSnapshot(records, now));
      if (opts.history) history = opts.history.record(entryFromAudit(auditRegistry(records, now, thresholds), now));
    } else if (opts.store) {
      if (opts.history) history = opts.history.load();
      const loaded = opts.store.load();
      if (loaded.ok) {
        records = loaded.snapshot.records;
        snapshotSavedAt = loaded.snapshot.savedAt;
      } else {
        snapshotNote = loaded.reason === 'empty' || loaded.reason === 'storage-unavailable' ? 'none' : 'unreadable';
      }
    } else {
      snapshotNote = 'none';
    }
    lastRecords = records ?? [];
    lastList = listState(auditRegistry(lastRecords, now, thresholds));
    host.setAttribute('lang', locale);
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', t(locale, 'panel.label'));
    host.innerHTML = renderDataStatusPanel({
      records: lastRecords,
      locale,
      now,
      snapshotSavedAt,
      snapshotNote,
      attributes: opts.attributes,
      attributeRecords: opts.getAttributeRecords?.(),
      filters,
      thresholds,
      history,
      changes,
      notices: opts.getNotices?.(locale),
      plainTables: opts.plainTables,
    });
  };

  const updateResults = (): void => {
    const region = host.querySelector?.('[data-region="sources"]') ?? null;
    if (region === null) {
      refresh();
      return;
    }
    const now = nowFn();
    const audit = auditRegistry(lastRecords, now, thresholds);
    const results = renderSourcesRegion(audit, opts.getLocale(), filters, now);
    region.innerHTML = opts.plainTables === true ? plainTables(results) : results;
    const next = listState(audit);
    announcer.say(describeListChange(lastList, next, opts.getLocale()));
    lastList = next;
  };

  const onFilterEvent = (ev: unknown): void => {
    const el = (ev as { target?: EventTarget }).target;
    const key = el?.getAttribute?.('data-filter');
    if (!key || !el) return;
    const value = typeof el.value === 'string' ? el.value : '';
    if (key === 'state') filters = { ...filters, state: (FILTER_STATES as readonly string[]).includes(value) ? (value as Filters['state']) : 'any' };
    else if (key === 'kind') filters = { ...filters, kind: isDatasetKind(value) ? value : 'any' };
    else if (key === 'query') filters = { ...filters, query: value.slice(0, MAX_QUERY_LENGTH) };
    else if (key === 'onlyIssues') filters = { ...filters, onlyIssues: el.checked === true };
    else return;
    updateResults();
    opts.onFiltersChange?.(view());
  };

  const exportChecksums = async (): Promise<void> => {
    const locale = opts.getLocale();
    let file: Awaited<ReturnType<typeof buildChecksumFile>> = null;
    try {
      file = await buildChecksumFile(buildExportFiles(lastRecords, locale, nowFn(), thresholds), locale);
    } catch {
      file = null;
    }
    if (file === null) announcer.say(describeVerify(null, locale)[0] ?? '');
    else opts.onExportFile?.({ text: file.text, filename: file.filename, mime: file.mime });
  };

  const onClick = (ev: unknown): void => {
    const target = (ev as { target?: EventTarget }).target;
    const action = target?.closest?.('[data-action]')?.getAttribute?.('data-action');
    if (action === 'recalculate') refresh();
    else if (action === 'reset-filters') {
      if (!hasActiveFilters(filters) && filters.query === '') return;
      const before = lastList;
      filters = { ...NO_FILTERS };
      refresh();
      if (lastList !== null) announcer.say(describeListChange(before, lastList, opts.getLocale()));
      opts.onFiltersChange?.(view());
    } else if (action === 'export-report' && opts.onExportFile) {
      const { text, filename, mime } = buildMarkdownFile(lastRecords, opts.getLocale(), nowFn(), thresholds);
      opts.onExportFile({ text, filename, mime });
    } else if (action === 'export-tables' && opts.onExportFile) {
      const { text, filename, mime } = buildTablesFile(lastRecords, opts.getLocale(), nowFn(), thresholds);
      opts.onExportFile({ text, filename, mime });
    } else if (action === 'export-facts' && opts.onExportFile) {
      const { text, filename, mime } = buildFactsFile(lastRecords, opts.getLocale(), nowFn(), thresholds);
      opts.onExportFile({ text, filename, mime });
    } else if (action === 'export-summary' && opts.onExportFile) {
      const { text, filename, mime } = buildSummaryFile(lastRecords, opts.getLocale(), nowFn(), thresholds);
      opts.onExportFile({ text, filename, mime });
    } else if (action === 'export-checksums') {
      void exportChecksums();
    } else if (action === 'export-csv' && opts.onExport) {
      const audit = auditRegistry(lastRecords, nowFn(), thresholds);
      opts.onExport(auditedSourcesToCsv(applyFilters(audit.sources, filters), opts.getLocale()), 'data-sources.csv');
    }
  };

  host.addEventListener('click', onClick);
  host.addEventListener('change', onFilterEvent);
  host.addEventListener('input', onFilterEvent);
  refresh();
  return {
    refresh,
    getFilters: () => ({ ...filters }),
    destroy: () => {
      host.removeEventListener('click', onClick);
      host.removeEventListener('change', onFilterEvent);
      host.removeEventListener('input', onFilterEvent);
    },
  };
}
