/**
 * Places close together. Places that have a map point are linked when two of them are no further apart
 * than a chosen distance, in a straight line, and every chain of links is one group. A group can
 * therefore be longer than the distance chosen: its span is the largest distance between any two of
 * its places, so a long chain is not mistaken for a tight cluster.
 *
 * This is counting and measuring only. It says nothing about whether a person can get from one place
 * to another, and nothing about how accessible any place is.
 */
import { distanceMetres, type Point } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";

export const NEAR_RADII = [50, 100, 250, 500] as const;
export type NearRadius = (typeof NEAR_RADII)[number];
export const DEFAULT_NEAR_RADIUS: NearRadius = 100;

export const isNearRadius = (value: unknown): value is NearRadius => (NEAR_RADII as readonly unknown[]).includes(value);

/** Metres in one degree of latitude, rounded down: a window of latitude that is never too small. */
const METRES_PER_DEGREE = 111_000;

export interface NearGroup {
  /** 1, 2, 3, … in the order the groups are listed. */
  readonly no: number;
  /** Ids of the places, ordered by name (a place with no name last) and then by id. */
  readonly ids: readonly string[];
  /** Names in the same order. null where the pack has no name. */
  readonly names: readonly (string | null)[];
  /** Largest straight-line distance between any two places of the group, in whole metres. */
  readonly spanMetres: number;
}

export interface NearGroups {
  readonly radius: NearRadius;
  readonly groups: readonly NearGroup[];
  /** Places with a map point that are in no group. */
  readonly aloneIds: readonly string[];
  /** Places with no map point, or a point that is not usable. */
  readonly unlocatedIds: readonly string[];
}

type Located = PackPlaceRecord & { location: Point };

const hasPoint = (p: PackPlaceRecord): p is Located =>
  p.location !== null && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lon) && Math.abs(p.location.lat) <= 90 && Math.abs(p.location.lon) <= 180;

const byName = (a: PackPlaceRecord, b: PackPlaceRecord): number => {
  if (a.name === null !== (b.name === null)) return a.name === null ? 1 : -1;
  const n = (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" });
  return n !== 0 ? n : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

class Sets {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[i] !== root) {
      const next = this.parent[i]!;
      this.parent[i] = root;
      i = next;
    }
    return root;
  }
  join(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/** The largest distance between two of the points, in whole metres. 0 for fewer than two. */
export function spanOf(points: readonly Point[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) max = Math.max(max, distanceMetres(points[i]!, points[j]!));
  }
  return Math.round(max);
}

export function buildNearGroups(places: readonly PackPlaceRecord[], radius: NearRadius = DEFAULT_NEAR_RADIUS): NearGroups {
  const located = places.filter(hasPoint).sort((a, b) => a.location.lat - b.location.lat || (a.id < b.id ? -1 : 1));
  const unlocatedIds = places.filter((p) => !hasPoint(p)).map((p) => p.id).sort();
  const sets = new Sets(located.length);
  const window = radius / METRES_PER_DEGREE;
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      if (located[j]!.location.lat - located[i]!.location.lat > window) break;
      if (distanceMetres(located[i]!.location, located[j]!.location) <= radius) sets.join(i, j);
    }
  }
  const members = new Map<number, Located[]>();
  located.forEach((p, i) => {
    const root = sets.find(i);
    const list = members.get(root);
    if (list) list.push(p);
    else members.set(root, [p]);
  });
  const groups: Omit<NearGroup, "no">[] = [];
  const aloneIds: string[] = [];
  for (const list of members.values()) {
    if (list.length < 2) {
      aloneIds.push(list[0]!.id);
      continue;
    }
    list.sort(byName);
    groups.push({ ids: list.map((p) => p.id), names: list.map((p) => p.name), spanMetres: spanOf(list.map((p) => p.location)) });
  }
  groups.sort((a, b) => b.ids.length - a.ids.length || a.spanMetres - b.spanMetres || a.ids[0]!.localeCompare(b.ids[0]!));
  aloneIds.sort();
  return { radius, groups: groups.map((g, i) => ({ ...g, no: i + 1 })), aloneIds, unlocatedIds };
}

/** Places in groups, for a sum check: groups + alone + unlocated is every place once. */
export const groupedCount = (r: NearGroups): number => r.groups.reduce((n, g) => n + g.ids.length, 0);
