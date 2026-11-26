// Behaviour audit: the real exporters, given a coordinate with twelve decimals, write what the register says.
// "known" tests record what happens today (a coordinate written as it is) and fail when that is changed.

import { describe, expect, it } from "vitest";
import { geoUri } from "../../states/geo";
import { buildMeetUp, halfway } from "../../states/meetUp";
import { meetUpPointText, meetUpToText } from "../../states/meetUpCopy";
import { meetUpToGeoJson } from "../../states/meetUpGeo";
import { outingToCsv, outingToGeoJson } from "../../states/outingExport";
import type { Outing } from "../../states/outingPlan";
import { type ExportRecord, packPlaceToText, packRow } from "../../states/packExport";
import { parseCoordinate, parsePointInput } from "../../states/packGeo";
import type { PackPlaceRecord } from "../../states/packPlaces";
import { findCoordinates, hasPointNear, maxDigits } from "./lcText";

const LAT = 43.123456789012;
const LON = -79.987654321098;
const decimals = (n: string): number => (n.split(".")[1] ?? "").length;

describe("exports that cut a coordinate", () => {
  it("geoUri writes five decimals", () => {
    const m = findCoordinates(geoUri({ lat: LAT, lon: LON }));
    expect(m.map((x) => x.form)).toEqual(["geo-uri"]);
    expect(maxDigits(m)).toBe(5);
    expect(geoUri({ lat: LAT, lon: LON })).toBe("geo:43.12346,-79.98765");
  });
  it("meetUpPointText writes five decimals in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = meetUpPointText({ lat: LAT, lon: LON }, locale);
      expect(maxDigits(findCoordinates(text)), text).toBe(5);
    }
    expect(meetUpPointText({ lat: LAT, lon: LON }, "fr")).toBe("43,12346 ; -79,98765");
  });
  it("halfway rounds to five decimals, and rounds a half up", () => {
    const h = halfway({ lat: LAT, lon: LON }, { lat: LAT + 0.0000011, lon: LON });
    expect(decimals(String(h.lat))).toBeLessThanOrEqual(5);
    expect(decimals(String(h.lon))).toBeLessThanOrEqual(5);
    expect(halfway({ lat: 0.000005, lon: 0 }, { lat: 0.000005, lon: 0 }).lat).toBe(0.00001);
  });
  it("halfway stays within the five-decimal grid of the two points", () => {
    const h = halfway({ lat: 10, lon: 10 }, { lat: 20.123456789, lon: 30 });
    expect(h.lat).toBe(15.06173);
  });
});

describe("what a person types", () => {
  it("is read with one to eight decimals and no more", () => {
    expect(parseCoordinate("43.12345678")).toBe(43.12345678);
    expect(parseCoordinate("43.123456789")).toBeNull();
    expect(parseCoordinate("43,5")).toBe(43.5);
  });
  it("meetUpToText writes the points cut to five decimals", () => {
    const a = { lat: 43.12345678, lon: -79.12345678 };
    const b = { lat: 43.22345678, lon: -79.22345678 };
    const r = buildMeetUp([], a, b);
    const text = meetUpToText(r, a, b, "en");
    expect(maxDigits(findCoordinates(text))).toBeLessThanOrEqual(5);
    expect(hasPointNear(findCoordinates(text), a.lat, a.lon, 2)).toBe(true);
  });
  it("is not read as a point when it is invalid", () => expect(parsePointInput("43.1", "")).toEqual({ status: "invalid" }));
});

describe("known: coordinates written as they are", () => {
  it("meetUpToGeoJson writes the points a person typed with every decimal they typed (known)", () => {
    const a = { lat: 43.12345678, lon: -79.12345678 };
    const b = { lat: 43.22345678, lon: -79.22345678 };
    const json = meetUpToGeoJson(buildMeetUp([], a, b), a, b, [] as readonly PackPlaceRecord[], {} as never);
    expect(json).toContain("43.12345678");
    expect(json).toContain("-79.22345678");
    const coords = JSON.parse(json).features.map((f: { geometry: { coordinates: number[] } }) => f.geometry.coordinates);
    expect(coords).toHaveLength(3);
    expect(decimals(String(coords[2][1]))).toBeLessThanOrEqual(5);
  });
  it("packRow writes a place's coordinates as they are (known)", () => {
    const rec = { place: { id: "p", name: "n", category: null, address: null, location: { lat: LAT, lon: LON }, tag: "unknown", provenance: {} }, tier: null } as unknown as ExportRecord;
    const row = packRow(rec);
    expect(row).toContain(String(LAT));
    expect(row).toContain(String(LON));
  });
  it("packPlaceToText cuts the same place to four decimals", () => {
    const rec = { place: { id: "p", name: "n", category: null, address: null, location: { lat: LAT, lon: LON }, tag: "unknown", provenance: null }, tier: null } as unknown as ExportRecord;
    const text = packPlaceToText(rec, "en", "2026-11-21");
    expect(text).toContain("43.1235, -79.9877");
    expect(text).not.toContain("43.12345");
  });
  it("the outing CSV and GeoJSON write a stop's point as they are (known)", () => {
    const stop = { id: "s", position: 1, name: "n", category: null, address: null, tag: "unknown", point: { lat: LAT, lon: LON }, legMetres: null, totalMetres: 0, totalComplete: true };
    const outing = { stops: [stop], start: null, totalMetres: 0, legCount: 0, legsKnown: 0, unlocated: 0, complete: true } as unknown as Outing;
    expect(outingToGeoJson(outing)).toContain(String(LON));
    expect(outingToCsv(outing)).toContain(String(LAT));
  });
});
