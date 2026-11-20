import { describe, expect, it } from "vitest";
import { START_EAST, START_WEST, onLine, scattered } from "./outingFixtures";
import { buildOuting, isOutingMode, moveStop, nearestOrder, orderFor, OUTING_MODES, reconcileOrder, reverseOrder, inputsFromPlaces } from "./outingPlan";
import { distanceMetres } from "./packGeo";
import { parsePackPlaces } from "./packPlaces";

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe("modes", () => {
  it("are the three order rules, in the order they are offered", () => {
    expect([...OUTING_MODES]).toEqual(["added", "nearest", "mine"]);
  });
  it("accepts only those three words", () => {
    for (const m of OUTING_MODES) expect(isOutingMode(m)).toBe(true);
    for (const bad of ["", "Added", "nearest ", "shortest", null, undefined, 1, {}, ["added"]]) expect(isOutingMode(bad), String(bad)).toBe(false);
  });
});

describe("nearestOrder", () => {
  const line = [onLine("c", 2), onLine("a", 0), onLine("d", 3), onLine("b", 1)];
  it("walks west to east from a start in the west", () => {
    expect(nearestOrder(line, START_WEST)).toEqual(["a", "b", "c", "d"]);
  });
  it("walks east to west from a start in the east", () => {
    expect(nearestOrder(line, START_EAST)).toEqual(["d", "c", "b", "a"]);
  });
  it("starts at the first located place in the order given when there is no start", () => {
    // From c (2) the places b (1) and d (3) are equally near, so the smaller id, b, goes next; then a, then d.
    expect(nearestOrder(line, null)).toEqual(["c", "b", "a", "d"]);
  });
  it("always goes to the nearest place left, not the nearest to the start", () => {
    const inputs = [onLine("far", 10), onLine("near", 1), onLine("mid", 4)];
    expect(nearestOrder(inputs, START_WEST)).toEqual(["near", "mid", "far"]);
    // From the middle of the line the nearest unvisited place alternates, it does not sort by distance from the start.
    const zig = [onLine("m", 5), onLine("l1", 4), onLine("r1", 6.2), onLine("l2", 1)];
    expect(nearestOrder(zig, { lat: 43.65, lon: -79.35 })).toEqual(["m", "l1", "r1", "l2"]);
  });
  it("breaks an exact tie by the smaller id, whatever order the places come in", () => {
    const here = { lat: 43.65, lon: -79.4 };
    const a = onLine("a", 1);
    const b = onLine("b", -1);
    expect(distanceMetres(here, { lat: 43.65, lon: -79.39 })).toBeCloseTo(distanceMetres(here, { lat: 43.65, lon: -79.41 }), 6);
    expect(nearestOrder([a, b], here)[0]).toBe("a");
    expect(nearestOrder([b, a], here)[0]).toBe("a");
  });
  it("puts places with no map point last, in the order given", () => {
    const inputs = [onLine("x", null), onLine("a", 0), onLine("y", null), onLine("b", 1)];
    expect(nearestOrder(inputs, START_WEST)).toEqual(["a", "b", "x", "y"]);
  });
  it("gives only the unlocated places, as given, when none has a point", () => {
    expect(nearestOrder([onLine("q", null), onLine("p", null)], START_WEST)).toEqual(["q", "p"]);
  });
  it("handles no places and one place", () => {
    expect(nearestOrder([], START_WEST)).toEqual([]);
    expect(nearestOrder([onLine("only", 3)], null)).toEqual(["only"]);
  });
  it("uses every place once", () => {
    const set = scattered(5, 40);
    const order = nearestOrder(set, START_WEST);
    expect([...order].sort()).toEqual(ids(set).sort());
  });
  it("does not change its input", () => {
    const copy = JSON.stringify(line);
    nearestOrder(line, START_WEST);
    expect(JSON.stringify(line)).toBe(copy);
  });
});

