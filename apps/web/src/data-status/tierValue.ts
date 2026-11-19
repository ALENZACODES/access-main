/**
 * Reading one recorded tier. A tier is one of 0, 1, 2, 3, 4 or E, exactly as recorded.
 * Nothing is guessed: no value, a placeholder, or any other text is not a tier. This module has
 * no wording of its own so the audit can use it without pulling in the message tables.
 */
import { cleanValue } from './unknownTokens';

export const TIER_IDS = ['0', '1', '2', '3', '4', 'E'] as const;
export type TierId = (typeof TIER_IDS)[number];

export type TierRead =
  | { kind: 'tier'; tier: TierId }
  /** Nothing usable is recorded. */
  | { kind: 'unknown' }
  /** Something is recorded, but it is not one of the tiers. */
  | { kind: 'unrecognised'; text: string };

const UNKNOWN: TierRead = { kind: 'unknown' };

export function isTierId(v: unknown): v is TierId {
  return typeof v === 'string' && (TIER_IDS as readonly string[]).includes(v);
}

/** Reads one recorded tier. Whole numbers 0 to 4 and the letter E (either case) are tiers; nothing else is. */
export function readTier(raw: unknown): TierRead {
  if (typeof raw === 'number') {
    if (Number.isInteger(raw) && raw >= 0 && raw <= 4) return { kind: 'tier', tier: String(raw) as TierId };
    return Number.isNaN(raw) ? UNKNOWN : { kind: 'unrecognised', text: String(raw) };
  }
  if (typeof raw !== 'string') return UNKNOWN;
  const text = cleanValue(raw);
  if (text === null) return UNKNOWN;
  const upper = text.toUpperCase();
  if (isTierId(upper)) return { kind: 'tier', tier: upper };
  return { kind: 'unrecognised', text };
}

/** The tier when one is recorded, else null. */
export function tierOf(raw: unknown): TierId | null {
  const read = readTier(raw);
  return read.kind === 'tier' ? read.tier : null;
}
