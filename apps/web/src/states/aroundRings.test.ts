import { describe, expect, it } from "vitest";
import { AROUND_TAG_COLUMNS, countTags, directionsWithPlaces, emptyTagCounts, ringEdges, ringRows, sectorRows } from "./aroundRings";
import { buildAroundList, type AroundMember } from "./aroundSearch";
import { at, crossroads } from "./aroundFixtures";

const m = (id: string, metres: number, tag: AroundMember["tag"], direction: AroundMember["direction"], name: string | null = id): AroundMember => ({ id, name, tag, category: null, address: null, metres, direction });

describe("ringEdges", () => {
  it("lists the standard edges below the radius, then the radius", () => {
    expect(ringEdges(100)).toEqual([50, 100]);
    expect(ringEdges(250)).toEqual([50, 100, 250]);
    expect(ringEdges(500)).toEqual([50, 100, 250, 500]);
    expect(ringEdges(1000)).toEqual([50, 100, 250, 500, 1000]);
  });
  it("gives a single band for a very small radius", () => {
    expect(ringEdges(30)).toEqual([30]);
    expect(ringEdges(50)).toEqual([50]);
  });
  it("gives a final band at an odd radius", () => {
    expect(ringEdges(300)).toEqual([50, 100, 250, 300]);
  });
  it("gives none for a radius that is not a distance", () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) expect(ringEdges(bad)).toEqual([]);
  });
});

describe("countTags", () => {
  it("starts every tag at zero", () => {
    expect(emptyTagCounts()).toEqual({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 });
  });
  it("counts each tag", () => {
    expect(countTags([{ tag: "yes" }, { tag: "yes" }, { tag: "no" }, { tag: "unknown" }])).toEqual({ yes: 2, limited: 0, no: 1, designated: 0, unknown: 1 });
  });
  it("lists the tags in the order used on the rest of the page", () => {
    expect([...AROUND_TAG_COLUMNS]).toEqual(["yes", "limited", "no", "designated", "unknown"]);
  });
});

describe("ringRows", () => {
  const members = [m("a", 0, "yes", null), m("b", 50, "no", "N"), m("c", 50.5, "no", "E"), m("d", 100, "limited", "S"), m("e", 249, "unknown", "W"), m("f", 250, "yes", "N")];
  it("puts a place at exactly an edge in the band that ends there", () => {
    const rows = ringRows(members, 250);
    expect(rows.map((r) => [r.from, r.upTo, r.count])).toEqual([[0, 50, 2], [50, 100, 2], [100, 250, 2]]);
  });
  it("takes a place at the same spot into the first band", () => {
    expect(ringRows(members, 250)[0]!.byTag.yes).toBe(1);
  });
  it("splits the tags within each band", () => {
    const rows = ringRows(members, 250);
    expect(rows[0]!.byTag).toEqual({ yes: 1, limited: 0, no: 1, designated: 0, unknown: 0 });
    expect(rows[1]!.byTag).toEqual({ yes: 0, limited: 1, no: 1, designated: 0, unknown: 0 });
    expect(rows[2]!.byTag).toEqual({ yes: 1, limited: 0, no: 0, designated: 0, unknown: 1 });
  });
  it("adds up to the number of places, so none is lost or counted twice", () => {
    const rows = ringRows(members, 250);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(members.length);
  });
  it("gives zero rows when nothing is listed, and still one row per band", () => {
    const rows = ringRows([], 500);
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.count).toBe(0);
  });
  it("matches a real search", () => {
    const r = buildAroundList(crossroads(), "centre", 250);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(ringRows(r.members, 250).map((x) => x.count)).toEqual([0, 1, 1 + 1 + 1]);
  });
});

describe("sectorRows", () => {
  const members = [m("n1", 30, "yes", "N"), m("n2", 10, "no", "N"), m("e", 60, "limited", "E"), m("same", 0, "unknown", null), m("sw", 90, "yes", "SW", null)];
  it("has a row for each point and one for the same spot", () => {
    expect(sectorRows(members).map((r) => r.point)).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW", null]);
  });
  it("counts and splits tags per direction", () => {
    const north = sectorRows(members)[0]!;
    expect(north.count).toBe(2);
    expect(north.byTag).toEqual({ yes: 1, limited: 0, no: 1, designated: 0, unknown: 0 });
  });
  it("names the closest place in a direction, with a null name left as null", () => {
    const rows = sectorRows(members);
    expect(rows[0]!.nearest).toEqual({ id: "n2", name: "n2", metres: 10 });
    expect(rows.find((r) => r.point === "SW")!.nearest).toEqual({ id: "sw", name: null, metres: 90 });
    expect(rows[1]!.nearest).toBeNull();
  });
  it("counts the same-spot places in their own row", () => {
    expect(sectorRows(members).find((r) => r.point === null)!.count).toBe(1);
  });
  it("adds up to the number of places", () => {
    expect(sectorRows(members).reduce((n, r) => n + r.count, 0)).toBe(members.length);
  });
});

describe("directionsWithPlaces", () => {
  it("lists directions in compass order without repeats", () => {
    expect(directionsWithPlaces([m("a", 1, "yes", "W"), m("b", 1, "yes", "N"), m("c", 1, "yes", "W"), m("d", 1, "yes", null)])).toEqual(["N", "W"]);
  });
  it("is empty for no places", () => {
    expect(directionsWithPlaces([])).toEqual([]);
  });
  it("finds all four neighbours of the crossroads", () => {
    const r = buildAroundList([...crossroads(), at("x", 10, 10)], "centre", 250);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(directionsWithPlaces(r.members)).toEqual(["N", "NE", "E", "S", "W"]);
  });
});
