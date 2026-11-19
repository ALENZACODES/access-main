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
import { applyFilters, parseFilters, FILTER_KINDS, FILTER_LICENCE_KINDS, FILTER_STATES, FILTER_TIERS, GAP_FIELDS, hasActiveFilters, isGapField, isDatasetFilter, isLicenceKind, isTierFilter, withOptionalFilter, normaliseQuery, MAX_QUERY_LENGTH, NO_FILTERS, type Filters } from './filters';
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
import { ariaSort, applySort, nextSort, sortParams, type SortKey, type SortSpec } from './sorting';
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
  addView,
  buildListedSummary,
  buildNoMatchHints,
  clampLimit,
  drillColumnHeading,
  drillFilters,
  factLabel,
  parseDrillAction,
  renderDrillControl,
  type DrillTarget,
  MAX_VIEW_NAME_LENGTH,
  LIVE_STEP,
  parseSortValue,
  renderShowMoreHtml,
  renderSortControl,
  SHOW_MORE_ACTION,
  showingText,
  buildQuickFilters,
  clearKeyFromAction,
  kindLabel,
  listActiveFilters,
  describeRenameOutcome,
  describeSaveOutcome,
  renameViewAt,
  viewRenameAction,
  VIEW_SAVE_ACTION,
  viewApplyAction,
  describeViewDeleted,
  parseViewAction,
  removeViewAt,
  renderActiveFiltersHtml,
  renderListedSummaryHtml,
  renderSavedViewsHtml,
  renderNoMatchHintsHtml,
  withoutFilter,
  buildStatusByTier,
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
  renderQuickFiltersHtml,
  renderStatusByTierHtml,
  renderRecordFactsHtml,
  renderSelfCheckHtml,
  renderSourceDetailsHtml,
  renderTierBreakdownHtml,
  renderTocHtml,
  renderWorkloadHtml,
  runSelfCheck,
  type SavedView,
  type SavedViewStore,
  quickFilterFor,
  quickFilterFromAction,
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
  /** Live panel only: the chosen order and how many rows to draw. Ignored in the static view, which sorts and pages with links. */
  live?: LiveList | undefined;
  /** Saved views to offer (query texts). Leave undefined to leave the section out; it is never shown in the static view. */
  savedViews?: { views: readonly SavedView[]; durable: boolean; draftName?: string } | undefined;
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

