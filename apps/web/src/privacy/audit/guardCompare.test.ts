import { describe, expect, it } from "vitest";
import { compareFlags, compareGuardAccepted, compareLists, comparePackages, compareSuppressions, flagSummary, formatGuardProblem, formatGuardProblems } from "./guardCompare";
import type { GuardAcceptRow, GuardRegister } from "./guardRegister";
import type { GuardFinding } from "./guardRules";
import type { ConfigFacts } from "./configScan";
import { parseTsConfig, effectiveFlags } from "./tsModel";

const reg = (over: Partial<GuardRegister> = {}): GuardRegister => ({ tsFlags: {}, suppressions: [], lists: {}, packages: [], ...over });
const ts = (files: Record<string, string>) => Object.entries(files).map(([p, t]) => parseTsConfig(p, t));
const STRICT = '{ "compilerOptions": { "strict": true, "noEmit": true } }';
const facts = (path: string, lists: Record<string, string[]>): ConfigFacts => ({ path, lists, findings: [] });
const finding = (code: GuardFinding["code"], path = "a.ts"): GuardFinding => ({ code, path, line: 1, detail: "d" });

describe("flagSummary", () => {
  it("lists the flags that are written, in the order of the flag list", () => {
    const e = effectiveFlags(ts({ "a.json": '{ "compilerOptions": { "noEmit": true, "strict": true, "skipLibCheck": false } }' })).get("a.json");
    expect(flagSummary(e as never)).toBe("strict=true,skipLibCheck=false,noEmit=true");
  });
  it("is empty when no flag is written", () => expect(flagSummary(effectiveFlags(ts({ "a.json": "{}" })).get("a.json") as never)).toBe(""));
});

describe("compareFlags", () => {
  it("has no difference when the register says what the files come to", () => expect(compareFlags(ts({ "a.json": STRICT }), reg({ tsFlags: { "a.json": "strict=true,noEmit=true" } }))).toEqual([]));
  it("finds a flag that changed", () => {
    const p = compareFlags(ts({ "a.json": '{ "compilerOptions": { "strict": false, "noEmit": true } }' }), reg({ tsFlags: { "a.json": "strict=true,noEmit=true" } }));
    expect(p).toEqual([{ code: "flags-changed", key: "a.json", detail: "register strict=true,noEmit=true; file strict=false,noEmit=true" }]);
  });
  it("finds a flag added", () => expect(compareFlags(ts({ "a.json": STRICT }), reg({ tsFlags: { "a.json": "strict=true" } }))[0]?.code).toBe("flags-changed"));
  it("finds a configuration the register does not list", () => expect(compareFlags(ts({ "a.json": STRICT }), reg()).map((p) => [p.code, p.key])).toEqual([["config-added", "a.json"]]));
  it("finds a configuration listed but not there", () => expect(compareFlags([], reg({ tsFlags: { "a.json": "strict=true" } })).map((p) => [p.code, p.key])).toEqual([["config-gone", "a.json"]]));
  it("follows extends, so a change in the parent shows in the child", () => {
    const files = { "base.json": '{ "compilerOptions": { "strict": false } }', "child.json": '{ "extends": "./base.json" }' };
    const p = compareFlags(ts(files), reg({ tsFlags: { "base.json": "strict=false", "child.json": "strict=true" } }));
    expect(p.map((x) => x.key)).toEqual(["child.json"]);
  });
  it("gives the problems in key order", () => expect(compareFlags(ts({ "b.json": STRICT, "a.json": STRICT }), reg()).map((p) => p.key)).toEqual(["a.json", "b.json"]));
});

describe("compareSuppressions", () => {
  const found = [{ path: "a.ts", kind: "eslint-disable-next-line" as const, rules: "x", count: 2 }];
  const listed = { path: "a.ts", kind: "eslint-disable-next-line", rules: "x", count: 2 };
  it("has no difference when found and listed agree", () => expect(compareSuppressions(found, reg({ suppressions: [listed] }))).toEqual([]));
  it("finds one that is not listed", () => expect(compareSuppressions(found, reg())).toEqual([{ code: "suppress-added", key: "a.ts eslint-disable-next-line [x]", detail: "2 found; the register does not list it" }]));
  it("finds one that is listed and gone", () => expect(compareSuppressions([], reg({ suppressions: [listed] }))).toEqual([{ code: "suppress-gone", key: "a.ts eslint-disable-next-line [x]", detail: "the register lists ×2; none found" }]));
  it("finds a count that changed", () => expect(compareSuppressions(found, reg({ suppressions: [{ ...listed, count: 1 }] }))).toEqual([{ code: "suppress-count-changed", key: "a.ts eslint-disable-next-line [x]", detail: "register ×1; found ×2" }]));
  it("treats the same file with other rules as another suppression", () => {
    const p = compareSuppressions(found, reg({ suppressions: [{ ...listed, rules: "y" }] }));
    expect(p.map((x) => x.code).sort()).toEqual(["suppress-added", "suppress-gone"]);
  });
  it("writes the key without brackets for a use of any", () => expect(compareSuppressions([{ path: "a.ts", kind: "any", rules: "", count: 1 }], reg())[0]?.key).toBe("a.ts any"));
});

