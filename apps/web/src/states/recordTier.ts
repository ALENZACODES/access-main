/**
 * The evidence tier a record states, read from the pack and worded for display.
 *
 * Tiers are 0 to 4 and E, as the shared tier list defines them. A missing or unrecognised tier
 * stays UNKNOWN: it is never defaulted to a low or a high tier. A tier is a statement about
 * where a record came from. It is not a measurement made by the App.
 */
import type { Locale } from "./stateCopy";
import { message, type MessageId } from "./messages";

export const RECORD_TIERS = [0, 1, 2, 3, 4, "E"] as const;
export type RecordTier = (typeof RECORD_TIERS)[number];

/** Tiers a prototype offline pack may hold. The others are shown as given, with a note. */
export const PACK_EXPECTED_TIERS: readonly RecordTier[] = [0, 1, "E"];

const TEXT_TIERS: Readonly<Record<string, RecordTier>> = { "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, E: "E" };

/** The tier a pack record states, or null when it states none that is recognised. */
export function readTier(value: unknown): RecordTier | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value <= 4 ? (value as RecordTier) : null;
  if (typeof value === "string") {
    const key = value.trim();
    return Object.prototype.hasOwnProperty.call(TEXT_TIERS, key) ? (TEXT_TIERS[key] ?? null) : null;
  }
  return null;
}

export function isExpectedInPack(tier: RecordTier | null): boolean {
  return tier !== null && PACK_EXPECTED_TIERS.includes(tier);
}

/** "Tier 0" / "Niveau 0", or "Tier UNKNOWN" / "Niveau INCONNU". */
export function tierLabel(tier: RecordTier | null, locale: Locale): string {
  return tier === null ? message("tier.labelUnknown", locale) : message("tier.label", locale, { tier: String(tier) });
}

/** What the tier means in one sentence. A tier a prototype pack should not hold carries a second sentence. */
export function tierMeaning(tier: RecordTier | null, locale: Locale): string {
  if (tier === null) return message("tier.meaningUnknown", locale);
  const base = message(`tier.meaning.${tier}` as MessageId, locale);
  return isExpectedInPack(tier) ? base : `${base} ${message("tier.notExpected", locale)}`;
}

/** The label and meaning together, for one line of text. */
export function tierLine(tier: RecordTier | null, locale: Locale): string {
  return message("tier.line", locale, { label: tierLabel(tier, locale), meaning: tierMeaning(tier, locale) });
}
