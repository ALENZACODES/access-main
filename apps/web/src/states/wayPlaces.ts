/**
 * Places along a straight line. A person types two map points, and up to MAX_VIA points in
 * between; every place on screen with a map point is measured against the straight lines joining
 * them: how far along the path its nearest point is, and how far off the path the place is. Places within the chosen width are listed in
 * order from the first point. The band has rounded ends: a place just before the first point or
 * just past the second counts when it is within the width of that point.
 *
 * It is measuring only. A straight line is not a route: it does not follow streets, and a place
 * near the line is not on a step-free way. A place with no map point is counted, never placed.
 *
 * Distances use a flat projection around the middle of the line. For lines up to
 * MAX_WAY_METRES long, the error is well under one percent of the distances shown.
 */
import { type Point, distanceMetres, isPoint } from "./packGeo";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";
import { TAG_FILTERS, type TagFilter } from "./packPlacesView";

/** Half-widths of the band, in metres: a place this far from the line or nearer is listed. */
export const WAY_WIDTHS = [100, 250, 500, 1000] as const;
export type WayWidth = (typeof WAY_WIDTHS)[number];
export const DEFAULT_WAY_WIDTH: WayWidth = 250;
export const isWayWidth = (v: unknown): v is WayWidth => (WAY_WIDTHS as readonly unknown[]).includes(v);

/** How many places the page lists. The files hold every place in the band. */
export const WAY_LIMITS = [10, 25, 50] as const;
export type WayLimit = (typeof WAY_LIMITS)[number];
export const DEFAULT_WAY_LIMIT: WayLimit = 25;
export const isWayLimit = (v: unknown): v is WayLimit => (WAY_LIMITS as readonly unknown[]).includes(v);

export const WAY_TAG_FILTERS: readonly TagFilter[] = TAG_FILTERS;
export const isWayTagFilter = (v: unknown): v is TagFilter => typeof v === "string" && (WAY_TAG_FILTERS as readonly string[]).includes(v);

/** Points in between the first and the second, at most. */
export const MAX_VIA = 3;

/** Two points closer than this are treated as one point: there is no line to follow. */
export const MIN_WAY_METRES = 20;
/** Longer paths (all parts together) are refused: a straight line that long says little about a trip, and the flat projection would drift. */
export const MAX_WAY_METRES = 50_000;

/** Where the nearest point of the line is: before the first point, on the line, or past the second point. */
export type WaySide = "start" | "line" | "end";

export interface WayRow {
  /** 1, 2, 3, … in order from the first point. */
  readonly position: number;
  readonly id: string;
  readonly name: string | null;
  readonly tag: WheelchairTag;
  /** Whole metres from the first point to the nearest point of the line. */
  readonly along: number;
  /** Whole metres from the place to the line. */
  readonly off: number;
  readonly side: WaySide;
  /** Which part of the path the place is nearest: 1 for the first part. */
  readonly leg: number;
}

export interface WayStretch {
  /** Whole metres along the line where the stretch starts and ends. */
  readonly from: number;
  readonly to: number;
}

export type WayProblem = "same-point" | "too-long";

export type WayResult =
  | {
      readonly ok: true;
      /** Whole metres along the whole path, from the first point to the last. */
      readonly length: number;
      /** Whole metres of each part of the path, in order. One part when there is no point in between. */
      readonly legs: readonly number[];
      readonly width: WayWidth;
      /** Every place in the band, in order from the first point. */
      readonly rows: readonly WayRow[];
      /** Places with a map point that are outside the band. */
      readonly outside: number;
      /** Places with no usable map point, by id. */
      readonly unlocatedIds: readonly string[];
    }
  | { readonly ok: false; readonly problem: WayProblem; readonly length: number };

type Located = PackPlaceRecord & { location: Point };
const usable = (p: PackPlaceRecord): p is Located => p.location !== null && isPoint(p.location);

const METRES_PER_DEGREE = (Math.PI / 180) * 6_371_008.8;

