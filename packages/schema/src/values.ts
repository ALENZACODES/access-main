/** Tokens that mean "no collected value" under Table T3-12. */
const GAP_TOKENS = new Set([
  "unknown",
  "n/a",
  "na",
  "null",
  "not_applicable",
  "not applicable",
  "not assessed",
  "unknown_recorded",
]);

export function isGapToken(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  return GAP_TOKENS.has(value.trim().toLowerCase());
}

export interface FactLike {
  value?: unknown;
  source_id?: string;
  licence?: string;
  retrieved_at?: string;
  tier?: number | string;
  observed_at?: string;
  method?: string | null;
  derived?: boolean;
  tri_state_observation?: boolean;
  source_key?: string;
  import_field?: string;
}

export function isFactLike(value: unknown): value is FactLike {
  return typeof value === "object" && value !== null && "value" in value && "tier" in value && "source_id" in value;
}

export function observationComplete(fact: FactLike): boolean {
  return Boolean(fact.tri_state_observation && fact.method && fact.observed_at && fact.source_id);
}
