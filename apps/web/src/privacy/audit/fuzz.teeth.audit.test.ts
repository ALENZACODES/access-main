// The robustness checks must be able to fail. Each test here swaps in a version of the code with one flaw planted in it
// and checks that the same kind of property catches it. A check that passes on broken code proves nothing.

import { describe, expect, it } from "vitest";
import { applyImport, prepareImport, type ImportPlan } from "../panel/importData";
import { removeForPurpose, type GateRule } from "../panel/consentGate";
import { eraseLocalData } from "../panel/localData";
import { createMemoryStorage, type StorageLike } from "../panel/storage";
import { createFaultyStorage } from "./fuzz/faultyStorage";
import { genKeyName, genString } from "./fuzz/gen";
import { checkProperty, shrinkList, shrinkString } from "./fuzz/property";

const PREFIX = "app.";

/** applyImport without the roll back: the flaw a rollback audit has to catch. */
function applyWithoutRollback(storage: StorageLike, plan: ImportPlan): { written: number; failed: string[] } {
  let written = 0;
  for (const key of [...plan.additions, ...plan.overwrites]) {
    try {
      storage.setItem(key, plan.items[key] ?? "");
      written += 1;
    } catch {
      return { written: 0, failed: [key] };
    }
  }
  return { written, failed: [] };
}

const file = (items: Record<string, string>): string => JSON.stringify({ format: "app-local-data", version: 1, exportedAt: "2026-11-20T00:00:00.000Z", prefix: PREFIX, items });

describe("the rollback check", () => {
  const spec = (apply: (s: StorageLike, p: ImportPlan) => unknown) => ({
    name: "rollback",
    runs: 80,
    gen: (rng: { int: (a: number, b: number) => number }) => ({ n: rng.int(2, 6), failAt: rng.int(2, 6) }),
    prop: ({ n, failAt }: { n: number; failAt: number }) => {
      const items = Object.fromEntries(Array.from({ length: n }, (_, i) => [`${PREFIX}k${i}`, `v${i}`]));
      const s = createFaultyStorage();
      const o = prepareImport(file(items), s, { prefix: PREFIX, keys: [] });
      if (!o.ok || failAt > n) return;
      s.setFaults({ failWriteNumber: failAt });
      apply(s, o.plan);
      expect(s.snapshot()).toEqual({});
    },
  });
  it("passes the real applyImport", () => {
    expect(checkProperty(spec(applyImport))).toBeNull();
  });
  it("fails a version that does not put earlier writes back, and says which input", () => {
    const f = checkProperty(spec(applyWithoutRollback));
    expect(f).not.toBeNull();
    expect(f?.error).toContain("expected");
  });
});

describe("the erase check", () => {
  const eraseLiar = (storage: StorageLike): { removed: number; failed: string[] } => {
    let removed = 0;
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX) === true) {
        try {
          storage.removeItem(k);
        } catch {
          continue;
        }
        removed += 1;
      }
    }
    return { removed, failed: [] };
  };
  const spec = (erase: (s: StorageLike) => { removed: number; failed: string[] }) => ({
    name: "erase tells the truth",
    runs: 80,
    gen: (rng: { int: (a: number, b: number) => number }) => rng.int(1, 8),
    prop: (n: number) => {
      const names = Array.from({ length: n }, (_, i) => `${PREFIX}k${i}`);
      const s = createFaultyStorage(Object.fromEntries(names.map((k) => [k, "v"])), { dropRemoveWhen: (k) => k.endsWith("0") });
      const r = erase(s);
      const left = Object.keys(s.snapshot()).filter((k) => k.startsWith(PREFIX));
      expect(left.sort()).toEqual([...r.failed].sort());
    },
  });
  it("passes the real eraseLocalData", () => {
    expect(checkProperty(spec((s) => eraseLocalData(s, PREFIX)))).toBeNull();
  });
  it("fails an erase that counts a removal it never checked", () => {
    expect(checkProperty(spec(eraseLiar))).not.toBeNull();
  });
});

describe("the withdraw check", () => {
  const RULES: readonly GateRule[] = [{ purposeId: "a", key: `${PREFIX}a.`, prefix: true }];
  const noCatch = (storage: StorageLike): string[] => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k?.startsWith(`${PREFIX}a.`) === true) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
    return keys;
  };
  const spec = (withdraw: (s: StorageLike) => string[]) => ({
    name: "withdraw survives a refused removal",
    runs: 60,
    gen: (rng: { int: (a: number, b: number) => number }) => rng.int(1, 5),
    prop: (n: number) => {
      const s = createFaultyStorage(Object.fromEntries(Array.from({ length: n }, (_, i) => [`${PREFIX}a.${i}`, "v"])), { failRemoveWhen: (k) => k.endsWith("0") });
      withdraw(s);
    },
  });
  it("passes the real removeForPurpose", () => {
    expect(checkProperty(spec((s) => removeForPurpose(s, RULES, "a")))).toBeNull();
  });
  it("fails the version that was in the code before this audit found the flaw", () => {
    expect(checkProperty(spec(noCatch))?.error).toContain("blocked");
  });
});

describe("the shrinker", () => {
  it("reduces a failing run of steps to the one step that matters, so a failure is short enough to read", () => {
    const f = checkProperty<string[]>({
      name: "no step named x",
      gen: (rng) => Array.from({ length: 30 }, () => (rng.bool(0.1) ? "x" : genKeyName(rng, 3))),
      prop: (steps) => {
        if (steps.includes("x")) throw new Error("x found");
      },
      shrink: (steps) => shrinkList(steps, shrinkString),
    });
    expect(f?.shrunk).toEqual(["x"]);
  });
  it("uses the same inputs on every run of the suite", () => {
    const a: string[] = [];
    const b: string[] = [];
    checkProperty({ name: "a", runs: 5, gen: (rng) => genString(rng, 10), prop: (s) => { a.push(s); } });
    checkProperty({ name: "a", runs: 5, gen: (rng) => genString(rng, 10), prop: (s) => { b.push(s); } });
    expect(a).toEqual(b);
    expect(createMemoryStorage().length).toBe(0);
  });
});
