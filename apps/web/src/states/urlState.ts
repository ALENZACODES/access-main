/**
 * Filter state in the URL query string, so a search can be shared, bookmarked and
 * restored offline. Decoding never trusts the input: unknown feature ids are dropped
 * and the free-text query is length-limited and stripped of control characters.
 */
import { FEATURE_IDS } from "./dataStatus";
import { EMPTY_FILTER, type PlaceFilter, isFeatureId } from "./filters";

export const MAX_QUERY_LENGTH = 100;

function cleanQuery(q: string): string {
  // eslint-disable-next-line no-control-regex
  return q.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_QUERY_LENGTH);
}

/** Query string without a leading "?". Default values are omitted. */
export function encodeFilter(f: PlaceFilter): string {
  const params = new URLSearchParams();
  const need = FEATURE_IDS.filter((id) => f.required.includes(id));
  if (need.length > 0) params.set("need", need.join(","));
  if (f.includeUnknown) params.set("unk", "1");
  const q = cleanQuery(f.query);
  if (q !== "") params.set("q", q);
  return params.toString();
}

export function decodeFilter(search: string): PlaceFilter {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const wanted = new Set((params.get("need") ?? "").split(",").filter(isFeatureId));
  return {
    ...EMPTY_FILTER,
    required: FEATURE_IDS.filter((id) => wanted.has(id)),
    includeUnknown: params.get("unk") === "1",
    query: cleanQuery(params.get("q") ?? ""),
  };
}