describe("reconcileOrder", () => {
  it("keeps a saved order that still fits", () => {
    expect(reconcileOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });
  it("drops ids that are no longer listed", () => {
    expect(reconcileOrder(["gone", "b", "a"], ["a", "b"])).toEqual(["b", "a"]);
  });
  it("adds places listed since at the end, in the order they were added", () => {
    expect(reconcileOrder(["b"], ["a", "b", "c", "d"])).toEqual(["b", "a", "c", "d"]);
  });
  it("keeps one place for an id the saved order repeats", () => {
    expect(reconcileOrder(["a", "a", "b", "a"], ["a", "b"])).toEqual(["a", "b"]);
  });
  it("gives the listed order for no saved order, and nothing for nothing listed", () => {
    expect(reconcileOrder([], ["x", "y"])).toEqual(["x", "y"]);
    expect(reconcileOrder(["x"], [])).toEqual([]);
  });
});

describe("orderFor", () => {
  const set = [onLine("a", 3), onLine("b", 1), onLine("c", 2)];
  it("follows the list for added", () => {
    expect(orderFor("added", set, START_WEST, ["c", "b", "a"])).toEqual(["a", "b", "c"]);
  });
  it("follows the distance rule for nearest", () => {
    expect(orderFor("nearest", set, START_WEST, [])).toEqual(["b", "c", "a"]);
  });
  it("follows the person's order for mine, fitted to the list", () => {
    expect(orderFor("mine", set, START_WEST, ["c", "gone", "a"])).toEqual(["c", "a", "b"]);
  });
});

describe("moveStop and reverseOrder", () => {
  it("moves a stop one step earlier or later and says where it went", () => {
    expect(moveStop(["a", "b", "c"], "b", -1)).toEqual({ moved: true, order: ["b", "a", "c"], position: 1 });
    expect(moveStop(["a", "b", "c"], "b", 1)).toEqual({ moved: true, order: ["a", "c", "b"], position: 3 });
  });
  it("does not move the first stop up or the last stop down, and returns the same order", () => {
    const order = ["a", "b", "c"];
    const up = moveStop(order, "a", -1);
    const down = moveStop(order, "c", 1);
    expect(up).toEqual({ moved: false, order, position: 1 });
    expect(down).toEqual({ moved: false, order, position: 3 });
    expect(up.order).toBe(order);
  });
  it("does nothing for an id that is not in the order", () => {
    expect(moveStop(["a"], "zzz", 1)).toEqual({ moved: false, order: ["a"], position: 0 });
  });
  it("leaves the order it was given alone", () => {
    const order = ["a", "b", "c"];
    moveStop(order, "b", 1);
    expect(order).toEqual(["a", "b", "c"]);
  });
  it("is undone by the opposite move", () => {
    const first = moveStop(["a", "b", "c", "d"], "c", -1);
    expect(first.moved && moveStop(first.order, "c", 1).order).toEqual(["a", "b", "c", "d"]);
  });
  it("reverses without changing the input", () => {
    const order = ["a", "b", "c"];
    expect(reverseOrder(order)).toEqual(["c", "b", "a"]);
    expect(order).toEqual(["a", "b", "c"]);
    expect(reverseOrder(reverseOrder(order))).toEqual(order);
  });
});

describe("buildOuting", () => {
  it("measures each leg as the straight line from the previous point, with a start", () => {
    const set = [onLine("a", 1), onLine("b", 3), onLine("c", 4)];
    const o = buildOuting(set, ["a", "b", "c"], START_WEST);
    expect(o.stops.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(o.stops[0]!.legMetres).toBeCloseTo(distanceMetres(START_WEST, set[0]!.point!), 6);
    expect(o.stops[1]!.legMetres).toBeCloseTo(distanceMetres(set[0]!.point!, set[1]!.point!), 6);
    expect(o.stops[2]!.legMetres).toBeCloseTo(distanceMetres(set[1]!.point!, set[2]!.point!), 6);
  });
  it("adds the legs into a running total and a final total", () => {
    const o = buildOuting([onLine("a", 1), onLine("b", 3), onLine("c", 4)], ["a", "b", "c"], START_WEST);
    let running = 0;
    for (const s of o.stops) {
      running += s.legMetres!;
      expect(s.totalMetres).toBeCloseTo(running, 6);
    }
    expect(o.totalMetres).toBeCloseTo(running, 6);
    expect(o.complete).toBe(true);
    expect([o.legCount, o.legsKnown, o.unlocated]).toEqual([3, 3, 0]);
  });
  it("gives the first stop no leg when there is no start, and still counts the outing as complete", () => {
    const o = buildOuting([onLine("a", 1), onLine("b", 2)], ["a", "b"], null);
    expect(o.stops[0]!.legMetres).toBeNull();
    expect(o.stops[0]!.totalComplete).toBe(true);
    expect([o.legCount, o.legsKnown, o.complete]).toEqual([1, 1, true]);
  });
  it("has no legs, and is complete, for one stop and no start", () => {
    const o = buildOuting([onLine("a", 1)], ["a"], null);
    expect([o.legCount, o.legsKnown, o.totalMetres, o.complete]).toEqual([0, 0, 0, true]);
  });
  it("leaves a leg UNKNOWN (null) when either end has no map point, and says the total is not whole", () => {
    const o = buildOuting([onLine("a", 1), onLine("x", null), onLine("b", 3)], ["a", "x", "b"], START_WEST);
    expect(o.stops.map((s) => s.legMetres === null)).toEqual([false, true, true]);
    expect(o.unlocated).toBe(1);
    expect([o.legCount, o.legsKnown, o.complete]).toEqual([3, 1, false]);
    expect(o.stops[1]!.totalComplete).toBe(false);
    expect(o.stops[2]!.totalComplete).toBe(false);
    expect(o.totalMetres).toBeCloseTo(o.stops[0]!.legMetres!, 6);
  });
  it("leaves the first leg UNKNOWN when the first stop has no point but there is a start", () => {
    const o = buildOuting([onLine("x", null), onLine("a", 1)], ["x", "a"], START_WEST);
    expect(o.stops[0]!.legMetres).toBeNull();
    expect(o.stops[0]!.totalComplete).toBe(false);
  });
  it("makes no leg out of a gap: the stop after an unlocated one is UNKNOWN too, not measured from further back", () => {
    const o = buildOuting([onLine("a", 1), onLine("x", null), onLine("b", 3)], ["a", "x", "b"], null);
    expect(o.stops[2]!.legMetres).toBeNull();
  });
  it("fits a stale order to the places: unknown ids are ignored, missing ones go last", () => {
    const o = buildOuting([onLine("a", 1), onLine("b", 2), onLine("c", 3)], ["c", "gone"], null);
    expect(ids(o.stops)).toEqual(["c", "a", "b"]);
  });
  it("copies each place's facts onto its stop", () => {
    const o = buildOuting([onLine("a", 1, { name: null, tag: "limited", category: null, address: "9 Elm" })], ["a"], null);
    expect(o.stops[0]).toMatchObject({ id: "a", name: null, tag: "limited", category: null, address: "9 Elm" });
  });
  it("is empty for no places", () => {
    const o = buildOuting([], [], START_WEST);
    expect([o.stops.length, o.legCount, o.complete, o.totalMetres]).toEqual([0, 0, true, 0]);
  });
  it("reads places from the pack records", () => {
    const parsed = parsePackPlaces([{ id: "a", name: "A", wheelchair: "yes", category: "cafe", address: "x", lat: 43.65, lon: -79.38, provenance: { source_name: "OpenStreetMap", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 } }, { id: "b", name: "B", wheelchair: "weird", category: "bar" }]).places;
    const inputs = inputsFromPlaces(parsed);
    expect(inputs.map((p) => [p.id, p.tag, p.point !== null])).toEqual([["a", "yes", true], ["b", "unknown", false]]);
  });
});
