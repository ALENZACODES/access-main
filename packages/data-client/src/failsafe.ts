import type { SearchHit, Tranche } from "./types.ts";

/**
 * A generous box around Ontario, the same one the access-maps import uses. It
 * is not a boundary: it only catches values that cannot be an Ontario
 * location, such as swapped latitude and longitude.
 */
export const ONTARIO_ENVELOPE = { minLat: 41, maxLat: 57.5, minLon: -96, maxLon: -73.5 } as const;

const TRANCHES: readonly Tranche[] = ["venue", "washroom", "transit", "path"];
const LAT_KEYS = ["lat", "latitude", "stop_lat"] as const;
const LON_KEYS = ["lon", "longitude", "stop_lon"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}/;

export type DeviceFaultCode = "parse" | "shape" | "provenance" | "source" | "coordinate";
export type DeviceCheck = { ok: true } | { ok: false; code: DeviceFaultCode; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inEnvelope(lat: number, lon: number): boolean {
  return lat >= ONTARIO_ENVELOPE.minLat && lat <= ONTARIO_ENVELOPE.maxLat && lon >= ONTARIO_ENVELOPE.minLon && lon <= ONTARIO_ENVELOPE.maxLon;
}

function validTier(tier: unknown): boolean {
  const value = typeof tier === "string" && /^\d$/.test(tier) ? Number(tier) : tier;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

function known(fields: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const field = fields[key];
    if (isObject(field) && field.value !== "UNKNOWN" && field.value !== undefined) return field.value;
  }
  return undefined;
}

/**
 * Checks one record on the device before it can be shown. A record that fails
 * is dropped and counted; it is never rendered. `sources` is the set of source
 * ids the manifest lists as in the web pack; a field from any other source has
 * no licence the app can show, so its record is dropped too.
 */
export function checkPackRecord(value: unknown, sources?: ReadonlySet<string>): DeviceCheck {
  if (!isObject(value)) return { ok: false, code: "shape", reason: "not an object" };
  if (typeof value.id !== "string" || value.id.trim() === "") return { ok: false, code: "shape", reason: "id is missing" };
  if (typeof value.tranche !== "string" || !TRANCHES.includes(value.tranche as Tranche)) return { ok: false, code: "shape", reason: "tranche is not known" };
  if (typeof value.region !== "string" || value.region.trim() === "") return { ok: false, code: "shape", reason: "region is missing" };
  const fields = value.fields;
  if (!isObject(fields) || Object.keys(fields).length === 0) return { ok: false, code: "shape", reason: "fields are missing" };
  for (const [name, field] of Object.entries(fields)) {
    if (!isObject(field) || !("value" in field)) return { ok: false, code: "provenance", reason: `${name} has no value` };
    if (typeof field.source_id !== "string" || field.source_id.trim() === "") return { ok: false, code: "provenance", reason: `${name} has no source` };
    if (typeof field.licence !== "string" || field.licence.trim() === "") return { ok: false, code: "provenance", reason: `${name} has no licence` };
    if (typeof field.retrieved_at !== "string" || !DATE.test(field.retrieved_at)) return { ok: false, code: "provenance", reason: `${name} has no date` };
    if (!validTier(field.tier)) return { ok: false, code: "provenance", reason: `${name} has an unknown tier` };
    if (sources && !sources.has(field.source_id)) return { ok: false, code: "source", reason: `${name} comes from a source the pack does not list` };
  }
  const lat = known(fields, LAT_KEYS);
  const lon = known(fields, LON_KEYS);
  if (lat !== undefined || lon !== undefined) {
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, code: "coordinate", reason: "coordinates are not both numbers" };
    if (!inEnvelope(lat, lon)) return { ok: false, code: "coordinate", reason: "point is outside Ontario" };
  }
  return { ok: true };
}

/** Same rule for one search index entry. */
export function checkSearchHit(value: unknown): value is SearchHit {
  if (!isObject(value)) return false;
  return typeof value.id === "string" && value.id !== "" && typeof value.nameNorm === "string"
    && typeof value.lat === "number" && typeof value.lon === "number" && Number.isFinite(value.lat) && Number.isFinite(value.lon)
    && inEnvelope(value.lat, value.lon)
    && (value.name === null || typeof value.name === "string")
    && TRANCHES.includes(value.tranche as Tranche);
}
