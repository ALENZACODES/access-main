/**
 * Positions in a pack that sit far from all the others.
 *
 * A pack covers one area. A record whose position is far from the middle of the rest is often a
 * typing slip in the coordinates (a swapped sign, a dropped digit). It is a prompt for a data
 * owner to look. The App never moves, hides or corrects the record, and a record with no position
 * stays UNKNOWN: it is simply not compared.
 */
import { type Point, distanceMetres } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";

/** Farther than this from the middle of the pack, in kilometres, is listed. */
export const OUTLIER_KM = 50;
/** With fewer located records than this there is no "middle" worth comparing to. */
export const MIN_LOCATED = 3;
export const MAX_OUTLIERS_LISTED = 20;

export interface Outlier {
  readonly id: string;
  /** Whole kilometres from the middle of the pack. */
  readonly km: number;
}

export interface OutlierResult {
  readonly outliers: readonly Outlier[];
  readonly total: number;
  readonly located: number;
  /** The middle used: the median latitude and the median longitude. null when too few records have a position. */
  readonly middle: Point | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function findPositionOutliers(places: readonly PackPlaceRecord[], maxKm: number = OUTLIER_KM): OutlierResult {
  const located = places.filter((p): p is PackPlaceRecord & { location: Point } => p.location !== null);
  if (located.length < MIN_LOCATED) return { outliers: [], total: 0, located: located.length, middle: null };
  const middle: Point = { lat: median(located.map((p) => p.location.lat)), lon: median(located.map((p) => p.location.lon)) };
  const far: Outlier[] = [];
  for (const p of located) {
    const km = distanceMetres(middle, p.location) / 1000;
    if (km > maxKm) far.push({ id: p.id, km: Math.round(km) });
  }
  far.sort((a, b) => b.km - a.km || a.id.localeCompare(b.id));
  return { outliers: far.slice(0, MAX_OUTLIERS_LISTED), total: far.length, located: located.length, middle };
}
