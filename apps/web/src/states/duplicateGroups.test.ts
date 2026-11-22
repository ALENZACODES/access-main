import { describe, expect, it } from "vitest";
import { CELL_DEGREES, MAX_BUCKET, candidatePairs, findDuplicates } from "./duplicateGroups";
import { addressKeyOf } from "./duplicateScore";
import { bare, lcg, place, varied } from "./placeFixtures";

const p = (id: string, over: Record<string, unknown> = {}) => place(id, { name: `Unique ${id}x`, address: `${id.length + 100} Road ${id}`, category: "shop", lat: 43.5, lon: -79.5, ...over });
const twin = (id: string, over: Record<string, unknown> = {}) => place(id, { name: "Alpha Hall", address: "5 Elm Street", category: "cafe", lat: 43.65, lon: -79.38, ...over });

describe("candidatePairs", () => {
  it("pairs places that share an address, a name or a patch of ground", () => {
    const places = [twin("a", { name: "One", lat: 44 }), twin("b", { name: "Two", lat: 45 }), p("c", { name: "Same", lat: 46, address: "9 X St" }), p("d", { name: "Same", lat: 47, address: "8 Y St" }), p("e", { lat: 48.5, lon: -80, address: "1 Q St" }), p("f", { lat: 48.5004, lon: -80, address: "2 R St" })];
    const keys = candidatePairs(places).pairs.map(([i, j]) => `${i}${j}`);
    expect(keys).toContain("01");
    expect(keys).toContain("23");
    expect(keys).toContain("45");
  });
  it("does not pair places with nothing in common", () => {
    const places = [p("a", { lat: 40, lon: -75, address: "1 A St" }), p("b", { lat: 44, lon: -79, address: "2 B St" })];
    expect(candidatePairs(places).pairs).toEqual([]);
  });
  it("pairs places in neighbouring ground cells, in either direction, once", () => {
    const base = { name: null, address: null };
    const places = [p("a", { ...base, lat: 43.1, lon: -79.1 }), p("b", { ...base, lat: 43.1 + CELL_DEGREES * 1.01 - (43.1 % CELL_DEGREES), lon: -79.1 }), p("c", { ...base, lat: 43.1, lon: -79.1 + CELL_DEGREES })];
    const { pairs } = candidatePairs(places);
    expect(new Set(pairs.map(([i, j]) => `${i}:${j}`)).size).toBe(pairs.length);
    for (const [i, j] of pairs) expect(i).toBeLessThan(j);
  });
  it("lists a pair once even when several buckets hold it", () => {
    const { pairs } = candidatePairs([twin("a"), twin("b")]);
    expect(pairs).toEqual([[0, 1]]);
  });
  it("skips a bucket that is too big and counts it", () => {
    const many = Array.from({ length: MAX_BUCKET + 1 }, (_, i) => p(`m${i}`, { name: "Chain Coffee", address: `${i} Road ${i}`, lat: 40 + i, lon: -70 }));
    const r = candidatePairs(many);
    expect(r.pairs).toEqual([]);
    expect(r.skippedBuckets).toBe(1);
  });
  it("takes a bucket of exactly the limit", () => {
    const some = Array.from({ length: MAX_BUCKET }, (_, i) => p(`m${i}`, { name: "Chain Coffee", address: `${i} Road ${i}`, lat: 40 + i, lon: -70 }));
    expect(candidatePairs(some).skippedBuckets).toBe(0);
    expect(candidatePairs(some).pairs).toHaveLength((MAX_BUCKET * (MAX_BUCKET - 1)) / 2);
  });
  it("ignores places with no name, address or position", () => {
    expect(candidatePairs([bare("a"), bare("b")])).toEqual({ pairs: [], skippedBuckets: 0 });
  });
});

