import { describe, expect, it } from "vitest";
import { AROUND_RADII, DEFAULT_AROUND_RADIUS, buildAround, centreChoices, centreOf, compareAround, isAroundRadius, type AroundMember } from "./aroundSearch";
import { at, crossroads } from "./aroundFixtures";
import { distanceMetres } from "./packGeo";
import { bare, place } from "./placeFixtures";

function ok(result: ReturnType<typeof buildAround>) {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result;
}

describe("radii", () => {
  it("offers four distances, smallest first, and starts at 250", () => {
    expect([...AROUND_RADII]).toEqual([100, 250, 500, 1000]);
    expect(DEFAULT_AROUND_RADIUS).toBe(250);
  });
  it("recognises only the offered distances", () => {
    for (const r of AROUND_RADII) expect(isAroundRadius(r)).toBe(true);
    for (const bad of [0, 99, 101, 250.5, "250", null, undefined, Number.NaN, 2000]) expect(isAroundRadius(bad)).toBe(false);
  });
});

describe("buildAround statuses", () => {
  const places = crossroads();
  it("asks for a centre when none is chosen", () => {
    expect(buildAround(places, null, 250)).toEqual({ status: "no-centre" });
    expect(buildAround(places, "", 250)).toEqual({ status: "no-centre" });
  });
  it("says when the chosen place is not in the list", () => {
    expect(buildAround(places, "gone", 250)).toEqual({ status: "centre-not-found", id: "gone" });
  });
  it("says when the chosen place has no map point, and how many others there are", () => {
    const r = buildAround(places, "nopoint", 250);
    expect(r.status).toBe("centre-has-no-point");
    if (r.status === "centre-has-no-point") {
      expect(r.centre.id).toBe("nopoint");
      expect(r.others).toBe(places.length - 1);
    }
  });
  it("gives an empty list for an empty pack", () => {
    expect(buildAround([], "centre", 250)).toEqual({ status: "centre-not-found", id: "centre" });
  });
});

describe("buildAround around the crossroads", () => {
  const places = crossroads();
  it("lists the four neighbours within 250 m, nearest first, with directions", () => {
    const r = ok(buildAround(places, "centre", 250));
    expect(r.members.map((m) => [m.id, m.direction])).toEqual([["n", "N"], ["e", "E"], ["s", "S"], ["w", "W"]].map(([id, d]) => [id, d]));
    expect(r.members.map((m) => Math.round(m.metres))).toEqual([80, 120, 200, 240]);
  });
  it("counts the far place as beyond and the mapless one as unmeasured", () => {
    const r = ok(buildAround(places, "centre", 250));
    expect(r.beyond).toBe(1);
    expect(r.unmeasured).toBe(1);
    expect(r.members.length + r.beyond + r.unmeasured + 1).toBe(places.length);
  });
  it("keeps only the nearer ones at 100 m", () => {
    const r = ok(buildAround(places, "centre", 100));
    expect(r.members.map((m) => m.id)).toEqual(["n"]);
    expect(r.beyond).toBe(4);
  });
  it("takes in the far place at 1 km", () => {
    const r = ok(buildAround(places, "centre", 1000));
    expect(r.members.map((m) => m.id)).toEqual(["n", "e", "s", "w", "far"]);
    expect(r.beyond).toBe(0);
  });
  it("carries each place's own tag, kind and address, not the centre's", () => {
    const r = ok(buildAround(places, "centre", 250));
    expect(r.members.map((m) => m.tag)).toEqual(["no", "limited", "designated", "unknown"]);
    expect(r.members[0]).toMatchObject({ name: "North Cafe", category: "cafe", address: "1 Main Street" });
  });
  it("describes the centre", () => {
    expect(ok(buildAround(places, "centre", 250)).centre).toEqual({ id: "centre", name: "Centre Hall", tag: "yes", address: "1 Main Street" });
  });
  it("never lists the centre in its own list", () => {
    for (const r of AROUND_RADII) expect(ok(buildAround(places, "centre", r)).members.some((m) => m.id === "centre")).toBe(false);
  });
  it("measures from whichever place is chosen", () => {
    const r = ok(buildAround(places, "e", 250));
    expect(r.members.map((m) => [m.id, m.direction])).toEqual([["centre", "W"], ["n", "NW"], ["s", "SW"]]);
  });
});

