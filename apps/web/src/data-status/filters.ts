/** Filter model for the source list. Deep-linkable via the query string; invalid values are ignored. */
import { AGE_BANDS, bandFor } from './ageBands';
import { isFieldKnown } from './completeness';
import type { AuditedSource } from './datasetRegistry';
import { licenceKind, type FreshnessState, type LicenceKind } from './dataStatus';
import { foldText, matchesQuery } from './searchText';
import { DATASET_KINDS, isDatasetKind, type DatasetKind } from './freshnessPolicy';
import { TIER_IDS, isTierId, type TierId } from './tierValue';

/** A tier to keep, or 'unknown' for records with no usable tier. */
export type TierFilter = TierId | 'unknown';
export const FILTER_TIERS: readonly TierFilter[] = [...TIER_IDS, 'unknown'];

export function isTierFilter(v: unknown): v is TierFilter {
  return v === 'unknown' || isTierId(v);
}

export interface Filters {
  state: FreshnessState | 'any';
  kind: DatasetKind | 'any';
  query: string;
  onlyIssues: boolean;
  /** Present only when a tier filter is active, so filters without one compare equal to older ones. */
  tier?: TierFilter;
  /** Present only when a licence-type filter is active. */
  licence?: LicenceKind;
  /** A dataset id. Present only when a dataset filter is active. */
  dataset?: string;
  /** Keeps sources where this fact is unknown. Present only when the filter is active. */
  gap?: GapField;
  /** An age band of the retrieved date, or 'unknown' for no usable date. Present only when the filter is active. */
  age?: AgeFilter;
  /** Keeps sources whose review date is within this many days and has not passed. Present only when the filter is active. */
  due?: DueWindow;
}

/** An age band id from ageBands.ts, or 'unknown' for sources with no usable retrieved date. */
export type AgeFilter = string;
export const FILTER_AGES: readonly AgeFilter[] = [...AGE_BANDS.map((b) => b.id), 'unknown'];

export function isAgeFilter(v: unknown): v is AgeFilter {
  return typeof v === 'string' && FILTER_AGES.includes(v);
}

/** The age filter value a source falls under: its band, or 'unknown'. Every source has exactly one. */
export function ageFilterOf(s: AuditedSource): AgeFilter {
  return (s.ageDays === null ? null : bandFor(s.ageDays))?.id ?? 'unknown';
}

export const DUE_WINDOWS = ['d7', 'd30', 'd90'] as const;
export type DueWindow = (typeof DUE_WINDOWS)[number];
export const DUE_WINDOW_DAYS: Readonly<Record<DueWindow, number>> = { d7: 7, d30: 30, d90: 90 };

export function isDueWindow(v: unknown): v is DueWindow {
  return typeof v === 'string' && (DUE_WINDOWS as readonly string[]).includes(v);
}

/**
 * Whole days until a source reaches its review limit, counted the way the review schedule counts
 * them; negative when the date has passed, null when there is no usable retrieved date.
 */
export function daysUntilReview(s: AuditedSource): number | null {
  return s.ageDays === null || s.state === 'unknown' ? null : s.limitDays - s.ageDays;
}

/** Whether the review date is within the window and has not passed. */
export function isDueWithin(s: AuditedSource, window: DueWindow): boolean {
  const days = daysUntilReview(s);
  return days !== null && days >= 0 && days <= DUE_WINDOW_DAYS[window];
}

/** The four facts every record should carry; the gap filter keeps sources where one of them is unknown. */
export const GAP_FIELDS = ['source', 'licence', 'date', 'tier'] as const;
export type GapField = (typeof GAP_FIELDS)[number];

export function isGapField(v: unknown): v is GapField {
  return typeof v === 'string' && (GAP_FIELDS as readonly string[]).includes(v);
}

/** Whether the fact is unknown for a source, by the same rules as the completeness tables. */
export function hasGap(s: AuditedSource, field: GapField): boolean {
  if (field === 'tier') return s.tier === null;
  return !isFieldKnown(s, field === 'date' ? 'retrieved' : field);
}

export const FILTER_LICENCE_KINDS: readonly LicenceKind[] = ['open', 'terms', 'unrecognised', 'unknown'];
export const MAX_DATASET_ID_LENGTH = 200;

export function isLicenceKind(v: unknown): v is LicenceKind {
  return typeof v === 'string' && (FILTER_LICENCE_KINDS as readonly string[]).includes(v);
}

/**
 * A dataset id usable as a filter: not blank, not longer than the limit, and not the word the
 * form sends for "all datasets". A dataset whose id is exactly "any" cannot be picked by this filter.
 */
