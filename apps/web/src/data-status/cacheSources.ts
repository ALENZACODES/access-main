/**
 * Cached records as data-status input: per-source grouping for the live page.
 *
 * The cache holds one provenance block per record. Several records often share a source and a licence, and
 * the page shows one row for them. That row must never look better than its worst record:
 *  - if any record's date is missing, unreadable, a placeholder or in the future, the row's date is Unknown;
 *  - otherwise the row shows the OLDEST retrieved date, compared as real instants (not as text).
 */
import { parseRetrieved, readRetrieved } from './dateRules';
import type { SourceInput } from './sourceList';
import { cleanValue } from './unknownTokens';

/** The part of a cache entry this module reads (structural, so no import from the storage package). */
export interface CachedRecordLike {
  id: string;
  title: string;
  kind: string;
  provenance: {
    source_name: string;
    source_url?: string | null | undefined;
    licence: string;
    retrieved_at?: string | null | undefined;
  };
}

export type CachedSourceBasis = 'oldest' | 'unknown-record' | 'no-records';

export interface CachedSource {
  /** Stable key: source name and licence. */
  id: string;
  name: string;
  licence: string;
  /** The date to show: the oldest readable one, or null (Unknown) when any record has none. */
  retrievedAt: string | null;
  recordCount: number;
  /** How many records had a date that is missing, unreadable, a placeholder or in the future. */
  unknownDateCount: number;
  basis: CachedSourceBasis;
}

function keyOf(r: CachedRecordLike): string {
  return `${cleanValue(r.provenance.source_name) ?? ''}\u0000${cleanValue(r.provenance.licence) ?? ''}`;
}

/** One row per source and licence, in order of first appearance. */
export function groupCachedSources(records: readonly CachedRecordLike[], now: Date): CachedSource[] {
  const groups = new Map<string, { first: CachedRecordLike; oldest: { ms: number; raw: string } | null; unknown: number; count: number }>();
  for (const r of records) {
    const key = keyOf(r);
    let g = groups.get(key);
    if (!g) {
      g = { first: r, oldest: null, unknown: 0, count: 0 };
      groups.set(key, g);
    }
    g.count++;
    const reading = readRetrieved(r.provenance.retrieved_at, now);
    const parsed = parseRetrieved(r.provenance.retrieved_at);
    if (reading.kind !== 'ok' || parsed === null) {
      g.unknown++;
      continue;
    }
    if (g.oldest === null || parsed.ms < g.oldest.ms) g.oldest = { ms: parsed.ms, raw: (r.provenance.retrieved_at as string).trim() };
  }
  return [...groups].map(([id, g]) => ({
    id,
    name: g.first.provenance.source_name,
    licence: g.first.provenance.licence,
    retrievedAt: g.unknown > 0 ? null : (g.oldest?.raw ?? null),
    recordCount: g.count,
    unknownDateCount: g.unknown,
    basis: g.count === 0 ? 'no-records' : g.unknown > 0 ? 'unknown-record' : 'oldest',
  }));
}

/** SourceInput rows for buildSourceList (the page's source table). */
export function cachedSourceInputs(sources: readonly CachedSource[]): SourceInput[] {
  return sources.map((s) => ({ id: s.id, name: s.name, source: s.name, licence: s.licence, retrievedAt: s.retrievedAt }));
}
