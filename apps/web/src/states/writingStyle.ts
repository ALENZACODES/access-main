/**
 * Street types written two ways across one list ("St" in some addresses and "Street" in others). Only the last
 * word of the street part counts, so "St. Clair Avenue" is read as an avenue, never as a street. When both forms
 * are in use, the places that use the less common one are pointed out. Neither form is wrong; the point is that
 * a list written one way is easier to search and to read aloud.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { foldAddressText } from "./streetAddress";

export interface StreetTypePair {
  readonly short: readonly string[];
  readonly long: string;
}

/** English street types with their short forms, folded (no dots, lower case). */
export const STREET_TYPE_PAIRS: readonly StreetTypePair[] = [
  { short: ["st"], long: "street" },
  { short: ["ave", "av"], long: "avenue" },
  { short: ["rd"], long: "road" },
  { short: ["blvd"], long: "boulevard" },
  { short: ["dr"], long: "drive" },
  { short: ["cres"], long: "crescent" },
  { short: ["ct"], long: "court" },
  { short: ["pl"], long: "place" },
  { short: ["ln"], long: "lane" },
  { short: ["hwy"], long: "highway" },
  { short: ["pkwy"], long: "parkway" },
  { short: ["terr", "ter"], long: "terrace" },
  { short: ["cir"], long: "circle" },
];

const DIRECTIONS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"]);

/** Fewest addresses that use a type, in total, before a mix is worth pointing out. */
export const MIN_STYLE_SAMPLE = 4;

export interface TypeUse {
  /** The pair's long form, folded ("street"). */
  readonly long: string;
  readonly form: "short" | "long";
  /** The word as written, with its own case and dots. */
  readonly written: string;
}

/** The street type at the end of the street part of an address, or null. Direction words after it are skipped. */
export function streetTypeUse(address: string | null): TypeUse | null {
  if (address === null) return null;
  const streetPart = address.split(",")[0] ?? "";
  const words = streetPart.trim().split(/\s+/).filter(Boolean);
  let i = words.length - 1;
  while (i > 0 && DIRECTIONS.has(foldAddressText(words[i]!))) i -= 1;
  // A line of one word is a name or a street with no type; two or more are needed to have a type after a street name.
  if (i < 1) return null;
  const written = words[i]!;
  const folded = foldAddressText(written);
  for (const pair of STREET_TYPE_PAIRS) {
    if (folded === pair.long) return { long: pair.long, form: "long", written };
    if (pair.short.includes(folded)) return { long: pair.long, form: "short", written };
  }
  return null;
}

export interface StyleMix {
  readonly long: string;
  readonly shortCount: number;
  readonly longCount: number;
  /** The form fewer addresses use. A tie is read as the short form being the minority. */
  readonly minority: "short" | "long";
  /** Ids of the places that use the minority form, in pack order. */
  readonly ids: readonly string[];
}

export function findStyleMixes(places: readonly PackPlaceRecord[]): StyleMix[] {
  const by = new Map<string, { short: string[]; long: string[] }>();
  for (const p of places) {
    const use = streetTypeUse(p.address);
    if (!use) continue;
    const e = by.get(use.long) ?? { short: [], long: [] };
    e[use.form].push(p.id);
    by.set(use.long, e);
  }
  const out: StyleMix[] = [];
  for (const pair of STREET_TYPE_PAIRS) {
    const e = by.get(pair.long);
    if (!e || e.short.length === 0 || e.long.length === 0 || e.short.length + e.long.length < MIN_STYLE_SAMPLE) continue;
    const minority = e.short.length <= e.long.length ? "short" : "long";
    out.push({ long: pair.long, shortCount: e.short.length, longCount: e.long.length, minority, ids: minority === "short" ? e.short : e.long });
  }
  return out;
}

/** Id to the mix its address belongs to as a minority. A place appears at most once, since it has one street type. */
export function minorityIndex(mixes: readonly StyleMix[]): Map<string, StyleMix> {
  const m = new Map<string, StyleMix>();
  for (const x of mixes) for (const id of x.ids) m.set(id, x);
  return m;
}
