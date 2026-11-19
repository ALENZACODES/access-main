/**
 * A place with an id and an optional location. Location follows the same rule as every
 * other detail: without valid provenance it is UNKNOWN, never guessed or defaulted.
 */
import type { PlaceReport } from "./placeSummary";
import { type Provenance, validateProvenance } from "./provenance";

export interface LocationInput {
  readonly lat?: unknown;
  readonly lon?: unknown;
  readonly provenance?: unknown;
}

export interface PlaceRecord extends PlaceReport {
  readonly id: string;
  readonly location?: LocationInput;
}

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export type LocationStatus =
  | { readonly status: "known"; readonly point: GeoPoint; readonly provenance: Provenance }
  | { readonly status: "unknown"; readonly reason: "not-recorded" | "out-of-range" | "missing-provenance" };

const PLACE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isPlaceId(s: unknown): s is string {
  return typeof s === "string" && PLACE_ID.test(s);
}

export function isValidPoint(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" && typeof lon === "number" &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  );
}

export function resolveLocation(input: LocationInput | undefined): LocationStatus {
  if (!input || input.lat === undefined || input.lon === undefined) return { status: "unknown", reason: "not-recorded" };
  if (!isValidPoint(input.lat, input.lon)) return { status: "unknown", reason: "out-of-range" };
  const p = validateProvenance(input.provenance);
  if (!p.ok) return { status: "unknown", reason: "missing-provenance" };
  return { status: "known", point: { lat: input.lat as number, lon: input.lon as number }, provenance: p.value };
}
