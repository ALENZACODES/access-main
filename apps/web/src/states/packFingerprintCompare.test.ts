import { describe, expect, it } from "vitest";
import { bucketOf, fingerprintPlaces } from "./packFingerprint";
import { printToCode, parseCode } from "./packFingerprintCode";
import { comparePrints } from "./packFingerprintCompare";
import { place, varied } from "./placeFixtures";

const base = varied(31, 45);
const fp = (places = base) => fingerprintPlaces(places);

describe("comparePrints", () => {
  it("says same for the same places, in any order", () => {
    const c = comparePrints(fp(), fp([...base].reverse()));
    expect(c.kind).toBe("same");
    expect(c.differing).toEqual([]);
    expect(c.buckets).toHaveLength(16);
    expect(c.buckets.every((b) => !b.differs && b.here === b.there)).toBe(true);
    expect(c.here).toBe(45);
    expect(c.there).toBe(45);
  });
  it("says both-empty when neither has places", () => {
    expect(comparePrints(fp([]), fp([])).kind).toBe("both-empty");
  });
  it("says different-places for an empty and a full pack", () => {
    const c = comparePrints(fp([]), fp());
    expect(c.kind).toBe("different-places");
    expect(c.here).toBe(0);
    expect(c.there).toBe(45);
    expect(c.differing.length).toBeGreaterThan(0);
  });
  it("says same-ids-different-details and names the one group that differs", () => {
    const target = base[10]!;
    const edited = base.map((p) => (p.id === target.id ? place(p.id, { name: "A new name", wheelchair: "no" }) : p));
    const c = comparePrints(fp(), fp(edited));
    expect(c.kind).toBe("same-ids-different-details");
    expect(c.differing).toEqual([bucketOf(target.id)]);
    expect(c.buckets.filter((b) => b.differs).every((b) => b.here === b.there)).toBe(true);
  });
  it("says different-places when a place is added, and counts it in its group", () => {
    const c = comparePrints(fp(), fp([...base, place("brand-new", {})]));
    expect(c.kind).toBe("different-places");
    expect(c.differing).toEqual([bucketOf("brand-new")]);
    const row = c.buckets.find((b) => b.key === bucketOf("brand-new"))!;
    expect(row.there).toBe(row.here + 1);
  });
  it("says different-places when a place is removed", () => {
    const c = comparePrints(fp(), fp(base.slice(1)));
    expect(c.kind).toBe("different-places");
    expect(c.differing).toEqual([bucketOf(base[0]!.id)]);
    expect(c.there).toBe(44);
  });
  it("says different-places when an id is swapped and the count stays", () => {
    const swapped = base.map((p, i) => (i === 0 ? place("a-different-id", {}) : p));
    const c = comparePrints(fp(), fp(swapped));
    expect(c.kind).toBe("different-places");
    expect(c.here).toBe(c.there);
  });
  it("lists several groups when several places differ", () => {
    const edited = base.map((p, i) => (i % 5 === 0 ? place(p.id, { name: `edit ${i}` }) : p));
    const c = comparePrints(fp(), fp(edited));
    expect(c.kind).toBe("same-ids-different-details");
    const expected = new Set(base.filter((_p, i) => i % 5 === 0).map((p) => bucketOf(p.id)));
    expect(new Set(c.differing)).toEqual(expected);
    expect(c.differing).toEqual([...c.differing].sort());
  });
  it("is symmetric in what differs, and swaps the two counts", () => {
    const other = [...base.slice(3), place("extra-1", {}), place("extra-2", {})];
    const a = comparePrints(fp(), fp(other));
    const b = comparePrints(fp(other), fp());
    expect(a.differing).toEqual(b.differing);
    expect(a.kind).toBe(b.kind);
    expect(a.here).toBe(b.there);
    expect(a.there).toBe(b.here);
  });
  it("works across a pasted code exactly as it does between prints", () => {
    const remote = [...base.slice(0, 20), place("only-there", {})];
    const parsed = parseCode(printToCode(fp(remote)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(comparePrints(fp(), parsed.print)).toEqual(comparePrints(fp(), fp(remote)));
  });
  it("never reports same while a group differs", () => {
    const here = fp();
    const there = { ...here, buckets: here.buckets.map((b, i) => (i === 4 ? { ...b, hash: "00000000" } : b)) };
    const c = comparePrints(here, there);
    expect(c.differing).toEqual(["4"]);
    expect(c.kind).not.toBe("same");
  });
});