describe("compareLists", () => {
  const r = reg({ lists: { "v.ts": { include: ["a", "b"], exclude: ["c"] } } });
  it("has no difference when the lists agree", () => expect(compareLists([facts("v.ts", { include: ["a", "b"], exclude: ["c"] })], r)).toEqual([]));
  it("finds a list that changed, and an entry moved", () => {
    expect(compareLists([facts("v.ts", { include: ["a"], exclude: ["c"] })], r).map((p) => [p.code, p.key])).toEqual([["list-changed", "v.ts include"]]);
    expect(compareLists([facts("v.ts", { include: ["b", "a"], exclude: ["c"] })], r)[0]?.code).toBe("list-changed");
  });
  it("finds an entry added to the exclude list, which hides tests", () => {
    const p = compareLists([facts("v.ts", { include: ["a", "b"], exclude: ["c", "tests/**"] })], r);
    expect(p).toEqual([{ code: "list-changed", key: "v.ts exclude", detail: 'register ["c"]; file ["c","tests/**"]' }]);
  });
  it("finds a list that is no longer written", () => expect(compareLists([facts("v.ts", { include: ["a", "b"] })], r).map((p) => [p.code, p.key])).toEqual([["list-gone", "v.ts exclude"]]));
  it("finds a list that is not in the register", () => expect(compareLists([facts("v.ts", { include: ["a", "b"], exclude: ["c"], setupFiles: ["s"] })], r).map((p) => [p.code, p.key])).toEqual([["list-added", "v.ts setupFiles"]]));
  it("finds a file that was not read, and a file that was read but is not in the register", () => {
    expect(compareLists([], r).map((p) => [p.code, p.key])).toEqual([["file-gone", "v.ts"]]);
    expect(compareLists([facts("v.ts", { include: ["a", "b"], exclude: ["c"] }), facts("w.ts", {})], r).map((p) => [p.code, p.key])).toEqual([["file-gone", "w.ts"]]);
  });
  it("does not take an empty list for an absent one", () => expect(compareLists([facts("v.ts", { include: [], exclude: ["c"] })], reg({ lists: { "v.ts": { include: [], exclude: ["c"] } } }))).toEqual([]));
});

describe("comparePackages", () => {
  it("has no difference when the files agree, in any order", () => expect(comparePackages(["b/package.json", "a/package.json"], reg({ packages: ["a/package.json", "b/package.json"] }))).toEqual([]));
  it("finds a package file added", () => expect(comparePackages(["a/package.json", "n/package.json"], reg({ packages: ["a/package.json"] })).map((p) => [p.code, p.key])).toEqual([["package-added", "n/package.json"]]));
  it("finds a package file gone", () => expect(comparePackages([], reg({ packages: ["a/package.json"] })).map((p) => [p.code, p.key])).toEqual([["package-gone", "a/package.json"]]));
});

describe("compareGuardAccepted", () => {
  const rows: GuardAcceptRow[] = [{ path: "a.ts", code: "suppress-no-reason", count: 1, reason: "A real reason that is long enough." }];
  it("has no difference when the findings are exactly the accepted ones", () => expect(compareGuardAccepted([finding("suppress-no-reason")], rows)).toEqual([]));
  it("has no difference for nothing on both sides", () => expect(compareGuardAccepted([], [])).toEqual([]));
  it("finds a finding that is not accepted", () => expect(compareGuardAccepted([finding("suppress-no-reason"), finding("suppress-any")], rows)).toEqual([{ code: "finding-not-accepted", key: "a.ts suppress-any", detail: "1 finding not on the accepted list" }]));
  it("says findings in the plural", () => expect(compareGuardAccepted([finding("suppress-any"), finding("suppress-any")], [])[0]?.detail).toBe("2 findings not on the accepted list"));
  it("finds an accepted finding that is gone", () => expect(compareGuardAccepted([], rows)[0]).toMatchObject({ code: "accepted-gone", key: "a.ts suppress-no-reason" }));
  it("finds a count that changed", () => expect(compareGuardAccepted([finding("suppress-no-reason"), finding("suppress-no-reason")], rows)).toEqual([{ code: "count-changed", key: "a.ts suppress-no-reason", detail: "accepted ×1, found ×2" }]));
  it("finds a code that may not be accepted", () => expect(compareGuardAccepted([finding("suppress-nocheck")], [{ ...rows[0], code: "suppress-nocheck" } as GuardAcceptRow]).map((p) => p.code)).toEqual(["unacceptable-code"]));
  it("does not take a finding in another path for the accepted one", () => expect(compareGuardAccepted([finding("suppress-no-reason", "b.ts")], rows).map((p) => p.code).sort()).toEqual(["accepted-gone", "finding-not-accepted"]));
});

describe("formatting", () => {
  const p = { code: "flags-changed", key: "a.json", detail: "d" } as const;
  it("writes a problem as one line", () => expect(formatGuardProblem(p)).toBe("flags-changed a.json: d"));
  it("writes problems one to a line, and no problems as nothing", () => {
    expect(formatGuardProblems([p, p]).split("\n")).toHaveLength(2);
    expect(formatGuardProblems([])).toBe("");
  });
});
