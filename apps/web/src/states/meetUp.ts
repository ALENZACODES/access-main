/**
 * Places for two people to meet. Each person gives a point; every listed place with a map point is
 * measured from both in a straight line, and the places are ordered by one of four rules:
 *
 *  - balanced: the smallest of the two distances' larger one (nobody is much further than the other needs to be)
 *  - total:    the smallest sum of the two distances
 *  - a:        nearest to the first point
 *  - b:        nearest to the second point
 *
 * It is measuring and ordering only. A straight line is not a route, a short distance is not a step-free
 * way, and an order is not a recommendation. A place with no map point is counted and never placed.
 */
import { type Point, distanceMetres, isPoint } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";

export const MEET_UP_ORDERS = ["balanced", "total", "a", "b"] as const;
export type MeetUpOrder = (typeof MEET_UP_ORDERS)[number];
export const DEFAULT_MEET_UP_ORDER: MeetUpOrder = "balanced";
export const isMeetUpOrder = (v: unknown): v is MeetUpOrder => typeof v === "string" && (MEET_UP_ORDERS as readonly string[]).includes(v);

/** How many places the page lists. The files hold every place. */
export const MEET_UP_LIMITS = [5, 10, 25] as const;
export type MeetUpLimit = (typeof MEET_UP_LIMITS)[number];
export const DEFAULT_MEET_UP_LIMIT: MeetUpLimit = 10;
export const isMeetUpLimit = (v: unknown): v is MeetUpLimit => (MEET_UP_LIMITS as readonly unknown[]).includes(v);

export type Nearer = "a" | "b" | "same";

export interface MeetUpRow {
  /** 1, 2, 3, … in the order chosen. */
  readonly position: number;
  readonly id: string;
  readonly name: string | null;
  /** Straight-line distances in whole metres. */
  readonly metresA: number;
  readonly metresB: number;
  /** The larger of the two distances, and their sum. */
  readonly longer: number;
  readonly total: number;
  /** How much further one point is than the other, in whole metres. */
  readonly gap: number;
  /** Which point the place is nearer to; "same" when the two whole-metre distances are equal. */
  readonly nearer: Nearer;
}

export interface MeetUpResult {
  readonly order: MeetUpOrder;
  /** Every placed place, in the chosen order. */
  readonly rows: readonly MeetUpRow[];
  /** Places with no usable map point, by id. */
  readonly unlocatedIds: readonly string[];
  /** The two points are this far apart in a straight line, in whole metres. */
  readonly apartMetres: number;
  /** The point halfway between the two, to five decimals. */
  readonly middle: Point;
}

type Located = PackPlaceRecord & { location: Point };
const usable = (p: PackPlaceRecord): p is Located => p.location !== null && isPoint(p.location);

const compareName = (a: { name: string | null; id: string }, b: { name: string | null; id: string }): number => {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  const n = (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" });
  return n !== 0 ? n : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const KEY: Record<MeetUpOrder, (r: Omit<MeetUpRow, "position">) => readonly number[]> = {
  balanced: (r) => [r.longer, r.total],
  total: (r) => [r.total, r.longer],
  a: (r) => [r.metresA, r.metresB],
  b: (r) => [r.metresB, r.metresA],
};

/** The point halfway along the straight line between two points. Rounded to five decimals, about a metre. */
export function halfway(a: Point, b: Point): Point {
  const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;
  // Across the date line the plain average would land on the wrong side of the world.
  const dLon = b.lon - a.lon;
  const lon = Math.abs(dLon) > 180 ? (a.lon + b.lon + (a.lon + b.lon > 0 ? -360 : 360)) / 2 : (a.lon + b.lon) / 2;
  return { lat: round5((a.lat + b.lat) / 2), lon: round5(lon) };
}

/** Measure every placed place from both points and put them in the chosen order. Never changes its input. */
export function buildMeetUp(places: readonly PackPlaceRecord[], a: Point, b: Point, order: MeetUpOrder = DEFAULT_MEET_UP_ORDER): MeetUpResult {
  const measured = places.filter(usable).map((p) => {
    const metresA = Math.round(distanceMetres(a, p.location));
    const metresB = Math.round(distanceMetres(b, p.location));
    return { id: p.id, name: p.name, metresA, metresB, longer: Math.max(metresA, metresB), total: metresA + metresB, gap: Math.abs(metresA - metresB), nearer: (metresA === metresB ? "same" : metresA < metresB ? "a" : "b") as Nearer };
  });
  const key = KEY[order];
  measured.sort((x, y) => {
    const kx = key(x);
    const ky = key(y);
    for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i]! - ky[i]!;
    return compareName(x, y);
  });
  return {
    order,
    rows: measured.map((m, i) => ({ position: i + 1, ...m })),
    unlocatedIds: places.filter((p) => !usable(p)).map((p) => p.id).sort(),
    apartMetres: Math.round(distanceMetres(a, b)),
    middle: halfway(a, b),
  };
}

/** The rows the page lists: the first `limit`, and whether more were left out. */
export function meetUpPage(result: MeetUpResult, limit: number = DEFAULT_MEET_UP_LIMIT): { rows: readonly MeetUpRow[]; more: number } {
  const cap = Math.max(0, Math.floor(limit));
  return { rows: result.rows.slice(0, cap), more: Math.max(0, result.rows.length - cap) };
}
