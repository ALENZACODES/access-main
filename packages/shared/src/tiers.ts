/**
 * Verification tiers for the shell.
 * Canonical ids, prototype labels, and access-tools tier strings, including
 * `administrator_page` → `E`, come from `@access-main/schema/tiers`.
 * This module does not keep a second copy of those lists.
 * `unknown` and `UNKNOWN` are missing values, not tiers.
 *
 * A prototype cache may store tiers 0, 1, and E, and the labels
 * PROTOTYPE-UNVERIFIED and SEEDED-OPEN-DATA. It refuses tier 2, tier 3,
 * tier 4, COMMUNITY-REPORTED, and VERIFIED.
 */
import { CANONICAL_TIER_IDS, PROTOTYPE_LABELS, canonicalTierFromForeign } from "@access-main/schema/tiers";
import type { CanonicalTierId, PrototypeLabelId } from "@access-main/schema/tiers";

export { CANONICAL_TIER_IDS, PROTOTYPE_LABELS, canonicalTierFromForeign };
export type { CanonicalTierId };
export type PrototypeLabel = PrototypeLabelId;

export const PROTOTYPE_CACHE_TIERS = [0, 1, "E"] as const satisfies readonly CanonicalTierId[];
export type PrototypeCacheTier = (typeof PROTOTYPE_CACHE_TIERS)[number];

export const PROTOTYPE_CACHE_LABELS = ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA"] as const satisfies readonly PrototypeLabel[];

/** Display keys for the data-status legend. Refused tiers are explained in copy, not offered as stored values. */
export const DISPLAY_TIERS = [...PROTOTYPE_CACHE_TIERS, ...PROTOTYPE_CACHE_LABELS] as const;
export type DisplayTier = (typeof DISPLAY_TIERS)[number];

const TIER_MESSAGE_KEYS: Record<string, string> = {
  0: "tiers.tier0",
  1: "tiers.tier1",
  2: "tiers.tier2",
  3: "tiers.tier3",
  4: "tiers.tier4",
  E: "tiers.tierE",
  "PROTOTYPE-UNVERIFIED": "tiers.prototypeUnverified",
  "SEEDED-OPEN-DATA": "tiers.seededOpenData",
  "COMMUNITY-REPORTED": "tiers.communityReported",
  VERIFIED: "tiers.verifiedClaim",
};

export function isPrototypeLabel(value: unknown): value is PrototypeLabel {
  return typeof value === "string" && (PROTOTYPE_LABELS as readonly string[]).includes(value);
}

export function tierMessageKey(tier: CanonicalTierId | PrototypeLabel): string {
  return TIER_MESSAGE_KEYS[String(tier)] ?? "tiers.unknown";
}

export function isLiveTier(tier: CanonicalTierId): boolean {
  return tier === 4;
}

/** Why a tier or label cannot be stored on a prototype record. Null means it can. */
export function prototypeTierRefusal(tier: CanonicalTierId, label: PrototypeLabel | null): string | null {
  if (label === "VERIFIED" || tier === 3) return "verified_not_in_prototype";
  if (label === "COMMUNITY-REPORTED" || tier === 2) return "tier_not_in_prototype";
  if (tier === 4) return "live_status_not_cached";
  if (tier !== 0 && tier !== 1 && tier !== "E") return "tier_not_in_prototype";
  return null;
}
