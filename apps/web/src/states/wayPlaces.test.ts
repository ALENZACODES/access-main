import { describe, expect, it } from "vitest";
import { distanceMetres } from "./packGeo";
import { bare, lcg, place } from "./placeFixtures";
import {
  DEFAULT_WAY_WIDTH, MAX_POINT_CHOICES, MAX_VIA, MAX_WAY_METRES, MIN_WAY_METRES, WAY_LIMITS, WAY_WIDTHS, buildPath, buildWay, countWayTags, filterWay, isWayLimit, isWayTagFilter, isWayWidth, longestStretch, measureAgainst, measureAlongPath, pointChoices, reverseWay, stretchesOver, wayPage, type WayRow,
} from "./wayPlaces";

const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
const LENGTH = distanceMetres(A, B);
const near = (got: number, want: number, share = 0.005) => expect(Math.abs(got - want), `${got} vs ${want}`).toBeLessThanOrEqual(Math.max(1, want * share));
const at = (id: string, name: string, lat: number, lon: number, wheelchair: string | null = "yes") => place(id, { name, lat, lon, wheelchair });
const ok = (r: ReturnType<typeof buildWay>) => {
  if (!r.ok) throw new Error(r.problem);
  return r;
};

describe("measureAgainst", () => {
  it("measures a place beside the line: how far along, and how far off", () => {
    const foot = { lat: 43.65, lon: -79.38 };
    const p = { lat: 43.6509, lon: -79.38 };
    const m = measureAgainst(A, B, p);
    expect(m.side).toBe("line");
    near(m.along, distanceMetres(A, foot));
    near(m.off, distanceMetres(foot, p));
  });

  it("puts a place before the first point at the start, measured from that point", () => {
    const p = { lat: 43.6505, lon: -79.41 };
    const m = measureAgainst(A, B, p);
    expect(m.side).toBe("start");
    expect(m.along).toBe(0);
    near(m.off, distanceMetres(A, p));
  });

  it("puts a place past the second point at the end, measured from that point", () => {
    const p = { lat: 43.6495, lon: -79.35 };
    const m = measureAgainst(A, B, p);
    expect(m.side).toBe("end");
    near(m.along, LENGTH);
    near(m.off, distanceMetres(B, p));
  });

  it("finds a point on a slanted line on it, halfway along", () => {
    const a = { lat: 43.6, lon: -79.5 };
    const b = { lat: 43.7, lon: -79.3 };
    const m = measureAgainst(a, b, { lat: 43.65, lon: -79.4 });
    expect(m.off).toBeLessThan(25);
    near(m.along, distanceMetres(a, b) / 2, 0.01);
  });

  it("measures across the date line the short way", () => {
    const a = { lat: 0, lon: 179.99 };
    const b = { lat: 0, lon: -179.99 };
    const m = measureAgainst(a, b, { lat: 0.001, lon: 180 });
    expect(m.side).toBe("line");
    near(m.off, distanceMetres({ lat: 0, lon: 180 }, { lat: 0.001, lon: 180 }));
    near(m.along, distanceMetres(a, b) / 2, 0.01);
  });

  it("agrees with great-circle distances for places near a city-length line", () => {
    const next = lcg(7);
    for (let i = 0; i < 200; i++) {
      const p = { lat: 43.64 + next() * 0.02, lon: -79.4 + next() * 0.04 };
      const m = measureAgainst(A, B, p);
      if (m.side !== "line") continue;
      // Pythagoras on the flat map against the true distance from the first point.
      near(Math.hypot(m.along, m.off), distanceMetres(A, p), 0.005);
    }
  });
});

