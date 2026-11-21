/**
 * Turns the on-device cache into registry records for the data-status panel.
 * One dataset per cache kind, one source per cached record. Nothing is filled
 * in: a missing licence, source or date stays missing and shows as Unknown.
 */
import type { Locale } from './dataStatus';
import type { DatasetRecord } from './datasetRegistry';
import type { DatasetKind } from './freshnessPolicy';

/** The slice of a cache entry this module reads (structurally a CacheEntry). */
export interface CachedEntryLike {
  id: string;
  kind: string;
  provenance: {
    source_name?: string | null | undefined;
    source_url?: string | null | undefined;
    licence?: string | null | undefined;
    retrieved_at?: string | null | undefined;
    tier?: string | number | null | undefined;
  };
}

/**
 * Staleness grouping per cache kind. This chooses which display threshold
 * applies; it is not a claim about how often any publisher updates, and the
 * panel lets the person change each threshold. Kinds without a clear match use
 * the general "reference" threshold.
 */
export const CACHE_KIND_GROUP: Readonly<Record<string, DatasetKind>> = {
  place: 'places',
  journey: 'routes',
};
export const DEFAULT_CACHE_GROUP: DatasetKind = 'reference';

const NAMES: Readonly<Record<string, Readonly<Record<Locale, string>>>> = {
  place: { en: 'Places', fr: 'Lieux' },
  journey: { en: 'Journeys', fr: 'Trajets' },
  finder: { en: 'Finder results', fr: 'Résultats de recherche' },
  'directory-link': { en: 'Directory links', fr: 'Liens de répertoire' },
  'help-article': { en: 'Help articles', fr: 'Articles d’aide' },
  'activity-pack': { en: 'Activity packs', fr: 'Ensembles d’activités' },
};
const OTHER_NAME: Readonly<Record<Locale, string>> = { en: 'Other cached records', fr: 'Autres données enregistrées' };

export function cacheKindName(kind: string, locale: Locale): string {
  return NAMES[kind]?.[locale] ?? OTHER_NAME[locale];
}

export function cacheKindNames(): readonly string[] {
  return Object.keys(NAMES);
}

/** Datasets sorted by kind name, sources in the order given. Empty input gives no datasets. */
export function buildCacheRecords(entries: readonly CachedEntryLike[], locale: Locale): DatasetRecord[] {
  const byKind = new Map<string, DatasetRecord>();
  for (const entry of entries) {
    const known = Object.hasOwn(NAMES, entry.kind);
    const id = known ? entry.kind : 'other';
    let dataset = byKind.get(id);
    if (!dataset) {
      dataset = {
        id,
        name: cacheKindName(id, locale),
        kind: CACHE_KIND_GROUP[id] ?? DEFAULT_CACHE_GROUP,
        sources: [],
      };
      byKind.set(id, dataset);
    }
    dataset.sources.push({
      id: entry.id,
      name: entry.provenance.source_name ?? null,
      source: entry.provenance.source_name ?? null,
      url: entry.provenance.source_url ?? null,
      licence: entry.provenance.licence ?? null,
      retrievedAt: entry.provenance.retrieved_at ?? null,
      tier: entry.provenance.tier ?? null,
    });
  }
  return [...byKind.values()].sort((a, b) => a.name.localeCompare(b.name, locale));
}
