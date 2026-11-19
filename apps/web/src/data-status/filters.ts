/** Filter model for the source list. Deep-linkable via the query string; invalid values are ignored. */
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

export const OPTIONAL_FILTER_KEYS = ['tier', 'licence', 'dataset'] as const;
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
  return {
    state: STATES.includes(state as FreshnessState) ? (state as FreshnessState) : 'any',
    kind: isDatasetKind(kind) ? kind : 'any',
    query: normaliseQuery(p.get('q') ?? ''),
    onlyIssues: p.get('issues') === '1',
    ...(isTierFilter(tier) ? { tier } : {}),
    ...(isLicenceKind(licence) ? { licence } : {}),
    ...(isDatasetFilter(dataset) ? { dataset } : {}),
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
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

export function hasActiveFilters(f: Filters): boolean {
  return f.state !== 'any' || f.kind !== 'any' || normaliseQuery(f.query) !== '' || f.onlyIssues || f.tier !== undefined || f.licence !== undefined || f.dataset !== undefined;
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
    if (q === '') return true;
    return matchesQuery([s.datasetName, s.name ?? '', s.sourceId, s.licence ?? ''].join(' '), q);
  });
}

export const FILTER_STATES: readonly FreshnessState[] = STATES;
export const FILTER_KINDS: readonly DatasetKind[] = DATASET_KINDS;
