/**
 * Distance helpers for the pack places list. A typed point is used only to
 * sort the list; nothing here stores or sends it.
 */
import type { Locale } from "./stateCopy";
import { NBSP } from "./typography";

export interface Point {
  readonly lat: number;
  readonly lon: number;
}

export type PointInput =
  | { readonly status: "none" }
  | { readonly status: "invalid" }
  | { readonly status: "ok"; readonly point: Point };

const EARTH_RADIUS_M = 6_371_008.8;

export function isPoint(p: unknown): p is Point {
  if (typeof p !== "object" || p === null) return false;
  const { lat, lon } = p as Record<string, unknown>;
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** Great-circle distance in metres (haversine). */
export function distanceMetres(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** One coordinate typed by a person: a decimal point or comma, optional sign, nothing else. */
export function parseCoordinate(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (!/^[+-]?\d{1,3}(\.\d{1,8})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Two empty fields mean no point; one empty or any bad field is invalid, never guessed. */
export function parsePointInput(latText: string, lonText: string): PointInput {
  if (latText.trim() === "" && lonText.trim() === "") return { status: "none" };
  const lat = parseCoordinate(latText);
  const lon = parseCoordinate(lonText);
  const point = lat === null || lon === null ? null : { lat, lon };
  return point && isPoint(point) ? { status: "ok", point } : { status: "invalid" };
}

/** "120 m", "1.2 km" (French: "1,2 km", with a no-break space before the unit). */
export function formatPackDistance(metres: number, locale: Locale): string {
  if (!Number.isFinite(metres) || metres < 0) return "";
  if (metres < 1000) {
    const m = metres < 100 ? Math.round(metres) : Math.round(metres / 10) * 10;
    return `${m}${NBSP}m`;
  }
  const km = metres < 10_000 ? (Math.round(metres / 100) / 10).toFixed(1) : String(Math.round(metres / 1000));
  return `${locale === "fr" ? km.replace(".", ",") : km}${NBSP}km`;
}
