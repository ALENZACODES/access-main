/**
 * Places in a pack that may be the same place listed twice.
 *
 * Two records are a possible pair when their names match after folding case, accents and
 * punctuation AND their positions are close. Records with no name or no position are never
 * paired: there is nothing to compare, and a guess would invent a link. A pair is a prompt for the
 * data owner to look. It is never merged, hidden or removed by the App.
 */
import { distanceMetres } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";

/** Two records closer than this, with the same folded name, are a possible pair. */
export const DUPLICATE_DISTANCE_M = 75;
/** Pairs beyond this many are counted but not listed, so one bad import cannot flood the page. */
export const MAX_PAIRS_LISTED = 20;

export interface DuplicatePair {
  readonly a: string;
  readonly b: string;
  /** Whole metres between the two positions. */
  readonly metres: number;
  /** The folded name both records share. */
  readonly name: string;
}

export interface DuplicateResult {
  readonly pairs: readonly DuplicatePair[];
  /** How many pairs were found in all, which can be more than the pairs listed. */
  readonly total: number;
  /** Records that could not be compared for lack of a name or a position. */
  readonly notComparable: number;
}

/** Fold case, accents, punctuation and repeated spaces so "Café  Bloor" and "cafe bloor" match. */
export function foldName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function findPossibleDuplicates(places: readonly PackPlaceRecord[], maxMetres: number = DUPLICATE_DISTANCE_M): DuplicateResult {
  const byName = new Map<string, PackPlaceRecord[]>();
  let notComparable = 0;
  for (const p of places) {
    const name = p.name === null ? "" : foldName(p.name);
    if (name === "" || p.location === null) {
      notComparable += 1;
      continue;
    }
    byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  const pairs: DuplicatePair[] = [];
  for (const [name, group] of byName) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const metres = Math.round(distanceMetres(a.location!, b.location!));
        if (metres <= maxMetres) pairs.push({ a: a.id, b: b.id, metres, name });
      }
    }
  }
  pairs.sort((x, y) => x.metres - y.metres || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return { pairs: pairs.slice(0, MAX_PAIRS_LISTED), total: pairs.length, notComparable };
}
