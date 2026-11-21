import { describe, expect, it } from "vitest";
import { MEET_UP_ORDERS, type MeetUpOrder, buildMeetUp, halfway, meetUpPage } from "./meetUp";
import { meetUpToCsv, meetUpToText } from "./meetUpCopy";
import { meetUpToGeoJson } from "./meetUpGeo";
import { NO_PACES, meetUpMinutes } from "./meetUpTime";
import { distanceMetres } from "./packGeo";
import { lcg, place, varied } from "./placeFixtures";

/** Written apart from the module: the key each order sorts by, as a plain function of two distances. */
const keyOf = (o: MeetUpOrder, a: number, b: number): [number, number] => {
  const longer = Math.max(a, b);
  const total = a + b;
  return o === "balanced" ? [longer, total] : o === "total" ? [total, longer] : o === "a" ? [a, b] : [b, a];
};
const cmp = (x: [number, number], y: [number, number]): number => x[0] - y[0] || x[1] - y[1];
const shuffle = <T,>(xs: readonly T[], seed: number): T[] => {
  const next = lcg(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};
const pt = (next: () => number) => ({ lat: 43.55 + next() * 0.2, lon: -79.55 + next() * 0.3 });

describe("an independent check of every order", () => {
  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
    const next = lcg(seed);
    const a = pt(next);
    const b = pt(next);
    const data = varied(seed + 100, 120);
    for (const order of MEET_UP_ORDERS) {
      it(`seed ${seed}, ${order}: every row's distances are the haversine distances, rounded, and the keys never decrease`, () => {
        const r = buildMeetUp(data, a, b, order);
        const byId = new Map(data.map((p) => [p.id, p] as const));
        let prev: [number, number] | null = null;
        for (const row of r.rows) {
          const loc = byId.get(row.id)!.location!;
          expect(row.metresA).toBe(Math.round(distanceMetres(a, loc)));
          expect(row.metresB).toBe(Math.round(distanceMetres(b, loc)));
          const k = keyOf(order, row.metresA, row.metresB);
          if (prev) expect(cmp(prev, k)).toBeLessThanOrEqual(0);
          prev = k;
        }
      });
      it(`seed ${seed}, ${order}: five shuffles of the input give the identical result`, () => {
        const base = buildMeetUp(data, a, b, order);
        for (let s = 1; s <= 5; s++) expect(buildMeetUp(shuffle(data, s * 7 + seed), a, b, order)).toEqual(base);
      });
    }
    it(`seed ${seed}: the first row of each order is a minimum of its own key over all places`, () => {
      for (const order of MEET_UP_ORDERS) {
        const r = buildMeetUp(data, a, b, order);
        if (r.rows.length === 0) continue;
        const keys = r.rows.map((x) => keyOf(order, x.metresA, x.metresB));
        const best = keys.reduce((m, k) => (cmp(k, m) < 0 ? k : m));
        expect(keys[0]).toEqual(best);
      }
    });
    it(`seed ${seed}: halfway is as near one point as the other, to within a few metres, and between them`, () => {
      const m = halfway(a, b);
      expect(Math.abs(distanceMetres(m, a) - distanceMetres(m, b))).toBeLessThan(25);
      expect(distanceMetres(m, a)).toBeLessThanOrEqual(distanceMetres(a, b) / 2 + 25);
    });
    it(`seed ${seed}: paging covers every row exactly once`, () => {
      const r = buildMeetUp(data, a, b);
      for (const limit of [5, 10, 25] as const) {
        const page = meetUpPage(r, limit);
        expect(page.rows.length + page.more).toBe(r.rows.length);
        expect(page.rows).toEqual(r.rows.slice(0, limit));
      }
    });
    it(`seed ${seed}: the files hold every located place, once each`, () => {
      const r = buildMeetUp(data, a, b);
      const csvLines = meetUpToCsv(r, data, "en").slice(1).split("\r\n").filter(Boolean);
      expect(csvLines).toHaveLength(1 + r.rows.length + r.unlocatedIds.length);
      const geo = JSON.parse(meetUpToGeoJson(r, a, b, data, NO_PACES)) as { features: { properties: { id?: string } }[] };
      const ids = geo.features.map((f) => f.properties.id).filter((x): x is string => x !== undefined);
      expect(new Set(ids).size).toBe(r.rows.length);
      const txt = meetUpToText(r, a, b, "en");
      expect(txt.split("\n").filter((l) => /^\d+\. /.test(l))).toHaveLength(r.rows.length);
    });
  }
});

