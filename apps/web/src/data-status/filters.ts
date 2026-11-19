/** Filter model for the source list. Deep-linkable via the query string; invalid values are ignored. */
import type { AuditedSource } from './datasetRegistry';
import type { FreshnessState } from './dataStatus';
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
  return {
    state: STATES.includes(state as FreshnessState) ? (state as FreshnessState) : 'any',
    kind: isDatasetKind(kind) ? kind : 'any',
    query: normaliseQuery(p.get('q') ?? ''),
    onlyIssues: p.get('issues') === '1',
    ...(isTierFilter(tier) ? { tier } : {}),
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
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

export function hasActiveFilters(f: Filters): boolean {
  return f.state !== 'any' || f.kind !== 'any' || normaliseQuery(f.query) !== '' || f.onlyIssues || f.tier !== undefined;
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
    if (q === '') return true;
    return matchesQuery([s.datasetName, s.name ?? '', s.sourceId, s.licence ?? ''].join(' '), q);
  });
}

export const FILTER_STATES: readonly FreshnessState[] = STATES;
export const FILTER_KINDS: readonly DatasetKind[] = DATASET_KINDS;
