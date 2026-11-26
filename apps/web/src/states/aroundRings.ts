/**
 * How the places around a centre spread over distance bands, and over compass directions.
 *
 * Both are counts of what the pack lists inside the chosen distance. They say nothing about
 * quality: a band with more places is not a better band. A tag with no place in a band is shown as
 * 0, which means "none listed", not "none exist".
 */
import { COMPASS_POINTS, type CompassPoint } from "./aroundBearing";
import type { AroundMember } from "./aroundSearch";
import { BAND_TAG_ORDER } from "./packBands";
import type { WheelchairTag } from "./packPlaces";

export type TagCounts = Readonly<Record<WheelchairTag, number>>;

export function emptyTagCounts(): Record<WheelchairTag, number> {
  return { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };
}

export function countTags(members: readonly Pick<AroundMember, "tag">[]): TagCounts {
  const counts = emptyTagCounts();
  for (const m of members) counts[m.tag] += 1;
  return counts;
}

/** Band edges in metres that are tried, smallest first. */
const EDGES = [50, 100, 250, 500, 1000] as const;

/** The upper edge of each band for a radius: every standard edge below the radius, then the radius itself. */
export function ringEdges(radius: number): readonly number[] {
  if (!Number.isFinite(radius) || radius <= 0) return [];
  const edges = EDGES.filter((e) => e < radius);
  return [...edges, radius];
}

export interface RingRow {
  /** Exclusive-of-lower, inclusive-of-upper: a place at exactly `upTo` metres is in this band. */
  readonly from: number;
  readonly upTo: number;
  readonly count: number;
  readonly byTag: TagCounts;
}

export function ringRows(members: readonly AroundMember[], radius: number): readonly RingRow[] {
  const edges = ringEdges(radius);
  let lower = 0;
  return edges.map((upTo) => {
    // The first band also takes places at distance 0 (the same spot).
    const from = lower;
    const take = members.filter((m) => (from === 0 ? m.metres >= 0 : m.metres > from) && m.metres <= upTo);
    lower = upTo;
    return { from, upTo, count: take.length, byTag: countTags(take) };
  });
}

export interface SectorRow {
  /** null is the row for places at the same spot as the centre. */
  readonly point: CompassPoint | null;
  readonly count: number;
  readonly byTag: TagCounts;
  /** The nearest place in this direction, when there is one. */
  readonly nearest: { readonly id: string; readonly name: string | null; readonly metres: number } | null;
}

export function sectorRows(members: readonly AroundMember[]): readonly SectorRow[] {
  const keys: (CompassPoint | null)[] = [...COMPASS_POINTS, null];
  return keys.map((key) => {
    const inSector = members.filter((m) => m.direction === key);
    let nearest: SectorRow["nearest"] = null;
    for (const m of inSector) if (nearest === null || m.metres < nearest.metres) nearest = { id: m.id, name: m.name, metres: m.metres };
    return { point: key, count: inSector.length, byTag: countTags(inSector), nearest };
  });
}

/** Tag columns, in the order used everywhere else on the page. */
export const AROUND_TAG_COLUMNS: readonly WheelchairTag[] = BAND_TAG_ORDER;

/** The directions that have at least one place, in compass order. */
export function directionsWithPlaces(members: readonly AroundMember[]): readonly CompassPoint[] {
  return COMPASS_POINTS.filter((p) => members.some((m) => m.direction === p));
}
