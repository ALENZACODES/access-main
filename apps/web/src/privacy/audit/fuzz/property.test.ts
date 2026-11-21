import { describe, expect, it } from "vitest";
import { DEFAULT_RUNS, assertProperty, assertPropertyAsync, checkProperty, checkPropertyAsync, explain, minimise, shrinkJson, shrinkList, shrinkString, showValue } from "./property";

describe("checkProperty", () => {
  it("returns null when every run holds, and tries the number of runs asked for", () => {
    let calls = 0;
    expect(checkProperty({ name: "ok", runs: 37, gen: (r) => r.int(0, 9), prop: () => { calls += 1; } })).toBeNull();
    expect(calls).toBe(37);
  });
  it("tries 200 runs by default", () => {
    let calls = 0;
    checkProperty({ name: "n", gen: () => 0, prop: () => { calls += 1; } });
    expect(calls).toBe(DEFAULT_RUNS);
  });
  it("reports the first failing run, with its seed", () => {
    const f = checkProperty({ name: "small", seed: 5, gen: (r) => r.int(0, 100), prop: (n) => { if (n > 90) throw new Error(`too big: ${n}`); } });
    expect(f).not.toBeNull();
    expect(f?.name).toBe("small");
    expect(f?.seed).toBe(5);
    expect(f?.error).toMatch(/^too big: /);
  });
  it("repeats the same input from the reported run seed", () => {
    const spec = { name: "x", seed: 9, gen: (r: { int: (a: number, b: number) => number }) => r.int(0, 1000), prop: (n: number) => { if (n > 800) throw new Error("big"); } };
    const a = checkProperty(spec);
    const b = checkProperty(spec);
    expect(a?.input).toBe(b?.input);
    expect(a?.runSeed).toBe(b?.runSeed);
  });
  it("shrinks a failing list to the smallest one that still fails", () => {
    const f = checkProperty<number[]>({
      name: "no 7",
      seed: 3,
      gen: (r) => Array.from({ length: r.int(5, 30) }, () => r.int(0, 9)),
      prop: (l) => { if (l.includes(7)) throw new Error("has a 7"); },
      shrink: (l) => shrinkList(l),
    });
    expect(f?.shrunk).toEqual([7]);
    expect((f?.input.length ?? 0) >= 5).toBe(true);
  });
  it("shrinks a failing string", () => {
    const f = checkProperty<string>({
      name: "no z",
      gen: (r) => Array.from({ length: 40 }, () => r.pick(["a", "b", "z", "c"])).join(""),
      prop: (s) => { if (s.includes("z")) throw new Error("z"); },
      shrink: shrinkString,
    });
    expect(f?.shrunk).toBe("z");
  });
  it("reports the first input as it was when there is no shrinker", () => {
    const f = checkProperty({ name: "n", gen: () => 5, prop: () => { throw new Error("always"); } });
    expect(f?.shrunk).toBe(5);
    expect(f?.shrinkSteps).toBe(0);
  });
  it("reports an error that is not an Error object", () => {
    const f = checkProperty({ name: "str", gen: () => 1, prop: () => { throw "plain text"; } });
    expect(f?.error).toBe("plain text");
  });
  it("refuses a check that returns a promise, so a missing await cannot hide a failure", () => {
    expect(() => checkProperty({ name: "p", gen: () => 1, prop: async () => { throw new Error("late"); } })).toThrow("checkPropertyAsync");
  });
});

describe("checkPropertyAsync", () => {
  it("passes and fails like the sync one", async () => {
    expect(await checkPropertyAsync({ name: "ok", runs: 10, gen: () => 1, prop: async () => undefined })).toBeNull();
    const f = await checkPropertyAsync<number[]>({ name: "bad", gen: (r) => [r.int(0, 3), 9], prop: async (l) => { if (l.includes(9)) throw new Error("nine"); }, shrink: (l) => shrinkList(l) });
    expect(f?.shrunk).toEqual([9]);
    expect(f?.error).toBe("nine");
  });
});

