/** Filter model for the source list. Deep-linkable via the query string; invalid values are ignored. */
import type { AuditedSource } from './datasetRegistry';
import type { FreshnessState } from './dataStatus';
import { DATASET_KINDS, isDatasetKind, type DatasetKind } from './freshnessPolicy';

export interface Filters {
  state: FreshnessState | 'any';
  kind: DatasetKind | 'any';
  query: string;
  onlyIssues: boolean;
}

export const NO_FILTERS: Readonly<Filters> = { state: 'any', kind: 'any', query: '', onlyIssues: false };
export const MAX_QUERY_LENGTH = 100;
const STATES: readonly FreshnessState[] = ['fresh', 'stale', 'unknown'];

export function normaliseQuery(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export function parseFilters(search: string): Filters {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const state = p.get('state');
  const kind = p.get('kind');
  return {
    state: STATES.includes(state as FreshnessState) ? (state as FreshnessState) : 'any',
    kind: isDatasetKind(kind) ? kind : 'any',
    query: normaliseQuery(p.get('q') ?? ''),
    onlyIssues: p.get('issues') === '1',
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
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

export function hasActiveFilters(f: Filters): boolean {
  return f.state !== 'any' || f.kind !== 'any' || normaliseQuery(f.query) !== '' || f.onlyIssues;
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
    if (q === '') return true;
    const hay = normaliseQuery([s.datasetName, s.name ?? '', s.sourceId, s.licence ?? ''].join(' '));
    return hay.includes(q);
  });
}

export const FILTER_STATES: readonly FreshnessState[] = STATES;
export const FILTER_KINDS: readonly DatasetKind[] = DATASET_KINDS;
