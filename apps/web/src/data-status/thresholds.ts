/**
 * Staleness thresholds and the page view state (filters + thresholds) as a query string.
 * The thresholds are display settings; the panel shows them so "possibly out of date"
 * is never opaque.
 */
import type { Locale } from './dataStatus';
import { DATASET_KINDS, DEFAULT_STALE_DAYS, staleAfterFor, type DatasetKind } from './freshnessPolicy';
import { NO_FILTERS, parseFilters, serializeFilters, type Filters } from './filters';
import { t } from './i18n';
import { escapeHtml } from './sourceList';

export type Thresholds = Partial<Record<DatasetKind, number>>;
export const MIN_THRESHOLD_DAYS = 1;
export const MAX_THRESHOLD_DAYS = 3650;

export function parseThresholds(search: string): Thresholds {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const out: Thresholds = {};
  for (const kind of DATASET_KINDS) {
    const raw = p.get(`stale_${kind}`);
    if (raw === null || !/^\d{1,4}$/.test(raw)) continue;
    const n = Number(raw);
    if (n >= MIN_THRESHOLD_DAYS && n <= MAX_THRESHOLD_DAYS && n !== DEFAULT_STALE_DAYS[kind]) out[kind] = n;
  }
  return out;
}

export interface ViewState {
  filters: Filters;
  thresholds: Thresholds;
}

export function parseViewState(search: string): ViewState {
  return { filters: parseFilters(search), thresholds: parseThresholds(search) };
}

/** Query string for filters then thresholds; defaults are omitted; '' when nothing is set. */
export function serializeViewState(v: ViewState): string {
  const p = new URLSearchParams(serializeFilters(v.filters).replace(/^\?/, ''));
  for (const kind of DATASET_KINDS) {
    const n = v.thresholds[kind];
    if (typeof n === 'number' && n >= MIN_THRESHOLD_DAYS && n <= MAX_THRESHOLD_DAYS && n !== DEFAULT_STALE_DAYS[kind]) {
      p.set(`stale_${kind}`, String(Math.trunc(n)));
    }
  }
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

export const EMPTY_VIEW: Readonly<ViewState> = { filters: NO_FILTERS, thresholds: {} };

export interface ThresholdRow {
  kind: DatasetKind;
  label: string;
  days: number;
  custom: boolean;
}

export function thresholdRows(overrides: Thresholds, locale: Locale): ThresholdRow[] {
  return DATASET_KINDS.map((kind) => ({
    kind,
    label: t(locale, `kind.${kind}`),
    days: staleAfterFor(kind, overrides),
    custom: staleAfterFor(kind, overrides) !== DEFAULT_STALE_DAYS[kind],
  }));
}

export function renderThresholdsHtml(overrides: Thresholds, locale: Locale): string {
  const rows = thresholdRows(overrides, locale)
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${r.days}</td>` +
        `<td>${escapeHtml(t(locale, r.custom ? 'thr.custom' : 'thr.default'))}</td></tr>`,
    )
    .join('');
  return (
    `<section aria-labelledby="ds-thr-title"><h2 id="ds-thr-title">${escapeHtml(t(locale, 'thr.title'))}</h2>` +
    `<p>${escapeHtml(t(locale, 'thr.intro'))}</p>` +
    `<table><caption>${escapeHtml(t(locale, 'thr.title'))}</caption><thead><tr>` +
    `<th scope="col">${escapeHtml(t(locale, 'flt.kind'))}</th><th scope="col">${escapeHtml(t(locale, 'thr.days'))}</th>` +
    `<th scope="col">${escapeHtml(t(locale, 'tbl.status'))}</th></tr></thead><tbody>${rows}</tbody></table></section>`
  );
}
