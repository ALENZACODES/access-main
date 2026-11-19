/**
 * Facets for the places in an offline pack: filter by source, open licence, tier and how long ago
 * the record was retrieved, with a count beside each choice.
 *
 * Counts follow the usual rule for faceted search: the count beside a choice is how many places
 * would match if that choice were picked and every OTHER filter stayed as it is. A record with no
 * usable source has no source, licence or age and is reachable through the "UNKNOWN" choice of
 * each facet, never dropped. A tier that is missing or not recognised is UNKNOWN too.
 *
 * Everything here is pure: the same places, selection and `today` give the same result.
 */
import { type PackPlaceRecord } from "./packPlaces";
import { type AgeBucketId, AGE_BUCKET_IDS, ageBucket } from "./packFreshness";
import { OPEN_LICENCES, type OpenLicenceId, daysBetween, isOpenLicence } from "./provenance";
import { RECORD_TIERS, type RecordTier } from "./recordTier";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const UNKNOWN_FACET = "unknown" as const;

/** A source name longer than this cannot come from a pack record, so a selection naming one is ignored. */
export const MAX_SOURCE_LENGTH = 200;

export type FacetId = "source" | "licence" | "tier" | "age";
export const FACET_IDS: readonly FacetId[] = ["source", "licence", "tier", "age"];

/** The value of one facet: a specific value, UNKNOWN (no usable source or no stated tier), or null for "any". */
export interface FacetSelection {
  readonly source: string | null;
  readonly licence: OpenLicenceId | typeof UNKNOWN_FACET | null;
  readonly tier: `${RecordTier}` | typeof UNKNOWN_FACET | null;
  readonly age: AgeBucketId | typeof UNKNOWN_FACET | null;
}

export const EMPTY_FACETS: FacetSelection = { source: null, licence: null, tier: null, age: null };

export interface FacetOption {
  /** "" stands for "any" so the value works as a radio value. */
  readonly value: string;
  readonly label: string;
  /** Places that would match if this option were picked, other facets unchanged. */
  readonly count: number;
}

export interface FacetGroup {
  readonly facet: FacetId;
  readonly label: string;
  readonly options: readonly FacetOption[];
}

export function activeFacetCount(sel: FacetSelection): number {
  return FACET_IDS.filter((id) => sel[id] !== null).length;
}

/** The facet value a place has, as the string used in selections. */
export function facetValueOf(p: PackPlaceRecord, facet: FacetId, today: string): string {
  switch (facet) {
    case "source":
      return p.provenance ? p.provenance.source : UNKNOWN_FACET;
    case "licence":
      return p.provenance ? p.provenance.licence : UNKNOWN_FACET;
    case "tier":
      return p.tier === null ? UNKNOWN_FACET : String(p.tier);
    case "age":
      return p.provenance ? ageBucket(daysBetween(p.provenance.retrievedOn, today)) : UNKNOWN_FACET;
  }
}

function sameSource(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function matchesFacet(p: PackPlaceRecord, facet: FacetId, wanted: string, today: string): boolean {
  const have = facetValueOf(p, facet, today);
  return facet === "source" ? sameSource(have, wanted) : have === wanted;
}

/** True when the place passes every active facet. `skip` leaves one facet out, for counting its options. */
export function matchesFacets(p: PackPlaceRecord, sel: FacetSelection, today: string, skip?: FacetId): boolean {
  for (const facet of FACET_IDS) {
    if (facet === skip) continue;
    const wanted = sel[facet];
    if (wanted !== null && !matchesFacet(p, facet, wanted, today)) return false;
  }
  return true;
}

export function applyFacets(places: readonly PackPlaceRecord[], sel: FacetSelection, today: string): PackPlaceRecord[] {
  return activeFacetCount(sel) === 0 ? [...places] : places.filter((p) => matchesFacets(p, sel, today));
}

const LABELS: Readonly<Record<FacetId, { en: string; fr: string }>> = {
  source: { en: "Source", fr: "Source" },
  licence: { en: "Licence", fr: "Licence" },
  tier: { en: "Tier", fr: "Niveau" },
  age: { en: "Retrieved", fr: "Consulté" },
};

const AGE_LABEL: Readonly<Record<AgeBucketId, { en: string; fr: string }>> = {
  "within-30": { en: "within 30 days", fr: "il y a 30 jours ou moins" },
  "within-90": { en: "31 to 90 days ago", fr: "il y a 31 à 90 jours" },
  "within-year": { en: "91 to 365 days ago", fr: "il y a 91 à 365 jours" },
  older: { en: "more than 365 days ago", fr: "il y a plus de 365 jours" },
  future: { en: "date in the future", fr: "date dans le futur" },
};

export function facetLabel(facet: FacetId, locale: Locale): string {
  return t(locale, LABELS[facet].en, LABELS[facet].fr);
}

/** The words for one value of a facet. A source name is shown as the pack gives it. */
export function facetValueLabel(facet: FacetId, value: string, locale: Locale): string {
  if (value === "") return t(locale, "Any", "Toutes");
  if (value === UNKNOWN_FACET) return "UNKNOWN";
  switch (facet) {
    case "source":
      return value;
    case "licence":
      return isOpenLicence(value) ? OPEN_LICENCES[value] : value;
    case "tier":
      return t(locale, `Tier ${value}`, `Niveau ${value}`);
    case "age":
      return (AGE_BUCKET_IDS as readonly string[]).includes(value) ? t(locale, AGE_LABEL[value as AgeBucketId].en, AGE_LABEL[value as AgeBucketId].fr) : value;
  }
}

const TIER_ORDER = RECORD_TIERS.map(String);

/** Order of the specific values within a facet: tiers and ages in their natural order, the rest by name. */
function compareValues(facet: FacetId, a: string, b: string): number {
  if (facet === "tier") return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b);
  if (facet === "age") return (AGE_BUCKET_IDS as readonly string[]).indexOf(a) - (AGE_BUCKET_IDS as readonly string[]).indexOf(b);
  return a.localeCompare(b);
}

