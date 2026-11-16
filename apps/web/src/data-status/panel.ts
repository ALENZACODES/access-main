/**
 * Data-status panel: QA report, changes since the saved copy, dataset and source tables
 * with filters, optional attribute coverage, credits, offline saved copy and CSV export.
 * `mountDataStatusPanel` is the integration point for an app shell; everything else is
 * pure and testable.
 */
import { badgeInlineStyle, buttonInlineStyle } from './a11y';
import { buildAttributions, renderAttributionHtml } from './attribution';
import { coverageTable, type AttributeDef } from './coverage';
import { auditRegistry, type AuditResult, type DatasetRecord } from './datasetRegistry';
import type { FreshnessState, Locale } from './dataStatus';
import { auditedSourcesToCsv } from './csv';
import { applyFilters, FILTER_KINDS, FILTER_STATES, hasActiveFilters, normaliseQuery, MAX_QUERY_LENGTH, NO_FILTERS, serializeFilters, type Filters } from './filters';
import { isDatasetKind } from './freshnessPolicy';
import { t, type MessageKey } from './i18n';
import { formatDisplayDate } from './locale';
import { buildQaReport, renderQaReportHtml } from './qaReport';
import { diffRegistries, renderChangesHtml, type Change } from './registryDiff';
import { createSnapshot, type Snapshot, type SnapshotStore } from './snapshot';
import { escapeHtml } from './sourceList';

export type SnapshotNote = 'none' | 'unreadable' | null;

export interface PanelState {
  records: readonly DatasetRecord[];
  locale: Locale;
  now: Date;
  /** Set only when the shown data came from the saved copy. */
  snapshotSavedAt?: string | null;
  snapshotNote?: SnapshotNote;
  attributes?: readonly AttributeDef[];
  /** Raw attribute values per record, used for the coverage table. */
  attributeRecords?: readonly Readonly<Record<string, unknown>>[];
  filters?: Filters;
  /** Changes against the saved copy; null or undefined hides the section. */
  changes?: readonly Change[] | null;
  /** Plain-text notices shown at the top (already localized). */
  notices?: readonly string[];
}

const esc = escapeHtml;

function statusBadge(state: FreshnessState, locale: Locale): string {
  return `<span style="${badgeInlineStyle(state)}">${esc(t(locale, `state.${state}`))}</span>`;
}

/** Wide tables scroll inside a focusable, named region so the page itself never scrolls sideways. */
function scrollable(label: string, table: string): string {
  return `<div class="ds-scroll" role="region" tabindex="0" aria-label="${esc(label)}">${table}</div>`;
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

export function renderSourcesRegion(audit: AuditResult, locale: Locale, filters: Filters): string {
  const unknown = t(locale, 'unknown');
  const shown = applyFilters(audit.sources, filters);
  const count = `<p>${esc(t(locale, 'flt.result', { shown: shown.length, total: audit.sources.length }))}</p>`;
  if (shown.length === 0) {
    return count + (audit.sources.length === 0 ? '' : `<p>${esc(t(locale, 'flt.noMatch'))}</p>`);
  }
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
          : `<time datetime="${esc(s.retrievedIso)}">${esc(formatDisplayDate(s.retrievedIso, locale))}</time>`;
      return (
        `<tr><th scope="row">${name}</th><td>${esc(s.licence ?? unknown)}</td><td>${date}</td>` +
        `<td>${statusBadge(s.state, locale)}</td></tr>`
      );
    })
    .join('');
  const table =
    `<table><caption>${esc(t(locale, 'tbl.sources'))}</caption><thead><tr>` +
    `<th scope="col">${esc(t(locale, 'tbl.source'))}</th><th scope="col">${esc(t(locale, 'tbl.licence'))}</th>` +
    `<th scope="col">${esc(t(locale, 'tbl.retrieved'))}</th><th scope="col">${esc(t(locale, 'tbl.status'))}</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`;
  return count + scrollable(t(locale, 'tbl.sources'), table);
}

const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';

