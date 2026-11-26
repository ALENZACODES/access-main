/**
 * One fixed text form for a saved place, so two devices holding the same record produce the same
 * bytes. Every field the pack can hold is in it, in a fixed order, and an absent value is `null`
 * (never an empty string), so "no name" and a blank name cannot be mixed up.
 *
 * Reading only. Nothing here changes a record, and the text is never shown as a place's details:
 * it exists to be hashed (see packFingerprint.ts).
 */
import type { PackPlaceRecord } from "./packPlaces";

/** Bump when the field list or order changes, so a code made by an older App is not compared as if it matched. */
export const CANONICAL_VERSION = 1;

/** The record as a JSON array in a fixed field order. Numbers and strings print one way only. */
export function canonicalLine(place: PackPlaceRecord): string {
  const p = place.provenance;
  return JSON.stringify([
    place.id,
    place.name,
    place.tag,
    p === null ? null : [p.source, p.licence, p.retrievedOn, p.url ?? null],
    place.tier,
    place.category,
    place.address,
    place.note,
    place.location === null ? null : [place.location.lat, place.location.lon],
  ]);
}

/** Code-unit order, not locale order: the same on every device and in every language. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The canonical line of every place, ordered by id and then by line, so input order never matters. */
export function canonicalLines(places: readonly PackPlaceRecord[]): string[] {
  return places
    .map((p) => ({ id: p.id, line: canonicalLine(p) }))
    .sort((x, y) => compareCodeUnits(x.id, y.id) || compareCodeUnits(x.line, y.line))
    .map((x) => x.line);
}

/** Lines joined for hashing. Each line ends with a line feed, so an empty list is the empty string. */
export function canonicalText(places: readonly PackPlaceRecord[]): string {
  return canonicalLines(places).map((l) => `${l}\n`).join("");
}

/** Only the ids, ordered, one per line. Two packs with the same ids may still differ in details. */
export function canonicalIds(places: readonly PackPlaceRecord[]): string {
  return places
    .map((p) => p.id)
    .sort(compareCodeUnits)
    .map((id) => `${JSON.stringify(id)}\n`)
    .join("");
}
