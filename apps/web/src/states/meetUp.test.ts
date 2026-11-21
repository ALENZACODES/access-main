import { describe, expect, it } from "vitest";
import { DEFAULT_MEET_UP_LIMIT, DEFAULT_MEET_UP_ORDER, MEET_UP_LIMITS, MEET_UP_ORDERS, type MeetUpOrder, buildMeetUp, halfway, isMeetUpLimit, isMeetUpOrder, meetUpPage } from "./meetUp";
import { distanceMetres } from "./packGeo";
import { bare, lcg, place, varied } from "./placeFixtures";

const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
/** A place on the line between A and B at a fraction f of the way, a little north. */
const on = (id: string, f: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + 0.0001, lon: A.lon + (B.lon - A.lon) * f, ...over });
const ids = (r: { rows: readonly { id: string }[] }) => r.rows.map((x) => x.id);

describe("orders and limits", () => {
  it("has four orders, balanced first, and recognises only those", () => {
    expect([...MEET_UP_ORDERS]).toEqual(["balanced", "total", "a", "b"]);
    expect(DEFAULT_MEET_UP_ORDER).toBe("balanced");
    for (const o of MEET_UP_ORDERS) expect(isMeetUpOrder(o)).toBe(true);
    for (const v of ["", "A", "fair", null, 1]) expect(isMeetUpOrder(v)).toBe(false);
  });
  it("has three limits, ten by default", () => {
    expect([...MEET_UP_LIMITS]).toEqual([5, 10, 25]);
    expect(DEFAULT_MEET_UP_LIMIT).toBe(10);
    expect(isMeetUpLimit(10)).toBe(true);
    expect(isMeetUpLimit(7)).toBe(false);
    expect(isMeetUpLimit("10")).toBe(false);
  });
});

describe("halfway", () => {
  it("is the average of the two points, to five decimals", () => {
    expect(halfway({ lat: 43.65, lon: -79.4 }, { lat: 43.66, lon: -79.36 })).toEqual({ lat: 43.655, lon: -79.38 });
    expect(halfway({ lat: 43.123456, lon: -79.1 }, { lat: 43.123457, lon: -79.1 })).toEqual({ lat: 43.12346, lon: -79.1 });
  });
  it("is the point itself for two equal points", () => expect(halfway(A, A)).toEqual(A));
  it("is the same whichever way round", () => expect(halfway(A, B)).toEqual(halfway(B, A)));
  it("crosses the date line the short way", () => {
    // 180 and -180 are the same meridian.
    expect(Math.abs(halfway({ lat: 0, lon: 179 }, { lat: 0, lon: -179 }).lon)).toBe(180);
    expect(Math.abs(halfway({ lat: 0, lon: -179 }, { lat: 0, lon: 179 }).lon)).toBe(180);
    expect(halfway({ lat: 0, lon: 179 }, { lat: 0, lon: -178 }).lon).toBe(-179.5);
    expect(halfway({ lat: 0, lon: -179 }, { lat: 0, lon: 178 }).lon).toBe(179.5);
  });
  it("is equidistant from the two points for a nearby pair", () => {
    const m = halfway(A, B);
    expect(Math.abs(distanceMetres(m, A) - distanceMetres(m, B))).toBeLessThan(2);
  });
});

describe("buildMeetUp", () => {
  it("measures each placed place from both points, in whole metres", () => {
    const p = on("p", 0.5);
    const r = buildMeetUp([p], A, B);
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0]!;
    expect(row.metresA).toBe(Math.round(distanceMetres(A, p.location!)));
    expect(row.metresB).toBe(Math.round(distanceMetres(B, p.location!)));
    expect(row.longer).toBe(Math.max(row.metresA, row.metresB));
    expect(row.total).toBe(row.metresA + row.metresB);
    expect(row.gap).toBe(Math.abs(row.metresA - row.metresB));
    expect(row.position).toBe(1);
  });
  it("says which point a place is nearer to, and same for a tie", () => {
    const r = buildMeetUp([on("near-a", 0.1), on("near-b", 0.9), on("mid", 0.5, { lat: A.lat, lon: (A.lon + B.lon) / 2 })], A, B);
    const by = new Map(r.rows.map((x) => [x.id, x] as const));
    expect(by.get("near-a")!.nearer).toBe("a");
    expect(by.get("near-b")!.nearer).toBe("b");
    expect(by.get("mid")!.nearer).toBe("same");
    expect(by.get("mid")!.gap).toBe(0);
  });
  it("reports how far apart the points are and where halfway is", () => {
    const r = buildMeetUp([], A, B);
    expect(r.apartMetres).toBe(Math.round(distanceMetres(A, B)));
    expect(r.middle).toEqual(halfway(A, B));
    expect(r.rows).toEqual([]);
  });
  it("sets aside places with no usable point and sorts their ids", () => {
    const odd = { ...on("n", 0.5), location: { lat: Number.NaN, lon: 0 } };
    const r = buildMeetUp([bare("y"), on("a", 0.5), bare("x"), odd], A, B);
    expect(r.unlocatedIds).toEqual(["n", "x", "y"]);
    expect(ids(r)).toEqual(["a"]);
  });
});

