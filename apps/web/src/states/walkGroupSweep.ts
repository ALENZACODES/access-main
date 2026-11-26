/**
 * How the chosen distance changes the groups: the same list grouped at each distance on offer, side by side.
 * Also the smallest distance on offer at which any group forms, so an empty result can say what would change it.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { groupStats, type WalkGroupStats } from "./walkGroupStats";
import { WALK_DISTANCES_M, groupPlaces, type WalkDistance } from "./walkGroups";

export interface SweepRow extends WalkGroupStats {
  readonly distanceM: WalkDistance;
}

export function sweepDistances(places: readonly PackPlaceRecord[], distances: readonly WalkDistance[] = WALK_DISTANCES_M): SweepRow[] {
  return distances.map((d) => ({ distanceM: d, ...groupStats(groupPlaces(places, d)) }));
}

/** The smallest offered distance at which at least one group forms, or null when none does at any of them. */
export function smallestGroupingDistance(rows: readonly SweepRow[]): WalkDistance | null {
  let best: WalkDistance | null = null;
  for (const r of rows) if (r.groups > 0 && (best === null || r.distanceM < best)) best = r.distanceM;
  return best;
}

/** What a longer distance changes, in numbers: groups gained or lost and places grouped, from one row to the next. */
export interface SweepStep {
  readonly from: WalkDistance;
  readonly to: WalkDistance;
  readonly groupsDelta: number;
  readonly groupedDelta: number;
}

export function sweepSteps(rows: readonly SweepRow[]): SweepStep[] {
  const sorted = [...rows].sort((a, b) => a.distanceM - b.distanceM);
  const out: SweepStep[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    out.push({ from: a.distanceM, to: b.distanceM, groupsDelta: b.groups - a.groups, groupedDelta: b.grouped - a.grouped });
  }
  return out;
}
