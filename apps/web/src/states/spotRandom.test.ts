import { describe, expect, it } from "vitest";
import { hashSeed, mulberry32, randomFor, shuffleSeeded } from "./spotRandom";

describe("hashSeed (FNV-1a, 32 bit)", () => {
  it.each([
    ["", 0x811c9dc5],
    ["a", 0xe40c292c],
    ["foobar", 0xbf9cf968],
  ])("matches the published value for %j", (text, expected) => {
    expect(hashSeed(text)).toBe(expected);
  });
  it("is always an unsigned 32-bit integer", () => {
    for (const s of ["", "x", "2026-11-21", "café", "東京", "😀", "a".repeat(500)]) {
      const h = hashSeed(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
  it("tells nearby seeds apart", () => {
    const hashes = new Set(Array.from({ length: 500 }, (_, i) => hashSeed(`2026-11-${i}`)));
    expect(hashes.size).toBe(500);
  });
  it("is case sensitive and keeps spaces", () => {
    expect(hashSeed("Seed")).not.toBe(hashSeed("seed"));
    expect(hashSeed("a b")).not.toBe(hashSeed("ab"));
  });
});

describe("mulberry32", () => {
  it("gives numbers in [0, 1)", () => {
    const next = mulberry32(12345);
    for (let i = 0; i < 5000; i += 1) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("gives the same run for the same seed and a different one for another", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const c = mulberry32(8);
    const run = (f: () => number) => Array.from({ length: 20 }, f);
    expect(run(a)).toEqual(run(b));
    expect(run(mulberry32(7))).not.toEqual(run(c));
  });
  it("has a fixed first value, so the draw never changes between releases", () => {
    expect(mulberry32(1)()).toBeCloseTo(0.6270739405881613, 12);
  });
  it("spreads values across the range", () => {
    const next = mulberry32(99);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 10000; i += 1) buckets[Math.floor(next() * 10)]! += 1;
    for (const n of buckets) {
      expect(n).toBeGreaterThan(850);
      expect(n).toBeLessThan(1150);
    }
  });
  it("treats a negative or large seed as its unsigned 32-bit value", () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
    expect(mulberry32(2 ** 32 + 5)()).toBe(mulberry32(5)());
  });
});

describe("randomFor", () => {
  it("is the generator for the hash of the seed text", () => {
    expect(randomFor("abc")()).toBe(mulberry32(hashSeed("abc"))());
  });
});

describe("shuffleSeeded", () => {
  const items = Array.from({ length: 30 }, (_, i) => i);
  it("keeps every item exactly once", () => {
    const out = shuffleSeeded(items, "s");
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });
  it("is the same for the same seed and different for another", () => {
    expect(shuffleSeeded(items, "s")).toEqual(shuffleSeeded(items, "s"));
    expect(shuffleSeeded(items, "s")).not.toEqual(shuffleSeeded(items, "t"));
  });
  it("does not change its input", () => {
    const copy = [...items];
    shuffleSeeded(items, "x");
    expect(items).toEqual(copy);
  });
  it("handles empty and one-item lists", () => {
    expect(shuffleSeeded([], "s")).toEqual([]);
    expect(shuffleSeeded(["only"], "s")).toEqual(["only"]);
  });
  it("puts each item in each position about equally often", () => {
    const counts = new Array<number>(4).fill(0);
    for (let i = 0; i < 2000; i += 1) counts[shuffleSeeded([0, 1, 2, 3], `seed-${i}`).indexOf(0)]! += 1;
    for (const n of counts) {
      expect(n).toBeGreaterThan(400);
      expect(n).toBeLessThan(600);
    }
  });
});
