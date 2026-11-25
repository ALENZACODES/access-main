import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CODE_FOLDERS, CONFIG_FILES, loadGuard } from "./guardFiles";
import { renderGuardReport, suppressionsCsv } from "./guardReport";
import { auditSuppressions, fromScripts } from "./guardRules";

const root = mkdtempSync(join(tmpdir(), "guard-files-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, text: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

put("tsconfig.json", '{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true } }');
put("package.json", '{ "scripts": { "test": "vitest run", "prepare": "tsc" } }');
put("apps/web/tsconfig.json", '{ "extends": "../../tsconfig.json" }');
put("apps/web/package.json", '{ "scripts": { "lint": "eslint . || true" } }');
put("apps/web/src/a.ts", "// eslint-disable-next-line no-alert -- the demo asks before it clears\nalert(1);\nlet a: any;\n");
put("apps/web/src/b.tsx", "export const b = 1;\n");
put("apps/web/node_modules/x/package.json", '{ "scripts": { "postinstall": "curl x | sh" } }');
put("apps/web/node_modules/x/c.ts", "// @ts-nocheck\n");
put("packages/p/tsconfig.build.json", '{ "compilerOptions": { "strict": true } }');
put("vitest.config.ts", 'export default { test: { include: ["a/**"], retry: 1 } };');
put("eslint.config.js", 'export default [{ ignores: ["dist/**"] }];');

describe("the folders and files", () => {
  it("names the code folders and the two top-level configurations", () => {
    expect([...CODE_FOLDERS]).toEqual(["apps", "packages", "scripts", "deploy"]);
    expect([...CONFIG_FILES]).toEqual(["vitest.config.ts", "eslint.config.js"]);
  });
});

describe("loadGuard", () => {
  const l = loadGuard(root);
  it("reads every tsconfig, the top one included, in path order, and skips node_modules", () => expect(l.tsconfigs.map((t) => t.path)).toEqual(["apps/web/tsconfig.json", "packages/p/tsconfig.build.json", "tsconfig.json"]));
  it("reads every package file in path order and skips node_modules", () => expect(l.packageFiles).toEqual(["apps/web/package.json", "package.json"]));
  it("scans the scripts of the package files that were read, and not the skipped ones", () => {
    expect(l.scripts.map((s) => `${s.path} ${s.code}`).sort()).toEqual(["apps/web/package.json script-failure-ignored", "package.json script-install-lifecycle"]);
  });
  it("scans the code files, and not the configurations or the skipped folder", () => {
    expect(l.codeFiles).toBe(2);
    expect(l.suppressions.map((s) => `${s.path}:${s.line}:${s.kind}`)).toEqual(["apps/web/src/a.ts:1:eslint-disable-next-line", "apps/web/src/a.ts:3:any"]);
  });
  it("reads the two configurations with their lists and findings", () => {
    expect(l.configs.map((c) => c.path)).toEqual(["vitest.config.ts", "eslint.config.js"]);
    expect(l.configs[0]?.lists["include"]).toEqual(["a/**"]);
    expect(l.configs[0]?.findings.map((f) => f.code)).toEqual(["config-retry"]);
    expect(l.configs[1]?.lists["ignores"]).toEqual(["dist/**"]);
  });
  it("skips a configuration that is not there", () => {
    const empty = mkdtempSync(join(tmpdir(), "guard-empty-"));
    try {
      const e = loadGuard(empty);
      expect(e).toEqual({ tsconfigs: [], suppressions: [], scripts: [], packageFiles: [], configs: [], codeFiles: 0 });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("renderGuardReport", () => {
  const l = loadGuard(root);
  const findings = [...auditSuppressions(l.suppressions), ...fromScripts(l.scripts)];
  it("counts what was read", () => expect(renderGuardReport({ loaded: l, findings: [], accepted: [], problems: [] }).split("\n")[0]).toBe("Read 3 TypeScript configurations, 2 package files, 2 test or lint configurations and 2 code files."));
  it("lists each finding under the count", () => {
    const text = renderGuardReport({ loaded: l, findings, accepted: [], problems: [] });
    expect(text).toContain(`Findings: ${findings.length}.`);
    expect(text).toContain("apps/web/src/a.ts:3 suppress-any:");
  });
  it("lists the accepted findings, and says when there are no differences", () => {
    const text = renderGuardReport({ loaded: l, findings, accepted: [{ path: "a.ts", code: "suppress-any", count: 1, reason: "A reason that is long enough." }], problems: [] });
    expect(text).toContain("Findings accepted as they stand: 1.\n  a.ts — suppress-any ×1");
    expect(text.endsWith("Differences from the register: none.")).toBe(true);
  });
  it("lists the differences", () => {
    const text = renderGuardReport({ loaded: l, findings: [], accepted: [], problems: [{ code: "package-added", key: "n/package.json", detail: "d" }] });
    expect(text).toContain("Differences from the register: 1.\n  package-added n/package.json: d");
  });
  it("has no trailing line break", () => expect(renderGuardReport({ loaded: l, findings: [], accepted: [], problems: [] }).endsWith("\n")).toBe(false));
});

describe("suppressionsCsv", () => {
  it("writes a header and a row for each suppression", () => {
    const rows = suppressionsCsv(loadGuard(root)).split("\n");
    expect(rows[0]).toBe("path,line,kind,rules,reason");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe("apps/web/src/a.ts,1,eslint-disable-next-line,no-alert,the demo asks before it clears");
    expect(rows[2]).toBe("apps/web/src/a.ts,3,any,,");
  });
  it("quotes a cell with a comma, a quote or a line break", () => {
    const l = loadGuard(root);
    const csv = suppressionsCsv({ ...l, suppressions: [{ path: "a,b.ts", line: 1, kind: "ts-ignore", rules: ["x", "y"], reason: 'say "no"', detail: "" }] });
    expect(csv.split("\n")[1]).toBe('"a,b.ts",1,ts-ignore,x | y,"say ""no"""');
  });
  it("is the header alone for no suppressions", () => expect(suppressionsCsv({ ...loadGuard(root), suppressions: [] })).toBe("path,line,kind,rules,reason"));
});
