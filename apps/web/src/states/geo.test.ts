import { describe, expect, it } from "vitest";
import { NBSP, nearFromQuery, formatDistance, geoUri, haversineMeters, isPlaceId, isValidPoint, parseNear, resolveLocation } from "./index";
import { LOC_PROV } from "./testHelpers";

describe("haversineMeters", () => {
  it("is zero for the same point and symmetric", () => {
    const a = { lat: 43.88, lon: -79.43 };
    const b = { lat: 43.65, lon: -79.38 };
    expect(haversineMeters(a, a)).toBe(0);
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
  it("is close to the known Toronto to Richmond Hill distance", () => {
    const d = haversineMeters({ lat: 43.6532, lon: -79.3832 }, { lat: 43.8828, lon: -79.4403 });
    expect(d).toBeGreaterThan(25_000);
    expect(d).toBeLessThan(27_000);
  });
  it("handles the antimeridian and poles without NaN", () => {
    expect(haversineMeters({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 })).toBeLessThan(23_000);
    expect(Number.isNaN(haversineMeters({ lat: 90, lon: 0 }, { lat: -90, lon: 0 }))).toBe(false);
  });
});

describe("formatDistance", () => {
  it("rounds metres to 10 and never shows 0 m", () => {
    expect(formatDistance(3, "en")).toBe("10 m");
    expect(formatDistance(847, "en")).toBe("850 m");
  });
  it("uses km with one decimal below 10 km, whole numbers above", () => {
    expect(formatDistance(1234, "en")).toBe("1.2 km");
    expect(formatDistance(12_400, "en")).toBe("12 km");
  });
  it("uses a decimal comma and a no-break space in French", () => {
    expect(formatDistance(1234, "fr")).toBe(`1,2${NBSP}km`);
    expect(formatDistance(500, "fr")).toBe(`500${NBSP}m`);
  });
});

describe("geoUri and parseNear", () => {
  it("builds a geo: URI with 5 decimals", () => {
    expect(geoUri({ lat: 43.88, lon: -79.43 })).toBe("geo:43.88000,-79.43000");
  });
  it.each([
    ["43.88,-79.43", { lat: 43.88, lon: -79.43 }],
    [" 0,0 ", { lat: 0, lon: 0 }],
    ["91,0", null],
    ["0,181", null],
    ["abc", null],
    ["43.88", null],
    ["", null],
    [null, null],
    ["1,2,3", null],
  ])("parseNear(%j)", (input, expected) => {
    expect(parseNear(input)).toEqual(expected);
  });
});

describe("place ids and locations", () => {
  it("accepts only safe ids", () => {
    expect(isPlaceId("hall-1")).toBe(true);
    for (const bad of ["", "-x", "A", "a b", "a/b", "a".repeat(65), "../etc", 5]) expect(isPlaceId(bad)).toBe(false);
  });
  it("validates coordinates", () => {
    expect(isValidPoint(0, 0)).toBe(true);
    expect(isValidPoint(NaN, 0)).toBe(false);
    expect(isValidPoint("1", 0)).toBe(false);
    expect(isValidPoint(0, 200)).toBe(false);
  });
  it("is UNKNOWN unless coordinates are valid and sourced", () => {
    expect(resolveLocation(undefined)).toEqual({ status: "unknown", reason: "not-recorded" });
    expect(resolveLocation({ lat: 1 })).toEqual({ status: "unknown", reason: "not-recorded" });
    expect(resolveLocation({ lat: 95, lon: 0, provenance: LOC_PROV })).toEqual({ status: "unknown", reason: "out-of-range" });
    expect(resolveLocation({ lat: 1, lon: 1 })).toEqual({ status: "unknown", reason: "missing-provenance" });
    expect(resolveLocation({ lat: 1, lon: 1, provenance: { ...LOC_PROV, licence: "Proprietary" } }).status).toBe("unknown");
    expect(resolveLocation({ lat: 1, lon: 1, provenance: LOC_PROV }).status).toBe("known");
  });
});

describe("nearFromQuery", () => {
  const q = (s: string) => nearFromQuery(new URLSearchParams(s));
  it("reads separate lat and lon fields", () => {
    expect(q("lat=43.88&lon=-79.44")).toEqual({ near: { lat: 43.88, lon: -79.44 }, input: { lat: "43.88", lon: "-79.44" }, error: false });
  });
  it("accepts a decimal comma", () => {
    expect(q("lat=43,88&lon=-79,44").near).toEqual({ lat: 43.88, lon: -79.44 });
  });
  it("reads the combined near parameter and fills the form from it", () => {
    expect(q("near=1.5,2.5")).toEqual({ near: { lat: 1.5, lon: 2.5 }, input: { lat: "1.5", lon: "2.5" }, error: false });
  });
  it("is not an error when nothing is supplied", () => {
    expect(q("")).toEqual({ near: null, input: { lat: "", lon: "" }, error: false });
    expect(q("lat=&lon=").error).toBe(false);
  });
  it.each(["lat=91&lon=0", "lat=0&lon=181", "lat=abc&lon=1", "lat=1", "lon=1", "near=zzz", "lat=1&lon=2&near=bad"])("flags %s as an error", (s) => {
    const r = q(s);
    expect(r.near).toBeNull();
    expect(r.error).toBe(true);
  });
  it("strips unexpected characters and limits length when redisplaying", () => {
    const r = q("lat=" + encodeURIComponent('<script>1</script>') + "&lon=" + "9".repeat(80));
    expect(r.input.lat).not.toMatch(/[<>a-df-zA-DF-Z]/);
    expect(r.input.lon.length).toBeLessThanOrEqual(20);
  });
});
