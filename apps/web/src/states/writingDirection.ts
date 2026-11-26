/**
 * A direction after the street type written two ways across one list ("Queen Street W" in some addresses and
 * "Queen Street West" in others). A direction counts only when it follows a street type, so "King West" (where
 * West may be part of the name) is left alone, and a direction before the name ("100 W Queen St") is not read.
 * Neither form is wrong; a list written one way is easier to search and to read aloud.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { foldAddressText } from "./streetAddress";
import { STREET_TYPE_PAIRS, MIN_STYLE_SAMPLE, type StyleMix } from "./writingStyle";

export interface DirectionPair {
  readonly short: string;
  readonly long: string;
}

export const DIRECTION_PAIRS: readonly DirectionPair[] = [
  { short: "n", long: "north" },
  { short: "s", long: "south" },
  { short: "e", long: "east" },
  { short: "w", long: "west" },
  { short: "ne", long: "northeast" },
  { short: "nw", long: "northwest" },
  { short: "se", long: "southeast" },
  { short: "sw", long: "southwest" },
];

const TYPE_WORDS = new Set(STREET_TYPE_PAIRS.flatMap((p) => [p.long, ...p.short]));

export interface DirectionUse {
  readonly long: string;
  readonly form: "short" | "long";
  readonly written: string;
}

/** The direction ending the street part of an address, when a street type comes right before it, or null. */
export function directionUse(address: string | null): DirectionUse | null {
  if (address === null) return null;
  const words = (address.split(",")[0] ?? "").trim().split(/\s+/).filter(Boolean);
  // A number, a name, a type and a direction: at least four words, or three when the number is left out.
  if (words.length < 3) return null;
  const written = words[words.length - 1]!;
  const before = foldAddressText(words[words.length - 2]!);
  if (!TYPE_WORDS.has(before)) return null;
  const folded = foldAddressText(written);
  for (const pair of DIRECTION_PAIRS) {
    if (folded === pair.long) return { long: pair.long, form: "long", written };
    if (folded === pair.short) return { long: pair.long, form: "short", written };
  }
  return null;
}

/** Directions written both short and long, the places with the less common form pointed out. A tie reads the short form as the minority. */
export function findDirectionMixes(places: readonly PackPlaceRecord[]): StyleMix[] {
  const by = new Map<string, { short: string[]; long: string[] }>();
  for (const p of places) {
    const use = directionUse(p.address);
    if (!use) continue;
    const e = by.get(use.long) ?? { short: [], long: [] };
    e[use.form].push(p.id);
    by.set(use.long, e);
  }
  const out: StyleMix[] = [];
  for (const pair of DIRECTION_PAIRS) {
    const e = by.get(pair.long);
    if (!e || e.short.length === 0 || e.long.length === 0 || e.short.length + e.long.length < MIN_STYLE_SAMPLE) continue;
    const minority = e.short.length <= e.long.length ? "short" : "long";
    out.push({ long: pair.long, shortCount: e.short.length, longCount: e.long.length, minority, ids: minority === "short" ? e.short : e.long });
  }
  return out;
}

/** The short form of a direction as it is usually written, in capitals ("W", "NE"). */
export const shortDirection = (long: string): string => (DIRECTION_PAIRS.find((p) => p.long === long)?.short ?? long).toUpperCase();
export const longDirection = (long: string): string => long.charAt(0).toUpperCase() + long.slice(1);
