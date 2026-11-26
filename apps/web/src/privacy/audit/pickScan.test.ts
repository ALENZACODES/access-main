import { describe, expect, it } from "vitest";
import type { PickRow } from "../panel/pickRegister";
import { comparePicks, formatPickComparison, isCleanPick, pickTotalsByKind, readLines, scanPicks, sizeCheckLines } from "./pickScan";

const at = (text: string, path = "apps/web/src/pages/x.tsx") => scanPicks([{ path, text }]);
const row = (over: Partial<PickRow> = {}): PickRow => ({
  kind: "pick",
  path: "apps/web/src/pages/x.tsx",
  uses: 1,
  reads: { en: "a b", fr: "a b" },
  accepts: ["json"],
  limit: "before-read",
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

describe("scanPicks: ways to take a chosen file in", () => {
  const WRITTEN = [
    "const f = input.files?.[0];",
    "const f = input.files[0];",
    "const f = event.currentTarget.files?.[0];",
    "const f = event.target.files?.item(0);",
    "const f = el.files.item(0);",
    "const list = Array.from(event.target.files ?? []);",
    "const list = [...(input.files ?? [])];",
    "const f = this.input.files ?.[ 0 ];",
  ];
  for (const text of WRITTEN) {
    it(`finds a pick in: ${text}`, () => {
      expect(at(text)).toEqual([{ kind: "pick", path: "apps/web/src/pages/x.tsx", lines: [1] }]);
    });
  }

  it("finds a file reader", () => {
    expect(at("const r = new FileReader();")).toEqual([{ kind: "reader", path: "apps/web/src/pages/x.tsx", lines: [1] }]);
    expect(at("const r = new  FileReader ( );").map((f) => f.kind)).toEqual(["reader"]);
  });

  it("finds picks written inside the strings plain TypeScript pages build", () => {
    expect(at('const html = `<input type="file">`; const f = box.files?.[0];')).toHaveLength(1);
  });

  it("gives the lines of each place, in order, and one entry per file and kind", () => {
    const text = "a();\nconst a = i.files?.[0];\nb();\nconst b = j.files?.[0];\nconst r = new FileReader();";
    expect(at(text)).toEqual([
      { kind: "pick", path: "apps/web/src/pages/x.tsx", lines: [2, 4] },
      { kind: "reader", path: "apps/web/src/pages/x.tsx", lines: [5] },
    ]);
  });

  it("counts two places on one line as two", () => {
    expect(at("const a = i.files?.[0], b = j.files?.[1];")[0]?.lines).toEqual([1, 1]);
  });
});

describe("scanPicks: what is not a pick", () => {
  const NOT = [
    "const files = [];",
    "files.push(x);",
    "const n = input.files.length;",
    "const t = input.files;",
    "const x = value.profiles?.[0];",
    "const reader = makeFileReader();",
    "const FileReaderLike = 1;",
    "type T = FileReader;",
    "// input.files?.[0]",
    "  * input.files?.[0]",
    "/* new FileReader() */",
  ];
  for (const text of NOT) {
    it(`finds nothing in: ${text}`, () => {
      expect(at(text)).toEqual([]);
    });
  }

  it("skips tests, type files, the audit folder, narrow/ and e2e/", () => {
    for (const path of ["apps/web/src/a/x.test.tsx", "apps/web/src/a/x.d.ts", "apps/web/src/privacy/audit/x.ts", "apps/web/src/narrow/x.ts", "apps/web/src/e2e/x.ts"]) {
      expect(at("const f = i.files?.[0];", path), path).toEqual([]);
    }
  });

  it("scans a file in any other folder", () => {
    expect(at("const f = i.files?.[0];", "apps/web/src/zones/x.ts")).toHaveLength(1);
  });
});

describe("scanPicks: order", () => {
  it("sorts by path, and gives the pick before the reader in a file", () => {
    const text = "const r = new FileReader();\nconst f = i.files?.[0];";
    const out = scanPicks([
      { path: "apps/web/src/b/B.ts", text },
      { path: "apps/web/src/a/A.ts", text },
    ]);
    expect(out.map((f) => `${f.path.split("/").pop()} ${f.kind}`)).toEqual(["A.ts pick", "A.ts reader", "B.ts pick", "B.ts reader"]);
  });

  it("does not depend on the order the files are given", () => {
    const a = { path: "apps/web/src/a.ts", text: "i.files?.[0]" };
    const b = { path: "apps/web/src/b.ts", text: "j.files?.[0]" };
    expect(scanPicks([a, b])).toEqual(scanPicks([b, a]));
  });
});

describe("sizeCheckLines", () => {
  it("finds a comparison of the size of a file with a limit", () => {
    expect(sizeCheckLines("if (file.size > MAX) return;")).toEqual([1]);
    expect(sizeCheckLines("a;\nif (chosen.size > 5 * 1024) return;\nif (selected.size > L) {}")).toEqual([2, 3]);
    expect(sizeCheckLines("if (f.size>MAX) return;")).toEqual([1]);
  });

  it("does not find other uses of size", () => {
    for (const text of ["const n = file.size;", "if (set.size > 3) {}", "if (file.size < 3) {}", "// if (file.size > MAX)", "if (file.sizes > MAX) {}"]) expect(sizeCheckLines(text), text).toEqual([]);
  });
});

describe("readLines", () => {
  it("finds the calls that read the content of a file", () => {
    expect(readLines("const t = await file.text();")).toEqual([1]);
    expect(readLines("x;\nconst b = await file.arrayBuffer();")).toEqual([2]);
    expect(readLines("r.readAsText(f);\nr.readAsDataURL(f);\nr.readAsArrayBuffer(f);\nr.readAsBinaryString(f);")).toEqual([1, 2, 3, 4]);
  });

  it("does not find other calls, or a comment", () => {
    for (const text of ["const t = file.name;", "textarea.text;", "// file.text()", "file.textContent()"]) expect(readLines(text), text).toEqual([]);
  });
});

describe("comparePicks", () => {
  const found = [{ kind: "pick" as const, path: "apps/web/src/pages/x.tsx", lines: [3] }];

  it("is clean when the rows and the scan agree", () => {
    const c = comparePicks(found, [row()]);
    expect(isCleanPick(c)).toBe(true);
    expect(formatPickComparison(c)).toBe("");
  });

  it("reports a place no row lists, with its first line", () => {
    const c = comparePicks(found, []);
    expect(c.unlisted).toEqual(found);
    expect(formatPickComparison(c)).toBe("apps/web/src/pages/x.tsx:3: 1 pick place found and no row lists them");
  });

  it("says places when there are several", () => {
    const c = comparePicks([{ kind: "pick", path: "apps/web/src/p.ts", lines: [1, 9] }], []);
    expect(formatPickComparison(c)).toContain("2 pick places found");
  });

  it("reports a row that finds nothing", () => {
    const c = comparePicks([], [row()]);
    expect(c.gone).toEqual([{ kind: "pick", path: "apps/web/src/pages/x.tsx" }]);
    expect(formatPickComparison(c)).toBe("apps/web/src/pages/x.tsx: the pick row finds nothing in the file");
  });

  it("reports a count that differs", () => {
    const c = comparePicks(found, [row({ uses: 2 })]);
    expect(c.wrongCount).toEqual([{ kind: "pick", path: "apps/web/src/pages/x.tsx", listed: 2, found: 1 }]);
    expect(formatPickComparison(c)).toBe("apps/web/src/pages/x.tsx: the pick row says 2 places but 1 found");
  });

  it("keeps a pick and a reader in one file apart", () => {
    const both = [...found, { kind: "reader" as const, path: "apps/web/src/pages/x.tsx", lines: [8] }];
    expect(isCleanPick(comparePicks(both, [row(), row({ kind: "reader", accepts: [], limit: "not-applicable" })]))).toBe(true);
    expect(comparePicks(both, [row()]).unlisted.map((u) => u.kind)).toEqual(["reader"]);
  });

  it("is not fooled by a path that contains another path or a NUL", () => {
    const c = comparePicks([{ kind: "pick", path: "apps/web/src/a.ts", lines: [1] }], [row({ path: "apps/web/src/a.tsx" })]);
    expect(c.unlisted).toHaveLength(1);
    expect(c.gone).toHaveLength(1);
  });

  it("lists every kind of difference together", () => {
    const c = comparePicks([...found, { kind: "pick", path: "apps/web/src/new.ts", lines: [1] }], [row({ uses: 4 }), row({ path: "apps/web/src/gone.ts" })]);
    expect(formatPickComparison(c).split("\n")).toHaveLength(3);
  });
});

describe("pickTotalsByKind", () => {
  it("gives places and files for each kind that has any, in the order of the kinds", () => {
    expect(
      pickTotalsByKind([
        { kind: "reader", path: "a", lines: [1] },
        { kind: "pick", path: "b", lines: [1, 2] },
        { kind: "pick", path: "c", lines: [4] },
      ]),
    ).toEqual([
      { kind: "pick", places: 3, files: 2 },
      { kind: "reader", places: 1, files: 1 },
    ]);
  });

  it("is empty when nothing was found", () => {
    expect(pickTotalsByKind([])).toEqual([]);
  });
});
