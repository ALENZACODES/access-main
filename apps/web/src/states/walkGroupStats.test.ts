import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { DEFAULT_WALK_GROUP_ORDER, unknownIn, WALK_GROUP_FILTERS, WALK_GROUP_ORDERS, filterGroups, groupStats, isWalkGroupFilter, isWalkGroupOrder, matchesFilter, orderWalkGroups, reportedKinds } from "./walkGroupStats";
import { groupPlaces, type WalkGrouping } from "./walkGroups";

const at = (id: string, east: number, north: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + north / 111_195, lon: -79.38 + east / 80_500, ...over });
const grouping = (): WalkGrouping =>
  groupPlaces(
    [
      at("a", 0, 0, { wheelchair: "yes", address: "1 Main Street", name: "Zed" }),
      at("b", 20, 0, { wheelchair: "no", address: "2 Main Street", name: "Yan" }),
      at("c", 5000, 0, { wheelchair: "UNKNOWN", address: "1 Oak Avenue", name: "Xi" }),
      at("d", 5030, 0, { wheelchair: "UNKNOWN", address: "3 Oak Avenue", name: "Wu" }),
      at("e", 5060, 0, { wheelchair: "UNKNOWN", address: "5 Oak Avenue", name: "Vi" }),
      at("f", 9000, 0, { wheelchair: "yes" }),
      place("g", { lat: null, lon: null }),
    ],
    100,
  );

describe("groupStats", () => {
  it("counts groups, grouped, alone and unplaced places", () => {
    expect(groupStats(grouping())).toEqual({ groups: 2, grouped: 5, alone: 1, withoutPoint: 1, largest: 3, median: 2.5, percentGrouped: 83 });
  });
  it("is all zero for nothing", () => {
    expect(groupStats(groupPlaces([], 100))).toEqual({ groups: 0, grouped: 0, alone: 0, withoutPoint: 0, largest: 0, median: 0, percentGrouped: 0 });
  });
  it("takes the middle size as the median of an odd number of groups", () => {
    const ps = [at("a", 0, 0), at("b", 10, 0), at("c", 5000, 0), at("d", 5010, 0), at("e", 5020, 0), at("f", 9000, 0), at("g", 9010, 0), at("h", 9020, 0), at("i", 9030, 0)];
    expect(groupStats(groupPlaces(ps, 100)).median).toBe(3);
  });
});

describe("filters", () => {
  const groups = grouping().groups;
  const [main, oak] = groups as [(typeof groups)[0], (typeof groups)[0]];
  it("counts the different reported tags and does not count UNKNOWN", () => {
    expect(reportedKinds(main)).toBe(2);
    expect(reportedKinds(oak)).toBe(0);
  });
  it("keeps every group for all", () => expect(filterGroups(groups, "all")).toHaveLength(2));
  it("keeps groups with two different reported tags for mixed", () => expect(filterGroups(groups, "mixed")).toEqual([main]));
  it("keeps groups where every place is UNKNOWN for none-known", () => expect(filterGroups(groups, "none-known")).toEqual([oak]));
  it("keeps groups with two or more UNKNOWN places for several-unknown", () => {
    expect(filterGroups(groups, "several-unknown")).toEqual([oak]);
    expect(unknownIn(oak)).toBe(3);
    expect(unknownIn(main)).toBe(0);
  });
  it("counts exactly two UNKNOWN places as several", () => {
    const two = groupPlaces([at("a", 0, 0, { wheelchair: "UNKNOWN" }), at("b", 10, 0, { wheelchair: "UNKNOWN" }), at("c", 20, 0, { wheelchair: "yes" })], 100).groups[0]!;
    expect(matchesFilter(two, "several-unknown")).toBe(true);
    const one = groupPlaces([at("a", 0, 0, { wheelchair: "UNKNOWN" }), at("b", 10, 0, { wheelchair: "yes" })], 100).groups[0]!;
    expect(matchesFilter(one, "several-unknown")).toBe(false);
  });
  it("keeps groups with a place tagged no", () => expect(filterGroups(groups, "has-no-tag")).toEqual([main]));
  it("knows its filters and orders", () => {
    for (const f of WALK_GROUP_FILTERS) expect(isWalkGroupFilter(f)).toBe(true);
    for (const o of WALK_GROUP_ORDERS) expect(isWalkGroupOrder(o)).toBe(true);
    expect(isWalkGroupFilter("x")).toBe(false);
    expect(isWalkGroupOrder(3)).toBe(false);
    expect(WALK_GROUP_ORDERS).toContain(DEFAULT_WALK_GROUP_ORDER);
  });
  it("does not say a group is better or worse", () => {
    for (const f of WALK_GROUP_FILTERS) expect(typeof matchesFilter(main, f)).toBe("boolean");
  });
});

describe("orderWalkGroups", () => {
  const groups = grouping().groups;
  it("puts the biggest first by size", () => expect(orderWalkGroups(groups, "size").map((g) => g.members.length)).toEqual([3, 2]));
  it("puts the tightest first by spread", () => {
    const o = orderWalkGroups(groups, "tight");
    expect(o[0]!.spreadM).toBeLessThanOrEqual(o[1]!.spreadM);
  });
  it("orders by the group's name", () => expect(orderWalkGroups(groups, "name").map((g) => g.id)).toEqual(["a", "c"]));
  it("keeps pack order for pack", () => expect(orderWalkGroups(groups, "pack").map((g) => g.id)).toEqual(["a", "c"]));
  it("does not change its input", () => {
    const copy = [...groups];
    for (const o of WALK_GROUP_ORDERS) orderWalkGroups(groups, o);
    expect(groups).toEqual(copy);
  });
  it("puts groups with no name last by name", () => {
    const unnamed = groupPlaces([at("x", 0, 0, { name: null, address: null }), at("y", 5, 0, { name: null, address: null })], 100).groups;
    expect(orderWalkGroups([...unnamed, ...groups], "name").at(-1)!.id).toBe("x");
  });
});
