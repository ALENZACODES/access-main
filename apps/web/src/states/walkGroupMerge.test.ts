import { describe, expect, it } from "vitest";
import { lcg, place } from "./placeFixtures";
import { growthBetween, newGroupsAt, onlyEnlarged } from "./walkGroupMerge";
import { groupPlaces } from "./walkGroups";

const at = (id: string, east: number, north = 0) => place(id, { lat: 43.65 + north / 111_195, lon: -79.38 + east / 80_500 });

describe("growthBetween", () => {
  const ps = [at("a", 0), at("b", 50), at("c", 250), at("d", 300), at("e", 440), at("f", 9000)];
  it("says which longer group holds each shorter one and how much it gained", () => {
    const g = growthBetween(groupPlaces(ps, 100), groupPlaces(ps, 150));
    expect(g).toEqual([
      { id: "a", intoId: "a", gained: 0, joinedGroups: 0 },
      { id: "c", intoId: "c", gained: 1, joinedGroups: 0 },
    ]);
  });
  it("counts the groups that join at a longer distance and the places added", () => {
    const g = growthBetween(groupPlaces(ps, 100), groupPlaces(ps, 260));
    expect(g.map((x) => [x.id, x.intoId, x.gained, x.joinedGroups])).toEqual([["a", "a", 3, 1], ["c", "a", 3, 1]]);
  });
  it("is empty when the shorter grouping has no groups", () => {
    expect(growthBetween(groupPlaces(ps, 10), groupPlaces(ps, 400))).toEqual([]);
  });
  it("gives each shorter group exactly one home", () => {
    const rand = lcg(8);
    const many = Array.from({ length: 80 }, (_, i) => at(`p${String(i).padStart(2, "0")}`, rand() * 3000, rand() * 3000));
    const short = groupPlaces(many, 100);
    const g = growthBetween(short, groupPlaces(many, 400));
    expect(g).toHaveLength(short.groups.length);
    for (const x of g) expect(x.gained).toBeGreaterThanOrEqual(0);
  });
  it("never loses a group going to a longer distance", () => {
    const rand = lcg(12);
    const many = Array.from({ length: 80 }, (_, i) => at(`p${String(i).padStart(2, "0")}`, rand() * 3000, rand() * 3000));
    for (const [a, b] of [[100, 200], [200, 400]] as const) {
      const s = groupPlaces(many, a);
      const l = groupPlaces(many, b);
      const memberIn = (id: string) => l.groups.some((g) => g.members.some((m) => m.id === id));
      for (const g of s.groups) for (const m of g.members) expect(memberIn(m.id), `${m.id} ${a}->${b}`).toBe(true);
    }
  });
});

describe("newGroupsAt", () => {
  it("lists groups made only of places that were alone", () => {
    const ps = [at("a", 0), at("b", 50), at("c", 1000), at("d", 1150)];
    expect(newGroupsAt(groupPlaces(ps, 100), groupPlaces(ps, 200)).map((g) => g.id)).toEqual(["c"]);
  });
  it("does not list a group that holds a shorter group", () => {
    const ps = [at("a", 0), at("b", 50), at("c", 180)];
    expect(newGroupsAt(groupPlaces(ps, 100), groupPlaces(ps, 200))).toEqual([]);
  });
  it("lists every group when the shorter distance made none", () => {
    const ps = [at("a", 0), at("b", 50), at("c", 1000), at("d", 1050)];
    expect(newGroupsAt(groupPlaces(ps, 10), groupPlaces(ps, 100)).map((g) => g.id)).toEqual(["a", "c"]);
  });
});

describe("onlyEnlarged", () => {
  it("is true when groups only grew", () => {
    const ps = [at("a", 0), at("b", 50), at("c", 140)];
    expect(onlyEnlarged(groupPlaces(ps, 100), groupPlaces(ps, 200))).toBe(true);
  });
  it("is false when two groups merged", () => {
    const ps = [at("a", 0), at("b", 50), at("c", 250), at("d", 300)];
    expect(onlyEnlarged(groupPlaces(ps, 100), groupPlaces(ps, 260))).toBe(false);
  });
  it("is false when a new group formed", () => {
    const ps = [at("a", 0), at("b", 50), at("c", 1000), at("d", 1150)];
    expect(onlyEnlarged(groupPlaces(ps, 100), groupPlaces(ps, 200))).toBe(false);
  });
  it("is true for no places", () => expect(onlyEnlarged(groupPlaces([], 100), groupPlaces([], 200))).toBe(true));
});
