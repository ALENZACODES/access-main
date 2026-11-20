/**
 * Compass direction from one map point to another, for "which way is it from here" lines.
 *
 * Direction is a straight-line fact between two points on the map. It is not a route and not a
 * walking direction: a street may not run that way. Eight points are used (a sector is 45 degrees
 * wide, centred on the point), so a direction is never given more precision than a map point has.
 */
import type { Point } from "./packGeo";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** Two points closer than this are the same spot: no direction is given. */
export const SAME_SPOT_METRES = 1;

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Initial great-circle bearing from `from` to `to`, in degrees clockwise from north: 0 up to but not including 360. */
export function bearingDegrees(from: Point, to: Point): number {
  const dLon = rad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(rad(to.lat));
  const x = Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) - Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(dLon);
  const b = (deg(Math.atan2(y, x)) + 360) % 360;
  return b >= 360 ? 0 : b;
}

/** The compass point a bearing falls in. Any finite number is accepted and wrapped; anything else is null. */
export function compassPoint(bearing: number): CompassPoint | null {
  if (!Number.isFinite(bearing)) return null;
  const wrapped = ((bearing % 360) + 360) % 360;
  return COMPASS_POINTS[Math.floor((wrapped + 22.5) / 45) % 8] ?? null;
}

/** The direction from `from` to `to`, or null when they are the same spot (or a point is not usable). */
export function directionBetween(from: Point, to: Point, metres: number): CompassPoint | null {
  if (!Number.isFinite(metres) || metres < SAME_SPOT_METRES) return null;
  return compassPoint(bearingDegrees(from, to));
}

/** The opposite point: the direction back. */
export function oppositePoint(p: CompassPoint): CompassPoint {
  return COMPASS_POINTS[(COMPASS_POINTS.indexOf(p) + 4) % 8]!;
}

const WORDS: Readonly<Record<CompassPoint, readonly [string, string]>> = {
  N: ["north", "nord"],
  NE: ["north-east", "nord-est"],
  E: ["east", "est"],
  SE: ["south-east", "sud-est"],
  S: ["south", "sud"],
  SW: ["south-west", "sud-ouest"],
  W: ["west", "ouest"],
  NW: ["north-west", "nord-ouest"],
};

/** French abbreviations use O for ouest, not W. */
const SHORT_FR: Readonly<Record<CompassPoint, string>> = { N: "N", NE: "NE", E: "E", SE: "SE", S: "S", SW: "SO", W: "O", NW: "NO" };

export function compassWord(p: CompassPoint, locale: Locale): string {
  const [en, fr] = WORDS[p];
  return t(locale, en, fr);
}

export function compassShort(p: CompassPoint, locale: Locale): string {
  return locale === "fr" ? SHORT_FR[p] : p;
}

/** "to the north-east", "au nord-est": the direction as a phrase. French says "à l’est" and "à l’ouest", not "au est". */
export function compassFrom(p: CompassPoint | null, locale: Locale): string {
  if (p === null) return t(locale, "at the same spot", "au même point");
  const w = compassWord(p, locale);
  if (locale !== "fr") return `to the ${w}`;
  return p === "E" || p === "W" ? `à l’${w}` : `au ${w}`;
}