function datasetTable(audit: AuditResult, locale: Locale, drill?: (target: DrillTarget) => string): string {
  const rows = audit.datasets
    .map(
      (d) =>
        `<tr><th scope="row">${esc(d.name)}</th><td>${esc(t(locale, `kind.${d.kind}`))}</td><td>${d.sourceCount}</td><td>${statusBadge(d.state, locale)}</td>` +
        // A dataset with no sources, or an id the filter cannot carry, has nothing to list.
        `${drill ? `<td>${d.sourceCount > 0 && isDatasetFilter(d.id) ? drill({ kind: 'dataset', value: d.id }) : ''}</td>` : ''}</tr>`,
    )
    .join('');
  const table =
    `<table><caption>${esc(t(locale, 'tbl.datasets'))}</caption><thead><tr>` +
    `<th scope="col">${esc(t(locale, 'tbl.dataset'))}</th><th scope="col">${esc(t(locale, 'flt.kind'))}</th>` +
    `<th scope="col">${esc(t(locale, 'tbl.sourceCount'))}</th><th scope="col">${esc(t(locale, 'tbl.status'))}</th>${drill ? `<th scope="col">${esc(drillColumnHeading(locale))}</th>` : ''}</tr></thead>` +
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

function sortHeading(locale: Locale, key: SortKey, label: MessageKey, nav: RegionNav | undefined, filters: Filters, liveSort: SortSpec | null = null): string {
  const text = esc(t(locale, label));
  if (!nav) {
    // Live panel: the order is chosen with the Sort by control, so the heading only states it.
    const live = ariaSort(liveSort, key);
    return live === null ? `<th scope="col">${text}</th>` : `<th scope="col" aria-sort="${live}">${text}<span aria-hidden="true">${live === 'ascending' ? ' \u25B2' : ' \u25BC'}</span></th>`;
  }
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

/** Live-panel list state: the chosen order and how many rows to draw. */
export interface LiveList {
  sort: SortSpec | null;
  limit: number;
}

export function renderSourcesRegion(audit: AuditResult, locale: Locale, filters: Filters, now?: Date, nav?: RegionNav, live?: LiveList): string {
  const unknown = t(locale, 'unknown');
  const matched = applyFilters(audit.sources, filters);
  const total = audit.sources.length;
  const count = `<p>${esc(tCount(locale, 'flt.result', locale === 'fr' ? matched.length : total, { shown: matched.length, total }))}</p>`;
  if (matched.length === 0) {
    return count + (audit.sources.length === 0 ? '' : `<p>${esc(t(locale, 'flt.noMatch'))}</p>`);
  }
  const liveSort = !nav && live ? live.sort : null;
  const sorted = nav ? applySort(matched, nav.table.sort, locale) : liveSort ? applySort(matched, liveSort, locale) : matched;
  const slice = nav ? paginate(sorted, nav.table.paging) : null;
  const liveCount = !nav && live ? clampLimit(live.limit, sorted.length) : sorted.length;
  const shown = slice ? slice.items : sorted.slice(0, liveCount);
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
        `<td>${statusBadge(s.state, locale)}</td><td>${esc(s.tier ?? unknown)}</td></tr>`
      );
    })
    .join('');
  const heads =
    sortHeading(locale, 'source', 'tbl.source', nav, filters, liveSort) +
    sortHeading(locale, 'licence', 'tbl.licence', nav, filters, liveSort) +
    sortHeading(locale, 'retrieved', 'tbl.retrieved', nav, filters, liveSort) +
    sortHeading(locale, 'status', 'tbl.status', nav, filters, liveSort) +
    sortHeading(locale, 'tier', 'tbl.tier', nav, filters, liveSort);
  const table =
    `<table><caption>${esc(t(locale, 'tbl.sources'))}</caption><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
  const help = nav ? `<p>${esc(t(locale, 'sort.help'))}</p>` : '';
  const more = !nav && live ? renderShowMoreHtml(liveCount, sorted.length, locale, buttonInlineStyle()) : '';
  return count + help + scrollable(t(locale, 'tbl.sources'), table) + (nav && slice ? pager(locale, nav, filters, slice.page, slice.pages) : '') + more;
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

/** A dataset offered in the dataset filter. */
export interface DatasetOption {
  id: string;
  name: string;
}

/** One option per dataset id, in audit order. */
export function datasetOptions(audit: AuditResult): DatasetOption[] {
  const seen = new Set<string>();
  const out: DatasetOption[] = [];
  for (const d of audit.datasets) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({ id: d.id, name: d.name });
  }
  return out;
}

/** The quick filters; this is what the quick region holds, so the pressed state can follow the filters. */
export function renderQuickRegion(audit: AuditResult, locale: Locale, filters: Filters, hrefFor?: (f: Filters) => string): string {
  return renderQuickFiltersHtml(buildQuickFilters(audit), locale, { active: filters, buttonStyle: buttonInlineStyle(), ...(hrefFor ? { hrefFor } : {}) });
}

/** The saved views; this is what the views region holds, so saving is offered as soon as a filter is chosen. */
export function renderViewsRegion(audit: AuditResult, locale: Locale, filters: Filters, saved: { views: readonly SavedView[]; durable: boolean; draftName?: string }): string {
  return renderSavedViewsHtml(saved.views, locale, {
    durable: saved.durable,
    active: filters,
    datasetNames: new Map(datasetOptions(audit).map((d) => [d.id, d.name])),
    buttonStyle: buttonInlineStyle(),
    countFor: (f: Filters) => applyFilters(audit.sources, f).length,
    ...(saved.draftName === undefined ? {} : { draftName: saved.draftName }),
  });
}

/** The source list with the filters in force above it; this is what the sources region holds. */
export function renderResultsHtml(audit: AuditResult, locale: Locale, filters: Filters, now?: Date, nav?: RegionNav, hrefWithout?: (f: Filters) => string, live?: LiveList): string {
  const names = new Map(datasetOptions(audit).map((d) => [d.id, d.name]));
  const activeList = listActiveFilters(filters, locale, names);
  const links = hrefWithout ? { hrefFor: (key: Parameters<typeof withoutFilter>[1]) => hrefWithout(withoutFilter(filters, key)) } : {};
  const active = renderActiveFiltersHtml(activeList, locale, { buttonStyle: buttonInlineStyle(), ...links });
  const listed = applyFilters(audit.sources, filters);
  const noMatch = audit.sources.length > 0 && listed.length === 0;
  const hints = noMatch
    ? renderNoMatchHintsHtml(buildNoMatchHints(audit.sources, filters, locale, names), locale, { buttonStyle: buttonInlineStyle(), activeCount: activeList.length, ...links })
    : '';
  // The summary describes every source the filters list, not only the page of rows on screen.
  return active + renderListedSummaryHtml(buildListedSummary(listed), locale) + renderSourcesRegion(audit, locale, filters, now, nav, live) + hints;
}

export function renderFilterControls(locale: Locale, f: Filters, form?: FilterFormOptions, datasets: readonly DatasetOption[] = [], liveSort?: SortSpec | null): string {
  const stateOpts =
    option('any', t(locale, 'flt.any'), f.state === 'any') +
    FILTER_STATES.map((s) => option(s, t(locale, `state.${s}`), f.state === s)).join('');
  const kindOpts =
    option('any', t(locale, 'flt.any'), f.kind === 'any') +
    FILTER_KINDS.map((k) => option(k, t(locale, `kind.${k}`), f.kind === k)).join('');
  const tierOpts =
    option('any', t(locale, 'flt.any'), f.tier === undefined) +
    FILTER_TIERS.map((v) => option(v, v === 'unknown' ? t(locale, 'unknown') : v, f.tier === v)).join('');
  const licenceOpts =
    option('any', t(locale, 'flt.any'), f.licence === undefined) +
    FILTER_LICENCE_KINDS.map((k) => option(k, kindLabel(k, locale), f.licence === k)).join('');
  const datasetOpts =
    option('any', t(locale, 'flt.any'), f.dataset === undefined) + datasets.map((d) => option(d.id, d.name, f.dataset === d.id)).join('');
  const gapOpts = option('any', t(locale, 'flt.any'), f.gap === undefined) + GAP_FIELDS.map((g) => option(g, factLabel(g, locale), f.gap === g)).join('');
  const field = (id: string, key: MessageKey, control: string) =>
    `<div><label for="${id}">${esc(t(locale, key))}</label> ${control}</div>`;
  const controls =
    `<fieldset><legend>${esc(t(locale, 'flt.legend'))}</legend>` +
    field('ds-f-state', 'flt.state', `<select id="ds-f-state" name="state" data-filter="state" style="${FIELD_STYLE}">${stateOpts}</select>`) +
    field('ds-f-kind', 'flt.kind', `<select id="ds-f-kind" name="kind" data-filter="kind" style="${FIELD_STYLE}">${kindOpts}</select>`) +
    field('ds-f-tier', 'flt.tier', `<select id="ds-f-tier" name="tier" data-filter="tier" style="${FIELD_STYLE}">${tierOpts}</select>`) +
    field('ds-f-licence', 'flt.licence', `<select id="ds-f-licence" name="lic" data-filter="licence" style="${FIELD_STYLE}">${licenceOpts}</select>`) +
    field('ds-f-gap', 'flt.gap', `<select id="ds-f-gap" name="gap" data-filter="gap" style="${FIELD_STYLE}">${gapOpts}</select>`) +
    (datasets.length > 1
      ? field('ds-f-dataset', 'flt.dataset', `<select id="ds-f-dataset" name="ds" data-filter="dataset" style="${FIELD_STYLE}">${datasetOpts}</select>`)
      : '') +
    field(
      'ds-f-q',
      'flt.query',
      `<input id="ds-f-q" name="q" type="search" data-filter="query" maxlength="${MAX_QUERY_LENGTH}" autocomplete="off" value="${esc(f.query)}" style="${FIELD_STYLE}">`,
    ) +
    `<div><label style="display:inline-flex;align-items:center;gap:8px;min-height:44px">` +
    `<input type="checkbox" id="ds-f-issues" name="issues" value="1" data-filter="onlyIssues" style="width:24px;height:24px"${f.onlyIssues ? ' checked' : ''}>` +
    `${esc(t(locale, 'flt.onlyIssues'))}</label></div>`;
  if (!form) {
    return controls + (liveSort === undefined ? '' : renderSortControl(liveSort, locale)) + `<button type="button" data-action="reset-filters" style="${buttonInlineStyle()}">${esc(t(locale, 'flt.reset'))}</button></fieldset>`;
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
  const drillNames = new Map(datasetOptions(audit).map((d) => [d.id, d.name]));
  const drill = (target: DrillTarget): string =>
    renderDrillControl(target, locale, {
      buttonStyle: buttonInlineStyle(),
      datasetNames: drillNames,
      ...(sv ? { hrefFor: (f: Filters) => `${sv.action}${serializeViewState({ filters: f, thresholds })}` } : {}),
    });
  const head = notices + snapshotLine(state) + actions + renderGlanceHtml(audit, locale);
  const body =
    renderQaReportHtml(buildQaReport(audit, locale), locale) +
    renderActionsHtml(buildActions(audit), locale) +
    renderSourceDetailsHtml(buildSourceDetails(audit), locale) +
    (state.changes ? renderChangesHtml(state.changes, locale) : '') +
    (state.history ? renderHistoryHtml(state.history, locale) : '') +
    datasetTable(audit, locale, drill) +
    renderReviewHtml(buildReviewQueue(audit, state.now), locale) +
    renderWorkloadHtml(buildWorkload(audit, state.now), locale) +
    renderThresholdsHtml(thresholds, locale) +
    renderBasisHtml(audit, locale) +
    `<div data-region="quick">${renderQuickRegion(audit, locale, filters, sv ? (f: Filters) => `${sv.action}${serializeViewState({ filters: f, thresholds })}` : undefined)}</div>` +
    renderFilterControls(locale, filters, sv ? { action: sv.action, thresholds, ...(state.table ? { table: state.table } : {}) } : undefined, datasetOptions(audit), sv || !state.live ? undefined : state.live.sort) +
    (sv || !state.savedViews ? '' : `<div data-region="views">${renderViewsRegion(audit, locale, filters, state.savedViews)}</div>`) +
    (sv ? '' : `<div data-region="announce" role="status" aria-live="polite" aria-atomic="true" style="${HIDDEN_STYLE}"></div>`) +
    `<div data-region="sources">${renderResultsHtml(audit, locale, filters, state.now, sv && state.table ? { action: sv.action, thresholds, table: state.table } : undefined, sv ? (f: Filters) => `${sv.action}${serializeViewState({ filters: f, thresholds })}` : undefined, sv ? undefined : state.live)}</div>` +
    coverageSection(state) +
    renderCompletenessHtml(buildCompleteness(audit), locale) +
    renderLicenceBreakdownHtml(buildLicenceBreakdown(audit), locale, { heading: drillColumnHeading(locale), cell: (kind) => drill({ kind: 'licence', value: kind }) }) +
    renderTierBreakdownHtml(buildTierBreakdown(state.records), locale, { heading: drillColumnHeading(locale), cell: (tier) => drill({ kind: 'tier', value: tier ?? 'unknown' }) }) +
    renderStatusByTierHtml(buildStatusByTier(audit), locale, { heading: drillColumnHeading(locale), cell: (s) => drill({ kind: 'state', value: s }) }) +
    renderRecordFactsHtml(buildRecordFacts(state.records, audit), locale, { heading: drillColumnHeading(locale), cell: (field) => drill({ kind: 'gap', value: field }) }) +
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
  /** The order the list starts in; none means the order of the registry. */
  initialSort?: SortSpec | null | undefined;
  /** Staleness thresholds in days per dataset type (for example parsed from the URL). */
  thresholds?: Thresholds | undefined;
  /** On-device history of totals; today's totals are recorded when live data loads. */
  history?: HistoryStore | undefined;
  /** Called with the new query string ('' or '?state=…', thresholds included) after filters change. */
  onFiltersChange?: ((search: string) => void) | undefined;
  /** Where saved views are kept. Without it the saved-views section is not shown. */
  savedViews?: SavedViewStore | undefined;
  /** Extra localized notices, for example files that could not be read. */
  getNotices?: ((locale: Locale) => readonly string[]) | undefined;
  /** See PanelState.plainTables. */
  plainTables?: boolean | undefined;
}

export interface MountedPanel {
  refresh(): void;
  getFilters(): Filters;
  getSort(): SortSpec | null;
  destroy(): void;
}

export function mountDataStatusPanel(host: PanelHost, opts: MountOptions): MountedPanel {
  let lastRecords: readonly DatasetRecord[] = [];
  let filters: Filters = { ...(opts.initialFilters ?? NO_FILTERS) };
  let sort: SortSpec | null = opts.initialSort ?? null;
  let limit = LIVE_STEP;
  // What has been typed as a name for the next saved view. Kept here so redraws do not lose it.
  let viewName = '';
  let baseline: Snapshot | null | undefined; // undefined until the first refresh
  const thresholds: Thresholds = { ...(opts.thresholds ?? {}) };
  const view = (): string => {
    const base = serializeViewState({ filters: { ...filters, query: normaliseQuery(filters.query) }, thresholds });
    if (sort === null) return base;
    const p = new URLSearchParams(base.replace(/^\?/, ''));
    for (const [k, v] of sortParams(sort)) p.set(k, v);
    return `?${p.toString()}`;
  };

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
    sort,
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
      live: { sort, limit },
      savedViews: opts.savedViews ? { views: opts.savedViews.load(), durable: opts.savedViews.durable, draftName: viewName } : undefined,
    });
  };

  /** Says what the list holds now. When only the first rows are drawn, it says that too, so "shown" is not misread. */
  const sayList = (before: ListState | null): void => {
    if (lastList === null) return;
    const locale = opts.getLocale();
    const text = describeListChange(before, lastList, locale);
    const drawn = clampLimit(limit, lastList.shown);
    announcer.say(drawn < lastList.shown ? `${text} ${showingText(drawn, lastList.shown, locale)}` : text);
  };

  /**
   * After a control redraws the panel, the control that was pressed has been replaced, and keyboard
   * focus would be lost with it. Focus is put back on the same control when it is still there, else on
   * the first fallback that exists. Only controls that take focus anyway are used, so the tab order is unchanged.
   */
  const focusFirst = (selectors: readonly string[]): void => {
    for (const selector of selectors) {
      const el = (host.querySelector?.(selector) ?? null) as { focus?: () => void } | null;
      if (el === null || typeof el.focus !== 'function') continue;
      try {
        el.focus();
      } catch {
        // A host that cannot take focus is left as it is.
      }
      return;
    }
  };
  const byAction = (action: string): string => `[data-action="${action.replace(/["\\]/g, '\\$&')}"]`;
  const FORM_START = '#ds-f-state';

  const updateResults = (): void => {
    const region = host.querySelector?.('[data-region="sources"]') ?? null;
    if (region === null) {
      refresh();
      return;
    }
    const now = nowFn();
    const audit = auditRegistry(lastRecords, now, thresholds);
    const results = renderResultsHtml(audit, opts.getLocale(), filters, now, undefined, undefined, { sort, limit });
    region.innerHTML = opts.plainTables === true ? plainTables(results) : results;
    // Keep the controls that describe the filters in step with them, without touching the form fields.
    const quick = host.querySelector?.('[data-region="quick"]') ?? null;
    if (quick !== null) quick.innerHTML = renderQuickRegion(audit, opts.getLocale(), filters);
    const views = host.querySelector?.('[data-region="views"]') ?? null;
    if (views !== null && opts.savedViews) {
      views.innerHTML = renderViewsRegion(audit, opts.getLocale(), filters, { views: opts.savedViews.load(), durable: opts.savedViews.durable, draftName: viewName });
    }
    const before = lastList;
    lastList = listState(audit);
    sayList(before);
  };

  const onFilterEvent = (ev: unknown): void => {
    const el = (ev as { target?: EventTarget }).target;
    const key = el?.getAttribute?.('data-filter');
    if (!key || !el) return;
    const value = typeof el.value === 'string' ? el.value : '';
    if (key === 'viewName') {
      // Typing a name changes nothing on screen; it is read when the view is saved.
      viewName = value.slice(0, MAX_VIEW_NAME_LENGTH);
      return;
    }
    // Any change to what is listed, or its order, starts again from the first rows.
    limit = LIVE_STEP;
    if (key === 'sort') sort = parseSortValue(value);
    else if (key === 'state') filters = { ...filters, state: (FILTER_STATES as readonly string[]).includes(value) ? (value as Filters['state']) : 'any' };
    else if (key === 'kind') filters = { ...filters, kind: isDatasetKind(value) ? value : 'any' };
    else if (key === 'tier') {
      filters = withOptionalFilter(filters, 'tier', isTierFilter(value) ? value : undefined);
    } else if (key === 'licence') {
      filters = withOptionalFilter(filters, 'licence', isLicenceKind(value) ? value : undefined);
    } else if (key === 'gap') {
      filters = withOptionalFilter(filters, 'gap', isGapField(value) ? value : undefined);
    } else if (key === 'dataset') {
      filters = withOptionalFilter(filters, 'dataset', isDatasetFilter(value) ? value : undefined);
    }
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
    if (action === SHOW_MORE_ACTION) {
      const total = applyFilters(auditRegistry(lastRecords, nowFn(), thresholds).sources, filters).length;
      if (limit >= total) return;
      limit = Math.min(total, limit + LIVE_STEP);
      updateResults();
      announcer.say(showingText(clampLimit(limit, total), total, opts.getLocale()));
    } else if (action === 'recalculate') refresh();
    else if (action === 'reset-filters') {
      if (!hasActiveFilters(filters) && filters.query === '') return;
      const before = lastList;
      filters = { ...NO_FILTERS };
      limit = LIVE_STEP;
      refresh();
      sayList(before);
      focusFirst([byAction('reset-filters'), FORM_START]);
      opts.onFiltersChange?.(view());
    } else if (action === 'export-report' && opts.onExportFile) {
      const { text, filename, mime } = buildMarkdownFile(lastRecords, opts.getLocale(), nowFn(), thresholds);
      opts.onExportFile({ text, filename, mime });
    } else if (action === 'export-tables' && opts.onExportFile) {
      const { text, filename, mime } = buildTablesFile(lastRecords, opts.getLocale(), nowFn(), thresholds);
      opts.onExportFile({ text, filename, mime });
    } else if (opts.savedViews && parseViewAction(action) !== null) {
      const act = parseViewAction(action);
      if (act === null) return;
      const locale = opts.getLocale();
      if (act.kind === 'save') {
        const { outcome } = addView(opts.savedViews, filters, viewName);
        if (outcome === 'saved') viewName = '';
        refresh();
        announcer.say(describeSaveOutcome(outcome, locale));
        focusFirst(outcome === 'saved' ? [byAction(viewApplyAction(opts.savedViews.load().length - 1)), FORM_START] : [byAction(VIEW_SAVE_ACTION), FORM_START]);
      } else if (act.kind === 'rename') {
        const { outcome } = renameViewAt(opts.savedViews, act.index, viewName);
        const said = describeRenameOutcome(outcome, locale);
        if (said === null) return;
        if (outcome === 'renamed') viewName = '';
        refresh();
        announcer.say(said);
        focusFirst(outcome === 'noName' ? ['#ds-view-name', FORM_START] : [byAction(viewRenameAction(act.index)), FORM_START]);
      } else if (act.kind === 'delete') {
        const { removed } = removeViewAt(opts.savedViews, act.index);
        if (!removed) return;
        refresh();
        announcer.say(describeViewDeleted(locale));
        focusFirst([byAction(VIEW_SAVE_ACTION), '[data-action^="view-apply:"]', FORM_START]);
      } else {
        const query = opts.savedViews.load()[act.index]?.query;
        if (query === undefined) return;
        const before = lastList;
        filters = parseFilters(query);
        limit = LIVE_STEP;
        refresh();
        sayList(before);
        focusFirst([byAction(action ?? ''), FORM_START]);
        opts.onFiltersChange?.(view());
      }
    } else if (parseDrillAction(action) !== null) {
      const target = parseDrillAction(action);
      if (target === null) return;
      const before = lastList;
      filters = drillFilters(target);
      limit = LIVE_STEP;
      refresh();
      sayList(before);
      focusFirst([byAction(action ?? ''), FORM_START]);
      opts.onFiltersChange?.(view());
    } else if (clearKeyFromAction(action) !== null) {
      const key = clearKeyFromAction(action);
      if (key === null) return;
      const before = lastList;
      filters = withoutFilter(filters, key);
      limit = LIVE_STEP;
      refresh();
      sayList(before);
      focusFirst(['[data-action^="clear:"]', byAction('reset-filters'), FORM_START]);
      opts.onFiltersChange?.(view());
    } else if (quickFilterFromAction(action) !== null) {
      const id = quickFilterFromAction(action);
      if (id === null) return;
      const before = lastList;
      filters = quickFilterFor(id);
      limit = LIVE_STEP;
      refresh();
      sayList(before);
      focusFirst([byAction(action ?? ''), byAction('reset-filters'), FORM_START]);
      opts.onFiltersChange?.(view());
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
    getSort: () => (sort === null ? null : { ...sort }),
    destroy: () => {
      host.removeEventListener('click', onClick);
      host.removeEventListener('change', onFilterEvent);
      host.removeEventListener('input', onFilterEvent);
    },
  };
}