describe("findDuplicates", () => {
  it("groups the same name at the same address", () => {
    const r = findDuplicates([twin("a"), p("z"), twin("b")]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.ids).toEqual(["a", "b"]);
    expect(r.placesInGroups).toBe(2);
  });
  it("has no group when nothing is alike", () => {
    const r = findDuplicates([p("a", { lat: 40 }), p("b", { lat: 41, address: "7 Other Rd" }), p("c", { lat: 42, address: "8 Third Rd" })]);
    expect(r.groups).toEqual([]);
    expect(r.placesInGroups).toBe(0);
  });
  it("joins a chain of pairs into one group", () => {
    const r = findDuplicates([twin("a"), twin("b", { name: "Alpha Hal" }), twin("c", { name: "Alpha Hal", address: "5 Elm St" })]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.ids).toEqual(["a", "b", "c"]);
    expect(r.groups[0]!.pairs.length).toBeGreaterThanOrEqual(2);
  });
  it("keeps members in the pack's order whatever the pair order", () => {
    const r = findDuplicates([twin("c"), p("x"), twin("a"), twin("b")]);
    expect(r.groups[0]!.ids).toEqual(["c", "a", "b"]);
  });
  it("puts a place in only one group", () => {
    const r = findDuplicates([twin("a"), twin("b"), twin("c", { name: "Beta Court", address: "9 Oak Ave", lat: 44, lon: -80 }), twin("d", { name: "Beta Court", address: "9 Oak Ave", lat: 44, lon: -80 })]);
    const ids = r.groups.flatMap((g) => g.ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.groups).toHaveLength(2);
  });
  it("sorts groups by their best score, then by position in the pack", () => {
    const loose = [twin("a", { name: "Quesnel Library", lat: 43.7 }), twin("b", { name: "Quesnell Library", lat: 43.7002, category: "bar" })];
    const exact = [twin("c", { name: "Zed Pharmacy", address: "9 Oak Ave", lat: 44 }), twin("d", { name: "Zed Pharmacy", address: "9 Oak Ave", lat: 44 })];
    const r = findDuplicates([...loose, ...exact], "loose");
    expect(r.groups[0]!.ids).toEqual(["c", "d"]);
    for (let i = 1; i < r.groups.length; i += 1) expect(r.groups[i - 1]!.top).toBeGreaterThanOrEqual(r.groups[i]!.top);
  });
  it("sorts the pairs of a group, best first", () => {
    const r = findDuplicates([twin("a"), twin("b", { name: "Alpha Hal" }), twin("c")]);
    const scores = r.groups[0]!.pairs.map((x) => x.pair.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(r.groups[0]!.top).toBe(scores[0]);
  });
  it("finds fewer groups at the strict level than at the loose level", () => {
    const places = varied(11, 60);
    expect(findDuplicates(places, "strict").placesInGroups).toBeLessThanOrEqual(findDuplicates(places, "loose").placesInGroups);
  });
  it("defaults to the balanced level and says which level it used", () => {
    expect(findDuplicates([twin("a")]).strictness).toBe("balanced");
    expect(findDuplicates([twin("a")], "loose").strictness).toBe("loose");
  });
  it("reports when two members give different wheelchair tags, not when one is unknown", () => {
    const differ = findDuplicates([twin("a", { wheelchair: "yes" }), twin("b", { wheelchair: "no" })]);
    expect(differ.groups[0]!.tagsDiffer).toBe(true);
    expect(differ.groups[0]!.tags).toEqual(["yes", "no"]);
    const unknown = findDuplicates([twin("a", { wheelchair: "yes" }), twin("b", { wheelchair: null })]);
    expect(unknown.groups[0]!.tagsDiffer).toBe(false);
    const same = findDuplicates([twin("a", { wheelchair: "yes" }), twin("b", { wheelchair: "yes" })]);
    expect(same.groups[0]!.tagsDiffer).toBe(false);
    expect(same.groups[0]!.tags).toEqual(["yes"]);
  });
  it("counts how many pairs it compared, far fewer than all pairs for a big pack", () => {
    const places = varied(3, 200);
    const r = findDuplicates(places);
    expect(r.compared).toBeLessThan((200 * 199) / 2);
  });
  it("gives no groups for no places or one place", () => {
    expect(findDuplicates([]).groups).toEqual([]);
    expect(findDuplicates([twin("a")]).groups).toEqual([]);
  });
  it("is the same every time and does not change its input", () => {
    const places = [twin("a"), twin("b"), p("c")];
    const copy = [...places];
    expect(findDuplicates(places)).toEqual(findDuplicates(places));
    expect(places).toEqual(copy);
  });
  it("finds a seeded duplicate among many varied places", () => {
    const rnd = lcg(5);
    const base = varied(21, 120);
    const source = base[Math.floor(rnd() * base.length)]!;
    const copy = place("dup", { name: source.name, address: source.address, category: source.category, lat: source.location?.lat ?? null, lon: source.location?.lon ?? null });
    const r = findDuplicates([...base, copy], "balanced");
    const g = r.groups.find((x) => x.ids.includes("dup"));
    expect(g, "the copy is grouped").toBeDefined();
    expect(g!.ids).toContain(source.id);
  });
  it("never groups on position and kind alone", () => {
    const r = findDuplicates([p("a", { name: "Alpha", address: "1 A St", lat: 43.65, lon: -79.38 }), p("b", { name: "Zeta", address: "2 B St", lat: 43.65, lon: -79.38 })], "loose");
    expect(r.groups).toEqual([]);
  });
  it("uses the address key the scorer uses", () => {
    expect(addressKeyOf("5 Elm Street")).toBe("5 elm street");
  });
});