describe("buildWay", () => {
  const set = [
    at("m", "Middle", 43.6509, -79.38),
    at("s", "Start side", 43.6505, -79.401),
    at("e", "End side", 43.6495, -79.359, "no"),
    at("f", "Far", 43.658, -79.38, "limited"),
    at("q", "Quarter", 43.6501, -79.39, null),
    bare("z"),
    bare("y"),
  ];

  it("refuses two points that are the same place, and lines too long to be useful", () => {
    expect(buildWay(set, A, A)).toEqual({ ok: false, problem: "same-point", length: 0 });
    const close = { lat: 43.65, lon: -79.4001 };
    expect(buildWay(set, A, close).ok).toBe(distanceMetres(A, close) >= MIN_WAY_METRES);
    const far = { lat: 44.2, lon: -79.4 };
    const r = buildWay(set, A, far);
    expect(r).toEqual({ ok: false, problem: "too-long", length: Math.round(distanceMetres(A, far)) });
    expect(Math.round(distanceMetres(A, far))).toBeGreaterThan(MAX_WAY_METRES);
  });

  it("lists the places within the width in order from the first point, and counts the rest", () => {
    const r = ok(buildWay(set, A, B));
    expect(r.length).toBe(Math.round(LENGTH));
    expect(r.width).toBe(DEFAULT_WAY_WIDTH);
    expect(r.rows.map((x) => [x.position, x.id, x.side])).toEqual([
      [1, "s", "start"],
      [2, "q", "line"],
      [3, "m", "line"],
      [4, "e", "end"],
    ]);
    expect(r.rows[1]?.tag).toBe("unknown");
    expect(r.outside).toBe(1);
    expect(r.unlocatedIds).toEqual(["y", "z"]);
  });

  it("gives whole metres, with the end of the line no further than its length", () => {
    const r = ok(buildWay(set, A, B));
    for (const row of r.rows) {
      expect(Number.isInteger(row.along) && Number.isInteger(row.off)).toBe(true);
      expect(row.along).toBeGreaterThanOrEqual(0);
      expect(row.along).toBeLessThanOrEqual(r.length);
    }
    expect(r.rows.at(-1)?.along).toBe(r.length);
  });

  it("widens and narrows the band with the width chosen", () => {
    expect(ok(buildWay(set, A, B, 100)).rows.map((x) => x.id)).toEqual(["s", "q", "m", "e"]);
    expect(ok(buildWay(set, A, B, 1000)).rows.map((x) => x.id)).toEqual(["s", "q", "m", "f", "e"]);
    const tight = ok(buildWay([at("m", "Middle", 43.6509, -79.38), at("w", "Wider", 43.652, -79.38)], A, B, 100));
    expect(tight.rows.map((x) => x.id)).toEqual(["m"]);
    expect(tight.outside).toBe(1);
  });

  it("puts places at the same point along the line nearer one first, then by name", () => {
    const r = ok(buildWay([at("2", "Bravo", 43.651, -79.38), at("1", "Alpha", 43.651, -79.38), at("0", "Close", 43.6502, -79.38)], A, B));
    expect(r.rows.map((x) => x.name)).toEqual(["Close", "Alpha", "Bravo"]);
  });

  it("does not change the places it is given", () => {
    const frozen = Object.freeze(set.map((p) => Object.freeze({ ...p })));
    expect(() => buildWay(frozen, A, B)).not.toThrow();
    expect(frozen.map((p) => p.id)).toEqual(set.map((p) => p.id));
  });

  it("lists from the other end when the points are swapped", () => {
    const there = ok(buildWay(set, A, B));
    const back = ok(reverseWay(set, [A, B]));
    expect(back.rows.map((x) => x.id)).toEqual([...there.rows].reverse().map((x) => x.id));
    expect(back.rows.find((x) => x.id === "s")?.side).toBe("end");
    const m = there.rows.find((x) => x.id === "m")!;
    const mb = back.rows.find((x) => x.id === "m")!;
    expect(Math.abs(m.along + mb.along - there.length)).toBeLessThanOrEqual(1);
  });
});

describe("filters, counts, pages and stretches", () => {
  const row = (position: number, id: string, along: number, tag: WayRow["tag"] = "yes"): WayRow => ({ position, id, name: id, tag, along, off: 10, side: "line", leg: 1 });
  const rows = [row(1, "a", 500), row(2, "b", 1000, "no"), row(3, "c", 1200, "unknown"), row(4, "d", 2600, "no")];

  it("keeps only the rows with a tag, numbered again from 1", () => {
    expect(filterWay(rows, "any")).toEqual(rows);
    expect(filterWay(rows, "no").map((r) => [r.position, r.id])).toEqual([
      [1, "b"],
      [2, "d"],
    ]);
    expect(filterWay(rows, "designated")).toEqual([]);
  });

  it("counts the rows with each tag", () => {
    expect(countWayTags(rows)).toEqual({ any: 4, yes: 1, limited: 0, no: 2, designated: 0, unknown: 1 });
  });

  it("finds the longest part of the line with no listed place", () => {
    expect(longestStretch(rows, 3000)).toEqual({ from: 1200, to: 2600 });
    expect(longestStretch([], 3000)).toEqual({ from: 0, to: 3000 });
    expect(longestStretch([row(1, "a", 2900)], 3000)).toEqual({ from: 0, to: 2900 });
    expect(longestStretch([row(1, "a", 0), row(2, "b", 0)], 0)).toBeUndefined();
  });

  it("pages the rows and says how many were left out", () => {
    expect(wayPage(rows, 2)).toEqual({ rows: rows.slice(0, 2), more: 2 });
    expect(wayPage(rows, 10)).toEqual({ rows, more: 0 });
    expect(wayPage(rows, -1)).toEqual({ rows: [], more: 4 });
  });

  it("accepts only the widths, limits and tags it offers", () => {
    for (const w of WAY_WIDTHS) expect(isWayWidth(w)).toBe(true);
    for (const n of WAY_LIMITS) expect(isWayLimit(n)).toBe(true);
    expect([isWayWidth(300), isWayWidth("250"), isWayLimit(7), isWayTagFilter("maybe"), isWayTagFilter(1)]).toEqual([false, false, false, false, false]);
    expect(isWayTagFilter("unknown")).toBe(true);
  });
});

