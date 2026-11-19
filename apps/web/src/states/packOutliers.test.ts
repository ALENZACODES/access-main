import { describe, expect, it } from "vitest";
import { distanceMetres } from "./packGeo";
import { MAX_OUTLIERS_LISTED, MIN_LOCATED, OUTLIER_KM, findPositionOutliers } from "./packOutliers";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";

const raw = (id: string, lat: number | null, lon: number | null) => ({
  id,
  name: `Place ${id}`,
  wheelchair: "yes",
  ...(lat === null ? {} : { lat }),
  ...(lon === null ? {} : { lon }),
  provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10" },
});
const parse = (items: unknown[]): PackPlaceRecord[] => [...parsePackPlaces(items).places];
// Toronto: 43.65, -79.38. One degree of latitude is about 111 km.
const city = [raw("a", 43.65, -79.38), raw("b", 43.66, -79.39), raw("c", 43.64, -79.37), raw("d", 43.67, -79.4)];

describe("findPositionOutliers", () => {
  it("reports nothing when every position is near the middle", () => {
    const r = findPositionOutliers(parse(city));
    expect(r).toMatchObject({ outliers: [], total: 0, located: 4 });
    expect(r.middle).not.toBeNull();
  });
  it("lists a position far from the rest, with whole kilometres", () => {
    const r = findPositionOutliers(parse([...city, raw("far", 45.65, -79.38)]));
    expect(r.total).toBe(1);
    expect(r.outliers[0]!.id).toBe("far");
    expect(r.outliers[0]!.km).toBeGreaterThanOrEqual(215);
    expect(r.outliers[0]!.km).toBeLessThanOrEqual(225);
  });
  it("finds a swapped sign, the usual slip", () => {
    const r = findPositionOutliers(parse([...city, raw("slip", 43.65, 79.38)]));
    expect(r.outliers.map((o) => o.id)).toEqual(["slip"]);
  });
  it("is not pulled off by the outlier itself: the middle is a median", () => {
    const r = findPositionOutliers(parse([...city, raw("x", 60, -100), raw("y", 61, -101)]));
    expect(r.outliers.map((o) => o.id).sort()).toEqual(["x", "y"]);
    expect(r.middle!.lat).toBeCloseTo(43.66, 1);
  });
  it("uses the limit given and treats exactly the limit as inside", () => {
    const places = parse([...city, raw("e", 44.1, -79.38)]);
    const km = findPositionOutliers(places, 1).outliers.find((o) => o.id === "e")!.km;
    expect(findPositionOutliers(places, km + 5).total).toBe(0);
    expect(findPositionOutliers(places, 20).outliers.map((o) => o.id)).toEqual(["e"]);
  });
  it("does not list a position that is exactly at the limit", () => {
    const places = parse([...city, raw("e", 44.1, -79.38)]);
    const { middle } = findPositionOutliers(places);
    const exactKm = distanceMetres(middle!, { lat: 44.1, lon: -79.38 }) / 1000;
    expect(findPositionOutliers(places, exactKm).total).toBe(0);
    expect(findPositionOutliers(places, exactKm - 0.01).total).toBe(1);
  });
  it("defaults to 50 km", () => {
    expect(OUTLIER_KM).toBe(50);
    expect(findPositionOutliers(parse([...city, raw("n", 44.0, -79.38)])).total).toBe(0);
    expect(findPositionOutliers(parse([...city, raw("n", 44.3, -79.38)])).total).toBe(1);
  });
  it("does not judge a pack with too few positions", () => {
    expect(MIN_LOCATED).toBe(3);
    const r = findPositionOutliers(parse([raw("a", 43.65, -79.38), raw("b", 10, 10)]));
    expect(r).toEqual({ outliers: [], total: 0, located: 2, middle: null });
  });
  it("leaves out records with no position and counts only the located ones", () => {
    const r = findPositionOutliers(parse([...city, raw("none", null, null)]));
    expect(r.located).toBe(4);
    expect(r.outliers).toEqual([]);
  });
  it("orders farthest first, then by id, and caps the list but not the count", () => {
    const near = Array.from({ length: 40 }, (_, i) => raw(`n${i}`, 43.65 + (i % 7) * 0.001, -79.38));
    const many = Array.from({ length: 25 }, (_, i) => raw(`o${String(i).padStart(2, "0")}`, 55 + (i % 5), -100));
    const r = findPositionOutliers(parse([...near, ...many]));
    expect(r.total).toBe(25);
    expect(r.outliers).toHaveLength(MAX_OUTLIERS_LISTED);
    for (let i = 1; i < r.outliers.length; i++) expect(r.outliers[i - 1]!.km).toBeGreaterThanOrEqual(r.outliers[i]!.km);
  });
  it("returns the same result for the same places in another order", () => {
    const places = parse([...city, raw("far", 45.65, -79.38)]);
    expect(findPositionOutliers([...places].reverse())).toEqual(findPositionOutliers(places));
  });
  it("is empty for no places", () => {
    expect(findPositionOutliers([])).toEqual({ outliers: [], total: 0, located: 0, middle: null });
  });
});
