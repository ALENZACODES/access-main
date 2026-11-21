import { describe, expect, it } from "vitest";
import { NOT_RETENTION, RETENTION_REGISTER, assertRetention, limitOf, retentionCounts, validateRetention, type Limit, type RetentionRow } from "./retentionRegister";
import { STORAGE_REGISTER, UNSCANNED } from "./storageRegister";

const ref = { path: "apps/web/src/a.ts", name: "MAX_A" };
const row = (over: Partial<RetentionRow> = {}): RetentionRow => ({
  key: "app.a.v1",
  holds: { en: "A", fr: "A" },
  files: ["apps/web/src/a.ts"],
  limits: [],
  source: "Read from the source files named in the row",
  recordedOn: "2026-11-20",
  ...over,
});
const days = (n: number): Limit => ({ kind: "days", days: n, from: ref });
const count = (n: number): Extract<Limit, { kind: "count" }> => ({ kind: "count", max: n, unit: { en: "items", fr: "éléments" }, whenFull: "new-refused", from: ref });
const bytes = (n: number): Extract<Limit, { kind: "bytes" }> => ({ kind: "bytes", max: n, about: { en: "files", fr: "fichiers" }, whenFull: "oldest-removed", from: ref });
const codes = (rows: readonly RetentionRow[], ctx = {}): string[] => validateRetention(rows, ctx).map((p) => p.code);

describe("the real register", () => {
  const own = RETENTION_REGISTER.map((r) => r.key).filter((k) => k.startsWith("access.") && !STORAGE_REGISTER.some((s) => s.key === k));
  it("has no problems against the storage register and the panel's own names", () => {
    expect(validateRetention(RETENTION_REGISTER, { register: STORAGE_REGISTER, unscanned: UNSCANNED, ownKeys: own })).toEqual([]);
  });
  it("does not throw when asserted", () => {
    expect(() => assertRetention(RETENTION_REGISTER, { register: STORAGE_REGISTER, unscanned: UNSCANNED, ownKeys: own })).not.toThrow();
  });
  it("lists one row for each of the ten registered names, five panel names and the store that cannot be read", () => {
    expect(RETENTION_REGISTER).toHaveLength(STORAGE_REGISTER.length + 5 + UNSCANNED.length);
  });
  it("leaves the store that cannot be read as UNKNOWN, not as a store with no limit", () => {
    const r = RETENTION_REGISTER.find((x) => x.key === "UNKNOWN");
    expect(r?.limits).toBe("UNKNOWN");
    expect(retentionCounts(RETENTION_REGISTER).unknown).toBe(1);
  });
  it("gives every exception a reason", () => {
    for (const e of NOT_RETENTION) expect(e.why.length).toBeGreaterThan(20);
  });
  it("records the time limits the panel's own code sets", () => {
    const days = Object.fromEntries(RETENTION_REGISTER.flatMap((r) => (r.limits === "UNKNOWN" ? [] : r.limits.filter((l) => l.kind === "days").map((l) => [r.key, l.kind === "days" ? l.days : 0]))));
    expect(days).toEqual({ "access.activity.v1": 90, "access.egress.v1": 30, "access.seen.v1": 365 });
  });
  it("counts the rows by what was found", () => {
    expect(retentionCounts(RETENTION_REGISTER)).toEqual({ total: 16, timed: 3, capped: 7, none: 7, unknown: 1 });
  });
});

