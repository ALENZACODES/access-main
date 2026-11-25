import { describe, expect, it } from "vitest";
import type { SaveRow } from "../panel/saveRegister";
import { compareSave, formatSaveComparison, isCleanSave, isSaveSource, kindOfFormats, namedFormats, saveTotalsByKind, scanSave, withoutComments } from "./saveScan";

const at = (path: string, text: string) => ({ path, text });
const P = "apps/web/src/a/Make.ts";
const MAKE = "const url = URL.createObjectURL(new Blob([x]));";

const row = (over: Partial<SaveRow> = {}): SaveRow => ({
  kind: "none",
  path: P,
  uses: 1,
  makes: { en: "A file", fr: "Un fichier" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

describe("scanSave: finding the places", () => {
  it("finds a call and its line", () => {
    expect(scanSave([at(P, `import x from "y";\n${MAKE}\n`)])).toEqual([{ path: P, lines: [2], kind: "none" }]);
  });

  it("finds each of several calls in a file, in the order they are written", () => {
    const found = scanSave([at(P, `${MAKE}\nconst a = 1;\n${MAKE}\n\n${MAKE}`)]);
    expect(found[0]?.lines).toEqual([1, 3, 5]);
  });

  it("finds a call with a view or a window in front of it, and with space before the bracket", () => {
    expect(scanSave([at(P, "view.URL.createObjectURL(b)")])[0]?.lines).toEqual([1]);
    expect(scanSave([at(P, "window.URL.createObjectURL (b)")])[0]?.lines).toEqual([1]);
    expect(scanSave([at(P, "URL.createObjectURL\n(b)")])[0]?.lines).toEqual([1]);
  });

  it("finds a call inside a template string a plain page builds", () => {
    expect(scanSave([at(P, "const code = `x ${URL.createObjectURL(b)}`;")])[0]?.lines).toEqual([1]);
  });

  it("does not find a line that is only a comment", () => {
    for (const c of ["// URL.createObjectURL(b)", "  * URL.createObjectURL(b)", "/* URL.createObjectURL(b) */", "\t// call URL.createObjectURL(b) here"]) expect(scanSave([at(P, c)]), c).toEqual([]);
  });

  it("does not find a name that is only looked at, or revoked", () => {
    for (const c of ["typeof URL.createObjectURL === 'function'", "URL.revokeObjectURL(u)", "const f = URL.createObjectURL;", "createObjectURL(b)", "MyURL.createObjectURLs(b)"]) expect(scanSave([at(P, c)]), c).toEqual([]);
  });

  it("finds nothing in a test file, a type file, the privacy audit or code under narrow", () => {
    for (const path of ["apps/web/src/a/Make.test.ts", "apps/web/src/a/types.d.ts", "apps/web/src/privacy/audit/x.ts", "apps/web/src/narrow/x.ts", "apps/web/e2e/x.ts"]) expect(scanSave([at(path, MAKE)]), path).toEqual([]);
  });

  it("gives files in the order of their paths, whatever the order they were given", () => {
    const files = [at("packages/z/src/a.ts", MAKE), at("apps/web/src/b.ts", MAKE), at("apps/web/src/a.ts", MAKE)];
    expect(scanSave(files).map((f) => f.path)).toEqual(["apps/web/src/a.ts", "apps/web/src/b.ts", "packages/z/src/a.ts"]);
    expect(scanSave([...files].reverse())).toEqual(scanSave(files));
  });

  it("does not change the files it is given", () => {
    const files = [at(P, MAKE), at("apps/web/src/b.ts", MAKE)];
    const copy = JSON.parse(JSON.stringify(files));
    scanSave(files);
    expect(files).toEqual(copy);
  });

  it("is not thrown off by a global pattern kept between calls", () => {
    const files = [at(P, MAKE)];
    expect(scanSave(files)).toEqual(scanSave(files));
  });

  it("copes with empty text and with windows line ends", () => {
    expect(scanSave([at(P, "")])).toEqual([]);
    expect(scanSave([at(P, `a\r\n${MAKE}\r\n`)])[0]?.lines).toEqual([2]);
  });
});

describe("namedFormats and kindOfFormats", () => {
  it("reads the formats a file names in its code", () => {
    expect(namedFormats('{ type: "application/json" }')).toEqual({ json: true, text: false, csv: false });
    expect(namedFormats("type: 'text/plain;charset=utf-8'")).toEqual({ json: false, text: true, csv: false });
    expect(namedFormats("type: 'text/csv;charset=utf-8'")).toEqual({ json: false, text: false, csv: true });
  });

  it("counts the txt extension as plain text", () => {
    expect(namedFormats('format === "txt"').text).toBe(true);
    expect(namedFormats("`report.txt`").text).toBe(true);
    expect(namedFormats("name.txt").text).toBe(true);
    expect(namedFormats("const context = 1;").text).toBe(false);
    expect(namedFormats("['json', 'txt']").text).toBe(true);
  });

  it("does not count a format named only in a comment", () => {
    expect(namedFormats("// application/json\n/* text/csv */\n * text/plain")).toEqual({ json: false, text: false, csv: false });
    expect(withoutComments("a\n// b\nc\n * d\n/* e */\nf")).toBe("a\nc\nf");
  });

  it("picks one kind for what is named", () => {
    const k = (json: boolean, text: boolean, csv: boolean): string => kindOfFormats({ json, text, csv });
    expect([k(true, false, false), k(false, true, false), k(false, false, true), k(true, true, false), k(false, false, false)]).toEqual(["json", "text", "csv", "json-and-text", "none"]);
    expect([k(true, false, true), k(false, true, true), k(true, true, true)]).toEqual(["mixed", "mixed", "mixed"]);
  });

  it("puts the kind on each file found", () => {
    const text = `${MAKE}\nconst a = { type: "application/json" };\nconst b = "text/plain";`;
    expect(scanSave([at(P, text)])[0]?.kind).toBe("json-and-text");
  });
});

describe("compareSave", () => {
  const found = scanSave([at(P, MAKE)]);

  it("is clean when the rows match the source", () => {
    const c = compareSave(found, [row()]);
    expect(isCleanSave(c)).toBe(true);
    expect(formatSaveComparison(c)).toBe("");
  });

  it("reports a file that makes a download and has no row", () => {
    const c = compareSave(found, []);
    expect(c.unlisted).toEqual(found);
    expect(formatSaveComparison(c)).toBe(`${P}:1: 1 place found that makes a file, and no row lists it`);
  });

  it("reports a row whose file makes no download", () => {
    const c = compareSave([], [row()]);
    expect(c.gone).toEqual([{ path: P }]);
    expect(formatSaveComparison(c)).toBe(`${P}: the row finds nothing in the file`);
  });

  it("reports a different number of places", () => {
    const c = compareSave(found, [row({ uses: 3 })]);
    expect(c.wrongCount).toEqual([{ path: P, listed: 3, found: 1 }]);
    expect(formatSaveComparison(c)).toBe(`${P}: the row says 3 places but 1 found`);
  });

  it("reports a different format", () => {
    const c = compareSave(found, [row({ kind: "json" })]);
    expect(c.wrongKind).toEqual([{ path: P, listed: "json", found: "none" }]);
    expect(formatSaveComparison(c)).toBe(`${P}: the row says json but the file names none`);
  });

  it("reports every difference, one line each, and is not clean", () => {
    const two = scanSave([at(P, `${MAKE}\n${MAKE}`), at("apps/web/src/b.ts", MAKE)]);
    const c = compareSave(two, [row({ kind: "text" }), row({ path: "apps/web/src/gone.ts" })]);
    expect(isCleanSave(c)).toBe(false);
    expect(formatSaveComparison(c).split("\n")).toHaveLength(4);
  });

  it("does not change what it is given", () => {
    const rows = [row()];
    const copy = JSON.parse(JSON.stringify({ found, rows }));
    compareSave(found, rows);
    expect({ found, rows }).toEqual(copy);
  });
});

describe("saveTotalsByKind and isSaveSource", () => {
  it("counts places and files for each kind in the order given, leaving out kinds with no file", () => {
    const f = scanSave([at("apps/web/src/a.ts", `${MAKE}\n${MAKE}\n"application/json"`), at("apps/web/src/b.ts", `${MAKE}\n"application/json"`), at("apps/web/src/c.ts", MAKE)]);
    expect(saveTotalsByKind(f, ["none", "json", "csv"])).toEqual([
      { kind: "none", places: 1, files: 1 },
      { kind: "json", places: 3, files: 2 },
    ]);
  });

  it("agrees with the other scans about which files are read", () => {
    expect(isSaveSource("apps/web/src/a.ts")).toBe(true);
    expect(isSaveSource("apps/web/src/a.test.ts")).toBe(false);
    expect(isSaveSource("packages/x/src/a.ts")).toBe(true);
  });
});
