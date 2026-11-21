import { describe, expect, it } from "vitest";
import { buildMeetUp } from "./meetUp";
import { MEET_UP_GEOJSON_FILENAMES, meetUpToGeoJson } from "./meetUpGeo";
import { NO_PACES } from "./meetUpTime";
import { bare, place, varied } from "./placeFixtures";

const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
const ps = [place("p1", { name: "Alpha", lat: 43.6501, lon: -79.395, category: "museum", address: "1 Main Street" }), place("p2", { name: null, address: null, lat: 43.6501, lon: -79.37 }), bare("none")];
const doc = (paces = NO_PACES) => JSON.parse(meetUpToGeoJson(buildMeetUp(ps, A, B), A, B, ps, paces)) as { type: string; features: { type: string; geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> }[]; unlocated: string[]; attribution: string };

describe("meetUpToGeoJson", () => {
  it("is a FeatureCollection of the two points, halfway and each placed place, ending in a newline", () => {
    const text = meetUpToGeoJson(buildMeetUp(ps, A, B), A, B, ps, NO_PACES);
    expect(text.endsWith("}\n")).toBe(true);
    const d = doc();
    expect(d.type).toBe("FeatureCollection");
    expect(d.features.map((f) => f.properties.role)).toEqual(["first point", "second point", "halfway", "place", "place"]);
    expect(d.unlocated).toEqual(["none"]);
  });
  it("writes coordinates as longitude then latitude", () => {
    const d = doc();
    expect(d.features[0]!.geometry).toEqual({ type: "Point", coordinates: [-79.4, 43.65] });
    expect(d.features[1]!.geometry.coordinates).toEqual([-79.36, 43.65]);
    const alpha = d.features.find((f) => f.properties.id === "p1")!.geometry.coordinates;
    expect(alpha[0]).toBeCloseTo(-79.395, 5);
    expect(alpha[1]).toBeCloseTo(43.6501, 5);
  });
  it("carries the measured distances, UNKNOWN for what is missing and the credit", () => {
    const d = doc();
    const named = d.features.find((f) => f.properties.id === "p1")!.properties;
    expect(named).toMatchObject({ name: "Alpha", kind: "museum", address: "1 Main Street" });
    expect(typeof named.metres_from_first).toBe("number");
    expect(named.total_metres).toBe((named.metres_from_first as number) + (named.metres_from_second as number));
    const unnamed = d.features.find((f) => f.properties.id === "p2")!.properties;
    expect(unnamed.name).toBe("UNKNOWN");
    expect(unnamed.address).toBe("UNKNOWN");
    expect(d.attribution).toMatch(/OpenStreetMap/);
    expect(d.features[2]!.properties.apart_metres).toBe(buildMeetUp(ps, A, B).apartMetres);
  });
  it("has minutes only for a person with a pace, and null otherwise", () => {
    const none = doc().features.find((f) => f.properties.id === "p1")!.properties;
    expect([none.minimum_minutes_first, none.minimum_minutes_second]).toEqual([null, null]);
    const one = doc({ a: 5, b: null }).features.find((f) => f.properties.id === "p1")!.properties;
    expect(one.minimum_minutes_first).toBe(Math.ceil((one.metres_from_first as number) / (5000 / 60)));
    expect(one.minimum_minutes_second).toBeNull();
  });
  it("lists places in the order chosen", () => {
    const r = buildMeetUp(ps, A, B, "b");
    const d = JSON.parse(meetUpToGeoJson(r, A, B, ps, NO_PACES)) as { features: { properties: { id?: string; position?: number } }[] };
    expect(d.features.slice(3).map((f) => f.properties.id)).toEqual(r.rows.map((x) => x.id));
    expect(d.features.slice(3).map((f) => f.properties.position)).toEqual(r.rows.map((x) => x.position));
  });
  it("keeps a feature for every placed place of a larger set", () => {
    const many = varied(5, 60);
    const r = buildMeetUp(many, A, B);
    const d = JSON.parse(meetUpToGeoJson(r, A, B, many, NO_PACES)) as { features: unknown[]; unlocated: string[] };
    expect(d.features).toHaveLength(3 + r.rows.length);
    expect(d.unlocated).toEqual(r.unlocatedIds);
  });
  it("skips a row whose place is missing or has lost its point, rather than writing a bad feature", () => {
    const r = buildMeetUp(ps, A, B);
    const lost = ps.map((p) => (p.id === "p1" ? { ...p, location: null } : p));
    const d = JSON.parse(meetUpToGeoJson(r, A, B, lost, NO_PACES)) as { features: { properties: { id?: string } }[] };
    expect(d.features.map((f) => f.properties.id).filter(Boolean)).toEqual(["p2"]);
    const gone = JSON.parse(meetUpToGeoJson(r, A, B, [], NO_PACES)) as { features: unknown[] };
    expect(gone.features).toHaveLength(3);
  });
  it("names a file for each language", () => {
    expect(MEET_UP_GEOJSON_FILENAMES.en).toMatch(/\.geojson$/);
    expect(MEET_UP_GEOJSON_FILENAMES.fr).not.toBe(MEET_UP_GEOJSON_FILENAMES.en);
  });
});
