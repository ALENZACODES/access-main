import { describe, expect, it } from "vitest";
import { auditSuppressions, auditTsConfigs, formatGuardFinding, fromConfig, fromScripts, GUARD_CODES, GUARD_POLICY, sortFindings, SUPPRESS_CODES, TS_CODES, type GuardCode } from "./guardRules";
import { scanSuppressions } from "./suppressScan";
import { parseTsConfig } from "./tsModel";

const ts = (files: Record<string, string>) => auditTsConfigs(Object.entries(files).map(([p, t]) => parseTsConfig(p, t)));
const tsCodes = (files: Record<string, string>): GuardCode[] => ts(files).map((f) => f.code);
const sup = (text: string, path = "a.ts") => auditSuppressions(scanSuppressions([{ path, text }]));
const supCodes = (text: string): GuardCode[] => sup(text).map((f) => f.code);
const STRICT = '{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true } }';

describe("the list of codes", () => {
  it("has every code once", () => {
    expect(new Set(GUARD_CODES).size).toBe(GUARD_CODES.length);
    expect(GUARD_CODES).toHaveLength(TS_CODES.length + SUPPRESS_CODES.length + 10 + 8);
  });
});

describe("auditTsConfigs", () => {
  it("finds nothing for strict configurations with the index flag", () => expect(tsCodes({ "a.json": STRICT, "b.json": STRICT })).toEqual([]));
  it("finds strict not true, with the line", () => {
    const f = ts({ "a.json": '{\n "compilerOptions": {\n  "strict": false,\n  "noUncheckedIndexedAccess": true\n }\n}' });
    expect(f).toEqual([{ code: "ts-strict-off", path: "a.json", line: 3, detail: "strict is false" }]);
  });
  it("finds strict not written", () => expect(ts({ "a.json": '{ "compilerOptions": { "noUncheckedIndexedAccess": true } }' })[0]).toMatchObject({ code: "ts-strict-off", line: 0, detail: "strict is not written" }));
  it("finds the index flag not written, or false", () => {
    expect(ts({ "a.json": '{ "compilerOptions": { "strict": true } }' })[0]).toMatchObject({ code: "ts-no-unchecked-index", detail: "noUncheckedIndexedAccess is not written" });
    expect(ts({ "a.json": '{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": false } }' })[0]).toMatchObject({ code: "ts-no-unchecked-index", detail: "noUncheckedIndexedAccess is false" });
  });
  it("finds a flag of the strict family set to false, even when strict is true", () => {
    const f = ts({ "a.json": '{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true, "noImplicitAny": false } }' });
    expect(f.map((x) => [x.code, x.detail])).toEqual([["ts-strict-flag-off", "noImplicitAny is false"]]);
  });
  it.each(["alwaysStrict", "noImplicitAny", "noImplicitThis", "strictNullChecks", "strictFunctionTypes", "strictBindCallApply", "strictPropertyInitialization", "useUnknownInCatchVariables"])("finds %s set to false", (flag) => {
    const f = ts({ "a.json": `{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true, "${flag}": false } }` });
    expect(f.map((x) => x.code)).toEqual(["ts-strict-flag-off"]);
  });
  it("finds a flag of the strict family that is not true or false", () => {
    expect(tsCodes({ "a.json": '{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true, "strictNullChecks": "no" } }' })).toEqual(["ts-flag-unknown"]);
  });
  it("follows extends: a child with no flags of its own is as strict as its parent", () => {
    expect(tsCodes({ "base.json": STRICT, "child.json": '{ "extends": "./base.json" }' })).toEqual([]);
  });
  it("follows extends: a parent that is not strict makes the child not strict", () => {
    expect(tsCodes({ "base.json": '{ "compilerOptions": {} }', "child.json": '{ "extends": "./base.json" }' })).toEqual(["ts-no-unchecked-index", "ts-strict-off", "ts-no-unchecked-index", "ts-strict-off"]);
  });
  it("says unknown, and not off, when the file extended is not among those read", () => {
    const f = ts({ "child.json": '{ "extends": "@tsconfig/strictest" }' });
    expect(f.map((x) => x.code)).toEqual(["ts-flag-unknown", "ts-flag-unknown"]);
    expect(f[0]?.detail).toContain("is unknown");
  });
  it("reports a file that cannot be read once and judges nothing else in it", () => {
    const f = ts({ "a.json": "{ nope" });
    expect(f).toHaveLength(1);
    expect(f[0]?.code).toBe("ts-config-unreadable");
  });
  it("judges each file, with its path", () => {
    const f = ts({ "a.json": STRICT, "b.json": '{ "compilerOptions": { "strict": true } }' });
    expect(f.map((x) => `${x.path} ${x.code}`)).toEqual(["b.json ts-no-unchecked-index"]);
  });
  it("uses a policy that can be changed for a test", () => {
    const c = [parseTsConfig("a.json", '{ "compilerOptions": { "strict": true } }')];
    expect(auditTsConfigs(c, { ...GUARD_POLICY, requiredTrue: ["strict"] })).toEqual([]);
    expect(auditTsConfigs(c, { ...GUARD_POLICY, requiredTrue: ["strict", "exactOptionalPropertyTypes"] }).map((f) => f.code)).toEqual(["ts-no-unchecked-index"]);
  });
});

