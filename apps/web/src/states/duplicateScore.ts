/**
 * How alike two places of the pack are, from their name, street address, position and kind. It only says
 * that two records may be the same place and why; it never merges them, never drops one, and never says
 * which record is right. Two places can share a name and a street and still be different (two units, two
 * floors), so a high score is a prompt to look, not a finding.
 */
import { distanceMetres } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import { foldPlaceName } from "./placeNameKey";
import { foldAddressText, parseAddress } from "./streetAddress";
import { nameSimilarity } from "./textSimilarity";

export type DuplicateReason = "same-name" | "similar-name" | "same-address" | "very-near" | "near" | "same-kind";

export const DUPLICATE_REASONS: readonly DuplicateReason[] = ["same-name", "similar-name", "same-address", "very-near", "near", "same-kind"];

/** Metres: closer than the first is "very near", closer than the second "near". */
export const VERY_NEAR_M = 60;
export const NEAR_M = 200;
/** Names at least this alike (0 to 1) count as similar. */
export const SIMILAR_NAME = 0.88;

export const REASON_WEIGHTS: Readonly<Record<DuplicateReason, number>> = {
  "same-name": 0.45,
  "similar-name": 0.3,
  "same-address": 0.35,
  "very-near": 0.3,
  near: 0.15,
  "same-kind": 0.1,
};

export interface PairScore {
  /** 0 to 1. The sum of the weights of the reasons, kept at 1. */
  readonly score: number;
  readonly reasons: readonly DuplicateReason[];
  /** Metres between the two when both have a position; null otherwise. */
  readonly metres: number | null;
  /** Name similarity from 0 to 1 when both have a name; null otherwise. */
  readonly nameSimilarity: number | null;
}

/** The address as compared: civic number and street key together. Null unless the pack gives a street with a number. */
export function addressKeyOf(address: string | null): string | null {
  const a = parseAddress(address);
  if (a.kind !== "street" || a.key === null || a.number === null) return null;
  return `${a.number.toLowerCase()} ${a.key}`;
}

const kindKey = (p: PackPlaceRecord): string | null => (p.category === null ? null : foldAddressText(p.category) || null);

export function scorePair(a: PackPlaceRecord, b: PackPlaceRecord): PairScore {
  const reasons: DuplicateReason[] = [];
  const ka = a.name === null ? "" : foldPlaceName(a.name);
  const kb = b.name === null ? "" : foldPlaceName(b.name);
  let sim: number | null = null;
  if (ka !== "" && kb !== "") {
    sim = nameSimilarity(ka, kb);
    if (ka === kb) reasons.push("same-name");
    else if (sim >= SIMILAR_NAME) reasons.push("similar-name");
  }
  const aa = addressKeyOf(a.address);
  const ab = addressKeyOf(b.address);
  if (aa !== null && aa === ab) reasons.push("same-address");
  let metres: number | null = null;
  if (a.location !== null && b.location !== null) {
    metres = distanceMetres(a.location, b.location);
    if (metres <= VERY_NEAR_M) reasons.push("very-near");
    else if (metres <= NEAR_M) reasons.push("near");
  }
  const ca = kindKey(a);
  if (ca !== null && ca === kindKey(b)) reasons.push("same-kind");
  const score = Math.min(1, reasons.reduce((s, r) => s + REASON_WEIGHTS[r], 0));
  return { score: Math.round(score * 1000) / 1000, reasons, metres, nameSimilarity: sim };
}

export type Strictness = "strict" | "balanced" | "loose";
export const STRICTNESS_LEVELS: readonly Strictness[] = ["strict", "balanced", "loose"];
export const DEFAULT_STRICTNESS: Strictness = "balanced";
export const THRESHOLDS: Readonly<Record<Strictness, number>> = { strict: 0.75, balanced: 0.6, loose: 0.45 };
export const isStrictness = (v: unknown): v is Strictness => typeof v === "string" && (STRICTNESS_LEVELS as readonly string[]).includes(v);

/** A pair is worth a look when its score reaches the threshold and at least one reason is about the name or the street. Position and kind alone never are. */
export function isCandidate(s: PairScore, strictness: Strictness): boolean {
  const anchored = s.reasons.some((r) => r === "same-name" || r === "similar-name" || r === "same-address");
  return anchored && s.score >= THRESHOLDS[strictness];
}
