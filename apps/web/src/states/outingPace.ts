/**
 * A pace the person types, used only to turn a straight-line distance into a minimum time. It is
 * never stored or sent. The result is "at least": it ignores streets, crossings, slopes, waiting
 * and rests, so a real trip takes longer.
 */
import { NBSP } from "./typography";

export const MIN_PACE_KMH = 0.5;
export const MAX_PACE_KMH = 8;

export type PaceInput = { readonly status: "none" } | { readonly status: "invalid" } | { readonly status: "ok"; readonly kmh: number };

/** Empty is "none". A decimal point or comma, digits only, within the range; anything else is invalid and is never guessed. */
export function parsePace(text: string): PaceInput {
  const s = text.trim().replace(",", ".");
  if (s === "") return { status: "none" };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return { status: "invalid" };
  const kmh = Number(s);
  if (!Number.isFinite(kmh) || kmh < MIN_PACE_KMH || kmh > MAX_PACE_KMH) return { status: "invalid" };
  return { status: "ok", kmh };
}

/** Whole minutes, rounded up, for a straight-line distance at a pace. 0 metres is 0 minutes. */
export function minutesAt(metres: number, kmh: number): number {
  if (!Number.isFinite(metres) || metres <= 0 || !Number.isFinite(kmh) || kmh <= 0) return 0;
  return Math.ceil(metres / ((kmh * 1000) / 60));
}

/** "4 min", "1 h 05 min", "2 h" (French the same, with no-break spaces before the units). */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}${NBSP}min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${String(rest).padStart(2, "0")}${NBSP}min`;
}