describe("auditSuppressions", () => {
  it("finds nothing in code with no directive", () => expect(supCodes("const a = 1;\n")).toEqual([]));
  it("accepts a line directive with a rule and a reason", () => expect(supCodes("// eslint-disable-next-line no-control-regex -- control characters are removed on purpose\nx;")).toEqual([]));
  it("finds a line directive with no reason", () => {
    const f = sup("// eslint-disable-next-line no-control-regex\nx;");
    expect(f.map((x) => x.code)).toEqual(["suppress-no-reason"]);
    expect(f[0]?.detail).toBe("eslint-disable-next-line no-control-regex has no reason after --");
  });
  it("finds a reason that is too short", () => {
    expect(supCodes("// eslint-disable-next-line a -- ok\nx;")).toEqual(["suppress-no-reason"]);
    expect(supCodes("// eslint-disable-next-line a -- long enough\nx;")).toEqual([]);
  });
  it("finds a directive with no rule as blanket, and with no reason", () => expect(supCodes("// eslint-disable-line\nx;")).toEqual(["suppress-blanket", "suppress-no-reason"]));
  it("finds a whole-file disable, with its rules", () => {
    const f = sup("/* eslint-disable no-console -- the demo logs on purpose */\nx;");
    expect(f.map((x) => x.code)).toEqual(["suppress-file-wide"]);
    expect(f[0]?.detail).toContain("no-console");
  });
  it("finds a whole-file disable with no rule as every problem it is", () => expect(supCodes("/* eslint-disable */\nx;").sort()).toEqual(["suppress-blanket", "suppress-file-wide", "suppress-no-reason"]));
  it("finds ts-nocheck", () => expect(supCodes("// @ts-nocheck\nx;")).toEqual(["suppress-nocheck"]));
  it("finds ts-ignore, with or without a reason", () => {
    expect(supCodes("// @ts-ignore\nx;")).toEqual(["suppress-ignore"]);
    expect(supCodes("// @ts-ignore a long reason\nx;")).toEqual(["suppress-ignore"]);
  });
  it("accepts ts-expect-error with a reason, and finds one without", () => {
    expect(supCodes("// @ts-expect-error: the overload is typed wrongly\nx;")).toEqual([]);
    expect(supCodes("// @ts-expect-error\nx;")).toEqual(["suppress-no-reason"]);
    expect(supCodes("// @ts-expect-error: hush\nx;")).toEqual(["suppress-no-reason"]);
  });
  it("finds each use of any", () => {
    const f = sup("let a: any;\nlet b = c as any;");
    expect(f.map((x) => [x.code, x.line])).toEqual([["suppress-any", 1], ["suppress-any", 2]]);
  });
  it("gives the findings in path and line order", () => {
    const f = auditSuppressions(scanSuppressions([{ path: "b.ts", text: "// @ts-ignore\n" }, { path: "a.ts", text: "x;\nlet a: any;\n// @ts-nocheck\n" }]));
    expect(f.map((x) => `${x.path}:${x.line}`)).toEqual(["a.ts:2", "a.ts:3", "b.ts:1"]);
  });
  it("uses a policy that can be changed for a test", () => {
    const found = scanSuppressions([{ path: "a.ts", text: "// eslint-disable-next-line a -- ok\nx;" }]);
    expect(auditSuppressions(found, { ...GUARD_POLICY, minReason: 2 })).toEqual([]);
  });
});

describe("fromScripts, fromConfig and sortFindings", () => {
  it("turns script findings into findings with no line, with the script in the detail", () => {
    const f = fromScripts([{ code: "script-retry", path: "package.json", script: "test", detail: "a retry flag" }]);
    expect(f).toEqual([{ code: "script-retry", path: "package.json", line: 0, detail: "test: a retry flag" }]);
  });
  it("keeps the detail alone for a problem with the whole file", () => expect(fromScripts([{ code: "script-unreadable", path: "p.json", script: "", detail: "not JSON" }])[0]?.detail).toBe("not JSON"));
  it("turns config findings into findings with their line", () => expect(fromConfig([{ code: "config-retry", path: "c.ts", line: 4, detail: "retry is set to 2" }])).toEqual([{ code: "config-retry", path: "c.ts", line: 4, detail: "retry is set to 2" }]));
  it("sorts by path, then line, then code, then detail", () => {
    const f = sortFindings([
      { code: "suppress-any", path: "b.ts", line: 1, detail: "x" },
      { code: "suppress-any", path: "a.ts", line: 9, detail: "x" },
      { code: "suppress-ignore", path: "a.ts", line: 2, detail: "x" },
      { code: "suppress-any", path: "a.ts", line: 2, detail: "y" },
      { code: "suppress-any", path: "a.ts", line: 2, detail: "x" },
    ]);
    expect(f.map((x) => `${x.path}:${x.line}:${x.code}:${x.detail}`)).toEqual(["a.ts:2:suppress-any:x", "a.ts:2:suppress-any:y", "a.ts:2:suppress-ignore:x", "a.ts:9:suppress-any:x", "b.ts:1:suppress-any:x"]);
  });
  it("does not change the list it is given", () => {
    const input = [{ code: "suppress-any" as const, path: "b.ts", line: 1, detail: "x" }, { code: "suppress-any" as const, path: "a.ts", line: 1, detail: "x" }];
    sortFindings(input);
    expect(input[0]?.path).toBe("b.ts");
  });
});

describe("formatGuardFinding", () => {
  it("writes the line after the path when there is one", () => expect(formatGuardFinding({ code: "suppress-any", path: "a.ts", line: 3, detail: "d" })).toBe("a.ts:3 suppress-any: d"));
  it("leaves the line out when there is none", () => expect(formatGuardFinding({ code: "script-retry", path: "package.json", line: 0, detail: "d" })).toBe("package.json script-retry: d"));
});