describe("assertProperty", () => {
  it("does nothing when the property holds", () => {
    expect(() => assertProperty({ name: "ok", runs: 5, gen: () => 1, prop: () => undefined })).not.toThrow();
  });
  it("throws a message with the name, the seed and both inputs", () => {
    let message = "";
    try {
      assertProperty({ name: "needs no 4", seed: 77, gen: (r) => [r.int(0, 3), 4, r.int(0, 3)], prop: (l) => { if (l.includes(4)) throw new Error("found 4"); }, shrink: (l) => shrinkList(l) });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("Property failed: needs no 4");
    expect(message).toContain("found 4");
    expect(message).toContain("seed 77");
    expect(message).toContain("smallest input: [4]");
    expect(message).toContain("first input:");
  });
  it("throws from the async one too", async () => {
    await expect(assertPropertyAsync({ name: "a", gen: () => 1, prop: async () => { throw new Error("x"); } })).rejects.toThrow("Property failed: a");
  });
});

describe("minimise", () => {
  it("keeps the input when nothing simpler fails", () => {
    expect(minimise(5, (n) => n === 5, () => [1, 2, 3])).toEqual({ value: 5, steps: 3 });
  });
  it("stops after the step limit", () => {
    const r = minimise(1000, () => true, (n) => [n - 1], 25);
    expect(r.steps).toBe(25);
    expect(r.value).toBeLessThan(1000);
  });
});

describe("shrinkString", () => {
  it("gives nothing for an empty string and the empty string first for any other", () => {
    expect([...shrinkString("")]).toEqual([]);
    expect([...shrinkString("abc")][0]).toBe("");
  });
  it("only gives strings that are shorter", () => {
    for (const s of shrinkString("abcdefgh")) expect(s.length).toBeLessThan(8);
  });
});

describe("shrinkList", () => {
  it("gives nothing for an empty list and the empty list first for any other", () => {
    expect([...shrinkList([])]).toEqual([]);
    expect([...shrinkList([1, 2])][0]).toEqual([]);
  });
  it("can drop each single element", () => {
    const all = [...shrinkList([1, 2, 3])].map((l) => l.join(","));
    expect(all).toEqual(expect.arrayContaining(["2,3", "1,3", "1,2"]));
  });
  it("shrinks inside the items when given a way to", () => {
    const all = [...shrinkList(["ab"], shrinkString)].map((l) => l.join("|"));
    expect(all).toContain("");
    expect(all).toContain("a");
  });
});

describe("shrinkJson", () => {
  it("offers null and the empty value first for containers", () => {
    expect([...shrinkJson({ a: 1 })].slice(0, 2)).toEqual([null, {}]);
    expect([...shrinkJson([1])].slice(0, 2)).toEqual([null, []]);
  });
  it("removes one key at a time and simplifies inside", () => {
    const outs = [...shrinkJson({ a: "xy", b: 1 })].map((v) => JSON.stringify(v));
    expect(outs).toEqual(expect.arrayContaining(['{"b":1}', '{"a":"xy"}', '{"a":"","b":1}', '{"a":"xy","b":0}']));
  });
  it("reduces scalars", () => {
    expect([...shrinkJson(5)]).toEqual([0]);
    expect([...shrinkJson(true)]).toEqual([false]);
    expect([...shrinkJson(null)]).toEqual([]);
    expect([...shrinkJson(0)]).toEqual([]);
  });
  it("finds the part of a value that matters", () => {
    const f = checkProperty<unknown>({
      name: "no deep marker",
      gen: () => ({ a: [1, 2, { keep: "x", marker: "bad", more: [1, 2, 3] }], b: "text" }),
      prop: (v) => { if (JSON.stringify(v).includes('"marker":"bad"')) throw new Error("marker"); },
      shrink: shrinkJson,
    });
    expect(JSON.stringify(f?.shrunk)).toBe('{"marker":"bad"}');
  });
});

describe("showValue and explain", () => {
  it("writes JSON, cuts long text, and falls back to String for what JSON cannot write", () => {
    expect(showValue({ a: 1 })).toBe('{"a":1}');
    expect(showValue("x".repeat(1000))).toContain("(1002 characters)");
    expect(showValue(undefined)).toBe("undefined");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(showValue(circular)).toBe("[object Object]");
  });
  it("explain names the seed and both inputs", () => {
    const text = explain({ name: "n", seed: 1, run: 2, runSeed: 3, input: [1, 2], shrunk: [2], shrinkSteps: 4, error: "boom" });
    expect(text.split("\n")).toEqual(["Property failed: n", "  boom", "  seed 1, run 2 (run seed 3); shrunk in 4 steps", "  smallest input: [2]", "  first input:    [1,2]"]);
  });
});
