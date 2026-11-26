/**
 * For each place with a map point, the one other place that is nearest to it in a straight line,
 * how many places have a neighbour within each distance, and the middle of a group of places.
 * Counting and measuring only. A neighbour is "nearest" by straight line, not by a way to get there.
 */
import { NEAR_RADII, type NearRadius } from "./nearGroup";
import { type Compass, bearingDegrees, compassOf } from "./textMap";
import { distanceMetres, type Point } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";

const METRES_PER_DEGREE = 111_000;
/** Closer than this, two places are at the same spot and no direction is given. */
const SAME_SPOT_METRES = 5;

export interface NeighbourRow {
  readonly id: string;
  readonly name: string | null;
  readonly nearestId: string;
  readonly nearestName: string | null;
  /** Straight-line distance to that place, in whole metres. */
  readonly metres: number;
  /** Which way the neighbour lies from this place. null when they are at the same spot. */
  readonly compass: Compass | null;
}

export interface NeighbourCount {
  readonly radius: NearRadius;
  /** Places that have another place within the radius. */
  readonly count: number;
}

export interface Neighbours {
  readonly rows: readonly NeighbourRow[];
  readonly counts: readonly NeighbourCount[];
  /** Places with a usable map point. */
  readonly located: number;
  /** Places with no usable map point, so no neighbour can be given. */
  readonly unlocatedIds: readonly string[];
}

type Located = PackPlaceRecord & { location: Point };
const usable = (p: PackPlaceRecord): p is Located =>
  p.location !== null && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lon) && Math.abs(p.location.lat) <= 90 && Math.abs(p.location.lon) <= 180;

const byIdText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byNameThenId = (a: { name: string | null; id: string }, b: { name: string | null; id: string }): number => {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  const n = (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" });
  return n !== 0 ? n : byIdText(a.id, b.id);
};

/** Nearest other place for each located place. Looks only at places whose latitude is close enough to matter. */
export function buildNeighbours(places: readonly PackPlaceRecord[]): Neighbours {
  const located = places.filter(usable).sort((a, b) => a.location.lat - b.location.lat || byIdText(a.id, b.id));
  const unlocatedIds = places.filter((p) => !usable(p)).map((p) => p.id).sort();
  const rows: NeighbourRow[] = [];
  if (located.length >= 2) {
    for (let i = 0; i < located.length; i++) {
      const me = located[i]!;
      let best: Located | null = null;
      let bestM = Number.POSITIVE_INFINITY;
      const consider = (o: Located): void => {
        const d = distanceMetres(me.location, o.location);
        if (d < bestM || (d === bestM && best !== null && byIdText(o.id, best.id) < 0)) {
          best = o;
          bestM = d;
        }
      };
      for (let j = i + 1; j < located.length; j++) {
        if ((located[j]!.location.lat - me.location.lat) * METRES_PER_DEGREE > bestM) break;
        consider(located[j]!);
      }
      for (let j = i - 1; j >= 0; j--) {
        if ((me.location.lat - located[j]!.location.lat) * METRES_PER_DEGREE > bestM) break;
        consider(located[j]!);
      }
      const near = best as Located | null;
      if (near === null) continue;
      rows.push({
        id: me.id,
        name: me.name,
        nearestId: near.id,
        nearestName: near.name,
        metres: Math.round(bestM),
        compass: bestM < SAME_SPOT_METRES ? null : compassOf(bearingDegrees(me.location, near.location)),
      });
    }
  }
  rows.sort((a, b) => a.metres - b.metres || byNameThenId({ name: a.name, id: a.id }, { name: b.name, id: b.id }));
  const counts = NEAR_RADII.map((radius) => ({ radius, count: rows.filter((r) => r.metres <= radius).length }));
  return { rows, counts, located: located.length, unlocatedIds };
}

/**
 * The middle of some places: the average of their latitudes and of their longitudes, to five decimals
 * (about a metre). It is a point to start from, not a place, and it may not be on any street.
 * null when none has a usable map point.
 */
export function groupMiddle(places: readonly PackPlaceRecord[]): Point | null {
  const pts = places.filter(usable).map((p) => p.location);
  if (pts.length === 0) return null;
  const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;
  return { lat: round5(mean(pts.map((p) => p.lat))), lon: round5(mean(pts.map((p) => p.lon))) };
}
