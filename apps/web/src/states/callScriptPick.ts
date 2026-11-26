/** Finding the place to write a script for: a name search over the places on screen, folded for accents and case. */
import type { PackPlaceRecord } from "./packPlaces";
import { foldAddressText } from "./streetAddress";

export const MAX_PICK_CHOICES = 8;

export interface PickResult {
  /** The first matches, in the order the places were given. */
  readonly shown: readonly PackPlaceRecord[];
  /** Matches that did not fit in the list. */
  readonly hidden: number;
  /** All matches. */
  readonly total: number;
}

/** Places whose name holds every word typed, in any order. An empty query matches every named place. Places with no name are never listed. */
export function pickPlaces(places: readonly PackPlaceRecord[], query: string, limit = MAX_PICK_CHOICES): PickResult {
  const words = foldAddressText(query).split(" ").filter(Boolean);
  const matches = places.filter((p) => {
    if (p.name === null) return false;
    const name = foldAddressText(p.name);
    return words.every((w) => name.includes(w));
  });
  const cap = Math.max(0, limit);
  return { shown: matches.slice(0, cap), hidden: Math.max(0, matches.length - cap), total: matches.length };
}

/** The label of a place in the list. Two places with one name are told apart by their address when there is one. */
export function pickLabel(place: PackPlaceRecord, among: readonly PackPlaceRecord[]): string {
  const name = place.name ?? "";
  const same = among.filter((p) => p.name === place.name).length;
  return same > 1 && place.address ? `${name}, ${place.address}` : name;
}
