/**
 * Labels the shell will store and display.
 * Lane 2 owns the JSON Schema in packages/schema. This list is the set the
 * shell accepts so a later schema can use either the Part 3 tier names or the
 * prototype names without this cache rejecting the record.
 * The shell never promotes a record to VERIFIED.
 */
export const VERIFICATION_TIERS = [
  "UNKNOWN",
  "TIER_0",
  "TIER_1",
  "TIER_2",
  "TIER_3",
  "TIER_4",
  "PROTOTYPE-UNVERIFIED",
  "SEEDED-OPEN-DATA",
  "COMMUNITY-REPORTED",
  "VERIFIED",
] as const;

export type VerificationTier = (typeof VERIFICATION_TIERS)[number];

const TIER_MESSAGE_KEYS: Record<VerificationTier, string> = {
  UNKNOWN: "tiers.unknown",
  TIER_0: "tiers.tier0",
  TIER_1: "tiers.tier1",
  TIER_2: "tiers.tier2",
  TIER_3: "tiers.tier3",
  TIER_4: "tiers.tier4",
  "PROTOTYPE-UNVERIFIED": "tiers.prototypeUnverified",
  "SEEDED-OPEN-DATA": "tiers.seededOpenData",
  "COMMUNITY-REPORTED": "tiers.communityReported",
  VERIFIED: "tiers.verifiedClaim",
};

export function isVerificationTier(value: unknown): value is VerificationTier {
  return typeof value === "string" && (VERIFICATION_TIERS as readonly string[]).includes(value);
}

export function tierMessageKey(tier: VerificationTier): string {
  return TIER_MESSAGE_KEYS[tier];
}

/** Live operational tiers are not kept in the offline cache. */
export function isLiveTier(tier: VerificationTier): boolean {
  return tier === "TIER_4";
}
