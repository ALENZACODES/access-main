import { describe, expect, it } from "vitest";
import { SAME_NAME_FILTERS, SAME_NAME_ORDERS, SAME_NAME_SIZES, buildSameName, listSameName, nameKey } from "./sameName";
import { sameNameToCsv, sameNameToText } from "./sameNameCopy";
import { distanceMetres } from "./packGeo";
import { lcg, place, varied } from "./placeFixtures";

const shuffle = <T,>(xs: readonly T[], seed: number): T[] => {
  const next = lcg(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};
/** A set with names repeated on purpose, in varied spellings. */
function crowded(seed: number, n: number) {
  const next = lcg(seed);
  const base = ["Corner Cafe", "Main Library", "Café Léa", "Bay Pharmacy", "Union Hall", "Joe's", "Studio 54", "Pool", "Rink", "Gym"];
  const spell = [(s: string) => s, (s: string) => s.toUpperCase(), (s: string) => `${s} #${Math.floor(next() * 90)}`, (s: string) => `${s} (annex)`, (s: string) => s.toLowerCase()];
  return Array.from({ length: n }, (_, i) =>
    place(`p${seed}-${i}`, {
      name: next() < 0.1 ? null : spell[Math.floor(next() * spell.length)]!(base[Math.floor(next() * base.length)]!),
      lat: 43.6 + next() * 0.1,
      lon: -79.5 + next() * 0.2,
      wheelchair: ["yes", "no", "limited", "designated", null][Math.floor(next() * 5)],
      address: next() < 0.2 ? null : `${Math.floor(next() * 300)} Main Street`,
    }),
  );
}

describe("an independent check of the grouping", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const data = crowded(seed, 150);
    const from = { lat: 43.65, lon: -79.4 };
    const r = buildSameName(data, from);
    it(`seed ${seed}: two places are in one group exactly when their keys are equal`, () => {
      const groupOf = new Map<string, string>();
      for (const g of r.groups) for (const m of g.members) groupOf.set(m.id, g.key);
      for (const p of data) {
        const k = nameKey(p.name);
        const mates = data.filter((q) => q.id !== p.id && nameKey(q.name) === k && k !== null);
        if (k === null) expect(groupOf.has(p.id)).toBe(false);
        else if (mates.length > 0) expect(groupOf.get(p.id)).toBe(k);
        else expect(groupOf.has(p.id)).toBe(false);
      }
    });
    it(`seed ${seed}: every place is in a group, alone, or unnamed, once`, () => {
      expect(r.groups.reduce((n, g) => n + g.members.length, 0) + r.alone + r.unnamed).toBe(data.length);
      const ids = r.groups.flatMap((g) => g.members.map((m) => m.id));
      expect(new Set(ids).size).toBe(ids.length);
    });
    it(`seed ${seed}: every group has two or more members and a unique key`, () => {
      expect(r.groups.every((g) => g.members.length >= 2)).toBe(true);
      expect(new Set(r.groups.map((g) => g.key)).size).toBe(r.groups.length);
    });
    it(`seed ${seed}: member distances are the haversine distances, rounded, and sorted`, () => {
      const by = new Map(data.map((p) => [p.id, p] as const));
      for (const g of r.groups) {
        for (const m of g.members) expect(m.metres).toBe(by.get(m.id)!.location ? Math.round(distanceMetres(from, by.get(m.id)!.location!)) : null);
        const ms = g.members.map((m) => m.metres).filter((x): x is number => x !== null);
        expect([...ms].sort((a, b) => a - b)).toEqual(ms);
        expect(g.nearestMetres).toBe(ms.length ? ms[0] : null);
      }
    });
    it(`seed ${seed}: tagsDiffer agrees with a direct count of distinct tags`, () => {
      const by = new Map(data.map((p) => [p.id, p] as const));
      for (const g of r.groups) expect(g.tagsDiffer).toBe(new Set(g.members.map((m) => by.get(m.id)!.tag)).size > 1);
    });
    it(`seed ${seed}: five shuffles of the input give the same groups`, () => {
      for (let s = 1; s <= 5; s++) expect(buildSameName(shuffle(data, seed * 10 + s), from)).toEqual(r);
    });
    for (const order of SAME_NAME_ORDERS) {
      it(`seed ${seed}, ${order}: every size and filter lists a subset of the groups, once each`, () => {
        for (const size of SAME_NAME_SIZES)
          for (const filter of SAME_NAME_FILTERS) {
            const l = listSameName(r, order, size, filter, "en");
            expect(new Set(l.map((g) => g.key)).size).toBe(l.length);
            expect(l.every((g) => g.members.length >= size && (filter === "all" || g.tagsDiffer))).toBe(true);
            expect(l.length).toBe(r.groups.filter((g) => g.members.length >= size && (filter === "all" || g.tagsDiffer)).length);
          }
      });
    }
    it(`seed ${seed}: count order never increases in size; nearest order never increases in distance`, () => {
      const c = listSameName(r, "count", 2, "all", "en");
      for (let i = 0; i + 1 < c.length; i++) expect(c[i]!.members.length).toBeGreaterThanOrEqual(c[i + 1]!.members.length);
      const n = listSameName(r, "nearest", 2, "all", "en").map((g) => g.nearestMetres).filter((x): x is number => x !== null);
      expect([...n].sort((a, b) => a - b)).toEqual(n);
    });
    it(`seed ${seed}: the files list every member of every listed group and no distance`, () => {
      const l = listSameName(r, "name", 2, "all", "en");
      const csv = sameNameToCsv(l, "en").slice(1).split("\r\n").filter(Boolean);
      expect(csv).toHaveLength(1 + l.reduce((n, g) => n + g.members.length, 0));
      const txt = sameNameToText(r, l, "en");
      for (const g of l) for (const m of g.members) expect(txt).toContain(`(${m.id})`);
      expect(txt).not.toContain("from the point typed");
    });
  }
});

describe("larger and stranger input", () => {
  it("copes with a large random pack", () => {
    const r = buildSameName(varied(9, 2000), { lat: 43.65, lon: -79.4 });
    expect(r.groups.reduce((n, g) => n + g.members.length, 0) + r.alone + r.unnamed).toBe(2000);
  });
  it("copes with every place having the same name", () => {
    const same = Array.from({ length: 50 }, (_, i) => place(`s${i}`, { name: "Same", lon: -79.4 + i * 0.001 }));
    const r = buildSameName(same, { lat: 43.65, lon: -79.4 });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.members).toHaveLength(50);
    expect(r.groups[0]!.members.map((m) => m.metres)).toEqual([...r.groups[0]!.members.map((m) => m.metres!)].sort((a, b) => a - b));
  });
  it("copes with only unnamed places", () => {
    const r = buildSameName([place("a", { name: null }), place("b", { name: null })], null);
    expect(r).toEqual({ groups: [], alone: 0, unnamed: 2 });
  });
  it("treats a name with only punctuation as unnamed", () => {
    expect(buildSameName([place("a", { name: "---" }), place("b", { name: "---" })], null).unnamed).toBe(2);
  });
  it("French names group the same way in the French order", () => {
    const ps = [place("a", { name: "Église" }), place("b", { name: "EGLISE" }), place("c", { name: "Zèbre" }), place("d", { name: "zebre" })];
    const r = buildSameName(ps, null, "fr");
    expect(listSameName(r, "name", 2, "all", "fr").map((g) => g.key)).toEqual(["eglise", "zebre"]);
  });
});
