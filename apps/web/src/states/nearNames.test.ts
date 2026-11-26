import { describe, expect, it } from "vitest";
import { NEAR_NAME_MAX_PAIRS, NEAR_NAME_MIN_CHARS, findNearNames, nearRelation } from "./nearNames";
import { nameKey } from "./sameName";
import { lcg, place } from "./placeFixtures";

/** Optimal string alignment distance, written the long way as an independent check. */
function osa(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}
const at = (id: string, name: string | null) => place(id, { name });

describe("nearRelation", () => {
  it("is null for equal names", () => expect(nearRelation("cafe lea", "cafe lea")).toBeNull());
  it("finds a letter missing, in either order of the arguments", () => {
    expect(nearRelation("hortons", "horton")).toBe("missing");
    expect(nearRelation("horton", "hortons")).toBe("missing");
    expect(nearRelation("xhorton", "horton")).toBe("missing");
    expect(nearRelation("hortonx", "horton")).toBe("missing");
  });
  it("finds a different letter", () => {
    expect(nearRelation("hortons", "hartons")).toBe("different");
    expect(nearRelation("aaaaa", "aaaab")).toBe("different");
    expect(nearRelation("baaaa", "aaaaa")).toBe("different");
  });
  it("finds two letters swapped", () => {
    expect(nearRelation("hortons", "hotrons")).toBe("swapped");
    expect(nearRelation("ab", "ba")).toBe("swapped");
    expect(nearRelation("abcde", "abced")).toBe("swapped");
  });
  it("is null for anything further apart", () => {
    expect(nearRelation("hortons", "hrtons")).toBe("missing");
    expect(nearRelation("hortons", "hrton")).toBeNull();
    expect(nearRelation("hortons", "hxrtxns")).toBeNull();
    expect(nearRelation("abcde", "badce")).toBeNull();
    expect(nearRelation("abc", "abcde")).toBeNull();
    expect(nearRelation("", "ab")).toBeNull();
  });
  it("agrees with the long way for every pair of short random strings", () => {
    const next = lcg(77);
    const rnd = () => Array.from({ length: Math.floor(next() * 6) }, () => "abc"[Math.floor(next() * 3)]).join("");
    for (let i = 0; i < 4000; i++) {
      const a = rnd();
      const b = rnd();
      expect(nearRelation(a, b) !== null, `${a}|${b}`).toBe(osa(a, b) === 1);
    }
  });
  it("is symmetric about whether a pair is near", () => {
    const next = lcg(5);
    const rnd = () => Array.from({ length: 2 + Math.floor(next() * 5) }, () => "ab"[Math.floor(next() * 2)]).join("");
    for (let i = 0; i < 1000; i++) {
      const a = rnd();
      const b = rnd();
      expect(nearRelation(a, b) === null).toBe(nearRelation(b, a) === null);
    }
  });
});

describe("findNearNames", () => {
  const ps = [at("a1", "Tim Hortons"), at("a2", "TIM HORTONS #3"), at("b1", "Tim Horton"), at("c1", "Tim Hortosn"), at("d1", "Library"), at("d2", "Librory"), at("e1", "Gym"), at("e2", "Gum"), at("f1", "Solo Bakery"), at("n", null)];
  const r = findNearNames(ps);
  it("pairs names one slip apart, with the longer name first", () => {
    const pairs = r.pairs.map((p) => `${p.a.label}|${p.b.label}|${p.relation}`);
    expect(pairs).toContain("Tim Hortons|Tim Horton|missing");
    expect(pairs).toContain("Tim Hortons|Tim Hortosn|swapped");
    expect(pairs).toContain("Library|Librory|different");
    expect(r.pairs).toHaveLength(4);
    expect(r.leftOut).toBe(0);
  });
  it("does not pair names that are the same once branch numbers are ignored", () => {
    expect(r.pairs.some((p) => p.a.key === p.b.key)).toBe(false);
  });
  it("counts the places behind each side and lists their ids", () => {
    const p = r.pairs.find((x) => x.b.label === "Tim Horton")!;
    expect(p.a.count).toBe(2);
    expect(p.a.ids).toEqual(["a1", "a2"]);
    expect(p.b.ids).toEqual(["b1"]);
  });
  it("leaves out short names", () => {
    expect(r.pairs.some((p) => p.a.key.length < NEAR_NAME_MIN_CHARS)).toBe(false);
    expect(findNearNames([at("a", "Gym"), at("b", "Gum"), at("c", "Pool1"), at("d", "Pool2")]).pairs).toHaveLength(1);
  });
  it("finds nothing among distinct names, an empty list or unnamed places", () => {
    expect(findNearNames([at("a", "Alpha Hall"), at("b", "Beta Court")]).pairs).toEqual([]);
    expect(findNearNames([]).pairs).toEqual([]);
    expect(findNearNames([at("a", null), at("b", "UNKNOWN")]).pairs).toEqual([]);
  });
  it("finds a chain: a pair for each neighbouring spelling, not for the far ones", () => {
    const c = findNearNames([at("a", "Pharmacy"), at("b", "Pharmacies"), at("c", "Pharmacys"), at("d", "Pharmacyy")]);
    const keys = c.pairs.map((p) => [p.a.key, p.b.key].sort().join("|"));
    expect(keys).toContain("pharmacy|pharmacyy");
    expect(keys).toContain("pharmacy|pharmacys");
    expect(keys).toContain("pharmacys|pharmacyy");
    expect(keys).not.toContain("pharmacies|pharmacys");
  });
  it("is the same whichever way round the places come", () => {
    expect(findNearNames([...ps].reverse())).toEqual(r);
  });
  it("French accents do not make a difference", () => {
    expect(findNearNames([at("a", "Café Léa"), at("b", "Cafe Leaa")], "fr").pairs).toHaveLength(1);
    expect(findNearNames([at("a", "Café Léa"), at("b", "CAFE LEA")], "fr").pairs).toHaveLength(0);
  });
});

