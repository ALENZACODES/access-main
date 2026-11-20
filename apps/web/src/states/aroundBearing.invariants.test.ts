import { describe, expect, it } from "vitest";
import { COMPASS_POINTS, bearingDegrees, compassPoint, directionBetween, oppositePoint } from "./aroundBearing";
import { ORIGIN, offset } from "./aroundFixtures";
import { distanceMetres } from "./packGeo";
import { lcg } from "./placeFixtures";

/** How far a bearing is from the nearest sector edge, in degrees. */
function edgeGap(b: number): number {
  const rem = (b + 22.5) % 45;
  return Math.min(rem, 45 - rem);
}

describe("direction between random pairs of points", () => {
  const next = lcg(20261120);
  const pairs = Array.from({ length: 1500 }, () => {
    const a = offset((next() - 0.5) * 2000, (next() - 0.5) * 2000);
    const b = offset((next() - 0.5) * 2000, (next() - 0.5) * 2000);
    return { a, b, metres: distanceMetres(a, b) };
  });

  it("is always one of the eight points for points that are not the same spot", () => {
    for (const { a, b, metres } of pairs) {
      const d = directionBetween(a, b, metres);
      expect(d === null ? metres < 1 : COMPASS_POINTS.includes(d)).toBe(true);
    }
  });
  it("gives the opposite point when the pair is swapped, except close to a sector edge", () => {
    let checked = 0;
    for (const { a, b, metres } of pairs) {
      const there = bearingDegrees(a, b);
      if (edgeGap(there) < 0.5 || metres < 1) continue;
      expect(directionBetween(b, a, metres), `${there}`).toBe(oppositePoint(directionBetween(a, b, metres)!));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1300);
  });
  it("agrees with compassPoint of the bearing", () => {
    for (const { a, b, metres } of pairs) {
      if (metres < 1) continue;
      expect(directionBetween(a, b, metres)).toBe(compassPoint(bearingDegrees(a, b)));
    }
  });
  it("does not change when both points move together by the same small amount", () => {
    const shift = offset(500, 500);
    const dLat = shift.lat - ORIGIN.lat;
    const dLon = shift.lon - ORIGIN.lon;
    let checked = 0;
    for (const { a, b, metres } of pairs.slice(0, 400)) {
      if (edgeGap(bearingDegrees(a, b)) < 1 || metres < 1) continue;
      const moved = directionBetween({ lat: a.lat + dLat, lon: a.lon + dLon }, { lat: b.lat + dLat, lon: b.lon + dLon }, metres);
      expect(moved).toBe(directionBetween(a, b, metres));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe("compassPoint over every tenth of a degree", () => {
  it("changes point exactly eight times round the circle", () => {
    let changes = 0;
    let last = compassPoint(0);
    for (let tenth = 1; tenth <= 3600; tenth += 1) {
      const p = compassPoint(tenth / 10);
      if (p !== last) changes += 1;
      last = p;
    }
    expect(changes).toBe(8);
  });
  it("never gives a sector wider than 45 degrees", () => {
    const widths = new Map<string, number>();
    for (let tenth = 0; tenth < 3600; tenth += 1) {
      const p = compassPoint(tenth / 10)!;
      widths.set(p, (widths.get(p) ?? 0) + 1);
    }
    for (const w of widths.values()) expect(w).toBe(450);
  });
});
