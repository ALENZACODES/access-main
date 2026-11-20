import { describe, expect, it } from "vitest";
import { lintFrench } from "./typography";
import {
  COMPASS_POINTS, SAME_SPOT_METRES, bearingDegrees, compassFrom, compassPoint, compassShort, compassWord, directionBetween, oppositePoint,
} from "./aroundBearing";
import { ORIGIN, offset } from "./aroundFixtures";
import { distanceMetres } from "./packGeo";

describe("bearingDegrees", () => {
  it.each([
    ["north", 100, 0, 0],
    ["east", 0, 100, 90],
    ["south", -100, 0, 180],
    ["west", 0, -100, 270],
    ["north-east", 100, 100, 45],
    ["south-east", -100, 100, 135],
    ["south-west", -100, -100, 225],
    ["north-west", 100, -100, 315],
  ])("is about the right angle for %s", (_name, north, east, want) => {
    const got = bearingDegrees(ORIGIN, offset(north, east));
    expect(Math.abs(got - want)).toBeLessThan(0.1);
  });
  it("stays below 360 and never goes negative", () => {
    for (let a = 0; a < 360; a += 7) {
      const r = (a * Math.PI) / 180;
      const b = bearingDegrees(ORIGIN, offset(100 * Math.cos(r), 100 * Math.sin(r)));
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
  it("is 0 for a point just west of north (not 360)", () => {
    const b = bearingDegrees(ORIGIN, offset(100, -0.00001));
    expect(b === 0 || b > 359.9).toBe(true);
    expect(b).toBeLessThan(360);
  });
  it("is 0 for identical points", () => {
    expect(bearingDegrees(ORIGIN, ORIGIN)).toBe(0);
  });
});

describe("compassPoint", () => {
  it.each([
    [0, "N"], [22.4, "N"], [22.5, "NE"], [45, "NE"], [67.4, "NE"], [67.5, "E"], [90, "E"], [112.5, "SE"], [135, "SE"], [157.5, "S"], [180, "S"],
    [202.5, "SW"], [225, "SW"], [247.5, "W"], [270, "W"], [292.5, "NW"], [315, "NW"], [337.5, "N"], [359.9, "N"], [360, "N"],
  ])("puts %s degrees at %s", (deg, want) => {
    expect(compassPoint(deg)).toBe(want);
  });
  it("wraps angles outside 0 to 360", () => {
    expect(compassPoint(-90)).toBe("W");
    expect(compassPoint(450)).toBe("E");
    expect(compassPoint(-360)).toBe("N");
    expect(compassPoint(720 + 135)).toBe("SE");
  });
  it("gives null for numbers that are not angles", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) expect(compassPoint(bad)).toBeNull();
  });
  it("covers each of the eight points once over a full turn", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 360; d += 5) seen.add(compassPoint(d)!);
    expect([...seen].sort()).toEqual([...COMPASS_POINTS].sort());
  });
});

describe("directionBetween", () => {
  it("names the direction of a place about 100 m away", () => {
    for (const [north, east, want] of [[100, 0, "N"], [0, 100, "E"], [-100, 0, "S"], [0, -100, "W"], [70, 70, "NE"], [-70, 70, "SE"], [-70, -70, "SW"], [70, -70, "NW"]] as const) {
      const to = offset(north, east);
      expect(directionBetween(ORIGIN, to, distanceMetres(ORIGIN, to))).toBe(want);
    }
  });
  it("gives no direction for the same spot", () => {
    expect(directionBetween(ORIGIN, ORIGIN, 0)).toBeNull();
    expect(directionBetween(ORIGIN, offset(0.5, 0), 0.5)).toBeNull();
  });
  it("gives a direction at exactly the same-spot limit", () => {
    expect(directionBetween(ORIGIN, offset(SAME_SPOT_METRES, 0), SAME_SPOT_METRES)).toBe("N");
  });
  it("gives no direction when the distance is not a usable number", () => {
    for (const bad of [Number.NaN, Infinity, -5]) expect(directionBetween(ORIGIN, offset(50, 0), bad)).toBeNull();
  });
});

describe("oppositePoint", () => {
  it("is the point four steps round", () => {
    expect(COMPASS_POINTS.map(oppositePoint)).toEqual(["S", "SW", "W", "NW", "N", "NE", "E", "SE"]);
  });
  it("undoes itself", () => {
    for (const p of COMPASS_POINTS) expect(oppositePoint(oppositePoint(p))).toBe(p);
  });
});

describe("words", () => {
  it("has an English and a French word for every point", () => {
    expect(COMPASS_POINTS.map((p) => compassWord(p, "en"))).toEqual(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]);
    expect(COMPASS_POINTS.map((p) => compassWord(p, "fr"))).toEqual(["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"]);
  });
  it("shortens with O for ouest in French and W in English", () => {
    expect(COMPASS_POINTS.map((p) => compassShort(p, "en"))).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    expect(COMPASS_POINTS.map((p) => compassShort(p, "fr"))).toEqual(["N", "NE", "E", "SE", "S", "SO", "O", "NO"]);
  });
  it("says where a place lies in a phrase", () => {
    expect(compassFrom("NE", "en")).toBe("to the north-east");
    expect(compassFrom("W", "fr")).toBe("à l’ouest");
    expect(compassFrom("E", "fr")).toBe("à l’est");
    expect(compassFrom("SW", "fr")).toBe("au sud-ouest");
    expect(compassFrom("NW", "fr")).toBe("au nord-ouest");
    expect(compassFrom("N", "fr")).toBe("au nord");
    expect(compassFrom(null, "en")).toBe("at the same spot");
    expect(compassFrom(null, "fr")).toBe("au même point");
  });
  it("is clean French", () => {
    for (const p of [...COMPASS_POINTS, null] as const) expect(lintFrench(compassFrom(p, "fr"))).toEqual([]);
  });
});