describe("findNearNames against the long way", () => {
  const letters = "abcd";
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: finds exactly the pairs of keys at distance one`, () => {
      const next = lcg(seed * 31);
      const names = Array.from({ length: 120 }, () => Array.from({ length: 5 + Math.floor(next() * 3) }, () => letters[Math.floor(next() * 4)]).join(""));
      const places = names.map((n, i) => at(`p${i}`, n));
      const keys = [...new Set(names.map((n) => nameKey(n)!))].filter((k) => k.length >= NEAR_NAME_MIN_CHARS);
      const expected = new Set<string>();
      for (let i = 0; i < keys.length; i++)
        for (let j = i + 1; j < keys.length; j++) if (osa(keys[i]!, keys[j]!) === 1) expected.add([keys[i]!, keys[j]!].sort().join("|"));
      const r = findNearNames(places);
      const got = new Set(r.pairs.map((p) => [p.a.key, p.b.key].sort().join("|")));
      if (expected.size <= NEAR_NAME_MAX_PAIRS) expect(got).toEqual(expected);
      else expect(r.pairs.length + r.leftOut).toBe(expected.size);
    });
  }
  it("swapping two equal neighbouring letters is not a pair with itself", () => {
    expect(findNearNames([at("a", "Aabbcc"), at("b", "Aabbcc")]).pairs).toEqual([]);
    expect(findNearNames([at("a", "Aabbcc")]).pairs).toEqual([]);
  });
  it("lists the first 200 pairs and counts every one beyond them", () => {
    const names: string[] = [];
    for (let i = 0; i < 230; i++) {
      const base = `Q${i.toString(36).padStart(3, "0")}${"mnopqr"[i % 6]}${"stuvwx"[Math.floor(i / 6) % 6]}`;
      names.push(base, `${base}y`);
    }
    const r = findNearNames(names.map((n, i) => at(`p${i}`, n)));
    expect(r.pairs).toHaveLength(NEAR_NAME_MAX_PAIRS);
    expect(r.leftOut).toBeGreaterThanOrEqual(30);
    const keys = r.pairs.map((p) => `${p.a.key}|${p.b.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("keeps at most the limit and counts the rest", () => {
    const names: string[] = [];
    for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) names.push(`aaaa${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + (j % 26))}${i}`);
    const r = findNearNames(names.map((n, i) => at(`p${i}`, n.replace(/\d+$/, ""))));
    expect(r.pairs.length).toBeLessThanOrEqual(NEAR_NAME_MAX_PAIRS);
    expect(r.pairs.length + r.leftOut).toBeGreaterThan(0);
  });
  it("does not change its input", () => {
    const ps = [at("a", "Tim Hortons"), at("b", "Tim Horton")];
    const copy = JSON.stringify(ps);
    findNearNames(ps);
    expect(JSON.stringify(ps)).toBe(copy);
  });
});
