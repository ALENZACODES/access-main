/** Builders for the "places around a place" tests. Not used by the App. */
import { PROV, place } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

/** Metres in one degree of latitude on the sphere distanceMetres uses. */
export const METRES_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;
export const ORIGIN = { lat: 43.65, lon: -79.38 } as const;

/** A map point `north` metres north and `east` metres east of the origin (small offsets only). */
export function offset(north: number, east: number): { lat: number; lon: number } {
  return {
    lat: ORIGIN.lat + north / METRES_PER_DEGREE,
    lon: ORIGIN.lon + east / (METRES_PER_DEGREE * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  };
}

/** A pack place `north`/`east` metres from the origin. Pass `null` for both to leave the map point out. */
export function at(id: string, north: number | null, east: number | null, over: Record<string, unknown> = {}): PackPlaceRecord {
  const point = north === null || east === null ? { lat: null, lon: null } : offset(north, east);
  return place(id, { name: id, ...point, ...over });
}

export { PROV };

/** A small street: a centre with one place in each compass direction, a far one and one with no point. */
export function crossroads(): PackPlaceRecord[] {
  return [
    at("centre", 0, 0, { name: "Centre Hall", wheelchair: "yes" }),
    at("n", 80, 0, { name: "North Cafe", wheelchair: "no" }),
    at("e", 0, 120, { name: "East Library", wheelchair: "limited" }),
    at("s", -200, 0, { name: "South Shop", wheelchair: "designated" }),
    at("w", 0, -240, { name: "West Bar", wheelchair: "UNKNOWN" }),
    at("far", 700, 0, { name: "Far Museum", wheelchair: "yes" }),
    at("nopoint", null, null, { name: "Mapless Place", wheelchair: "yes" }),
  ];
}
