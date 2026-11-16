/**
 * Place filtering with strict UNKNOWN semantics.
 * A requirement is met only by a detail reported "yes" with valid provenance.
 * A place whose required detail is UNKNOWN is never counted as a match and never
 * silently dropped: it is reported as its own group.
 */
import { FEATURE_IDS, type FeatureId, evaluateAll } from "./dataStatus";
import type { PlaceReport } from "./placeSummary";

export interface PlaceFilter {
  readonly required: readonly FeatureId[];
  readonly includeUnknown: boolean;
  readonly query: string;
}

export const EMPTY_FILTER: PlaceFilter = { required: [], includeUnknown: false, query: "" };

export type MatchKind = "match" | "unknown" | "no-match";

export interface PlaceMatch {
  readonly place: PlaceReport;
  readonly kind: MatchKind;
  readonly matched: readonly FeatureId[];
  readonly unknown: readonly FeatureId[];
  readonly failed: readonly FeatureId[];
}

/** Lower-case and strip accents so "Café" matches "cafe". */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function classifyPlace(place: PlaceReport, filter: PlaceFilter): PlaceMatch {
  const q = normalizeText(filter.query);
  if (q !== "" && !normalizeText(place.name).includes(q)) {
    return { place, kind: "no-match", matched: [], unknown: [], failed: [] };
  }
  const byId = new Map(evaluateAll(place.features).map((s) => [s.feature, s.status] as const));
  const matched: FeatureId[] = [];
  const unknown: FeatureId[] = [];
  const failed: FeatureId[] = [];
  for (const f of filter.required) {
    const status = byId.get(f) ?? "unknown";
    if (status === "yes") matched.push(f);
    else if (status === "unknown") unknown.push(f);
    else failed.push(f); // "no" and "partial" do not meet a requirement
  }
  const kind: MatchKind = failed.length > 0 ? "no-match" : unknown.length > 0 ? "unknown" : "match";
  return { place, kind, matched, unknown, failed };
}

export interface SearchOutcome {
  readonly matches: readonly PlaceMatch[];
  readonly unknownPlaces: readonly PlaceMatch[];
  readonly noMatchCount: number;
}

export function searchPlaces(places: readonly PlaceReport[], filter: PlaceFilter): SearchOutcome {
  const matches: PlaceMatch[] = [];
  const unknownPlaces: PlaceMatch[] = [];
  let noMatchCount = 0;
  for (const p of places) {
    const m = classifyPlace(p, filter);
    if (m.kind === "match") matches.push(m);
    else if (m.kind === "unknown") unknownPlaces.push(m);
    else noMatchCount++;
  }
  const byName = (a: PlaceMatch, b: PlaceMatch): number =>
    normalizeText(a.place.name).localeCompare(normalizeText(b.place.name));
  return { matches: matches.sort(byName), unknownPlaces: unknownPlaces.sort(byName), noMatchCount };
}

export function isFeatureId(v: unknown): v is FeatureId {
  return typeof v === "string" && (FEATURE_IDS as readonly string[]).includes(v);
}