/**
 * The options of one facet. "Any" comes first with the count of places passing the other filters,
 * then each value that occurs, then UNKNOWN if any place has it. The current choice is always
 * listed, even when no place would match it, so the control never hides what is selected.
 */
export function facetOptions(places: readonly PackPlaceRecord[], sel: FacetSelection, facet: FacetId, locale: Locale, today: string): FacetOption[] {
  const pool = places.filter((p) => matchesFacets(p, sel, today, facet));
  const counts = new Map<string, number>();
  for (const p of pool) {
    const v = facetValueOf(p, facet, today);
    const key = facet === "source" ? [...counts.keys()].find((k) => sameSource(k, v)) ?? v : v;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const chosen = sel[facet];
  if (chosen !== null && ![...counts.keys()].some((k) => (facet === "source" ? sameSource(k, chosen) : k === chosen))) counts.set(chosen, 0);
  const specific = [...counts.keys()].filter((k) => k !== UNKNOWN_FACET).sort((a, b) => compareValues(facet, a, b));
  const ordered = counts.has(UNKNOWN_FACET) ? [...specific, UNKNOWN_FACET] : specific;
  const options: FacetOption[] = [{ value: "", label: "", count: pool.length }, ...ordered.map((value) => ({ value, label: "", count: counts.get(value) ?? 0 }))];
  return options.map((o) => ({ ...o, label: t(locale, `${facetValueLabel(facet, o.value, locale)} (${o.count})`, `${facetValueLabel(facet, o.value, locale)} (${o.count})`) }));
}

/** Every facet's options, for building the controls. */
export function facetGroups(places: readonly PackPlaceRecord[], sel: FacetSelection, locale: Locale, today: string): FacetGroup[] {
  return FACET_IDS.map((facet) => ({ facet, label: facetLabel(facet, locale), options: facetOptions(places, sel, facet, locale, today) }));
}

/** A short sentence naming the active filters, or null when none is active. */
export function facetSummary(sel: FacetSelection, locale: Locale): string | null {
  const parts = FACET_IDS.filter((id) => sel[id] !== null).map((id) => `${facetLabel(id, locale)}${locale === "fr" ? " " : ""}: ${facetValueLabel(id, sel[id] as string, locale)}`);
  if (parts.length === 0) return null;
  return t(locale, `Filtered by ${parts.join("; ")}.`, `Filtré selon ${parts.join(" ; ")}.`);
}

/** Set one facet to a value from a control. "" clears it. Anything not offered for that facet clears it too. */
export function selectFacet(sel: FacetSelection, facet: FacetId, raw: string): FacetSelection {
  if (raw === "") return { ...sel, [facet]: null };
  const ok = (() => {
    switch (facet) {
      case "source":
        return raw.trim() !== "" && raw.length <= MAX_SOURCE_LENGTH;
      case "licence":
        return raw === UNKNOWN_FACET || isOpenLicence(raw);
      case "tier":
        return raw === UNKNOWN_FACET || TIER_ORDER.includes(raw);
      case "age":
        return raw === UNKNOWN_FACET || (AGE_BUCKET_IDS as readonly string[]).includes(raw);
    }
  })();
  return { ...sel, [facet]: ok ? raw : null } as FacetSelection;
}

/** Selection as a query string such as "licence=ODbL-1.0&tier=0". Empty when nothing is selected. */
export function encodeFacets(sel: FacetSelection): string {
  const p = new URLSearchParams();
  for (const id of FACET_IDS) if (sel[id] !== null) p.set(id, sel[id] as string);
  return p.toString();
}

/** Read a query string back. Unknown keys and values that are not offered are ignored, never trusted. */
export function decodeFacets(query: string): FacetSelection {
  const p = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  let sel = EMPTY_FACETS;
  for (const id of FACET_IDS) {
    const v = p.get(id);
    if (v !== null) sel = selectFacet(sel, id, v);
  }
  return sel;
}