export function isDatasetFilter(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && v !== 'any' && v.length <= MAX_DATASET_ID_LENGTH;
}

export const OPTIONAL_FILTER_KEYS = ['tier', 'licence', 'dataset', 'gap', 'age', 'due'] as const;
export type OptionalFilterKey = (typeof OPTIONAL_FILTER_KEYS)[number];

/** A copy with one optional filter set, or removed when the value is undefined. The input is not changed. */
export function withOptionalFilter<K extends OptionalFilterKey>(f: Filters, key: K, value: Filters[K] | undefined): Filters {
  const next: Filters = { state: f.state, kind: f.kind, query: f.query, onlyIssues: f.onlyIssues };
  for (const k of OPTIONAL_FILTER_KEYS) {
    const v = k === key ? value : f[k];
    if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
  }
  return next;
}

export const NO_FILTERS: Readonly<Filters> = { state: 'any', kind: 'any', query: '', onlyIssues: false };
export const MAX_QUERY_LENGTH = 100;
const STATES: readonly FreshnessState[] = ['fresh', 'stale', 'unknown'];

export function normaliseQuery(raw: string): string {
  return foldText(raw).slice(0, MAX_QUERY_LENGTH).trim();
}

export function parseFilters(search: string): Filters {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const state = p.get('state');
  const kind = p.get('kind');
  const tier = p.get('tier');
  const licence = p.get('lic');
  const dataset = p.get('ds');
  const gap = p.get('gap');
  const age = p.get('age');
  const due = p.get('due');
  return {
    state: STATES.includes(state as FreshnessState) ? (state as FreshnessState) : 'any',
    kind: isDatasetKind(kind) ? kind : 'any',
    query: normaliseQuery(p.get('q') ?? ''),
    onlyIssues: p.get('issues') === '1',
    ...(isTierFilter(tier) ? { tier } : {}),
    ...(isLicenceKind(licence) ? { licence } : {}),
    ...(isDatasetFilter(dataset) ? { dataset } : {}),
    ...(isGapField(gap) ? { gap } : {}),
    ...(isAgeFilter(age) ? { age } : {}),
    ...(isDueWindow(due) ? { due } : {}),
  };
}

/** Query string for the active filters ('' when none). Defaults are omitted. */
export function serializeFilters(f: Filters): string {
  const p = new URLSearchParams();
  if (f.state !== 'any') p.set('state', f.state);
  if (f.kind !== 'any') p.set('kind', f.kind);
  const q = normaliseQuery(f.query);
  if (q !== '') p.set('q', q);
  if (f.onlyIssues) p.set('issues', '1');
  if (f.tier !== undefined) p.set('tier', f.tier);
  if (f.licence !== undefined) p.set('lic', f.licence);
  if (f.dataset !== undefined) p.set('ds', f.dataset);
  if (f.gap !== undefined) p.set('gap', f.gap);
  if (f.age !== undefined) p.set('age', f.age);
  if (f.due !== undefined) p.set('due', f.due);
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

export function hasActiveFilters(f: Filters): boolean {
  return f.state !== 'any' || f.kind !== 'any' || normaliseQuery(f.query) !== '' || f.onlyIssues || f.tier !== undefined || f.licence !== undefined || f.dataset !== undefined || f.gap !== undefined || f.age !== undefined || f.due !== undefined;
}

export function needsReview(s: AuditedSource): boolean {
  return s.issues.length > 0 || s.state === 'stale';
}

export function applyFilters(sources: readonly AuditedSource[], f: Filters): AuditedSource[] {
  const q = normaliseQuery(f.query);
  return sources.filter((s) => {
    if (f.state !== 'any' && s.state !== f.state) return false;
    if (f.kind !== 'any' && s.kind !== f.kind) return false;
    if (f.onlyIssues && !needsReview(s)) return false;
    if (f.tier !== undefined && (s.tier ?? 'unknown') !== f.tier) return false;
    if (f.licence !== undefined && licenceKind(s.licence) !== f.licence) return false;
    if (f.dataset !== undefined && s.datasetId !== f.dataset) return false;
    if (f.gap !== undefined && !hasGap(s, f.gap)) return false;
    if (f.age !== undefined && ageFilterOf(s) !== f.age) return false;
    if (f.due !== undefined && !isDueWithin(s, f.due)) return false;
    if (q === '') return true;
    return matchesQuery([s.datasetName, s.name ?? '', s.sourceId, s.licence ?? ''].join(' '), q);
  });
}

export const FILTER_STATES: readonly FreshnessState[] = STATES;
export const FILTER_KINDS: readonly DatasetKind[] = DATASET_KINDS;
