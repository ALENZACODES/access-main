/**
 * An outing: the shortlisted places put in a visiting order, with the straight-line distance from
 * each stop to the next.
 *
 * Distances are great-circle lines between two map points. They are not walking or rolling routes,
 * they follow no streets, crossings, slopes or closures, and a real route is longer. A stop with no
 * map point has no distance, and that stays UNKNOWN (null) rather than being guessed. The order is
 * a convenience for the person: nothing here says one order is better for access.
 */
import { distanceMetres, type Point } from "./packGeo";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";

export const OUTING_MODES = ["added", "nearest", "mine"] as const;
export type OutingMode = (typeof OUTING_MODES)[number];

export function isOutingMode(value: unknown): value is OutingMode {
  return typeof value === "string" && (OUTING_MODES as readonly string[]).includes(value);
}

/** What a stop needs from a place: the facts, copied from the pack as it is now. */
export interface OutingInput {
  readonly id: string;
  readonly name: string | null;
  readonly tag: WheelchairTag;
  readonly category: string | null;
  readonly address: string | null;
  readonly point: Point | null;
}

export function inputsFromPlaces(places: readonly PackPlaceRecord[]): OutingInput[] {
  return places.map((p) => ({ id: p.id, name: p.name, tag: p.tag, category: p.category, address: p.address, point: p.location }));
}

export interface Stop extends OutingInput {
  /** 1-based position in the outing. */
  readonly position: number;
  /** Straight-line metres from the previous stop (or from the start for the first stop). null when either end has no point, or for the first stop with no start. */
  readonly legMetres: number | null;
  /** Sum of the known legs up to and including this stop. */
  readonly totalMetres: number;
  /** True when every leg up to this stop is known, so the total is the whole of it and not a part. */
  readonly totalComplete: boolean;
}

export interface Outing {
  readonly stops: readonly Stop[];
  readonly start: Point | null;
  /** Sum of the known legs. A lower bound when `complete` is false. */
  readonly totalMetres: number;
  /** How many legs there are: one between each pair of stops, plus one from the start when there is one. */
  readonly legCount: number;
  readonly legsKnown: number;
  /** Stops with no map point. */
  readonly unlocated: number;
  /** True when every leg is known. An outing with one stop and no start has no legs and is complete. */
  readonly complete: boolean;
}

const byId = (a: OutingInput, b: OutingInput): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Greedy nearest-next order: begin with the located place nearest the start (or, with no start, the
 * first located place in the order given), then always go to the nearest place not yet visited.
 * Ties go to the smaller id so the same input always gives the same order. Places with no map
 * point cannot be placed by distance and come last, in the order given. This is a simple rule, not
 * the shortest possible tour.
 */
export function nearestOrder(inputs: readonly OutingInput[], start: Point | null): string[] {
  const located = inputs.filter((p) => p.point !== null);
  const unlocated = inputs.filter((p) => p.point === null);
  const order: OutingInput[] = [];
  const left = [...located];
  let here: Point | null = start;
  while (left.length > 0) {
    let best = 0;
    if (here !== null) {
      let bestD = Infinity;
      for (let i = 0; i < left.length; i++) {
        const d = distanceMetres(here, left[i]!.point!);
        if (d < bestD || (d === bestD && byId(left[i]!, left[best]!) < 0)) {
          best = i;
          bestD = d;
        }
      }
    }
    const [next] = left.splice(best, 1);
    order.push(next!);
    here = next!.point;
  }
  return [...order, ...unlocated].map((p) => p.id);
}

/**
 * A saved order made to fit the places that are listed now: ids no longer listed are dropped, each
 * id keeps one place, and places added since come at the end in the order they were added.
 */
export function reconcileOrder(saved: readonly string[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of saved) {
    if (wanted.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** The ids in the order the mode gives. "mine" uses the saved order, fitted to the places listed now. */
export function orderFor(mode: OutingMode, inputs: readonly OutingInput[], start: Point | null, mine: readonly string[]): string[] {
  const ids = inputs.map((p) => p.id);
  if (mode === "nearest") return nearestOrder(inputs, start);
  if (mode === "mine") return reconcileOrder(mine, ids);
  return ids;
}

export type MoveResult = { readonly moved: true; readonly order: string[]; readonly position: number } | { readonly moved: false; readonly order: readonly string[]; readonly position: number };

/** Move one place one step earlier (-1) or later (+1). At either end, or for an id not in the order, nothing moves and the same order comes back. */
export function moveStop(order: readonly string[], id: string, step: -1 | 1): MoveResult {
  const at = order.indexOf(id);
  if (at < 0) return { moved: false, order, position: 0 };
  const to = at + step;
  if (to < 0 || to >= order.length) return { moved: false, order, position: at + 1 };
  const next = [...order];
  [next[at], next[to]] = [next[to]!, next[at]!];
  return { moved: true, order: next, position: to + 1 };
}

export function reverseOrder(order: readonly string[]): string[] {
  return [...order].reverse();
}

/** Put the places in the given order, with legs and running totals. Ids not among the inputs are ignored; inputs not in the order go last. */
export function buildOuting(inputs: readonly OutingInput[], order: readonly string[], start: Point | null): Outing {
  const byIdMap = new Map(inputs.map((p) => [p.id, p] as const));
  const ids = reconcileOrder(order, inputs.map((p) => p.id));
  const stops: Stop[] = [];
  let previous: Point | null = start;
  let havePrevious = start !== null;
  let total = 0;
  let complete = true;
  let legsKnown = 0;
  let unlocated = 0;
  ids.forEach((id, i) => {
    const place = byIdMap.get(id)!;
    if (place.point === null) unlocated += 1;
    let leg: number | null = null;
    if (i === 0 && start === null) {
      // The first stop with no start has no leg at all: nothing is missing, so the total stays complete.
    } else if (havePrevious && previous !== null && place.point !== null) {
      leg = distanceMetres(previous, place.point);
      total += leg;
      legsKnown += 1;
    } else {
      complete = false;
    }
    stops.push({ ...place, position: i + 1, legMetres: leg, totalMetres: total, totalComplete: complete });
    previous = place.point;
    havePrevious = true;
  });
  const legCount = Math.max(0, stops.length - (start === null ? 1 : 0));
  return { stops, start, totalMetres: total, legCount, legsKnown, unlocated, complete: legsKnown === legCount };
}
