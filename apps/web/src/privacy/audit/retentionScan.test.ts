import { describe, expect, it } from "vitest";
import type { NotRetention, RetentionRow } from "../panel/retentionRegister";
import { compareRetention, constantValue, evaluateNumber, expiryCallers, formatRetentionComparison, isClean, limitConstants, limitValue } from "./retentionScan";
import type { FoundKey } from "./storageKeys";

const file = (path: string, text: string) => ({ path, text });
const row = (over: Partial<RetentionRow> = {}): RetentionRow => ({ key: "app.a.v1", holds: { en: "A", fr: "A" }, files: ["apps/web/src/a.ts"], limits: [], source: "s", recordedOn: "2026-11-20", ...over });
const cap = (name = "MAX_A", max = 5) => ({ kind: "count" as const, max, unit: { en: "x", fr: "x" }, whenFull: "new-refused" as const, from: { path: "apps/web/src/a.ts", name } });
const key = (k: string, paths: string[]): FoundKey => ({ key: k, path: paths[0] ?? "", line: 1, via: "call", paths });

describe("evaluateNumber", () => {
  it("reads whole numbers, with underscores and products", () => {
    expect(evaluateNumber("50")).toBe(50);
    expect(evaluateNumber(" 1_000_000 ")).toBe(1_000_000);
    expect(evaluateNumber("50 * 1024 * 1024")).toBe(52_428_800);
    expect(evaluateNumber("86_400 * 1000")).toBe(86_400_000);
    expect(evaluateNumber("3_600_000 as const")).toBe(3_600_000);
  });
  it("gives null for anything else, so a value it cannot read is never guessed", () => {
    for (const t of ["", "Infinity", "Number.MAX_SAFE_INTEGER", "1.5", "-1", "5 + 5", "(5)", "'5'", "N", "0x10", "5 *", "2 ** 8", "9007199254740993", "9007199254740991 * 2"]) expect(evaluateNumber(t), t).toBeNull();
  });
});

describe("limitConstants", () => {
  const text = [
    "export const MAX_QUEUE = 50;",
    "const TTL_DAYS: number = 30;",
    "const MAX_BYTES = 50 * 1024 * 1024;",
    "const BACKOFF_MAX_MS = 3_600_000;",
    "const RETRY_LIMIT = Infinity;",
    "// const MAX_OLD = 9;",
    " * const MAX_DOC = 9;",
    "const NAME = 5;",
    "const MAXIMUM = 5;",
    "const SOME_QUOTA = 7",
    "const x_max = 3;",
  ].join("\n");
  const found = limitConstants(file("p.ts", text));
  it("finds the names that read as a limit, with their values, and ignores comments", () => {
    expect(found.map((c) => `${c.name}=${c.value}@${c.line}`)).toEqual(["MAX_QUEUE=50@1", "TTL_DAYS=30@2", "MAX_BYTES=52428800@3", "BACKOFF_MAX_MS=3600000@4", "RETRY_LIMIT=null@5", "SOME_QUOTA=7@10"]);
  });
  it("does not take a word that only contains one of the names", () => {
    expect(found.map((c) => c.name)).not.toContain("MAXIMUM");
    expect(found.map((c) => c.name)).not.toContain("x_max");
  });
  it("gives the file path", () => {
    expect(found.every((c) => c.path === "p.ts")).toBe(true);
  });
});

describe("constantValue", () => {
  const files = [file("a.ts", "const MAX_A = 12;\nconst MAX_B = Infinity;")];
  it("gives the number, or null when the file, the name or a plain number is missing", () => {
    expect(constantValue(files, "a.ts", "MAX_A")).toBe(12);
    expect(constantValue(files, "a.ts", "MAX_B")).toBeNull();
    expect(constantValue(files, "a.ts", "MAX_C")).toBeNull();
    expect(constantValue(files, "b.ts", "MAX_A")).toBeNull();
  });
});

describe("expiryCallers", () => {
  it("finds the files that call putExpiring, and not the file that defines it, tests or comments", () => {
    const files = [
      file("apps/web/src/a.ts", "putExpiring(s, k, v, now, 7);"),
      file("apps/web/src/b.ts", "  // putExpiring(s, k, v, now, 7);"),
      file("apps/web/src/privacy/panel/expiry.ts", "export function putExpiring(a) {}\nputExpiring(x);"),
      file("apps/web/src/c.test.ts", "putExpiring(s);"),
      file("apps/web/src/d.ts", "const x = 1;"),
      file("apps/web/src/e.ts", "await putExpiring (s)"),
    ];
    expect(expiryCallers(files)).toEqual(["apps/web/src/a.ts", "apps/web/src/e.ts"]);
  });
});