/** Longitude difference in -180..180, so a line across the date line is measured the short way. */
function lonDelta(from: number, to: number): number {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** A flat map around `origin` in metres: x east, y north. */
function projector(origin: Point): (p: Point) => { x: number; y: number } {
  const k = Math.cos((origin.lat * Math.PI) / 180) * METRES_PER_DEGREE;
  return (p) => ({ x: lonDelta(origin.lon, p.lon) * k, y: (p.lat - origin.lat) * METRES_PER_DEGREE });
}

/** The middle of the line, the short way round. */
function middle(a: Point, b: Point): Point {
  const lon = a.lon + lonDelta(a.lon, b.lon) / 2;
  return { lat: (a.lat + b.lat) / 2, lon: lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon };
}

export interface WayMeasure {
  /** Metres from the first point to the nearest point of the line, from 0 to the line's length. */
  readonly along: number;
  /** Metres from the place to that nearest point. */
  readonly off: number;
  readonly side: WaySide;
}

/** Where a point lies against the line from `a` to `b`. Not rounded. */
export function measureAgainst(a: Point, b: Point, p: Point): WayMeasure {
  const flat = projector(middle(a, b));
  const fa = flat(a);
  const fb = flat(b);
  const fp = flat(p);
  const dx = fb.x - fa.x;
  const dy = fb.y - fa.y;
  const len2 = dx * dx + dy * dy;
  const raw = len2 === 0 ? 0 : ((fp.x - fa.x) * dx + (fp.y - fa.y) * dy) / len2;
  const t = Math.min(1, Math.max(0, raw));
  const nx = fa.x + t * dx;
  const ny = fa.y + t * dy;
  return { along: t * Math.sqrt(len2), off: Math.hypot(fp.x - nx, fp.y - ny), side: raw < 0 ? "start" : raw > 1 ? "end" : "line" };
}

const compareName = (a: { name: string | null; id: string }, b: { name: string | null; id: string }): number => {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  const n = (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" });
  return n !== 0 ? n : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Measure every placed place against the line and keep those within `width`. Never changes its input. */
export function buildWay(places: readonly PackPlaceRecord[], a: Point, b: Point, width: WayWidth = DEFAULT_WAY_WIDTH): WayResult {
  return buildPath(places, [a, b], width);
}

const TIE_METRES = 0.5;

/**
 * Where a point lies against a path of straight parts: the part it is nearest (the first one on a
 * tie), how far along the whole path, and how far off. Before the first point and past the last are
 * the only places a point can be off the ends; at an inner corner it is measured from the corner.
 */
export function measureAlongPath(points: readonly Point[], p: Point): WayMeasure & { leg: number } {
  let best: (WayMeasure & { leg: number }) | undefined;
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const m = measureAgainst(a, b, p);
    const side: WaySide = m.side === "start" && i > 1 ? "line" : m.side === "end" && i < points.length - 1 ? "line" : m.side;
    // Each part is measured on its own flat map, so equal distances can differ by a hair: within half a metre is a tie, and a tie goes to the earlier part.
    if (!best || m.off < best.off - TIE_METRES) best = { along: start + m.along, off: m.off, side, leg: i };
    start += distanceMetres(a, b);
  }
  return best ?? { along: 0, off: points[0] ? distanceMetres(points[0], p) : 0, side: "start", leg: 1 };
}

/**
 * Measure every placed place against a path of two to MAX_VIA + 2 points and keep those within
 * `width`, in order along the path. A path with two points in a row at the same place, or longer
 * than MAX_WAY_METRES in all, is refused. Never changes its input.
 */
export function buildPath(places: readonly PackPlaceRecord[], points: readonly Point[], width: WayWidth = DEFAULT_WAY_WIDTH): WayResult {
  if (points.length < 2 || points.length > MAX_VIA + 2) throw new RangeError(`a path has 2 to ${MAX_VIA + 2} points`);
  const legs = points.slice(1).map((b, i) => distanceMetres(points[i]!, b));
  const length = Math.round(legs.reduce((sum, x) => sum + x, 0));
  if (legs.some((x) => x < MIN_WAY_METRES)) return { ok: false, problem: "same-point", length };
  if (length > MAX_WAY_METRES) return { ok: false, problem: "too-long", length };
  const located = places.filter(usable);
  const measured = located.map((p) => {
    const m = measureAlongPath(points, p.location);
    return { id: p.id, name: p.name, tag: p.tag, along: Math.min(length, Math.round(m.along)), off: Math.round(m.off), side: m.side, leg: m.leg };
  });
  const inside = measured.filter((m) => m.off <= width);
  inside.sort((x, y) => x.along - y.along || x.off - y.off || compareName(x, y));
  return {
    ok: true,
    length,
    legs: legs.map((x) => Math.round(x)),
    width,
    rows: inside.map((m, i) => ({ position: i + 1, ...m })),
    outside: located.length - inside.length,
    unlocatedIds: places.filter((p) => !usable(p)).map((p) => p.id).sort(),
  };
}

/** The rows with a tag filter applied, numbered again from 1 so the positions match what is shown. */
export function filterWay(rows: readonly WayRow[], tag: TagFilter): readonly WayRow[] {
  const kept = tag === "any" ? rows : rows.filter((r) => r.tag === tag);
  return kept.map((r, i) => (r.position === i + 1 ? r : { ...r, position: i + 1 }));
}

/** How many rows have each tag, for the filter's labels. */
export function countWayTags(rows: readonly WayRow[]): Readonly<Record<TagFilter, number>> {
  const out: Record<TagFilter, number> = { any: rows.length, yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };
  for (const r of rows) out[r.tag] += 1;
  return out;
}

/**
 * The longest part of the line with no listed place near it, measured between the points along
 * the line where places sit (and the two ends). Undefined for a line with no gap at all. It says
 * where the list has nothing, not that there is nothing there.
 */
export function longestStretch(rows: readonly WayRow[], length: number): WayStretch | undefined {
  const marks = [0, ...rows.map((r) => r.along).sort((x, y) => x - y), length];
  let best: WayStretch | undefined;
  for (let i = 1; i < marks.length; i++) {
    const from = marks[i - 1]!;
    const to = marks[i]!;
    if (to > from && (!best || to - from > best.to - best.from)) best = { from, to };
  }
  return best;
}

/**
 * Every part of the path at least `min` metres long with no listed place near it, in order along
 * the path. Like longestStretch, it says where the list has nothing, not that nothing is there.
 */
export function stretchesOver(rows: readonly WayRow[], length: number, min: number): readonly WayStretch[] {
  const marks = [0, ...rows.map((r) => r.along).sort((x, y) => x - y), length];
  const out: WayStretch[] = [];
  for (let i = 1; i < marks.length; i++) if (marks[i]! - marks[i - 1]! >= min && marks[i]! > marks[i - 1]!) out.push({ from: marks[i - 1]!, to: marks[i]! });
  return out;
}

/** Places offered in the "use a place on screen" list, at most; the rest are counted. */
export const MAX_POINT_CHOICES = 200;

export interface PointChoice {
  readonly id: string;
  readonly name: string | null;
  readonly point: Point;
}

/** Places with a map point that can fill in a point, by name (no name last), then id. */
export function pointChoices(places: readonly PackPlaceRecord[], max: number = MAX_POINT_CHOICES): { choices: readonly PointChoice[]; more: number } {
  const all = places
    .filter(usable)
    .map((p) => ({ id: p.id, name: p.name, point: p.location }))
    .sort(compareName);
  return { choices: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** The rows the page lists: the first `limit`, and how many were left out. */
export function wayPage(rows: readonly WayRow[], limit: number = DEFAULT_WAY_LIMIT): { rows: readonly WayRow[]; more: number } {
  const cap = Math.max(0, Math.floor(limit));
  return { rows: rows.slice(0, cap), more: Math.max(0, rows.length - cap) };
}

/** The same path the other way: the last point becomes the first. Positions along the path are measured from it. */
export function reverseWay(places: readonly PackPlaceRecord[], points: readonly Point[], width: WayWidth = DEFAULT_WAY_WIDTH): WayResult {
  return buildPath(places, [...points].reverse(), width);
}
