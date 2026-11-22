import { describe, expect, it } from "vitest";
import { MAX_DECIMALS, PRIVATE_KINDS, TORONTO_BOX, checkPlaceGeo, decimalsOf } from "./pkGeo";

const codes = (p: unknown): string[] => checkPlaceGeo(p).map((x) => x.code);
const at = (lat: unknown, lon: unknown, category: unknown = "cafe") => ({ lat, lon, category });

describe("decimalsOf", () => {
  it.each([[43, 0], [43.6, 1], [43.656157, 6], [-79.380186, 6], [43.1234567, 7], [0.5, 1], [-0.25, 2]])("%d has %d decimals", (n, d) => expect(decimalsOf(n)).toBe(d));
  it("treats a number written with an exponent as having too many", () => expect(decimalsOf(1e-7)).toBeGreaterThan(MAX_DECIMALS));
});

describe("checkPlaceGeo", () => {
  it("accepts a point in the box with six decimals", () => expect(codes(at(43.656157, -79.380186))).toEqual([]));
  it("accepts a point with no decimals, on the edge of the box", () => {
    expect(codes(at(TORONTO_BOX.south, TORONTO_BOX.west))).toEqual([]);
    expect(codes(at(TORONTO_BOX.north, TORONTO_BOX.east))).toEqual([]);
  });
  it.each([[null], ["x"], [undefined], [[]], [1]])("says a point is missing when the record is %j or has no numbers", (p) => expect(codes(p)).toEqual(p && typeof p === "object" && !Array.isArray(p) ? ["pk-geo-missing"] : []));
  it("says a point is missing when a coordinate is a text or absent", () => {
    expect(codes(at("43.6", -79.3))).toEqual(["pk-geo-missing"]);
    expect(codes({ lat: 43.6 })).toEqual(["pk-geo-missing"]);
    expect(codes({})).toEqual(["pk-geo-missing"]);
  });
  it("finds a point that is not on the earth", () => {
    expect(codes(at(91, 0))).toEqual(["pk-geo-range"]);
    expect(codes(at(0, 181))).toEqual(["pk-geo-range"]);
    expect(codes(at(Number.NaN, 1))).toEqual(["pk-geo-range"]);
    expect(codes(at(Infinity, 1))).toEqual(["pk-geo-range"]);
  });
  it("finds 0, 0", () => expect(codes(at(0, 0))).toEqual(["pk-geo-null-island"]));
  it("finds a point outside the box, on each side", () => {
    expect(codes(at(43.39, -79.4))).toEqual(["pk-geo-outside"]);
    expect(codes(at(44.01, -79.4))).toEqual(["pk-geo-outside"]);
    expect(codes(at(43.7, -79.81))).toEqual(["pk-geo-outside"]);
    expect(codes(at(43.7, -79.09))).toEqual(["pk-geo-outside"]);
  });
  it("finds a point with too many decimals, and says how many", () => expect(checkPlaceGeo(at(43.65615712, -79.38))).toEqual([{ code: "pk-geo-precision", detail: "8 decimals" }]));
  it("uses the box it is given", () => expect(checkPlaceGeo(at(51.5, -0.1), { south: 51, north: 52, west: -1, east: 1 })).toEqual([]));
  it.each(PRIVATE_KINDS)("finds the kind %s, in any case", (k) => {
    expect(codes(at(43.7, -79.4, k))).toEqual(["pk-geo-private-kind"]);
    expect(codes(at(43.7, -79.4, k.toUpperCase()))).toEqual(["pk-geo-private-kind"]);
  });
  it("does not take a public kind for private", () => {
    for (const k of ["cafe", "pharmacy", "attraction", "yes", "main", "", 5, null]) expect(codes(at(43.7, -79.4, k))).toEqual([]);
  });
  it("finds a private kind and a bad point together, with the kind first", () => expect(codes(at(0, 0, "house"))).toEqual(["pk-geo-private-kind", "pk-geo-null-island"]));
  it("still finds a private kind when the point is missing", () => expect(codes({ category: "house" })).toEqual(["pk-geo-private-kind", "pk-geo-missing"]));
});
