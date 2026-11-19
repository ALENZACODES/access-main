import { describe, expect, it } from "vitest";
import type { RegisterRow } from "../panel/storageRegister";
import { checkRegister, compareToRegister, formatComparison, isScannedSource, panelCoverage, scanStorageKeys } from "./storageKeys";
import type { SourceFile } from "./repoAudit";

const f = (path: string, text: string): SourceFile => ({ path, text });
const row = (key: string, path = "apps/web/src/a.ts"): RegisterRow => ({ key, path, holds: { en: "x", fr: "x" }, gated: false, source: "s", recordedOn: "2026-11-19" });

describe("which files are scanned", () => {
  it("skips tests, test helpers, type shims, the audit folder, narrow samples and e2e", () => {
    expect(isScannedSource("apps/web/src/a.ts")).toBe(true);
    expect(isScannedSource("apps/web/src/hub/Page.tsx")).toBe(true);
    expect(isScannedSource("apps/web/src/privacy/panel/live.ts")).toBe(true);
    for (const p of ["apps/web/src/a.test.ts", "apps/web/src/x.d.ts", "apps/web/src/privacy/panel/x.test-util.ts", "apps/web/src/privacy/audit/x.ts", "apps/web/src/narrow/s.ts", "apps/web/e2e/a.ts", "README.md"]) {
      expect(isScannedSource(p), p).toBe(false);
    }
  });
});

describe("scanStorageKeys", () => {
  it("finds a key constant and a literal passed to setItem", () => {
    const found = scanStorageKeys([
      f("apps/web/src/a.ts", `export const PREFS_KEY = "app.prefs.v1";\n`),
      f("apps/web/src/b.ts", `store.setItem("app.other.v1", "x");\nstore.getItem('app.third');`),
    ]);
    expect(found.map((x) => [x.key, x.via, x.path, x.line])).toEqual([
      ["app.other.v1", "call", "apps/web/src/b.ts", 1],
      ["app.prefs.v1", "constant", "apps/web/src/a.ts", 1],
      ["app.third", "call", "apps/web/src/b.ts", 2],
    ]);
  });
  it("accepts single quotes, a type annotation and the Key suffix", () => {
    const found = scanStorageKeys([f("apps/web/src/a.ts", `const savedKey: string = 'data-status:x:v1';\nconst LIST_KEY = "__list";`)]);
    expect(found.map((x) => x.key)).toEqual(["__list", "data-status:x:v1"]);
  });
  it("ignores constants that are not keys, and names without a key-like value", () => {
    const found = scanStorageKeys([f("apps/web/src/a.ts", `const TITLE = "app.title";\nconst CACHE_KEY = "plain";\nconst X_KEY = "ab";`)]);
    expect(found).toEqual([]);
  });
  it("resolves a key written as a prefix constant plus a name, in the same file", () => {
    const found = scanStorageKeys([f("apps/web/src/a.ts", "const PREFIX = \"access.\";\nexport const ROUTES_KEY = `${PREFIX}routes.v1`;\nconst OTHER = `${PREFIX}x`;\nconst MISSING_KEY = `${NOPE}y`;")]);
    expect(found.map((x) => x.key)).toEqual(["access.routes.v1"]);
  });
  it("ignores comments", () => {
    const found = scanStorageKeys([f("apps/web/src/a.ts", `// store.setItem("app.a.v1", x)\n * const A_KEY = "app.b.v1";\n/* store.getItem("app.c.v1") */`)]);
    expect(found).toEqual([]);
  });
  it("lists every file that names a key, once, and keeps the first mention", () => {
    const found = scanStorageKeys([
      f("apps/web/src/z.ts", `x.getItem("access.language");`),
      f("apps/web/src/i18n.ts", `const LANGUAGE_STORAGE_KEY = "access.language";\nlocalStorage.setItem("access.language", v);`),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: "access.language", path: "apps/web/src/i18n.ts", line: 1, via: "constant", paths: ["apps/web/src/i18n.ts", "apps/web/src/z.ts"] });
  });
  it("skips files that are not scanned", () => {
    expect(scanStorageKeys([f("apps/web/src/a.test.ts", `s.setItem("app.t.v1", "1")`), f("apps/web/src/privacy/audit/p.ts", `s.setItem("app.p.v1", "1")`)])).toEqual([]);
  });
  it("is the same whatever order the files come in", () => {
    const a = f("apps/web/src/a.ts", `s.setItem("app.a.v1","1")`);
    const b = f("apps/web/src/b.ts", `s.setItem("app.b.v1","1")`);
    expect(scanStorageKeys([a, b])).toEqual(scanStorageKeys([b, a]));
  });
  it("does not find keys built at run time", () => {
    expect(scanStorageKeys([f("apps/web/src/a.ts", "s.setItem(`app.${id}`, v); s.setItem(prefix + id, v);")])).toEqual([]);
  });
});

describe("compareToRegister", () => {
  const found = scanStorageKeys([f("apps/web/src/a.ts", `s.setItem("app.a.v1","1"); s.setItem("app.b.v1","1");`)]);
  it("is clean when the register matches", () => {
    expect(compareToRegister(found, [row("app.a.v1"), row("app.b.v1")])).toEqual({ unregistered: [], stale: [], moved: [] });
  });
  it("reports a key that has no row, a row with no key, and a key that moved", () => {
    const c = compareToRegister(found, [row("app.a.v1", "apps/web/src/elsewhere.ts"), row("app.gone.v1")]);
    expect(c.unregistered.map((x) => x.key)).toEqual(["app.b.v1"]);
    expect(c.stale.map((x) => x.key)).toEqual(["app.gone.v1"]);
    expect(c.moved).toEqual([{ key: "app.a.v1", registered: "apps/web/src/elsewhere.ts", found: ["apps/web/src/a.ts"] }]);
    expect(formatComparison(c)).toContain("NEW  app.b.v1");
    expect(formatComparison(c)).toContain("GONE app.gone.v1");
    expect(formatComparison(c)).toContain("MOVE app.a.v1");
  });
  it("formats nothing when there is nothing to say", () => {
    expect(formatComparison({ unregistered: [], stale: [], moved: [] })).toBe("");
  });
});

describe("checkRegister", () => {
  it("accepts a good register", () => {
    expect(checkRegister([row("app.a.v1"), row("access.b")])).toEqual([]);
  });
  it("names each problem", () => {
    const bad = [row("app.a.v1"), row("app.a.v1"), { ...row("has space"), recordedOn: "yesterday" }, { ...row("app.c"), holds: { en: " ", fr: "y" }, source: "", path: "" }];
    const problems = checkRegister(bad);
    expect(problems).toContain("app.a.v1: listed twice");
    expect(problems).toContain("has space: not a plain key name");
    expect(problems).toContain("has space: recordedOn is not YYYY-MM-DD");
    expect(problems).toContain("app.c: holds is empty in one language");
    expect(problems).toContain("app.c: source is empty");
    expect(problems).toContain("app.c: path is empty");
  });
});

describe("panelCoverage", () => {
  it("separates keys the panel reaches from those outside its prefix", () => {
    const c = panelCoverage([row("access.a"), row("app.b"), row("access.c"), row("data-status:d")], "access.");
    expect(c.covered.map((r) => r.key)).toEqual(["access.a", "access.c"]);
    expect(c.outside.map((r) => r.key)).toEqual(["app.b", "data-status:d"]);
  });
});
