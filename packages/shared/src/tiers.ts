/**
 * Canonical tier ids from packages/schema/TIERS.md on cursor/schema-package-61db.
 * That file is the source of truth. This module does not invent a second list.
 * `unknown` and `UNKNOWN` are missing values, not tiers.
 *
 * A prototype cache may store tiers 0, 1, and E, and the labels
 * PROTOTYPE-UNVERIFIED and SEEDED-OPEN-DATA. It refuses tier 2, tier 3,
 * tier 4, COMMUNITY-REPORTED, and VERIFIED.
 */

export const CANONICAL_TIER_IDS = [0, 1, 2, 3, 4, "E"] as const;
export type CanonicalTierId = (typeof CANONICAL_TIER_IDS)[number];

export const PROTOTYPE_LABELS = [
  "PROTOTYPE-UNVERIFIED",
  "SEEDED-OPEN-DATA",
  "COMMUNITY-REPORTED",
  "VERIFIED",
] as const;
export type PrototypeLabel = (typeof PROTOTYPE_LABELS)[number];

export const PROTOTYPE_CACHE_TIERS = [0, 1, "E"] as const;
export type PrototypeCacheTier = (typeof PROTOTYPE_CACHE_TIERS)[number];

export const PROTOTYPE_CACHE_LABELS = ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA"] as const;

/** Display keys for the data-status legend. Refused tiers are explained in copy, not offered as stored values. */
export const DISPLAY_TIERS = [...PROTOTYPE_CACHE_TIERS, ...PROTOTYPE_CACHE_LABELS] as const;
export type DisplayTier = (typeof DISPLAY_TIERS)[number];

const ACCESS_TOOLS_TIERS: Record<string, CanonicalTierId> = {
  "tier-0-open-data": 0,
  "tier-1-business-claimed": 1,
  "tier-2-peer": 2,
  "tier-3-surveyor": 3,
  "tier-4-live-feed": 4,
  administrator_page: "E",
};

const LEGACY_TIERS: Record<string, CanonicalTierId> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  E: "E",
  TIER_0: 0,
  TIER_1: 1,
  TIER_2: 2,
  TIER_3: 3,
  TIER_4: 4,
};

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

export function canonicalTierFromForeign(value: unknown): CanonicalTierId | null {
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === "E") return value;
  if (typeof value !== "string") return null;
  if (Object.prototype.hasOwnProperty.call(ACCESS_TOOLS_TIERS, value)) return ACCESS_TOOLS_TIERS[value] ?? null;
  if (Object.prototype.hasOwnProperty.call(LEGACY_TIERS, value)) return LEGACY_TIERS[value] ?? null;
  return null;
}

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
