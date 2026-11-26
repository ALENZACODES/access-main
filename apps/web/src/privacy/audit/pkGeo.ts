// Rules for the places in a pack: where a point is, how exactly, and what kind of building it is.

import { isRecord } from "./pkWalk";

export type PkGeoCode = "pk-geo-missing" | "pk-geo-range" | "pk-geo-outside" | "pk-geo-null-island" | "pk-geo-precision" | "pk-geo-private-kind";

export interface PkGeoProblem {
  code: PkGeoCode;
  detail: string;
}

/** The box the Toronto pack may hold points in: the city and its near surroundings. */
export interface PkBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export const TORONTO_BOX: PkBox = { south: 43.4, north: 44.0, west: -79.8, east: -79.1 };

/** More decimals than this is a point exact to a few centimetres, which a public place does not need. */
export const MAX_DECIMALS = 6;

/** Kinds of place that are somebody's home. The pack lists public places only. */
export const PRIVATE_KINDS: readonly string[] = ["house", "detached", "semidetached_house", "bungalow", "residential", "apartments", "dormitory", "terrace", "cabin", "static_caravan"];

/** The number of digits after the point, as written in the file. */
export function decimalsOf(n: number): number {
  const s = String(n);
  if (/e/i.test(s)) return 99;
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

const inRange = (lat: number, lon: number): boolean => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** What is wrong with the point and the kind of one place record. */
export function checkPlaceGeo(place: unknown, box: PkBox = TORONTO_BOX): PkGeoProblem[] {
  if (!isRecord(place)) return [];
  const out: PkGeoProblem[] = [];
  const { lat, lon, category } = place;
  if (typeof category === "string" && PRIVATE_KINDS.includes(category.toLowerCase())) out.push({ code: "pk-geo-private-kind", detail: `kind ${category}` });
  if (typeof lat !== "number" || typeof lon !== "number") {
    out.push({ code: "pk-geo-missing", detail: "the point is not two numbers" });
    return out;
  }
  if (!inRange(lat, lon)) {
    out.push({ code: "pk-geo-range", detail: `${lat}, ${lon} is not a point on the earth` });
    return out;
  }
  if (lat === 0 && lon === 0) out.push({ code: "pk-geo-null-island", detail: "0, 0 is where a missing point is often written" });
  else if (lat < box.south || lat > box.north || lon < box.west || lon > box.east) out.push({ code: "pk-geo-outside", detail: `${lat}, ${lon} is outside the box of the pack` });
  const d = Math.max(decimalsOf(lat), decimalsOf(lon));
  if (d > MAX_DECIMALS) out.push({ code: "pk-geo-precision", detail: `${d} decimals` });
  return out;
}
