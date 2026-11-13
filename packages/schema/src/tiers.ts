import { PROTOTYPE_LABELS, TIERS } from "./catalog/types.js";

/**
 * Canonical verification tiers. packages/schema is the source of truth.
 * Other repositories map into these ids. They do not publish a second list.
 * The French name of the product is "l'application". These ids are not translated.
 */

export { PROTOTYPE_LABELS };
export const CANONICAL_TIER_IDS = TIERS;

export type CanonicalTierId = (typeof CANONICAL_TIER_IDS)[number];
export type PrototypeLabelId = (typeof PROTOTYPE_LABELS)[number];

/** Labels stored by access-tools PR #1 (packages/place/src/types.ts). Not canonical. */
export const ACCESS_TOOLS_TIER_LABELS = {
  "tier-0-open-data": 0,
  "tier-1-business-claimed": 1,
  "tier-2-peer": 2,
  "tier-3-surveyor": 3,
  "tier-4-live-feed": 4,
} as const satisfies Record<string, CanonicalTierId>;

const NUMERIC_STRINGS: Record<string, CanonicalTierId> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  E: "E",
};

/**
 * Map an access-maps numeric tier or an access-tools tier string onto a canonical id.
 * UNKNOWN is a missing value, not a tier, and returns null.
 */
export function canonicalTierFromForeign(value: unknown): CanonicalTierId | null {
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === "E") return value;
  if (typeof value === "string") {
    if (Object.prototype.hasOwnProperty.call(ACCESS_TOOLS_TIER_LABELS, value)) {
      return ACCESS_TOOLS_TIER_LABELS[value as keyof typeof ACCESS_TOOLS_TIER_LABELS];
    }
    if (Object.prototype.hasOwnProperty.call(NUMERIC_STRINGS, value)) return NUMERIC_STRINGS[value] ?? null;
  }
  return null;
}
