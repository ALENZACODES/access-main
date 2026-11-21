import { describe, expect, it } from "vitest";
import { createRng, hashText, seedFor } from "./rng";

describe("createRng", () => {
  it("gives the same numbers for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });
  it("gives different numbers for different seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it("stays in the range 0 up to 1", () => {
    const r = createRng(7);
    for (let i = 0; i < 5000; i += 1) {
      const n = r.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
  it("keeps the first numbers fixed, so a seed printed in a failure repeats it in later releases", () => {
    const r = createRng(1);
    expect([r.next(), r.next(), r.next()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });
  it("reports the seed as an unsigned 32-bit number", () => {
    expect(createRng(-1).seed).toBe(4294967295);
    expect(createRng(2 ** 32 + 5).seed).toBe(5);
  });
});

describe("int", () => {
  it("reaches both ends of the range and nothing outside it", () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(r.int(-2, 2));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });
  it("returns the only value when the range is one number", () => {
    expect(createRng(3).int(5, 5)).toBe(5);
  });
  it("refuses a backwards or fractional range", () => {
    expect(() => createRng(1).int(3, 2)).toThrow(RangeError);
    expect(() => createRng(1).int(0.5, 2)).toThrow(RangeError);
  });
  it("is roughly even: no value of ten takes more than twice its share in 5,000 draws", () => {
    const r = createRng(11);
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 5000; i += 1) {
      const n = r.int(0, 9);
      counts[n] = (counts[n] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeLessThan(1000);
    expect(Math.min(...counts)).toBeGreaterThan(250);
  });
});

describe("bool and pick", () => {
  it("bool(0) is never true and bool(1) is always true", () => {
    const r = createRng(5);
    for (let i = 0; i < 200; i += 1) {
      expect(r.bool(0)).toBe(false);
      expect(r.bool(1)).toBe(true);
    }
  });
  it("pick returns members and reaches each of them", () => {
    const r = createRng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(r.pick(["a", "b", "c"]));
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
  });
  it("pick refuses an empty list", () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });
});

describe("fork, hashText and seedFor", () => {
  it("fork is repeatable and does not depend on how many numbers the parent handed out", () => {
    const a = createRng(9);
    const b = createRng(9);
    for (let i = 0; i < 10; i += 1) a.next();
    expect(a.fork("x").next()).toBe(b.fork("x").next());
    expect(a.fork("x").next()).toBe(0.3185431733727455);
  });
  it("fork gives different streams for different labels", () => {
    expect(createRng(9).fork("x").next()).not.toBe(createRng(9).fork("y").next());
  });
  it("hashText is stable and spreads different text", () => {
    expect(hashText("abc")).toBe(440920331);
    expect(hashText("abc")).not.toBe(hashText("abd"));
    expect(hashText("")).toBe(2166136261);
  });
  it("seedFor gives a different, repeatable seed for each run number", () => {
    expect(seedFor(5, 3)).toBe(387389609);
    expect(new Set(Array.from({ length: 200 }, (_, i) => seedFor(5, i))).size).toBe(200);
  });
});