function option(value: string, label: string, selected: boolean): string {
  return `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
}

export function renderFilterControls(locale: Locale, f: Filters): string {
  const stateOpts =
    option('any', t(locale, 'flt.any'), f.state === 'any') +
    FILTER_STATES.map((s) => option(s, t(locale, `state.${s}`), f.state === s)).join('');
  const kindOpts =
    option('any', t(locale, 'flt.any'), f.kind === 'any') +
    FILTER_KINDS.map((k) => option(k, t(locale, `kind.${k}`), f.kind === k)).join('');
  const field = (id: string, key: MessageKey, control: string) =>
    `<div><label for="${id}">${esc(t(locale, key))}</label> ${control}</div>`;
  return (
    `<fieldset><legend>${esc(t(locale, 'flt.legend'))}</legend>` +
    field('ds-f-state', 'flt.state', `<select id="ds-f-state" data-filter="state" style="${FIELD_STYLE}">${stateOpts}</select>`) +
    field('ds-f-kind', 'flt.kind', `<select id="ds-f-kind" data-filter="kind" style="${FIELD_STYLE}">${kindOpts}</select>`) +
    field(
      'ds-f-q',
      'flt.query',
      `<input id="ds-f-q" type="search" data-filter="query" maxlength="${MAX_QUERY_LENGTH}" autocomplete="off" value="${esc(f.query)}" style="${FIELD_STYLE}">`,
    ) +
    `<div><label style="display:inline-flex;align-items:center;gap:8px;min-height:44px">` +
    `<input type="checkbox" id="ds-f-issues" data-filter="onlyIssues" style="width:24px;height:24px"${f.onlyIssues ? ' checked' : ''}>` +
    `${esc(t(locale, 'flt.onlyIssues'))}</label></div>` +
    `<button type="button" data-action="reset-filters" style="${buttonInlineStyle()}">${esc(t(locale, 'flt.reset'))}</button>` +
    `</fieldset>`
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

export function renderDataStatusPanel(state: PanelState): string {
  const { locale } = state;
  const filters = state.filters ?? NO_FILTERS;
  const audit = auditRegistry(state.records, state.now);
  const btn = (action: string, label: string) =>
    `<button type="button" data-action="${action}" style="${buttonInlineStyle()}">${esc(label)}</button>`;
  const notices = (state.notices ?? []).map((n) => `<p role="status">${esc(n)}</p>`).join('');
  return (
    notices +
    snapshotLine(state) +
    `<div>${btn('recalculate', t(locale, 'act.recalculate'))} ${btn('export-csv', t(locale, 'act.exportCsv'))}</div>` +
    renderQaReportHtml(buildQaReport(audit, locale), locale) +
    (state.changes ? renderChangesHtml(state.changes, locale) : '') +
    datasetTable(audit, locale) +
    renderFilterControls(locale, filters) +
    `<div data-region="sources" aria-live="polite">${renderSourcesRegion(audit, locale, filters)}</div>` +
    coverageSection(state) +
    scrollable(t(locale, 'attr.title'), renderAttributionHtml(buildAttributions(audit.sources, locale), locale))
  );
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
  now?: () => Date;
  store?: SnapshotStore;
  attributes?: readonly AttributeDef[];
  getAttributeRecords?: () => readonly Readonly<Record<string, unknown>>[];
  /** Called with the CSV text and a file name when the export button is used. */
  onExport?: (csv: string, filename: string) => void;
  /** Starting filters (for example parsed from the URL). */
  initialFilters?: Filters;
  /** Called with the new query string ('' or '?state=…') after filters change. */
  onFiltersChange?: (search: string) => void;
  /** Extra localized notices, for example files that could not be read. */
  getNotices?: (locale: Locale) => readonly string[];
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

  const nowFn = opts.now ?? (() => new Date());

  const refresh = (): void => {
    const locale = opts.getLocale();
    const now = nowFn();
    let records: readonly DatasetRecord[] | null = null;
    let snapshotSavedAt: string | null = null;
    let snapshotNote: SnapshotNote = null;
    let changes: Change[] | null = null;

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
    } else if (opts.store) {
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
    host.setAttribute('lang', locale);
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', t(locale, 'qa.title'));
    host.innerHTML = renderDataStatusPanel({
      records: lastRecords,
      locale,
      now,
      snapshotSavedAt,
      snapshotNote,
      attributes: opts.attributes,
      attributeRecords: opts.getAttributeRecords?.(),
      filters,
      changes,
      notices: opts.getNotices?.(locale),
    });
  };

  const updateResults = (): void => {
    const region = host.querySelector?.('[data-region="sources"]') ?? null;
    if (region === null) {
      refresh();
      return;
    }
    const audit = auditRegistry(lastRecords, nowFn());
    region.innerHTML = renderSourcesRegion(audit, opts.getLocale(), filters);
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
    opts.onFiltersChange?.(serializeFilters({ ...filters, query: normaliseQuery(filters.query) }));
  };

  const onClick = (ev: unknown): void => {
    const target = (ev as { target?: EventTarget }).target;
    const action = target?.closest?.('[data-action]')?.getAttribute?.('data-action');
    if (action === 'recalculate') refresh();
    else if (action === 'reset-filters') {
      if (!hasActiveFilters(filters) && filters.query === '') return;
      filters = { ...NO_FILTERS };
      refresh();
      opts.onFiltersChange?.('');
    } else if (action === 'export-csv' && opts.onExport) {
      const audit = auditRegistry(lastRecords, nowFn());
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