describe("limitValue", () => {
  it("gives the days or the maximum", () => {
    expect(limitValue({ kind: "days", days: 9, from: { path: "p", name: "N" } })).toBe(9);
    expect(limitValue(cap("MAX_A", 4))).toBe(4);
  });
});

describe("compareRetention", () => {
  const a = file("apps/web/src/a.ts", "export const MAX_A = 5;\n");
  const none: NotRetention[] = [];
  it("is clean when the row matches the source", () => {
    const c = compareRetention([a], [row({ limits: [cap()] })], none, [key("app.a.v1", ["apps/web/src/a.ts"])]);
    expect(isClean(c)).toBe(true);
    expect(formatRetentionComparison(c)).toBe("");
  });
  it("reports a wrong number, naming both", () => {
    const c = compareRetention([a], [row({ limits: [cap("MAX_A", 9)] })], none, []);
    expect(c.wrong).toEqual([{ key: "app.a.v1", constant: "MAX_A", path: "apps/web/src/a.ts", expected: 9, actual: 5 }]);
    expect(formatRetentionComparison(c)).toBe("app.a.v1: the row says 9 for MAX_A but apps/web/src/a.ts has 5");
  });
  it("reports a limit-like constant no row claims, with its line, and skips one whose value is not a number", () => {
    const f = file("apps/web/src/a.ts", "const X = 1;\nexport const MAX_Z = 8;\nconst MAX_Y = Infinity;\n");
    const c = compareRetention([f], [row()], none, []);
    expect(c.unclaimed.map((u) => `${u.name}@${u.line}`)).toEqual(["MAX_Z@2"]);
    expect(formatRetentionComparison(c)).toContain("apps/web/src/a.ts:2: MAX_Z (8) looks like a limit and is in no row");
  });
  it("accepts a constant that is in the exceptions", () => {
    const f = file("apps/web/src/a.ts", "export const MAX_Z = 8;");
    expect(isClean(compareRetention([f], [row()], [{ path: "apps/web/src/a.ts", name: "MAX_Z", why: "w" }], []))).toBe(true);
  });
  it("only looks at constants in files a row lists", () => {
    const other = file("apps/web/src/other.ts", "export const MAX_Q = 3;");
    expect(isClean(compareRetention([a, other], [row({ limits: [cap()] })], none, []))).toBe(true);
  });
  it("reports a file that names the key and is not listed, and a listed file that is gone", () => {
    const c = compareRetention([a], [row({ files: ["apps/web/src/a.ts", "apps/web/src/gone.ts"] })], none, [key("app.a.v1", ["apps/web/src/a.ts", "apps/web/src/new.ts"])]);
    expect(c.newFiles).toEqual([{ key: "app.a.v1", path: "apps/web/src/new.ts" }]);
    expect(c.missingFiles).toEqual([{ key: "app.a.v1", path: "apps/web/src/gone.ts" }]);
  });
  it("reports a file that sets an expiry and is in no row", () => {
    const e = file("apps/web/src/e.ts", "putExpiring(s, k, v, n, 3);");
    expect(compareRetention([a, e], [row()], none, []).unlistedExpiry).toEqual(["apps/web/src/e.ts"]);
    expect(compareRetention([a, e], [row({ files: ["apps/web/src/a.ts", "apps/web/src/e.ts"] })], none, []).unlistedExpiry).toEqual([]);
  });
  it("reports an exception that is not there and one a row now claims", () => {
    const c = compareRetention([a], [row({ limits: [cap()] })], [{ path: "apps/web/src/a.ts", name: "MAX_NO", why: "w" }, { path: "apps/web/src/a.ts", name: "MAX_A", why: "w" }], []);
    expect(c.staleExceptions.map((e) => e.name)).toEqual(["MAX_NO", "MAX_A"]);
  });
  it("does not check the numbers of a row whose limits are UNKNOWN", () => {
    expect(isClean(compareRetention([a], [row({ key: "UNKNOWN", limits: "UNKNOWN" })], [{ path: "apps/web/src/a.ts", name: "MAX_A", why: "w" }], []))).toBe(true);
  });
});
