import { describe, expect, it } from "vitest";
import type { BrowserRow } from "../panel/browserRegister";
import { browserTotalsByKind, compareBrowser, formatBrowserComparison, isCleanBrowser, scanBrowser } from "./browserScan";

const at = (text: string, path = "apps/web/src/pages/x.tsx") => scanBrowser([{ path, text }]);
const kinds = (text: string) => at(text).map((f) => f.kind);
const row = (over: Partial<BrowserRow> = {}): BrowserRow => ({
  kind: "language",
  path: "apps/web/src/pages/x.tsx",
  uses: 1,
  asks: { en: "a b c d", fr: "e f g h" },
  usedFor: { en: "a b c d", fr: "e f g h" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

describe("scanBrowser: what it finds", () => {
  const WRITTEN: ReadonlyArray<[string, string]> = [
    ["const l = navigator.language;", "language"],
    ["const l = window.navigator.language.toLowerCase();", "language"],
    ["const l = navigator.languages[0];", "language"],
    ["const l = nav.language;", "language"],
    ["const on = navigator.onLine;", "online"],
    ["const on = nav.onLine;", "online"],
    ['const q = window.matchMedia("(prefers-contrast: more)");', "preference"],
    ['return media.matchMedia("(prefers-reduced-motion: reduce)").matches;', "preference"],
    ["const s = navigator.storage;", "storage-size"],
    ["const e = await storage.estimate();", "storage-size"],
    ["const p = await storage.persisted();", "storage-size"],
    ["const id = crypto.randomUUID();", "identifier"],
    ["const id = globalThis.crypto.randomUUID();", "identifier"],
    ["crypto.getRandomValues(bytes);", "identifier"],
    ["const t = count.toLocaleString();", "own-language"],
    ["const t = d.toLocaleDateString();", "own-language"],
    ["const t = d.toLocaleTimeString( );", "own-language"],
  ];
  for (const [text, kind] of WRITTEN) {
    it(`finds ${kind} in: ${text}`, () => {
      expect(at(text)).toEqual([{ kind, path: "apps/web/src/pages/x.tsx", lines: [1] }]);
    });
  }

  it("finds a question written inside the strings plain TypeScript pages build", () => {
    expect(kinds("const html = `<p>${navigator.language}</p>`;")).toEqual(["language"]);
  });

  it("gives the lines of each place, in order, one entry for a file and kind", () => {
    const text = "a();\nconst a = nav.onLine;\nb();\nconst b = navigator.onLine;\nconst l = navigator.language;";
    expect(at(text)).toEqual([
      { kind: "language", path: "apps/web/src/pages/x.tsx", lines: [5] },
      { kind: "online", path: "apps/web/src/pages/x.tsx", lines: [2, 4] },
    ]);
  });

  it("counts two places on one line as two", () => {
    expect(at("const a = navigator.onLine && nav.onLine;")[0]?.lines).toEqual([1, 1]);
  });

  it("counts both words of a guarded call, as the code does", () => {
    expect(at('return typeof crypto.randomUUID === "function"\n  ? crypto.randomUUID()\n  : "x";')[0]?.lines).toEqual([1, 2]);
  });

  it("gives a kind for each catalogue entry in a file that asks several things", () => {
    expect(kinds("navigator.language; navigator.onLine; matchMedia('(a)'); navigator.storage; crypto.randomUUID(); n.toLocaleString();")).toEqual(["language", "online", "preference", "storage-size", "identifier", "own-language"]);
  });
});

describe("scanBrowser: what it does not find", () => {
  const NOT = [
    "const l = lang;",
    "const l = navigator.languageTag;",
    "const l = mynavigator.language;",
    "const on = navigator.onLineStatus;",
    "const m = prefersmatchMedia(x);",
    "const m = window.matchMediaQuery;",
    "const s = navigator.storageEstimate;",
    "const e = storage.estimates();",
    "const p = storage.persist();",
    "const id = crypto.randomBytes(8);",
    "const id = mycrypto.randomUUID();",
    "const t = count.toLocaleString('fr-CA');",
    "const t = d.toLocaleDateString(language);",
    "const t = s.toLocaleLowerCase();",
    "const t = s.toLocaleUpperCase();",
    "// navigator.language",
    "  * navigator.onLine",
    "/* crypto.randomUUID() */",
  ];
  for (const text of NOT) {
    it(`finds nothing in: ${text}`, () => {
      expect(at(text)).toEqual([]);
    });
  }

  it("skips tests, type files, the audit folder, narrow/ and e2e/", () => {
    for (const path of ["apps/web/src/a/x.test.tsx", "apps/web/src/a/x.d.ts", "apps/web/src/privacy/audit/x.ts", "apps/web/src/narrow/x.ts", "apps/web/src/e2e/x.ts"]) {
      expect(at("navigator.language;", path), path).toEqual([]);
    }
  });

  it("scans a file in any other folder, and a package file", () => {
    expect(at("navigator.language;", "apps/web/src/zones/x.ts")).toHaveLength(1);
    expect(at("navigator.language;", "packages/consent/src/main.tsx")).toHaveLength(1);
  });

  it("does not find a question the code makes through another name for the browser", () => {
    expect(at("const n = window; n.navigator['language'];")).toEqual([]);
    expect(at("const { language } = navigator;")).toEqual([]);
  });
});

describe("scanBrowser: order", () => {
  it("sorts by path, then by the order of the catalogue", () => {
    const text = "crypto.randomUUID();\nnavigator.language;";
    const out = scanBrowser([
      { path: "apps/web/src/b/B.ts", text },
      { path: "apps/web/src/a/A.ts", text },
    ]);
    expect(out.map((f) => `${f.path.split("/").pop()} ${f.kind}`)).toEqual(["A.ts language", "A.ts identifier", "B.ts language", "B.ts identifier"]);
  });

  it("does not depend on the order the files are given", () => {
    const a = { path: "apps/web/src/a.ts", text: "navigator.language;" };
    const b = { path: "apps/web/src/b.ts", text: "navigator.onLine;" };
    expect(scanBrowser([a, b])).toEqual(scanBrowser([b, a]));
  });
});

describe("compareBrowser", () => {
  const found = [{ kind: "language" as const, path: "apps/web/src/pages/x.tsx", lines: [3] }];

  it("is clean when the rows and the scan agree", () => {
    const c = compareBrowser(found, [row()]);
    expect(isCleanBrowser(c)).toBe(true);
    expect(formatBrowserComparison(c)).toBe("");
  });

  it("reports a place no row lists, with its first line", () => {
    const c = compareBrowser(found, []);
    expect(c.unlisted).toEqual(found);
    expect(formatBrowserComparison(c)).toBe("apps/web/src/pages/x.tsx:3: 1 language place found and no row lists them");
  });

  it("says places when there are several", () => {
    expect(formatBrowserComparison(compareBrowser([{ kind: "online", path: "apps/web/src/p.ts", lines: [1, 9] }], []))).toContain("2 online places found");
  });

  it("reports a row that finds nothing", () => {
    const c = compareBrowser([], [row()]);
    expect(c.gone).toEqual([{ kind: "language", path: "apps/web/src/pages/x.tsx" }]);
    expect(formatBrowserComparison(c)).toBe("apps/web/src/pages/x.tsx: the language row finds nothing in the file");
  });

  it("reports a count that differs", () => {
    const c = compareBrowser(found, [row({ uses: 2 })]);
    expect(c.wrongCount).toEqual([{ kind: "language", path: "apps/web/src/pages/x.tsx", listed: 2, found: 1 }]);
    expect(formatBrowserComparison(c)).toBe("apps/web/src/pages/x.tsx: the language row says 2 places but 1 found");
  });

  it("keeps two kinds in one file apart", () => {
    const both = [...found, { kind: "online" as const, path: "apps/web/src/pages/x.tsx", lines: [8] }];
    expect(isCleanBrowser(compareBrowser(both, [row(), row({ kind: "online" })]))).toBe(true);
    expect(compareBrowser(both, [row()]).unlisted.map((u) => u.kind)).toEqual(["online"]);
  });

  it("is not fooled by a path that contains another path", () => {
    const c = compareBrowser([{ kind: "language", path: "apps/web/src/a.ts", lines: [1] }], [row({ path: "apps/web/src/a.tsx" })]);
    expect(c.unlisted).toHaveLength(1);
    expect(c.gone).toHaveLength(1);
  });

  it("lists every kind of difference together", () => {
    const c = compareBrowser([...found, { kind: "language", path: "apps/web/src/new.ts", lines: [1] }], [row({ uses: 4 }), row({ path: "apps/web/src/gone.ts" })]);
    expect(formatBrowserComparison(c).split("\n")).toHaveLength(3);
  });
});

describe("browserTotalsByKind", () => {
  it("gives places and files for each kind that has any, in the order of the kinds", () => {
    expect(
      browserTotalsByKind([
        { kind: "identifier", path: "a", lines: [1] },
        { kind: "language", path: "b", lines: [1, 2] },
        { kind: "language", path: "c", lines: [4] },
      ]),
    ).toEqual([
      { kind: "language", places: 3, files: 2 },
      { kind: "identifier", places: 1, files: 1 },
    ]);
  });

  it("is empty when nothing was found", () => {
    expect(browserTotalsByKind([])).toEqual([]);
  });
});
