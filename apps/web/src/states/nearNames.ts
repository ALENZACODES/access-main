/**
 * Names that are one small slip apart: a letter missing, a letter different, or two neighbouring
 * letters swapped. It finds spellings that may be one name written two ways. It cannot tell a typing
 * slip from two real places, so every pair is only a pair to look at.
 */
import { displayName, nameKey, pickLabel } from "./sameName";
import { compareNames } from "./streetIndex";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";

/** Names shorter than this are not compared: one letter is too large a part of a short name. */
export const NEAR_NAME_MIN_CHARS = 5;
/** Most pairs kept; the rest are counted. */
export const NEAR_NAME_MAX_PAIRS = 200;

export type NearRelation = "missing" | "different" | "swapped";

/**
 * How `b` differs from `a`: `a` has one letter that `b` lacks ("missing" from b), one letter in
 * place of another ("different"), or two neighbouring letters in the other order ("swapped").
 * null when the two are equal or further apart than that. Order of the arguments does not change
 * the answer, apart from which of the two "has the extra letter".
 */
export function nearRelation(a: string, b: string): NearRelation | null {
  if (a === b) return null;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return null;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return "different";
    if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return "swapped";
    return null;
  }
  const [long, short] = la > lb ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i) ? "missing" : null;
}

export interface NearNameSide {
  readonly key: string;
  readonly label: string;
  /** Places with this name. */
  readonly count: number;
  readonly ids: readonly string[];
}

export interface NearNamePair {
  readonly relation: NearRelation;
  /** The side with the longer key, or the first in key order when the keys are the same length. */
  readonly a: NearNameSide;
  readonly b: NearNameSide;
}

export interface NearNameResult {
  readonly pairs: readonly NearNamePair[];
  /** Pairs found beyond the limit, not listed. */
  readonly leftOut: number;
}

const variantsMissing = (k: string): string[] => {
  const out: string[] = [];
  for (let i = 0; i < k.length; i++) out.push(`${k.slice(0, i)}${k.slice(i + 1)}`);
  return out;
};

/** All pairs of different name keys one slip apart. The result does not depend on the order of the places. */
export function findNearNames(places: readonly PackPlaceRecord[], locale: Locale = "en"): NearNameResult {
  const sides = new Map<string, { names: string[]; ids: string[] }>();
  for (const p of places) {
    const key = nameKey(p.name);
    if (key === null || key.length < NEAR_NAME_MIN_CHARS) continue;
    const s = sides.get(key);
    if (s) {
      s.names.push(displayName(p.name!));
      s.ids.push(p.id);
    } else sides.set(key, { names: [displayName(p.name!)], ids: [p.id] });
  }
  const keys = [...sides.keys()].sort();
  const side = (key: string): NearNameSide => {
    const s = sides.get(key)!;
    const label = pickLabel(s.names, locale);
    return { key, label, count: s.ids.length, ids: [...s.ids].sort() };
  };
  // Two keys one letter apart (or the same length with one different letter) share a key with one letter taken out;
  // two keys with neighbours swapped are found by swapping neighbours in one of them.
  const buckets = new Map<string, string[]>();
  for (const k of keys) for (const v of new Set(variantsMissing(k))) (buckets.get(v) ?? buckets.set(v, []).get(v)!).push(k);
  const found = new Map<string, NearRelation>();
  const note = (x: string, y: string): void => {
    const [lo, hi] = x < y ? [x, y] : [y, x];
    const id = `${lo}\u0000${hi}`;
    if (found.has(id)) return;
    const rel = nearRelation(lo, hi);
    if (rel !== null) found.set(id, rel);
  };
  for (const k of keys) {
    for (const v of variantsMissing(k)) {
      for (const other of buckets.get(v) ?? []) note(k, other);
      if (sides.has(v) && v.length >= NEAR_NAME_MIN_CHARS) note(k, v);
    }
    for (let i = 0; i + 1 < k.length; i++) {
      const swapped = `${k.slice(0, i)}${k[i + 1]}${k[i]}${k.slice(i + 2)}`;
      if (sides.has(swapped)) note(k, swapped);
    }
  }
  const all: NearNamePair[] = [...found.entries()].map(([id, relation]) => {
    const [lo, hi] = id.split("\u0000") as [string, string];
    const [first, second] = hi.length > lo.length ? [hi, lo] : [lo, hi];
    return { relation, a: side(first), b: side(second) };
  });
  all.sort((p, q) => compareNames(p.a.label, q.a.label, locale) || (p.a.key < q.a.key ? -1 : p.a.key > q.a.key ? 1 : p.b.key < q.b.key ? -1 : 1));
  return { pairs: all.slice(0, NEAR_NAME_MAX_PAIRS), leftOut: Math.max(0, all.length - NEAR_NAME_MAX_PAIRS) };
}
