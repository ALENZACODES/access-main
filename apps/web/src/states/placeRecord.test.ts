import { describe, expect, it } from "vitest";
import { isPlaceId, isValidPoint, resolveLocation } from "./placeRecord";

const PROV = { source: "OpenStreetMap", licence: "ODbL-1.0", retrievedOn: "2026-11-13" };

describe("isPlaceId", () => {
  it.each(["a", "a1", "0", "cafe-nord", "a-b-c", "x".repeat(64), "9lives", "a0-9"])("accepts %s", (id) => expect(isPlaceId(id)).toBe(true));
  it.each(["", "-a", "A", "a_b", "a b", "a/b", "a.b", "é", "x".repeat(65), "a\n", " a", "a ", "a?b", "../x", "a%20b"])("rejects %j", (id) => expect(isPlaceId(id)).toBe(false));
  it.each([null, undefined, 1, {}, [], true, Symbol.iterator])("rejects a non-string", (v) => expect(isPlaceId(v)).toBe(false));
  it("accepts exactly 64 characters and no more", () => {
    expect(isPlaceId("a".repeat(64))).toBe(true);
    expect(isPlaceId("a".repeat(65))).toBe(false);
  });
});

describe("isValidPoint", () => {
  it.each([[0, 0], [43.65, -79.38], [90, 180], [-90, -180], [89.999999, 179.999999], [-0, 0]])("accepts %d, %d", (lat, lon) => expect(isValidPoint(lat, lon)).toBe(true));
  it.each([[90.0001, 0], [-90.0001, 0], [0, 180.0001], [0, -180.0001], [91, 0], [0, 181]])("rejects the out-of-range %d, %d", (lat, lon) => expect(isValidPoint(lat, lon)).toBe(false));
  it.each([[NaN, 0], [0, NaN], [Infinity, 0], [0, -Infinity]])("rejects the non-finite %d, %d", (lat, lon) => expect(isValidPoint(lat, lon)).toBe(false));
  it.each([["43", "-79"], [null, null], [undefined, 1], [1, undefined], [{}, {}], [[1], [2]], [true, false]])("rejects the non-numbers %j, %j", (lat, lon) => expect(isValidPoint(lat, lon)).toBe(false));
});

describe("resolveLocation", () => {
  it("is unknown and not recorded with no input or no coordinates", () => {
    for (const input of [undefined, {}, { lat: 1 }, { lon: 1 }, { provenance: PROV }]) expect(resolveLocation(input)).toEqual({ status: "unknown", reason: "not-recorded" });
  });
  it("is unknown and out of range for a bad point, even with provenance", () => {
    expect(resolveLocation({ lat: 100, lon: 0, provenance: PROV })).toEqual({ status: "unknown", reason: "out-of-range" });
    expect(resolveLocation({ lat: "43", lon: "-79", provenance: PROV })).toEqual({ status: "unknown", reason: "out-of-range" });
    expect(resolveLocation({ lat: null, lon: 1, provenance: PROV })).toEqual({ status: "unknown", reason: "out-of-range" });
  });
  it("is unknown without valid provenance, so a point is never shown on its own", () => {
    for (const provenance of [undefined, null, {}, { source: "x" }, { ...PROV, licence: "All rights reserved" }, { ...PROV, retrievedOn: "yesterday" }, "text"]) {
      expect(resolveLocation({ lat: 43.65, lon: -79.38, provenance })).toEqual({ status: "unknown", reason: "missing-provenance" });
    }
  });
  it("is known with a valid point and valid provenance", () => {
    const r = resolveLocation({ lat: 43.65, lon: -79.38, provenance: PROV });
    expect(r).toMatchObject({ status: "known", point: { lat: 43.65, lon: -79.38 } });
    if (r.status === "known") expect(r.provenance).toMatchObject({ licence: "ODbL-1.0", retrievedOn: "2026-11-13" });
  });
  it("accepts the edges of the globe", () => expect(resolveLocation({ lat: -90, lon: 180, provenance: PROV }).status).toBe("known"));
  it("checks the point before the provenance", () => expect(resolveLocation({ lat: 999, lon: 0 })).toEqual({ status: "unknown", reason: "out-of-range" }));
  it("does not change its input", () => {
    const input = Object.freeze({ lat: 1, lon: 2, provenance: Object.freeze({ ...PROV }) });
    expect(() => resolveLocation(input)).not.toThrow();
  });
});
