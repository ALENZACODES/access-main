import { describe, expect, it } from "vitest";
import { NBSP, distanceMetres, formatPackDistance, isPoint, parseCoordinate, parsePointInput } from "./index";

describe("parseCoordinate", () => {
  it.each([
    ["43.6532", 43.6532],
    ["-79.3832", -79.3832],
    ["+43", 43],
    ["43,6532", 43.6532],
    [" 0 ", 0],
    ["180", 180],
  ])("accepts %j", (text, n) => expect(parseCoordinate(text)).toBe(n));
  it.each(["", " ", "abc", "43.", ".5", "1e3", "0x10", "43.6532.1", "4 3", "--1", "1234", "43.123456789", "NaN", "Infinity", "<b>1</b>"])(
    "rejects %j",
    (text) => expect(parseCoordinate(text)).toBeNull(),
  );
});

describe("parsePointInput", () => {
  it("treats two empty fields as no point", () => {
    expect(parsePointInput("", "  ")).toEqual({ status: "none" });
  });
  it("reads a valid point", () => {
    expect(parsePointInput("43,65", "-79.38")).toEqual({ status: "ok", point: { lat: 43.65, lon: -79.38 } });
  });
  it.each([
    ["43.65", ""],
    ["", "-79.38"],
    ["91", "0"],
    ["-91", "0"],
    ["0", "181"],
    ["x", "1"],
  ])("never guesses a point from %j, %j", (lat, lon) => expect(parsePointInput(lat, lon)).toEqual({ status: "invalid" }));
});

describe("isPoint", () => {
  it("accepts only finite in-range numbers", () => {
    expect(isPoint({ lat: 90, lon: -180 })).toBe(true);
    for (const bad of [null, 5, {}, { lat: "1", lon: 2 }, { lat: NaN, lon: 0 }, { lat: 0, lon: Infinity }, { lat: 90.1, lon: 0 }, { lat: 0, lon: -180.1 }]) {
      expect(isPoint(bad)).toBe(false);
    }
  });
});

describe("distanceMetres", () => {
  it("is zero for the same point and symmetric", () => {
    const a = { lat: 43.656157, lon: -79.380186 };
    const b = { lat: 43.656229, lon: -79.38056 };
    expect(distanceMetres(a, a)).toBe(0);
    expect(distanceMetres(a, b)).toBeCloseTo(distanceMetres(b, a), 6);
  });
  it("matches known distances within a small tolerance", () => {
    // One degree of latitude is about 111.2 km.
    expect(distanceMetres({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeGreaterThan(111_000);
    expect(distanceMetres({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeLessThan(111_400);
    // Toronto to Ottawa is roughly 350 km in a straight line.
    const d = distanceMetres({ lat: 43.6532, lon: -79.3832 }, { lat: 45.4215, lon: -75.6972 });
    expect(d).toBeGreaterThan(340_000);
    expect(d).toBeLessThan(360_000);
  });
  it("handles opposite points without returning NaN", () => {
    expect(Number.isFinite(distanceMetres({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }))).toBe(true);
  });
});

describe("formatPackDistance", () => {
  it.each([
    [0, "en", `0${NBSP}m`],
    [42.4, "en", `42${NBSP}m`],
    [124, "en", `120${NBSP}m`],
    [999, "en", `1000${NBSP}m`],
    [1000, "en", `1.0${NBSP}km`],
    [1249, "en", `1.2${NBSP}km`],
    [1250, "fr", `1,3${NBSP}km`],
    [12_400, "en", `12${NBSP}km`],
  ] as const)("%d m in %s", (m, locale, text) => expect(formatPackDistance(m, locale)).toBe(text));
  it("returns nothing for a distance it cannot state", () => {
    expect(formatPackDistance(Number.NaN, "en")).toBe("");
    expect(formatPackDistance(-1, "fr")).toBe("");
    expect(formatPackDistance(Number.POSITIVE_INFINITY, "en")).toBe("");
  });
});
