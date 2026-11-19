import { describe, expect, it } from "vitest";
import { DUPLICATE_DISTANCE_M, MAX_PAIRS_LISTED, findPossibleDuplicates, foldName } from "./packDuplicates";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";

const raw = (id: string, name: string | null, lat: number | null, lon: number | null) => ({
  id,
  ...(name === null ? {} : { name }),
  ...(lat === null ? {} : { lat }),
  ...(lon === null ? {} : { lon }),
  wheelchair: "yes",
  provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10" },
});
const parse = (items: unknown[]): PackPlaceRecord[] => [...parsePackPlaces(items).places];
// 0.0001 degree of latitude is about 11 metres.
const at = (n: number) => 43.65 + n * 0.0001;

describe("foldName", () => {
  it("folds case, accents, punctuation and spaces", () => {
    expect(foldName("Café  Bloor-West!")).toBe("cafe bloor west");
    expect(foldName("ÉCOLE  Saint‑Jean")).toBe("ecole saint jean");
  });
  it("is empty for a name with no letters or digits", () => {
    expect(foldName("  ---  ")).toBe("");
  });
  it("keeps letters of other scripts and digits", () => {
    expect(foldName("Tim #12")).toBe("tim 12");
    expect(foldName("多伦多 图书馆")).toBe("多伦多 图书馆");
  });
});

describe("findPossibleDuplicates", () => {
  it("pairs two records with the same folded name close together", () => {
    const r = findPossibleDuplicates(parse([raw("a", "Café Bloor", at(0), -79.38), raw("b", "cafe bloor", at(3), -79.38)]));
    expect(r.total).toBe(1);
    expect(r.pairs[0]).toMatchObject({ a: "a", b: "b", name: "cafe bloor" });
    expect(r.pairs[0]!.metres).toBeGreaterThanOrEqual(30);
    expect(r.pairs[0]!.metres).toBeLessThanOrEqual(36);
  });
  it("does not pair the same name far apart", () => {
    expect(findPossibleDuplicates(parse([raw("a", "Library", at(0), -79.38), raw("b", "Library", at(100), -79.38)])).total).toBe(0);
  });
  it("does not pair different names close together", () => {
    expect(findPossibleDuplicates(parse([raw("a", "Library", at(0), -79.38), raw("b", "Pharmacy", at(0), -79.38)])).total).toBe(0);
  });
  it("includes a pair at exactly the limit and leaves out one just over", () => {
    const [a, b] = parse([raw("a", "Hall", at(0), -79.38), raw("b", "Hall", at(7), -79.38)]);
    const metres = findPossibleDuplicates([a!, b!], 1000).pairs[0]!.metres;
    expect(findPossibleDuplicates([a!, b!], metres).total).toBe(1);
    expect(findPossibleDuplicates([a!, b!], metres - 1).total).toBe(0);
  });
  it("uses 75 metres by default", () => {
    expect(DUPLICATE_DISTANCE_M).toBe(75);
    expect(findPossibleDuplicates(parse([raw("a", "Hall", at(0), -79.38), raw("b", "Hall", at(6), -79.38)])).total).toBe(1);
    expect(findPossibleDuplicates(parse([raw("a", "Hall", at(0), -79.38), raw("b", "Hall", at(8), -79.38)])).total).toBe(0);
  });
  it("never pairs records without a name or without a position, and counts them", () => {
    const r = findPossibleDuplicates(parse([raw("a", null, at(0), -79.38), raw("b", null, at(0), -79.38), raw("c", "Hall", null, null), raw("d", "Hall", null, null), raw("e", "Hall", at(0), -79.38)]));
    expect(r.total).toBe(0);
    expect(r.notComparable).toBe(4);
  });
  it("finds every pair in a group of three and orders them nearest first", () => {
    const r = findPossibleDuplicates(parse([raw("a", "Hall", at(0), -79.38), raw("b", "Hall", at(5), -79.38), raw("c", "Hall", at(1), -79.38)]));
    expect(r.pairs.map((p) => `${p.a}-${p.b}`)).toEqual(["a-c", "b-c", "a-b"]);
  });
  it("breaks a tie in distance by id so the order is stable", () => {
    const r = findPossibleDuplicates(parse([raw("z", "Hall", at(0), -79.38), raw("y", "Hall", at(0), -79.38), raw("x", "Park", at(0), -79.38), raw("w", "Park", at(0), -79.38)]));
    expect(r.pairs.map((p) => `${p.a}-${p.b}`)).toEqual(["x-w", "z-y"]);
  });
  it("lists at most MAX_PAIRS_LISTED but counts them all", () => {
    const many = Array.from({ length: 10 }, (_, i) => raw(`p${i}`, "Hall", at(0), -79.38));
    const r = findPossibleDuplicates(parse(many));
    expect(r.total).toBe(45);
    expect(r.pairs).toHaveLength(MAX_PAIRS_LISTED);
  });
  it("returns nothing for no places and never changes its input", () => {
    expect(findPossibleDuplicates([])).toEqual({ pairs: [], total: 0, notComparable: 0 });
    const input = parse([raw("a", "Hall", at(0), -79.38), raw("b", "Hall", at(1), -79.38)]);
    const copy = JSON.stringify(input);
    findPossibleDuplicates(input);
    expect(JSON.stringify(input)).toBe(copy);
  });
  it("treats a name that folds to nothing as not comparable", () => {
    const r = findPossibleDuplicates(parse([raw("a", "---", at(0), -79.38), raw("b", "---", at(0), -79.38)]));
    expect(r).toMatchObject({ total: 0, notComparable: 2 });
  });
});