describe("a place at exactly the radius", () => {
  it("is inside, and one metre more is outside", () => {
    const edge = [at("c", 0, 0), at("in", 100, 0), at("out", 102, 0)];
    const r = ok(buildAround(edge, "c", 100));
    expect(r.members.map((m) => m.id)).toEqual(["in"]);
    expect(r.beyond).toBe(1);
  });
});

describe("the distance is inclusive to the last bit", () => {
  it("lists a place whose distance equals the radius given, and not one a hair beyond", () => {
    const [c, p] = [at("c", 0, 0), at("p", 137, 61)];
    const d = distanceMetres(c.location!, p.location!);
    expect(ok(buildAround([c, p], "c", d)).members.map((m) => m.id)).toEqual(["p"]);
    const hair = ok(buildAround([c, p], "c", d - 1e-6));
    expect(hair.members).toEqual([]);
    expect(hair.beyond).toBe(1);
  });
});

describe("places at the same spot", () => {
  it("are listed with no direction and come first", () => {
    const r = ok(buildAround([at("c", 0, 0), at("twin", 0, 0), at("n", 50, 0)], "c", 250));
    expect(r.members.map((m) => [m.id, m.direction])).toEqual([["twin", null], ["n", "N"]]);
  });
});

describe("places with missing details", () => {
  it("lists a place with no name, no tag and no address as UNKNOWN-valued fields, not dropped", () => {
    const b = place("b", { name: null, wheelchair: null, address: null, category: null, lat: at("x", 30, 0).location!.lat, lon: at("x", 30, 0).location!.lon });
    const r = ok(buildAround([at("c", 0, 0), b], "c", 250));
    expect(r.members).toHaveLength(1);
    expect(r.members[0]).toMatchObject({ id: "b", name: null, tag: "unknown", address: null, category: null });
  });
  it("counts a fully bare record as unmeasured", () => {
    const r = ok(buildAround([at("c", 0, 0), bare("z")], "c", 250));
    expect(r.members).toEqual([]);
    expect(r.unmeasured).toBe(1);
  });
  it("does not count a repeated id twice", () => {
    const dup = at("n", 50, 0);
    const r = ok(buildAround([at("c", 0, 0), dup, dup], "c", 250));
    expect(r.members).toHaveLength(1);
  });
});

describe("compareAround", () => {
  const m = (id: string, name: string | null, metres: number): AroundMember => ({ id, name, tag: "yes", category: null, address: null, metres, direction: "N" });
  it("puts nearer first", () => {
    expect(compareAround(m("a", "Z", 10), m("b", "A", 20))).toBeLessThan(0);
  });
  it("breaks a tie with a named place before an unnamed one, then name, then id", () => {
    expect(compareAround(m("a", null, 10), m("b", "B", 10))).toBeGreaterThan(0);
    expect(compareAround(m("a", "Beta", 10), m("b", "alpha", 10))).toBeGreaterThan(0);
    expect(compareAround(m("a", "Same", 10), m("b", "Same", 10))).toBeLessThan(0);
    expect(compareAround(m("a", "Same", 10), m("a", "Same", 10))).toBe(0);
  });
});

describe("centreChoices", () => {
  it("offers only places with a map point, by name, unnamed last", () => {
    const list = [at("b", 0, 0, { name: "Béta" }), at("none", null, null), at("a", 5, 5, { name: "alpha" }), at("u", 9, 9, { name: null }), at("c", 7, 7, { name: "Gamma" })];
    expect(centreChoices(list).map((p) => p.id)).toEqual(["a", "b", "c", "u"]);
  });
  it("keeps the input as it was", () => {
    const list = [at("b", 0, 0), at("a", 5, 5)];
    centreChoices(list);
    expect(list.map((p) => p.id)).toEqual(["b", "a"]);
  });
  it("summarises a place as a centre", () => {
    expect(centreOf(at("q", 1, 1, { name: null, wheelchair: "no" }))).toEqual({ id: "q", name: null, tag: "no", address: "1 Main Street" });
  });
});
