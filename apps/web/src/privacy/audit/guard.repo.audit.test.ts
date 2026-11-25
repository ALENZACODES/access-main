// CI audit: the strictness settings of the real tree. The TypeScript flags of every configuration, every suppression
// of a check in the code, the lists that choose which tests run, and the package files are all in guardRegister.ts,
// and the findings that remain are all in its accepted list with a reason. A configuration that loosens a flag, a new
// suppression, a test list that drops a folder or a script that hides a failure fails here. It reads text only: it
// does not run the compiler or the linter.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareFlags, compareGuardAccepted, compareLists, comparePackages, compareSuppressions, formatGuardProblems } from "./guardCompare";
import { loadGuard } from "./guardFiles";
import { GUARD_ACCEPTED, GUARD_REGISTER, validateGuardRegister } from "./guardRegister";
import { renderGuardReport } from "./guardReport";
import { auditSuppressions, auditTsConfigs, fromConfig, fromScripts, sortFindings } from "./guardRules";
import { countSuppressions, scanSuppressions } from "./suppressScan";
import { parseTsConfig } from "./tsModel";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const loaded = loadGuard(ROOT);
const findings = sortFindings([...auditTsConfigs(loaded.tsconfigs), ...auditSuppressions(loaded.suppressions), ...fromScripts(loaded.scripts), ...loaded.configs.flatMap((c) => fromConfig(c.findings))]);

describe("the real tree", () => {
  it("is read, so the audit cannot pass by finding nothing", () => {
    expect(loaded.tsconfigs.length).toBeGreaterThan(10);
    expect(loaded.packageFiles).toContain("apps/web/package.json");
    expect(loaded.codeFiles).toBeGreaterThan(1000);
    expect(loaded.configs.map((c) => c.path)).toEqual(["vitest.config.ts", "eslint.config.js"]);
  });
  it("has a well-formed register", () => expect(validateGuardRegister()).toEqual([]));
  it("has TypeScript flags that match the register", () => expect(formatGuardProblems(compareFlags(loaded.tsconfigs, GUARD_REGISTER))).toBe(""));
  it("has suppressions that match the register", () => expect(formatGuardProblems(compareSuppressions(countSuppressions(loaded.suppressions), GUARD_REGISTER))).toBe(""));
  it("has test and lint lists that match the register", () => expect(formatGuardProblems(compareLists(loaded.configs, GUARD_REGISTER))).toBe(""));
  it("has package files that match the register", () => expect(formatGuardProblems(comparePackages(loaded.packageFiles, GUARD_REGISTER))).toBe(""));
  it("has findings that are exactly the accepted ones", () => expect(formatGuardProblems(compareGuardAccepted(findings, GUARD_ACCEPTED))).toBe(""));
  it("has a report that says no differences", () => {
    const text = renderGuardReport({ loaded, findings, accepted: GUARD_ACCEPTED, problems: [] });
    expect(text).toContain("Differences from the register: none.");
  });
});

describe("the rules of the real tree", () => {
  const codes = (c: string): number => findings.filter((f) => f.code === c).length;
  it("has no file-wide switch-off, no ts-ignore, no ts-nocheck and no blanket directive", () => {
    for (const c of ["suppress-file-wide", "suppress-ignore", "suppress-nocheck", "suppress-blanket"]) expect(codes(c), c).toBe(0);
  });
  it("has no use of the type any that the scan can see", () => expect(codes("suppress-any")).toBe(0));
  it("has no retry, bail, timeout change, pass-with-no-tests or lint rule turned off in the configurations", () => {
    for (const c of ["config-retry", "config-bail", "config-timeout", "config-pass-with-no-tests", "config-allow-only", "config-lint-off", "config-silent", "config-lint-warn"]) expect(codes(c), c).toBe(0);
  });
  it("has no script that hides a failure, retries, skips a hook or pipes into a shell", () => {
    for (const c of ["script-failure-ignored", "script-no-tests-pass", "script-retry", "script-timeout", "script-hook-skipped", "script-force", "script-pipe-to-shell", "script-unreadable"]) expect(codes(c), c).toBe(0);
  });
  it("has strict on in every configuration", () => expect(codes("ts-strict-off") + codes("ts-strict-flag-off") + codes("ts-config-unreadable")).toBe(0));
  it("lets the privacy tests run: they are included and not excluded", () => {
    const v = loaded.configs.find((c) => c.path === "vitest.config.ts");
    expect((v?.lists["include"] ?? []).some((p) => p.includes("apps/web"))).toBe(true);
    expect((v?.lists["exclude"] ?? []).some((p) => p.includes("privacy"))).toBe(false);
  });
});

describe("a change to the real text is found", () => {
  const rule = (text: string, path = "apps/web/src/x.ts"): string[] => auditSuppressions(scanSuppressions([{ path, text }])).map((f) => f.code);
  it("finds a directive added to the text of a real file", () => {
    const real = readFileSync(`${ROOT}apps/web/src/privacy/audit/guardFiles.ts`, "utf8");
    expect(rule(real)).toEqual([]);
    expect(rule(`// @ts-nocheck\n${real}`)).toEqual(["suppress-nocheck"]);
    expect(rule(`${real}\nlet extra: any;\n`)).toEqual(["suppress-any"]);
  });
  it("finds strict switched off in the text of a real configuration", () => {
    const real = readFileSync(`${ROOT}apps/web/tsconfig.json`, "utf8");
    const loose = real.replace(/"strict"\s*:\s*true/, '"strict": false');
    expect(loose).not.toBe(real);
    const codes = auditTsConfigs([parseTsConfig("apps/web/tsconfig.json", loose)]).map((f) => f.code);
    expect(codes).toContain("ts-strict-off");
  });
  it("finds a test folder dropped from the include list", () => {
    const v = loaded.configs.map((c) => (c.path === "vitest.config.ts" ? { ...c, lists: { ...c.lists, include: (c.lists["include"] ?? []).slice(1) } } : c));
    expect(compareLists(v, GUARD_REGISTER).map((p) => p.code)).toEqual(["list-changed"]);
  });
  it("finds a package file that is new", () => expect(comparePackages([...loaded.packageFiles, "zz/package.json"], GUARD_REGISTER).map((p) => p.code)).toEqual(["package-added"]));
  it("finds one more suppression in a file that has some", () => {
    const counts = countSuppressions(loaded.suppressions).map((c, i) => (i === 0 ? { ...c, count: c.count + 1 } : c));
    expect(compareSuppressions(counts, GUARD_REGISTER).map((p) => p.code)).toEqual(["suppress-count-changed"]);
  });
});