describe("the four orders", () => {
  const ps = [on("a1", 0.05, { name: "Near A" }), on("mid", 0.5, { name: "Middle" }), on("b1", 0.95, { name: "Near B" }), on("far", 1.6, { name: "Beyond B" }), on("back", -0.6, { name: "Behind A" })];
  const order = (o: MeetUpOrder) => ids(buildMeetUp(ps, A, B, o));
  it("balanced puts the middle first and the far ones last", () => {
    const r = order("balanced");
    expect(r[0]).toBe("mid");
    expect(r.slice(-2).sort()).toEqual(["back", "far"]);
  });
  it("total puts a place between the two points before one beyond them", () => {
    const r = order("total");
    expect(r.indexOf("mid")).toBeLessThan(r.indexOf("far"));
    expect(r.indexOf("a1")).toBeLessThan(r.indexOf("back"));
  });
  it("a is nearest to the first point first, b to the second", () => {
    // Behind A is about 1.9 km from A; Near B is about 3 km from A.
    expect(order("a")).toEqual(["a1", "mid", "back", "b1", "far"]);
    expect(order("b")).toEqual(["b1", "mid", "far", "a1", "back"]);
  });
  it("numbers positions from 1 in the order chosen", () => {
    for (const o of MEET_UP_ORDERS) expect(buildMeetUp(ps, A, B, o).rows.map((x) => x.position)).toEqual([1, 2, 3, 4, 5]);
  });
  it("breaks ties by name, with an unnamed place last, then id", () => {
    const tied = [on("t3", 0.5, { name: null }), on("t2", 0.5, { name: "Same" }), on("t1", 0.5, { name: "same" })];
    expect(ids(buildMeetUp(tied, A, B))).toEqual(["t1", "t2", "t3"]);
  });
  it("is the default when no order is given", () => expect(ids(buildMeetUp(ps, A, B))).toEqual(order("balanced")));
  it("swapping the two points swaps the roles: the a order becomes the b order", () => {
    expect(ids(buildMeetUp(ps, B, A, "a"))).toEqual(ids(buildMeetUp(ps, A, B, "b")));
    expect(ids(buildMeetUp(ps, B, A, "balanced"))).toEqual(ids(buildMeetUp(ps, A, B, "balanced")));
    expect(ids(buildMeetUp(ps, B, A, "total"))).toEqual(ids(buildMeetUp(ps, A, B, "total")));
  });
  it("balanced and total can disagree: a place near one point and far from the other", () => {
    const lopsided = [on("sideways", 0.5, { lat: 43.65 + 0.003, name: "Aaa" }), on("lopsided", 0.02, { name: "Zzz" })];
    expect(ids(buildMeetUp(lopsided, A, B, "balanced"))[0]).toBe("sideways");
  });
});

describe("any layout", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const next = lcg(seed);
    const a = { lat: 43.6 + next() * 0.05, lon: -79.45 + next() * 0.05 };
    const b = { lat: 43.6 + next() * 0.05, lon: -79.45 + next() * 0.05 };
    const data = varied(seed + 30, 80);
    for (const order of MEET_UP_ORDERS) {
      it(`seed ${seed}, ${order}: every place appears once, either placed or set aside`, () => {
        const r = buildMeetUp(data, a, b, order);
        expect(r.rows.length + r.unlocatedIds.length).toBe(data.length);
        expect(new Set([...ids(r), ...r.unlocatedIds]).size).toBe(data.length);
      });
      it(`seed ${seed}, ${order}: the result does not depend on the input order`, () => {
        expect(buildMeetUp([...data].reverse(), a, b, order)).toEqual(buildMeetUp(data, a, b, order));
      });
    }
    it(`seed ${seed}: the larger distance is at least half the distance between the points, and the sum at least all of it`, () => {
      const r = buildMeetUp(data, a, b);
      for (const x of r.rows) {
        expect(x.longer * 2).toBeGreaterThanOrEqual(r.apartMetres - 2);
        expect(x.total).toBeGreaterThanOrEqual(r.apartMetres - 2);
      }
    });
    it(`seed ${seed}: rows are sorted by the order's key`, () => {
      const r = buildMeetUp(data, a, b, "balanced");
      for (let i = 0; i + 1 < r.rows.length; i++) expect(r.rows[i]!.longer).toBeLessThanOrEqual(r.rows[i + 1]!.longer);
      const t = buildMeetUp(data, a, b, "total");
      for (let i = 0; i + 1 < t.rows.length; i++) expect(t.rows[i]!.total).toBeLessThanOrEqual(t.rows[i + 1]!.total);
    });
    it(`seed ${seed}: the first row of the balanced order has the smallest larger distance`, () => {
      const r = buildMeetUp(data, a, b, "balanced");
      if (r.rows.length > 0) expect(r.rows[0]!.longer).toBe(Math.min(...r.rows.map((x) => x.longer)));
    });
  }
  it("does not change its input", () => {
    const data = varied(2, 20);
    const copy = [...data];
    buildMeetUp(data, A, B, "a");
    expect(data).toEqual(copy);
  });
});

describe("meetUpPage", () => {
  const r = buildMeetUp(varied(9, 60).filter((p) => p.location), A, B);
  it("lists the first rows and says how many were left out", () => {
    const page = meetUpPage(r, 10);
    expect(page.rows).toHaveLength(10);
    expect(page.more).toBe(r.rows.length - 10);
    expect(page.rows.map((x) => x.id)).toEqual(ids(r).slice(0, 10));
  });
  it("leaves out nothing when the limit is at least the count", () => {
    expect(meetUpPage(r, 1000)).toEqual({ rows: r.rows, more: 0 });
  });
  it("uses ten by default and treats a negative or fractional limit sensibly", () => {
    expect(meetUpPage(r).rows).toHaveLength(10);
    expect(meetUpPage(r, -3)).toEqual({ rows: [], more: r.rows.length });
    expect(meetUpPage(r, 2.9).rows).toHaveLength(2);
  });
});
