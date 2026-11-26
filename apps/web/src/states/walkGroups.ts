/**
 * Places that sit close together on the map, grouped by straight-line distance. A place joins a group when it
 * is within the chosen distance of any place already in it, so a row of shops along one street forms one group
 * even when its two ends are further apart than the distance. Nothing here is a route: the real way between
 * two places may be longer, and nothing says whether it can be used with a wheelchair.
 *
 * Places with no map point are left out and counted. A grid of cells the size of the distance keeps the work
 * near linear, so a province-sized list does not compare every place with every other.
 */
import { distanceMetres, type Point } from "./packGeo";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";

export const WALK_DISTANCES_M = [100, 200, 400] as const;
export type WalkDistance = (typeof WALK_DISTANCES_M)[number];
export const DEFAULT_WALK_DISTANCE: WalkDistance = 200;
export const isWalkDistance = (v: unknown): v is WalkDistance => typeof v === "number" && (WALK_DISTANCES_M as readonly number[]).includes(v);

/** Most places grouped in one call. A longer list is cut here and the cut is reported, never silent. */
export const MAX_GROUPED_PLACES = 20_000;
/** Largest group whose width is worked out pair by pair. */
export const MAX_WIDTH_MEMBERS = 400;

export interface WalkLocated {
  readonly place: PackPlaceRecord;
  readonly point: Point;
}

export interface WalkGroup {
  /** Stable for a given list and distance: the id of the group's first place in pack order. */
  readonly id: string;
  readonly members: readonly PackPlaceRecord[];
  /** The distance the group was made with, in metres. */
  readonly distanceM: number;
  /** The mean of the members' points. */
  readonly centre: Point;
  /** The farthest member from the centre, in metres. 0 for a single place. */
  readonly spreadM: number;
  /** The largest distance between any two members, in metres; null for a group of more than MAX_WIDTH_MEMBERS places, where every pair is not worth comparing. */
  readonly widthM: number | null;
  readonly tags: Readonly<Record<WheelchairTag, number>>;
}

export interface WalkGrouping {
  readonly distanceM: number;
  /** Groups of two or more places, in pack order of their first place. */
  readonly groups: readonly WalkGroup[];
  /** Places with no other place within the distance. */
  readonly alone: number;
  readonly withoutPoint: number;
  /** Places left out because the list was longer than MAX_GROUPED_PLACES. */
  readonly leftOut: number;
}

const emptyTags = (): Record<WheelchairTag, number> => ({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 });

/** The places that have a map point, in pack order. */
export function locatedPlaces(places: readonly PackPlaceRecord[]): WalkLocated[] {
  const out: WalkLocated[] = [];
  for (const p of places) if (p.location !== null) out.push({ place: p, point: p.location });
  return out;
}

class Sets {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    let cur = i;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur]!;
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }
  join(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    // The lower index stays the root, so a group is named by its first place in pack order.
    if (ra < rb) this.parent[rb] = ra;
    else if (rb < ra) this.parent[ra] = rb;
  }
}

const METRES_PER_DEGREE_LAT = 111_195;

/** Cell keys: latitude rows are `distance` metres tall; longitude columns are as wide at the list's mean latitude. */
function cellOf(p: Point, cellLat: number, cellLon: number): [number, number] {
  return [Math.floor(p.lat / cellLat), Math.floor(p.lon / cellLon)];
}

/** Centre of a set of points. Longitudes are averaged around the first so a group across ±180 is not torn apart. */
export function walkGroupCentre(points: readonly Point[]): Point {
  if (points.length === 0) return { lat: 0, lon: 0 };
  const base = points[0]!.lon;
  let lat = 0;
  let lon = 0;
  for (const p of points) {
    lat += p.lat;
    let d = p.lon - base;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    lon += d;
  }
  let c = base + lon / points.length;
  if (c > 180) c -= 360;
  if (c < -180) c += 360;
  return { lat: lat / points.length, lon: c };
}

/** Group places that are within `distanceM` metres of each other, straight line, joined end to end. */
export function groupPlaces(places: readonly PackPlaceRecord[], distanceM: number = DEFAULT_WALK_DISTANCE): WalkGrouping {
  const all = locatedPlaces(places);
  const withoutPoint = places.length - all.length;
  const leftOut = Math.max(0, all.length - MAX_GROUPED_PLACES);
  const items = leftOut > 0 ? all.slice(0, MAX_GROUPED_PLACES) : all;
  if (!(distanceM > 0) || items.length === 0) return { distanceM, groups: [], alone: items.length, withoutPoint, leftOut };

  const meanLat = items.reduce((s, i) => s + i.point.lat, 0) / items.length;
  const cellLat = distanceM / METRES_PER_DEGREE_LAT;
  // Near the poles a degree of longitude is short; cap the width so the cell never collapses to nothing.
  const cellLon = distanceM / (METRES_PER_DEGREE_LAT * Math.max(0.05, Math.cos((meanLat * Math.PI) / 180)));

  const cells = new Map<string, number[]>();
  items.forEach((it, i) => {
    const [r, c] = cellOf(it.point, cellLat, cellLon);
    const key = `${r}:${c}`;
    const list = cells.get(key);
    if (list) list.push(i);
    else cells.set(key, [i]);
  });

  const sets = new Sets(items.length);
  items.forEach((it, i) => {
    const [r, c] = cellOf(it.point, cellLat, cellLon);
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const near = cells.get(`${r + dr}:${c + dc}`);
        if (!near) continue;
        for (const j of near) {
          if (j <= i) continue;
          if (sets.find(i) === sets.find(j)) continue;
          if (distanceMetres(it.point, items[j]!.point) <= distanceM) sets.join(i, j);
        }
      }
    }
  });

  const byRoot = new Map<number, number[]>();
  items.forEach((_, i) => {
    const root = sets.find(i);
    const list = byRoot.get(root);
    if (list) list.push(i);
    else byRoot.set(root, [i]);
  });

  const groups: WalkGroup[] = [];
  let alone = 0;
  for (const idx of [...byRoot.keys()].sort((a, b) => a - b)) {
    const members = byRoot.get(idx)!;
    if (members.length < 2) {
      alone += 1;
      continue;
    }
    groups.push(buildGroup(members.map((i) => items[i]!), distanceM));
  }
  return { distanceM, groups, alone, withoutPoint, leftOut };
}

function buildGroup(members: readonly WalkLocated[], distanceM: number): WalkGroup {
  const points = members.map((m) => m.point);
  const centre = walkGroupCentre(points);
  let spreadM = 0;
  let widthM: number | null = points.length <= MAX_WIDTH_MEMBERS ? 0 : null;
  for (let i = 0; i < points.length; i += 1) {
    spreadM = Math.max(spreadM, distanceMetres(centre, points[i]!));
    if (widthM === null) continue;
    for (let j = i + 1; j < points.length; j += 1) widthM = Math.max(widthM, distanceMetres(points[i]!, points[j]!));
  }
  const tags = emptyTags();
  for (const m of members) tags[m.place.tag] += 1;
  return { id: members[0]!.place.id, members: members.map((m) => m.place), distanceM, centre, spreadM: Math.round(spreadM), widthM: widthM === null ? null : Math.round(widthM), tags };
}