describe("validateRetention", () => {
  it("accepts a plain row", () => {
    expect(codes([row()])).toEqual([]);
    expect(codes([row({ limits: [days(30), count(50)] })])).toEqual([]);
  });
  it("flags an empty or odd key, and a key listed twice", () => {
    expect(codes([row({ key: " " })])).toContain("empty-key");
    expect(codes([row({ key: "a b" })])).toContain("bad-key");
    expect(codes([row(), row()])).toContain("duplicate-key");
  });
  it("allows UNKNOWN once with UNKNOWN limits, and refuses UNKNOWN limits on a real key", () => {
    expect(codes([row({ key: "UNKNOWN", limits: "UNKNOWN" })])).toEqual([]);
    expect(codes([row({ limits: "UNKNOWN" })])).toContain("unknown-with-key");
  });
  it("needs a file, a plain path, text in both languages, a source and a date", () => {
    expect(codes([row({ files: [] })])).toContain("no-files");
    expect(codes([row({ files: ["a b.ts"] })])).toContain("bad-path");
    expect(codes([row({ holds: { en: "A", fr: " " } })])).toContain("empty-text");
    expect(codes([row({ source: "" })])).toContain("empty-source");
    expect(codes([row({ recordedOn: "2026-13-01" })])).toContain("bad-date");
    expect(codes([row({ recordedOn: "yesterday" })])).toContain("bad-date");
  });
  it("refuses a time limit that is not a whole number of days the code would accept", () => {
    for (const n of [0, -1, 1.5, Number.NaN, 3651]) expect(codes([row({ limits: [days(n)] })]), String(n)).toContain("bad-number");
    expect(codes([row({ limits: [days(1)] })])).toEqual([]);
    expect(codes([row({ limits: [days(3650)] })])).toEqual([]);
  });
  it("refuses a count below two, a fraction, and an empty unit", () => {
    for (const n of [0, 1, 2.5]) expect(codes([row({ limits: [count(n)] })]), String(n)).toContain("bad-number");
    expect(codes([row({ limits: [{ ...count(5), unit: { en: "", fr: "x" } }] })])).toContain("bad-unit");
  });
  it("refuses a size below one kilobyte and an empty description of it", () => {
    expect(codes([row({ limits: [bytes(100)] })])).toContain("bad-number");
    expect(codes([row({ limits: [bytes(2048)] })])).toEqual([]);
    expect(codes([row({ limits: [{ ...bytes(2048), about: { en: "x", fr: "" } }] })])).toContain("bad-unit");
  });
  it("refuses two limits of one kind and a bad constant reference", () => {
    expect(codes([row({ limits: [count(5), count(6)] })])).toContain("repeated-limit");
    expect(codes([row({ limits: [{ ...count(5), from: { path: "x", name: "MAX_A" } }] })])).toContain("bad-path");
    expect(codes([row({ limits: [{ ...count(5), from: { path: "apps/web/src/a.ts", name: "1A" } }] })])).toContain("bad-path");
  });
  it("finds a name in the storage register with no row, and a row for a name that is not there", () => {
    const reg = [{ ...STORAGE_REGISTER[0]!, key: "app.a.v1", path: "apps/web/src/a.ts" }, { ...STORAGE_REGISTER[0]!, key: "app.b.v1", path: "apps/web/src/b.ts" }];
    expect(validateRetention([row()], { register: reg }).map((p) => `${p.code}:${p.key}`)).toEqual(["missing-row:app.b.v1"]);
    expect(validateRetention([row(), row({ key: "app.c.v1" })], { register: [reg[0]!] }).map((p) => `${p.code}:${p.key}`)).toEqual(["extra-row:app.c.v1"]);
  });
  it("finds a registered file that the row does not list", () => {
    const reg = [{ ...STORAGE_REGISTER[0]!, key: "app.a.v1", path: "apps/web/src/elsewhere.ts" }];
    expect(codes([row()], { register: reg })).toEqual(["path-not-listed"]);
  });
  it("wants a row for the unscanned store when there is one, and none when there is not", () => {
    expect(codes([row()], { unscanned: UNSCANNED })).toContain("missing-row");
    expect(codes([row({ key: "UNKNOWN", limits: "UNKNOWN" })], { unscanned: [] })).toContain("extra-row");
  });
  it("wants a row for each name the panel keeps itself", () => {
    expect(codes([row()], { ownKeys: ["access.prefs.v1"] })).toContain("missing-row");
  });
  it("checks nothing about coverage when given nothing to cover", () => {
    expect(codes([row({ key: "anything" })])).toEqual([]);
  });
  it("sorts problems by key and code", () => {
    const p = validateRetention([row({ key: "b", files: [] }), row({ key: "a", files: [] })]);
    expect(p.map((x) => x.key)).toEqual(["a", "b"]);
  });
});

describe("assertRetention", () => {
  it("throws a message naming each problem", () => {
    expect(() => assertRetention([row({ files: [] })])).toThrow("no-files app.a.v1");
    expect(() => assertRetention([row({ limits: [days(0)] })])).toThrow("bad-number app.a.v1 (days 0)");
  });
});

describe("retentionCounts and limitOf", () => {
  it("counts a row with both kinds once in each, and a row with neither as none", () => {
    const rows = [row({ key: "a", limits: [days(5), count(5)] }), row({ key: "b", limits: [days(5)] }), row({ key: "c", limits: [bytes(4096)] }), row({ key: "d" }), row({ key: "UNKNOWN", limits: "UNKNOWN" })];
    expect(retentionCounts(rows)).toEqual({ total: 5, timed: 2, capped: 2, none: 1, unknown: 1 });
    expect(retentionCounts([])).toEqual({ total: 0, timed: 0, capped: 0, none: 0, unknown: 0 });
  });
  it("finds the limit of a kind, or nothing", () => {
    const r = row({ limits: [days(5), count(7)] });
    expect(limitOf(r, "days")?.days).toBe(5);
    expect(limitOf(r, "count")?.max).toBe(7);
    expect(limitOf(r, "bytes")).toBeUndefined();
    expect(limitOf(row({ limits: "UNKNOWN", key: "UNKNOWN" }), "days")).toBeUndefined();
  });
});
