import { describe, expect, it } from "vitest";
import { BUCKET_HEX, BUCKET_KEYS, WHOLE_HEX, bucketOf, fingerprintPlaces, placesInBuckets, samePrint, type BucketKey } from "./packFingerprint";
import { lcg, place, varied } from "./placeFixtures";
import { sha256Hex } from "./sha256";

describe("bucketOf", () => {
  it("is the first hex character of the id's hash", () => {
    for (const id of ["a", "p001", "café", "x".repeat(60)]) expect(bucketOf(id)).toBe(sha256Hex(id)[0]);
  });
  it("always names one of the sixteen groups", () => {
    for (let i = 0; i < 300; i += 1) expect(BUCKET_KEYS).toContain(bucketOf(`id-${i}`));
  });
  it("spreads ids across every group", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) seen.add(bucketOf(`place-${i}`));
    expect(seen.size).toBe(16);
  });
  it("gives the same group every time", () => {
    expect(bucketOf("same")).toBe(bucketOf("same"));
  });
});

describe("fingerprintPlaces", () => {
  it("has a count, two whole hashes and sixteen groups", () => {
    const fp = fingerprintPlaces(varied(1, 50));
    expect(fp.count).toBe(50);
    expect(fp.ids).toMatch(new RegExp(`^[0-9a-f]{${WHOLE_HEX}}$`));
    expect(fp.all).toMatch(new RegExp(`^[0-9a-f]{${WHOLE_HEX}}$`));
    expect(fp.buckets.map((b) => b.key)).toEqual([...BUCKET_KEYS]);
    for (const b of fp.buckets) expect(b.hash).toMatch(new RegExp(`^[0-9a-f]{${BUCKET_HEX}}$`));
  });
  it("counts every place in exactly one group", () => {
    const fp = fingerprintPlaces(varied(2, 123));
    expect(fp.buckets.reduce((n, b) => n + b.count, 0)).toBe(123);
  });
  it("puts each place in the group its id names", () => {
    const places = varied(3, 80);
    const fp = fingerprintPlaces(places);
    for (const key of BUCKET_KEYS) expect(fp.buckets.find((b) => b.key === key)!.count).toBe(places.filter((p) => bucketOf(p.id) === key).length);
  });
  it("is the same for the same places in any order", () => {
    const places = varied(4, 60);
    const next = lcg(5);
    const shuffled = [...places].sort(() => next() - 0.5);
    expect(fingerprintPlaces(shuffled)).toEqual(fingerprintPlaces(places));
  });
  it("is the same on every call", () => {
    const places = varied(5, 30);
    expect(fingerprintPlaces(places)).toEqual(fingerprintPlaces(places));
  });
  it("has a fixed value for the empty pack", () => {
    const fp = fingerprintPlaces([]);
    expect(fp.count).toBe(0);
    expect(fp.ids).toBe(sha256Hex("").slice(0, WHOLE_HEX));
    expect(fp.all).toBe(sha256Hex("").slice(0, WHOLE_HEX));
    expect(fp.buckets.every((b) => b.count === 0 && b.hash === sha256Hex("").slice(0, BUCKET_HEX))).toBe(true);
  });
  it("does not change the list it is given", () => {
    const places = [place("b", {}), place("a", {})];
    fingerprintPlaces(places);
    expect(places.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("what changes the fingerprint", () => {
  const base = () => [place("alpha", {}), place("bravo", {}), place("charlie", {}), place("delta", {}), place("echo", {})];
  const changed = (id: string, over: Record<string, unknown>) => base().map((p) => (p.id === id ? place(id, over) : p));

  it("a changed detail changes the whole hash and one group, not the ids hash", () => {
    const a = fingerprintPlaces(base());
    const b = fingerprintPlaces(changed("charlie", { name: "Renamed" }));
    expect(b.all).not.toBe(a.all);
    expect(b.ids).toBe(a.ids);
    expect(b.count).toBe(a.count);
    const differing = a.buckets.filter((x, i) => x.hash !== b.buckets[i]!.hash).map((x) => x.key);
    expect(differing).toEqual([bucketOf("charlie")]);
  });
  it.each([
    ["name", { name: "Another" }],
    ["tag", { wheelchair: "limited" }],
    ["category", { category: "museum" }],
    ["address", { address: "9 Other Road" }],
    ["note", { wheelchair_description: "Steps at the door" }],
    ["location", { lat: 43.7 }],
    ["tier", { provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/42", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 2 } }],
    ["retrieval date", { provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/42", licence: "ODbL-1.0", retrieved_at: "2026-10-01", tier: 0 } }],
  ])("a changed %s is seen", (_what, over) => {
    expect(fingerprintPlaces(changed("bravo", over)).all).not.toBe(fingerprintPlaces(base()).all);
  });
  it("an added place changes the count, both hashes and one group", () => {
    const a = fingerprintPlaces(base());
    const b = fingerprintPlaces([...base(), place("foxtrot", {})]);
    expect(b.count).toBe(6);
    expect(b.ids).not.toBe(a.ids);
    expect(b.all).not.toBe(a.all);
    expect(b.buckets.filter((x, i) => x.hash !== a.buckets[i]!.hash).map((x) => x.key)).toEqual([bucketOf("foxtrot")]);
  });
  it("a removed place changes the count, both hashes and one group", () => {
    const a = fingerprintPlaces(base());
    const b = fingerprintPlaces(base().filter((p) => p.id !== "delta"));
    expect(b.count).toBe(4);
    expect(b.ids).not.toBe(a.ids);
    expect(b.buckets.filter((x, i) => x.hash !== a.buckets[i]!.hash).map((x) => x.key)).toEqual([bucketOf("delta")]);
  });
  it("a renamed id is a removal and an addition", () => {
    const a = fingerprintPlaces(base());
    const b = fingerprintPlaces(base().map((p) => (p.id === "echo" ? place("echo2", {}) : p)));
    expect(b.ids).not.toBe(a.ids);
    expect(b.count).toBe(a.count);
  });
  it("one place swapped for a different one at each of many positions is always seen", () => {
    const places = varied(11, 40);
    const a = fingerprintPlaces(places);
    for (let i = 0; i < places.length; i += 1) {
      const edited = places.map((p, j) => (j === i ? place(p.id, { name: `${p.name ?? "x"} edited` }) : p));
      expect(fingerprintPlaces(edited).all, `position ${i}`).not.toBe(a.all);
    }
  });
});

describe("placesInBuckets", () => {
  it("returns only places in the named groups, in id order", () => {
    const places = varied(8, 70);
    const keys = new Set<BucketKey>(["3", "a"]);
    const got = placesInBuckets(places, keys);
    expect(got.every((p) => keys.has(bucketOf(p.id)))).toBe(true);
    expect(got.map((p) => p.id)).toEqual([...got.map((p) => p.id)].sort());
    expect(got.length).toBe(places.filter((p) => keys.has(bucketOf(p.id))).length);
  });
  it("returns nothing for no groups and everything for all of them", () => {
    const places = varied(9, 25);
    expect(placesInBuckets(places, new Set())).toEqual([]);
    expect(placesInBuckets(places, new Set(BUCKET_KEYS))).toHaveLength(25);
  });
});

describe("samePrint", () => {
  it("is true for equal prints and false after any change", () => {
    const places = varied(12, 20);
    expect(samePrint(fingerprintPlaces(places), fingerprintPlaces([...places].reverse()))).toBe(true);
    expect(samePrint(fingerprintPlaces(places), fingerprintPlaces(places.slice(1)))).toBe(false);
    const edited = places.map((p, i) => (i === 0 ? place(p.id, { name: "z" }) : p));
    expect(samePrint(fingerprintPlaces(places), fingerprintPlaces(edited))).toBe(false);
  });
});
