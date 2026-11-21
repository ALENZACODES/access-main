/**
 * A short fingerprint of the saved places, so two devices can tell whether they hold the same
 * records without sending the records anywhere. It says only that the saved records match or
 * do not. It never says the records are right, complete or current.
 *
 * The places are split into 16 groups by a hash of their id. When two fingerprints differ, the
 * groups that differ narrow down where to look. The split is by id, so a group is not a place on
 * a map or a kind of place.
 */
import { canonicalIds, canonicalLine, compareCodeUnits } from "./packCanonical";
import type { PackPlaceRecord } from "./packPlaces";
import { sha256Hex } from "./sha256";

export const BUCKET_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"] as const;
export type BucketKey = (typeof BUCKET_KEYS)[number];

/** Hex characters kept from each hash: 32 for the whole pack (128 bits) and 8 for each group. */
export const WHOLE_HEX = 32;
export const BUCKET_HEX = 8;

export interface BucketPrint {
  readonly key: BucketKey;
  readonly count: number;
  readonly hash: string;
}

export interface PackFingerprint {
  readonly count: number;
  /** Hash of the ordered ids alone. */
  readonly ids: string;
  /** Hash of every field of every place. */
  readonly all: string;
  readonly buckets: readonly BucketPrint[];
}

/** The group an id belongs to: the first hex character of the id's hash. */
export function bucketOf(id: string): BucketKey {
  return sha256Hex(id)[0] as BucketKey;
}

export function fingerprintPlaces(places: readonly PackPlaceRecord[]): PackFingerprint {
  const groups = new Map<BucketKey, { id: string; line: string }[]>(BUCKET_KEYS.map((k) => [k, []]));
  const all: { id: string; line: string }[] = [];
  for (const place of places) {
    const row = { id: place.id, line: canonicalLine(place) };
    groups.get(bucketOf(place.id))!.push(row);
    all.push(row);
  }
  const text = (rows: { id: string; line: string }[]): string =>
    rows
      .sort((x, y) => compareCodeUnits(x.id, y.id) || compareCodeUnits(x.line, y.line))
      .map((r) => `${r.line}\n`)
      .join("");
  return {
    count: places.length,
    ids: sha256Hex(canonicalIds(places)).slice(0, WHOLE_HEX),
    all: sha256Hex(text(all)).slice(0, WHOLE_HEX),
    buckets: BUCKET_KEYS.map((key) => {
      const rows = groups.get(key)!;
      return { key, count: rows.length, hash: sha256Hex(text(rows)).slice(0, BUCKET_HEX) };
    }),
  };
}

/** The records that fall in the given groups, in id order. */
export function placesInBuckets(places: readonly PackPlaceRecord[], keys: ReadonlySet<BucketKey>): PackPlaceRecord[] {
  return places.filter((p) => keys.has(bucketOf(p.id))).sort((a, b) => compareCodeUnits(a.id, b.id));
}

/** Whether two fingerprints are equal in every part. */
export function samePrint(a: PackFingerprint, b: PackFingerprint): boolean {
  return a.count === b.count && a.ids === b.ids && a.all === b.all && a.buckets.every((x, i) => x.count === b.buckets[i]?.count && x.hash === b.buckets[i]?.hash);
}