describe("minutes against distance", () => {
  it("never fall as distance grows and never fall as pace slows", () => {
    const next = lcg(99);
    for (let i = 0; i < 200; i++) {
      const m1 = Math.floor(next() * 5000);
      const m2 = m1 + Math.floor(next() * 500);
      const kmh = 0.5 + next() * 7.5;
      const slower = kmh * 0.7 < 0.5 ? 0.5 : kmh * 0.7;
      expect(meetUpMinutes({ metresA: m2, metresB: 0 }, { a: kmh, b: null }).a!).toBeGreaterThanOrEqual(meetUpMinutes({ metresA: m1, metresB: 0 }, { a: kmh, b: null }).a!);
      expect(meetUpMinutes({ metresA: m1, metresB: 0 }, { a: slower, b: null }).a!).toBeGreaterThanOrEqual(meetUpMinutes({ metresA: m1, metresB: 0 }, { a: kmh, b: null }).a!);
    }
  });
  it("the time is never less than the distance divided by the pace", () => {
    for (const [m, kmh] of [[1, 8], [83, 5], [84, 5], [4000, 4], [12345, 3.3]] as const) {
      const min = meetUpMinutes({ metresA: m, metresB: 0 }, { a: kmh, b: null }).a!;
      expect(min * ((kmh * 1000) / 60)).toBeGreaterThanOrEqual(m - 1e-9);
      expect((min - 1) * ((kmh * 1000) / 60)).toBeLessThan(m);
    }
  });
});

describe("awkward names in the files", () => {
  const odd = [place("f", { name: "=SUM(1+1)", lat: 43.65, lon: -79.38 }), place("g", { name: "Line\nbreak, \"quoted\"", lat: 43.65, lon: -79.39 }), place("h", { name: "Ünï — café", lat: 43.65, lon: -79.37 })];
  const A = { lat: 43.65, lon: -79.4 };
  const B = { lat: 43.65, lon: -79.36 };
  const r = buildMeetUp(odd, A, B);
  it("a name that starts like a formula is defused in the CSV", () => {
    const csv = meetUpToCsv(r, odd, "en");
    expect(csv).not.toMatch(/(^|,)=SUM/m);
    expect(csv).toContain("'=SUM(1+1)");
  });
  it("a name with a comma and quotes stays in one quoted cell (the pack reader has already turned a line break into a space)", () => {
    expect(meetUpToCsv(r, odd, "en")).toContain('"Line break, ""quoted"""');
  });
  it("accents survive in the text, the CSV and the GeoJSON", () => {
    expect(meetUpToText(r, A, B, "en")).toContain("Ünï — café");
    expect(meetUpToCsv(r, odd, "en")).toContain("Ünï — café");
    expect(meetUpToGeoJson(r, A, B, odd, NO_PACES)).toContain("Ünï — café");
  });
});

describe("the date line and the poles", () => {
  it("measures across the date line the short way", () => {
    const a = { lat: 0, lon: 179.99 };
    const b = { lat: 0, lon: -179.99 };
    const r = buildMeetUp([place("w", { lat: 0, lon: -179.995 })], a, b);
    expect(r.apartMetres).toBeLessThan(3000);
    expect(r.rows[0]!.metresB).toBeLessThan(r.rows[0]!.metresA);
  });
  it("copes with points at the poles", () => {
    const r = buildMeetUp([place("p", { lat: 89.99, lon: 10 })], { lat: 90, lon: 0 }, { lat: -90, lon: 0 });
    expect(r.rows).toHaveLength(1);
    expect(Number.isFinite(r.rows[0]!.total)).toBe(true);
    expect(r.apartMetres).toBeGreaterThan(19_000_000);
  });
});
