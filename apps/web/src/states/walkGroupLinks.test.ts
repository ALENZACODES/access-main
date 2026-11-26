import { describe, expect, it } from "vitest";
import { lcg, place } from "./placeFixtures";
import { MAX_LINK_MEMBERS, analyseGroup, mostApart } from "./walkGroupLinks";
import { groupPlaces } from "./walkGroups";

const at = (id: string, east: number, north: number) => place(id, { lat: 43.65 + north / 111_195, lon: -79.38 + east / 80_500 });
const group = (ps: ReturnType<typeof at>[], d: number) => groupPlaces(ps, d).groups[0]!;

describe("analyseGroup links", () => {
  it("finds the middle of a row as a link", () => {
    const g = group([at("a", 0, 0), at("b", 90, 0), at("c", 180, 0)], 100);
    const a = analyseGroup(g, 100)!;
    expect(a.links).toEqual(["b"]);
    expect(a.parts["b"]).toEqual([1, 1]);
  });
  it("finds no link in a group where everyone is close to everyone", () => {
    const g = group([at("a", 0, 0), at("b", 10, 0), at("c", 20, 0), at("d", 30, 0)], 100);
    expect(analyseGroup(g, 100)!.links).toEqual([]);
  });
  it("finds no link in a pair", () => {
    expect(analyseGroup(group([at("a", 0, 0), at("b", 50, 0)], 100), 100)!.links).toEqual([]);
  });
  it("finds no link in a ring where every place has two ways round", () => {
    const ring = Array.from({ length: 8 }, (_, i) => at(`r${i}`, Math.cos((i * Math.PI) / 4) * 80, Math.sin((i * Math.PI) / 4) * 80));
    const a = analyseGroup(group(ring, 70), 70)!;
    expect(a.links).toEqual([]);
  });
  it("reports the sizes of the parts left, largest first", () => {
    const g = group([at("a", 0, 0), at("b", 90, 0), at("c", 180, 0), at("d", 270, 0), at("e", 360, 0)], 100);
    const a = analyseGroup(g, 100)!;
    expect(a.links).toEqual(["b", "c", "d"]);
    expect(a.parts["b"]).toEqual([3, 1]);
    expect(a.parts["c"]).toEqual([2, 2]);
  });
  it("lists links in pack order", () => {
    const g = group([at("z", 0, 0), at("y", 90, 0), at("x", 180, 0), at("w", 270, 0)], 100);
    expect(analyseGroup(g, 100)!.links).toEqual(["y", "x"]);
  });
  it("matches removing each place and regrouping what is left", () => {
    const rand = lcg(31);
    const ps = Array.from({ length: 40 }, (_, i) => at(`p${String(i).padStart(2, "0")}`, rand() * 700, rand() * 700));
    for (const grouped of groupPlaces(ps, 120).groups) {
      const a = analyseGroup(grouped, 120)!;
      for (const m of grouped.members) {
        const rest = groupPlaces(grouped.members.filter((x) => x.id !== m.id), 120);
        const parts = rest.groups.length + rest.alone;
        expect(a.links.includes(m.id), m.id).toBe(parts >= 2);
      }
    }
  });
  it("returns null for a group too large to compare pair by pair", () => {
    const big = Array.from({ length: MAX_LINK_MEMBERS + 1 }, (_, i) => at(`p${i}`, (i % 30) * 5, Math.floor(i / 30) * 5));
    expect(analyseGroup(group(big, 100), 100)).toBeNull();
  });
  it("works at the limit", () => {
    const edge = Array.from({ length: MAX_LINK_MEMBERS }, (_, i) => at(`p${i}`, (i % 20) * 5, Math.floor(i / 20) * 5));
    expect(analyseGroup(group(edge, 100), 100)!.neighbours).toHaveLength(MAX_LINK_MEMBERS);
  });
  it("ignores members with no map point", () => {
    const a = analyseGroup({ members: [at("a", 0, 0), place("b", { lat: null, lon: null }), at("c", 20, 0)] }, 100)!;
    expect(a.neighbours.map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("analyseGroup neighbours", () => {
  const g = group([at("a", 0, 0), at("b", 30, 0), at("c", 130, 0)], 110);
  it("gives each member its nearest other member and the distance", () => {
    const nb = analyseGroup(g, 110)!.neighbours;
    expect(nb.map((x) => [x.id, x.nearestId])).toEqual([["a", "b"], ["b", "a"], ["c", "b"]]);
    expect(nb[0]!.nearestM).toBe(30);
    expect(nb[2]!.nearestM).toBe(100);
  });
  it("counts the other members within the distance", () => {
    expect(analyseGroup(g, 110)!.neighbours.map((x) => x.within)).toEqual([1, 2, 1]);
  });
  it("finds the closest pair", () => {
    expect(analyseGroup(g, 110)!.closestPair).toMatchObject({ a: "a", b: "b", metres: 30 });
  });
  it("names the member standing most apart", () => {
    expect(mostApart(analyseGroup(g, 110)!)).toMatchObject({ id: "c", nearestM: 100 });
  });
  it("has no pair and no one apart for a single member", () => {
    const one = analyseGroup({ members: [at("a", 0, 0)] }, 100)!;
    expect(one.closestPair).toBeNull();
    expect(one.neighbours[0]).toMatchObject({ nearestId: null, nearestM: null, within: 0 });
    expect(mostApart(one)).toBeNull();
  });
  it("gives the same answer when the members are listed in another order", () => {
    const rand = lcg(2);
    const ps = Array.from({ length: 25 }, (_, i) => at(`p${String(i).padStart(2, "0")}`, rand() * 500, rand() * 500));
    const forward = analyseGroup({ members: ps }, 150)!;
    const back = analyseGroup({ members: [...ps].reverse() }, 150)!;
    expect([...forward.links].sort()).toEqual([...back.links].sort());
    expect(forward.closestPair!.metres).toBe(back.closestPair!.metres);
  });
});
