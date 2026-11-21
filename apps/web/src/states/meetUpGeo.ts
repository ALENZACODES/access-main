/** The two points and the measured places as GeoJSON, for a map program. Made on this device. */
import { OSM_CREDIT } from "./dataCredits";
import type { MeetUpResult } from "./meetUp";
import { type MeetUpPaces, meetUpMinutes } from "./meetUpTime";
import { UNKNOWN_TOKEN } from "./packExport";
import type { Point } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";

export const MEET_UP_GEOJSON_FILENAMES: Readonly<Record<Locale, string>> = { en: "places-to-meet.geojson", fr: "lieux-de-rencontre.geojson" };

const orUnknown = (v: string | null): string => (v === null || v === "" ? UNKNOWN_TOKEN : v);
const pointFeature = (role: string, p: Point, extra: Record<string, unknown> = {}) => ({
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
  properties: { role, ...extra },
});

/**
 * One feature for each point, one for halfway, and one for each placed place in the order chosen.
 * Coordinates are [lon, lat]. Minutes appear only for a person who gave a pace; they are minimums.
 */
export function meetUpToGeoJson(result: MeetUpResult, a: Point, b: Point, places: readonly PackPlaceRecord[], paces: MeetUpPaces): string {
  const byId = new Map(places.map((p) => [p.id, p] as const));
  const features: unknown[] = [pointFeature("first point", a), pointFeature("second point", b), pointFeature("halfway", result.middle, { apart_metres: result.apartMetres })];
  for (const row of result.rows) {
    const p = byId.get(row.id);
    if (!p?.location) continue;
    const m = meetUpMinutes(row, paces);
    features.push(
      pointFeature("place", p.location, {
        position: row.position,
        id: row.id,
        name: orUnknown(row.name),
        kind: orUnknown(p.category),
        address: orUnknown(p.address),
        metres_from_first: row.metresA,
        metres_from_second: row.metresB,
        longer_metres: row.longer,
        total_metres: row.total,
        nearer: row.nearer,
        minimum_minutes_first: m.a,
        minimum_minutes_second: m.b,
      }),
    );
  }
  return `${JSON.stringify({ type: "FeatureCollection", features, unlocated: [...result.unlocatedIds], attribution: OSM_CREDIT }, null, 2)}\n`;
}