describe("a path with points in between", () => {
  // An L-shaped path: east along 43.65, then north along -79.36.
  const C = { lat: 43.67, lon: -79.36 };
  const leg1 = distanceMetres(A, B);
  const leg2 = distanceMetres(B, C);

  it("measures along the whole path, from the part a place is nearest", () => {
    const m = measureAlongPath([A, B, C], { lat: 43.66, lon: -79.3591 });
    expect(m.leg).toBe(2);
    expect(m.side).toBe("line");
    near(m.along, leg1 + distanceMetres(B, { lat: 43.66, lon: -79.36 }));
    near(m.off, distanceMetres({ lat: 43.66, lon: -79.36 }, { lat: 43.66, lon: -79.3591 }));
  });

  it("measures a place at an inner corner from the corner, on the path, not off its end", () => {
    const m = measureAlongPath([A, B, C], { lat: 43.6495, lon: -79.3595 });
    expect(m.side).toBe("line");
    near(m.along, leg1, 0.01);
  });

  it("gives the first part on a tie, and still only lets the ends be before or past", () => {
    const m = measureAlongPath([A, B, C], { lat: 43.6505, lon: -79.401 });
    expect([m.leg, m.side]).toEqual([1, "start"]);
    const end = measureAlongPath([A, B, C], { lat: 43.671, lon: -79.36 });
    expect([end.leg, end.side]).toEqual([2, "end"]);
  });

  it("lists the places along both parts in order, and gives the length of each part", () => {
    const places = [at("n", "North", 43.66, -79.3591), at("w", "West", 43.6501, -79.39), at("c", "Corner", 43.6495, -79.3595), at("x", "Off", 43.66, -79.39)];
    const r = ok(buildPath(places, [A, B, C]));
    expect(r.legs).toEqual([Math.round(leg1), Math.round(leg2)]);
    expect(r.length).toBe(Math.round(leg1 + leg2));
    expect(r.rows.map((x) => [x.id, x.leg])).toEqual([
      ["w", 1],
      ["c", 1],
      ["n", 2],
    ]);
    expect(r.outside).toBe(1);
  });

  it("refuses a point in between at the same place as the one before it", () => {
    expect(buildPath([], [A, B, B, C])).toMatchObject({ ok: false, problem: "same-point" });
  });

  it("refuses a path too long in all, even when each part is short", () => {
    const zig = [A, { lat: 43.65, lon: -79.1 }, { lat: 43.66, lon: -79.4 }, { lat: 43.67, lon: -79.1 }, { lat: 43.68, lon: -79.4 }];
    const r = buildPath([], zig);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toBe("too-long");
  });

  it("takes two to five points and no other number", () => {
    expect(() => buildPath([], [A])).toThrow(RangeError);
    expect(() => buildPath([], [A, B, C, A, B, C])).toThrow(RangeError);
    expect(MAX_VIA).toBe(3);
  });

  it("lists from the other end with the points in between reversed", () => {
    const places = [at("n", "North", 43.66, -79.3591), at("w", "West", 43.6501, -79.39)];
    const back = ok(reverseWay(places, [A, B, C]));
    expect(back.rows.map((x) => [x.id, x.leg])).toEqual([
      ["n", 1],
      ["w", 2],
    ]);
    expect(back.legs).toEqual([Math.round(leg2), Math.round(leg1)]);
  });
});

describe("stretchesOver", () => {
  const row = (along: number): WayRow => ({ position: 1, id: String(along), name: null, tag: "yes", along, off: 0, side: "line", leg: 1 });

  it("lists every empty part at least that long, in order", () => {
    expect(stretchesOver([row(300), row(1500), row(1700)], 3000, 500)).toEqual([
      { from: 300, to: 1500 },
      { from: 1700, to: 3000 },
    ]);
    expect(stretchesOver([row(300), row(1500), row(1700)], 3000, 1300)).toEqual([{ from: 1700, to: 3000 }]);
  });

  it("covers the whole line when nothing is listed, and nothing when all parts are short", () => {
    expect(stretchesOver([], 900, 500)).toEqual([{ from: 0, to: 900 }]);
    expect(stretchesOver([row(400), row(800)], 1200, 500)).toEqual([]);
  });
});

describe("pointChoices", () => {
  it("offers the places with a map point by name, unnamed last, and counts the rest", () => {
    const places = [at("2", "Bravo", 43.65, -79.38), place("u", { name: null, lat: 43.65, lon: -79.38 }), at("1", "alpha", 43.65, -79.39), bare("z"), at("0", "Bravo", 43.66, -79.38)];
    const { choices, more } = pointChoices(places);
    expect(choices.map((c) => c.id)).toEqual(["1", "0", "2", "u"]);
    expect(choices[0]?.point).toEqual({ lat: 43.65, lon: -79.39 });
    expect(more).toBe(0);
    const capped = pointChoices(places, 2);
    expect(capped.choices.map((c) => c.id)).toEqual(["1", "0"]);
    expect(capped.more).toBe(2);
    expect(MAX_POINT_CHOICES).toBe(200);
  });
});
