/**
 * Places around one chosen place of the pack.
 *
 * Given a centre place and a distance, this lists the other places whose map point lies within that
 * straight-line distance, each with its distance, compass direction and the wheelchair tag the pack
 * gives it. It is a distance fact, not advice: a place that is near is not thereby reachable, open
 * or suitable. Places with no map point cannot be measured, so they are counted apart, never placed
 * and never guessed. The centre itself is never in its own list, and neither is another record with
 * the same id.
 */
import { type CompassPoint, directionBetween } from "./aroundBearing";
import { distanceMetres } from "./packGeo";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";

export const AROUND_RADII = [100, 250, 500, 1000] as const;
export type AroundRadius = (typeof AROUND_RADII)[number];
export const DEFAULT_AROUND_RADIUS: AroundRadius = 250;

export function isAroundRadius(n: unknown): n is AroundRadius {
  return typeof n === "number" && (AROUND_RADII as readonly number[]).includes(n);
}

export interface AroundMember {
  readonly id: string;
  readonly name: string | null;
  readonly tag: WheelchairTag;
  readonly category: string | null;
  readonly address: string | null;
  readonly metres: number;
  /** null when the place is at the same spot as the centre. */
  readonly direction: CompassPoint | null;
}

export interface AroundCentre {
  readonly id: string;
  readonly name: string | null;
  readonly tag: WheelchairTag;
  readonly address: string | null;
}

export type AroundResult =
  | { readonly status: "no-centre" }
  | { readonly status: "centre-not-found"; readonly id: string }
  | { readonly status: "centre-has-no-point"; readonly centre: AroundCentre; readonly others: number }
  | {
      readonly status: "ok";
      readonly centre: AroundCentre;
      readonly radius: number;
      /** Within the radius, nearest first. */
      readonly members: readonly AroundMember[];
      /** Places with a map point that lie farther away than the radius. */
      readonly beyond: number;
      /** Places with no map point, which cannot be measured. */
      readonly unmeasured: number;
    };

/** Nearest first; equal distances put a named place before an unnamed one, then by name, then by id. */
export function compareAround(a: AroundMember, b: AroundMember): number {
  if (a.metres !== b.metres) return a.metres - b.metres;
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  const byName = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function centreOf(place: PackPlaceRecord): AroundCentre {
  return { id: place.id, name: place.name, tag: place.tag, address: place.address };
}

/** Places that can be the centre: those with a map point, in name order (unnamed last), then id. */
export function centreChoices(places: readonly PackPlaceRecord[]): readonly PackPlaceRecord[] {
  return places
    .filter((p) => p.location !== null)
    .slice()
    .sort((a, b) => {
      if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
      const byName = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export function buildAroundList(places: readonly PackPlaceRecord[], centreId: string | null, radius: number): AroundResult {
  if (centreId === null || centreId === "") return { status: "no-centre" };
  const centre = places.find((p) => p.id === centreId);
  if (centre === undefined) return { status: "centre-not-found", id: centreId };
  if (centre.location === null) return { status: "centre-has-no-point", centre: centreOf(centre), others: places.length - 1 };
  const members: AroundMember[] = [];
  let beyond = 0;
  let unmeasured = 0;
  const seen = new Set<string>([centre.id]);
  for (const p of places) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (p.location === null) {
      unmeasured += 1;
      continue;
    }
    const metres = distanceMetres(centre.location, p.location);
    if (metres > radius) {
      beyond += 1;
      continue;
    }
    members.push({ id: p.id, name: p.name, tag: p.tag, category: p.category, address: p.address, metres, direction: directionBetween(centre.location, p.location, metres) });
  }
  members.sort(compareAround);
  return { status: "ok", centre: centreOf(centre), radius, members, beyond, unmeasured };
}
