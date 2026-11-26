/**
 * Groups places of the pack that may be the same place. Candidate pairs come from three buckets (same
 * address, same name, same patch of ground) so a large pack is not compared place against place, and a
 * bucket too big to mean anything is skipped and counted, never silently dropped. Groups are made of
 * pairs that pass `isCandidate`; one place can only be in one group. Nothing is merged or removed.
 */
import { DEFAULT_STRICTNESS, addressKeyOf, isCandidate, scorePair, type PairScore, type Strictness } from "./duplicateScore";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";
import { foldPlaceName } from "./placeNameKey";

/** A bucket with more places than this is too common to point at anything (a chain's name, a mall's address). */
export const MAX_BUCKET = 40;
/** Degrees of latitude and longitude per ground cell: about 200 m north to south. */
export const CELL_DEGREES = 0.002;

export interface RepeatPair {
  readonly a: string;
  readonly b: string;
  readonly pair: PairScore;
}

export interface DuplicatePlaceGroup {
  /** The ids, in the pack's order. */
  readonly ids: readonly string[];
  readonly pairs: readonly RepeatPair[];
  /** The best pair score in the group. */
  readonly top: number;
  /** True when two members report different wheelchair tags (unknown does not count as different). */
  readonly tagsDiffer: boolean;
  /** The tags the members report, each once, in the order of the members. */
  readonly tags: readonly WheelchairTag[];
}

export interface DuplicateReport {
  readonly groups: readonly DuplicatePlaceGroup[];
  readonly placesInGroups: number;
  readonly compared: number;
  /** Buckets left out for being bigger than MAX_BUCKET. */
  readonly skippedBuckets: number;
  readonly strictness: Strictness;
}

const cellOf = (p: PackPlaceRecord): [number, number] | null => (p.location === null ? null : [Math.floor(p.location.lat / CELL_DEGREES), Math.floor(p.location.lon / CELL_DEGREES)]);

/** Union-find over indexes. */
class Sets {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r]!;
    let c = i;
    while (this.parent[c] !== r) {
      const next = this.parent[c]!;
      this.parent[c] = r;
      c = next;
    }
    return r;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/** Pairs of indexes (i < j) worth scoring, and how many buckets were too big. */
export function candidatePairs(places: readonly PackPlaceRecord[]): { pairs: [number, number][]; skippedBuckets: number } {
  const buckets = new Map<string, number[]>();
  const add = (key: string, i: number): void => {
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  };
  places.forEach((p, i) => {
    const addr = addressKeyOf(p.address);
    if (addr !== null) add(`a:${addr}`, i);
    const name = p.name === null ? "" : foldPlaceName(p.name);
    if (name !== "") add(`n:${name}`, i);
    const cell = cellOf(p);
    if (cell !== null) add(`c:${cell[0]}:${cell[1]}`, i);
  });
  const seen = new Set<string>();
  const pairs: [number, number][] = [];
  let skipped = 0;
  const take = (list: readonly number[]): void => {
    for (let x = 0; x < list.length; x += 1) {
      for (let y = x + 1; y < list.length; y += 1) {
        const i = list[x]!;
        const j = list[y]!;
        const key = `${i}:${j}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([i, j]);
        }
      }
    }
  };
  for (const [key, list] of buckets) {
    if (key.startsWith("c:")) continue; // ground cells are joined with their neighbours below
    if (list.length > MAX_BUCKET) skipped += 1;
    else take(list);
  }
  // Ground cells: each cell with its east, south-east, south and south-west neighbour, so every neighbouring pair is met once.
  for (const [key, list] of buckets) {
    if (!key.startsWith("c:")) continue;
    const [, r, c] = key.split(":");
    const row = Number(r);
    const col = Number(c);
    if (list.length > MAX_BUCKET) {
      skipped += 1;
      continue;
    }
    take(list);
    for (const [dr, dc] of [[0, 1], [1, -1], [1, 0], [1, 1]] as const) {
      const other = buckets.get(`c:${row + dr}:${col + dc}`);
      if (!other || other.length > MAX_BUCKET) continue;
      for (const i of list) for (const j of other) if (i !== j) {
        const lo = Math.min(i, j);
        const hi = Math.max(i, j);
        const k = `${lo}:${hi}`;
        if (!seen.has(k)) {
          seen.add(k);
          pairs.push([lo, hi]);
        }
      }
    }
  }
  return { pairs, skippedBuckets: skipped };
}

export function findDuplicates(places: readonly PackPlaceRecord[], strictness: Strictness = DEFAULT_STRICTNESS): DuplicateReport {
  const { pairs, skippedBuckets } = candidatePairs(places);
  const sets = new Sets(places.length);
  const kept: { i: number; j: number; pair: PairScore }[] = [];
  for (const [i, j] of pairs) {
    const pair = scorePair(places[i]!, places[j]!);
    if (isCandidate(pair, strictness)) {
      kept.push({ i, j, pair });
      sets.union(i, j);
    }
  }
  const byRoot = new Map<number, { members: Set<number>; pairs: { i: number; j: number; pair: PairScore }[] }>();
  for (const k of kept) {
    const root = sets.find(k.i);
    const g = byRoot.get(root) ?? { members: new Set<number>(), pairs: [] };
    g.members.add(k.i);
    g.members.add(k.j);
    g.pairs.push(k);
    byRoot.set(root, g);
  }
  const built = [...byRoot.values()]
    .map((g) => {
      const members = [...g.members].sort((a, b) => a - b);
      const tags: WheelchairTag[] = [];
      for (const m of members) {
        const tag = places[m]!.tag;
        if (!tags.includes(tag)) tags.push(tag);
      }
      const reported = tags.filter((x) => x !== "unknown");
      const sorted = [...g.pairs].sort((x, y) => y.pair.score - x.pair.score || x.i - y.i || x.j - y.j);
      return {
        ids: members.map((m) => places[m]!.id),
        pairs: sorted.map((p) => ({ a: places[p.i]!.id, b: places[p.j]!.id, pair: p.pair })),
        top: sorted[0]!.pair.score,
        tagsDiffer: reported.length > 1,
        tags,
        first: members[0]!,
      };
    })
    .sort((x, y) => y.top - x.top || x.first - y.first);
  const groups: DuplicatePlaceGroup[] = built.map((g) => ({ ids: g.ids, pairs: g.pairs, top: g.top, tagsDiffer: g.tagsDiffer, tags: g.tags }));
  return { groups, placesInGroups: groups.reduce((n, g) => n + g.ids.length, 0), compared: pairs.length, skippedBuckets, strictness };
}
