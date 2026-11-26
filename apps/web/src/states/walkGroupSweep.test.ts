import { describe, expect, it } from "vitest";
import { lcg, place } from "./placeFixtures";
import { smallestGroupingDistance, sweepDistances, sweepSteps } from "./walkGroupSweep";

const at = (id: string, east: number, north: number) => place(id, { lat: 43.65 + north / 111_195, lon: -79.38 + east / 80_500 });

describe("sweepDistances", () => {
  const ps = [at("a", 0, 0), at("b", 150, 0), at("c", 450, 0), at("d", 5000, 0)];
  it("groups the same list at each distance on offer", () => {
    const rows = sweepDistances(ps);
    expect(rows.map((r) => [r.distanceM, r.groups, r.grouped, r.alone])).toEqual([
      [100, 0, 0, 4],
      [200, 1, 2, 2],
      [400, 1, 3, 1],
    ]);
  });
  it("uses the distances it is given", () => expect(sweepDistances(ps, [200]).map((r) => r.distanceM)).toEqual([200]));
  it("has a row of zeros for no places", () => {
    for (const r of sweepDistances([])) expect(r).toMatchObject({ groups: 0, grouped: 0, alone: 0, largest: 0, percentGrouped: 0 });
  });
  it("never groups fewer places at a longer distance", () => {
    const rand = lcg(4);
    const many = Array.from({ length: 70 }, (_, i) => at(`p${i}`, rand() * 3000, rand() * 3000));
    const rows = sweepDistances(many);
    for (let i = 1; i < rows.length; i += 1) expect(rows[i]!.grouped).toBeGreaterThanOrEqual(rows[i - 1]!.grouped);
  });
});

describe("smallestGroupingDistance", () => {
  it("is the smallest distance at which a group forms", () => {
    expect(smallestGroupingDistance(sweepDistances([at("a", 0, 0), at("b", 350, 0)]))).toBe(400);
    expect(smallestGroupingDistance(sweepDistances([at("a", 0, 0), at("b", 50, 0)]))).toBe(100);
  });
  it("is null when no distance forms a group", () => {
    expect(smallestGroupingDistance(sweepDistances([at("a", 0, 0), at("b", 5000, 0)]))).toBeNull();
    expect(smallestGroupingDistance([])).toBeNull();
  });
  it("does not depend on the order of the rows", () => {
    const rows = sweepDistances([at("a", 0, 0), at("b", 150, 0)]);
    expect(smallestGroupingDistance([...rows].reverse())).toBe(200);
  });
});

describe("sweepSteps", () => {
  it("gives the change from one distance to the next", () => {
    const rows = sweepDistances([at("a", 0, 0), at("b", 150, 0), at("c", 450, 0), at("d", 5000, 0)]);
    expect(sweepSteps(rows)).toEqual([
      { from: 100, to: 200, groupsDelta: 1, groupedDelta: 2 },
      { from: 200, to: 400, groupsDelta: 0, groupedDelta: 1 },
    ]);
  });
  it("is empty for one row or none", () => {
    expect(sweepSteps([])).toEqual([]);
    expect(sweepSteps(sweepDistances([], [100]))).toEqual([]);
  });
});
