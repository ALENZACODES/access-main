/**
 * Per-kind staleness thresholds. These are display defaults, not claims about
 * how often any publisher updates; callers can override them.
 */
export const DATASET_KINDS = ['places', 'routes', 'transit', 'boundaries', 'reference'] as const;
export type DatasetKind = (typeof DATASET_KINDS)[number];

export const DEFAULT_STALE_DAYS: Readonly<Record<DatasetKind, number>> = {
  places: 180,
  routes: 120,
  transit: 60,
  boundaries: 730,
  reference: 365,
};

export function isDatasetKind(v: unknown): v is DatasetKind {
  return typeof v === 'string' && (DATASET_KINDS as readonly string[]).includes(v);
}

/** Threshold in days for a kind; invalid overrides (NaN, <= 0, non-number) are ignored. */
export function staleAfterFor(
  kind: DatasetKind,
  overrides?: Partial<Record<DatasetKind, number>>,
): number {
  const o = overrides?.[kind];
  return typeof o === 'number' && Number.isFinite(o) && o > 0 ? o : DEFAULT_STALE_DAYS[kind];
}
