import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import {
  AUTO_EFFECTS,
  AUTO_KINDS,
  AUTO_REGISTER,
  EFFECT_LABELS,
  KIND_LABELS,
  assertAuto,
  autoCounts,
  inKindOrder,
  rowsFor,
  validateAuto,
  type AutoRow,
} from "./autoRegister";

const row = (over: Partial<AutoRow> = {}): AutoRow => ({
  kind: "timer",
  path: "apps/web/src/a/b.ts",
  uses: 1,
  effect: "runs",
  when: { en: "When x", fr: "Quand x" },
  does: { en: "Does y", fr: "Fait y" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});
const codes = (rows: AutoRow[]): string[] => validateAuto(rows).map((p) => p.code);

describe("the real register", () => {
  it("is well formed", () => {
    expect(validateAuto(AUTO_REGISTER)).toEqual([]);
    expect(() => assertAuto(AUTO_REGISTER)).not.toThrow();
  });
  it("has a row for each kind and file once", () => {
    const ids = AUTO_REGISTER.map((r) => `${r.kind} ${r.path}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("says what sets each one going and what it does, in both languages", () => {
    for (const r of AUTO_REGISTER) {
      for (const text of [r.when.en, r.when.fr, r.does.en, r.does.fr]) expect(text.length, r.path).toBeGreaterThan(15);
      expect(lintCopy("fr", r.when.fr), r.path).toEqual([]);
      expect(lintCopy("fr", r.does.fr), r.path).toEqual([]);
      expect(lintCopy("en", r.does.en), r.path).toEqual([]);
    }
  });
  it("marks only the offline worker's rows as reads", () => {
    const reads = AUTO_REGISTER.filter((r) => r.effect === "reads");
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r.kind).toBe("service-worker");
  });
  it("lists the files in a steady order for each kind", () => {
    for (const kind of AUTO_KINDS) {
      const paths = rowsFor(AUTO_REGISTER, kind).map((r) => r.path);
      expect(paths, kind).toEqual([...paths].sort());
    }
  });
  it("uses no programming interface name in the words a person reads", () => {
    for (const r of AUTO_REGISTER) {
      for (const text of [r.when.en, r.does.en, r.when.fr, r.does.fr]) expect(text, r.path).not.toMatch(/serviceWorker|MutationObserver|setTimeout|requestAnimationFrame|navigator|addEventListener/);
    }
  });
});

describe("validateAuto", () => {
  it("is empty for a good row", () => {
    expect(codes([row()])).toEqual([]);
  });
  it("names a path outside the web source, with a parent folder, a double slash or another extension", () => {
    for (const path of ["packages/x/a.ts", "apps/web/src/../a.ts", "apps/web/src//a.ts", "apps/web/src/a.js", "apps/web/src/a.test.md", ""]) expect(codes([row({ path })]), path).toContain("bad-path");
    expect(codes([row({ path: "apps/web/src/a/b.tsx" })])).toEqual([]);
  });
  it("names a kind and an effect that are not in the lists", () => {
    expect(codes([row({ kind: "poll" as AutoRow["kind"] })])).toEqual(["bad-kind"]);
    expect(codes([row({ effect: "sleeps" as AutoRow["effect"] })])).toEqual(["bad-effect"]);
  });
  it("names a count that is zero, negative, fractional or not a number", () => {
    for (const uses of [0, -2, 1.5, Number.NaN]) expect(codes([row({ uses })]), String(uses)).toContain("bad-count");
  });
  it("names empty words in either language", () => {
    expect(codes([row({ when: { en: "", fr: "x" } })])).toEqual(["empty-text"]);
    expect(codes([row({ does: { en: "x", fr: "  " } })])).toEqual(["empty-text"]);
  });
  it("names an empty source and a bad date", () => {
    expect(codes([row({ source: " " })])).toEqual(["empty-source"]);
    expect(codes([row({ recordedOn: "2026-13-01" })])).toEqual(["bad-date"]);
  });
  it("names a duplicate row, and accepts the same file for another kind", () => {
    expect(codes([row(), row()])).toEqual(["duplicate-row"]);
    expect(codes([row(), row({ kind: "frame" })])).toEqual([]);
  });
  it("only lets the offline worker's kind be marked reads", () => {
    expect(codes([row({ effect: "reads" })])).toEqual(["reads-not-service-worker"]);
    expect(codes([row({ kind: "service-worker", effect: "reads" })])).toEqual([]);
  });
  it("puts the problems in a steady order", () => {
    const a = validateAuto([row({ uses: 0 }), row({ kind: "frame", uses: 0 })]);
    const b = validateAuto([row({ kind: "frame", uses: 0 }), row({ uses: 0 })]);
    expect(a).toEqual(b);
  });
  it("gives the kind and file with each problem", () => {
    expect(validateAuto([row({ uses: 0 })])).toEqual([{ code: "bad-count", kind: "timer", path: "apps/web/src/a/b.ts", detail: "0" }]);
  });
});

describe("assertAuto", () => {
  it("throws with every problem in one message", () => {
    expect(() => assertAuto([row({ uses: 0 }), row({ path: "x" })])).toThrow(/bad-count timer apps\/web\/src\/a\/b\.ts \(0\); bad-path timer x/);
  });
});

describe("autoCounts", () => {
  it("adds up rows, places, files and effects", () => {
    const rows = [row({ uses: 3 }), row({ path: "apps/web/src/c.ts", effect: "reacts", uses: 2 }), row({ kind: "service-worker", path: "apps/web/src/c.ts", effect: "reads" })];
    expect(autoCounts(rows)).toEqual({ total: 3, uses: 6, files: 2, runs: 1, reacts: 1, reads: 1 });
  });
  it("is all zero for no rows", () => {
    expect(autoCounts([])).toEqual({ total: 0, uses: 0, files: 0, runs: 0, reacts: 0, reads: 0 });
  });
  it("counts the real register's rows by effect so they add up", () => {
    const c = autoCounts(AUTO_REGISTER);
    expect(c.runs + c.reacts + c.reads).toBe(c.total);
    expect(c.uses).toBeGreaterThanOrEqual(c.total);
  });
});

describe("ordering and labels", () => {
  it("sorts by kind and then by path, without changing the input", () => {
    const rows = [row({ kind: "service-worker" }), row({ path: "apps/web/src/z.ts" }), row({ kind: "frame" }), row({ path: "apps/web/src/a.ts" })];
    const copy = [...rows];
    expect(inKindOrder(rows).map((r) => `${r.kind} ${r.path.split("/").pop()}`)).toEqual(["timer a.ts", "timer z.ts", "frame b.ts", "service-worker b.ts"]);
    expect(rows).toEqual(copy);
  });
  it("has a label in both languages for every kind and effect", () => {
    for (const k of AUTO_KINDS) {
      expect(KIND_LABELS[k].en.length).toBeGreaterThan(3);
      expect(KIND_LABELS[k].fr.length).toBeGreaterThan(3);
      expect(lintCopy("fr", KIND_LABELS[k].fr), k).toEqual([]);
    }
    for (const e of AUTO_EFFECTS) {
      expect(EFFECT_LABELS[e].en.length).toBeGreaterThan(3);
      expect(lintCopy("fr", EFFECT_LABELS[e].fr), e).toEqual([]);
    }
  });
  it("lists every kind and effect once", () => {
    expect(new Set(AUTO_KINDS).size).toBe(AUTO_KINDS.length);
    expect(new Set(AUTO_EFFECTS).size).toBe(AUTO_EFFECTS.length);
  });
});
