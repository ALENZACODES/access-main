/** Small geography helpers. No network, no map tiles. */
import type { Locale } from "./stateCopy";
import { type GeoPoint, isValidPoint } from "./placeRecord";
import { NBSP } from "./typography";

const EARTH_RADIUS_M = 6_371_008.8;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m", "1.2 km", "12 km"; French uses a decimal comma and a no-break space. */
export function formatDistance(meters: number, locale: Locale): string {
  const sep = locale === "fr" ? NBSP : " ";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)}${sep}m`;
  const km = meters / 1000;
  const text = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return `${locale === "fr" ? text.replace(".", ",") : text}${sep}km`;
}

/** A `geo:` link opens the person's own maps app; the App contacts no tile server. */
export function geoUri(p: GeoPoint): string {
  return `geo:${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
}

/** Parse "lat,lon" from a query parameter; null when missing or out of range. */
export function parseNear(value: string | null): GeoPoint | null {
  const m = /^(-?\d{1,2}(?:\.\d{1,6})?),(-?\d{1,3}(?:\.\d{1,6})?)$/.exec((value ?? "").trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return isValidPoint(lat, lon) ? { lat, lon } : null;
}
