/**
 * What a pasted fingerprint says about the places saved on this device. A match means the saved
 * records are the same on both devices, as read. A difference means they are not, and the groups
 * that differ narrow down where. Neither says which device's records are better.
 */
import { BUCKET_KEYS, type BucketKey, type PackFingerprint } from "./packFingerprint";

export type CompareKind =
  /** No places on either device. */
  | "both-empty"
  | "same"
  /** The same place ids, but some details differ. */
  | "same-ids-different-details"
  | "different-places";

export interface BucketDiff {
  readonly key: BucketKey;
  readonly here: number;
  readonly there: number;
  readonly differs: boolean;
}

export interface Comparison {
  readonly kind: CompareKind;
  readonly here: number;
  readonly there: number;
  readonly buckets: readonly BucketDiff[];
  readonly differing: readonly BucketKey[];
}

export function comparePrints(here: PackFingerprint, there: PackFingerprint): Comparison {
  const buckets: BucketDiff[] = BUCKET_KEYS.map((key, i) => {
    const a = here.buckets[i]!;
    const b = there.buckets[i]!;
    return { key, here: a.count, there: b.count, differs: a.count !== b.count || a.hash !== b.hash };
  });
  const differing = buckets.filter((b) => b.differs).map((b) => b.key);
  let kind: CompareKind;
  if (here.count === 0 && there.count === 0) kind = "both-empty";
  else if (here.all === there.all && here.count === there.count && differing.length === 0) kind = "same";
  else if (here.ids === there.ids && here.count === there.count) kind = "same-ids-different-details";
  else kind = "different-places";
  return { kind, here: here.count, there: there.count, buckets, differing };
}
