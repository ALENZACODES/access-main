import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy } from "./copyLint";
import {
  SAVE_KINDS,
  SAVE_KIND_LABELS,
  SAVE_REGISTER,
  assertSave,
  saveCounts,
  saveKindOrder,
  saveOfKind,
  validateSave,
  type SaveProblemCode,
  type SaveRow,
} from "./saveRegister";

const good = (over: Partial<SaveRow> = {}): SaveRow => ({
  kind: "json",
  path: "apps/web/src/a/B.tsx",
  uses: 1,
  makes: { en: "A file about a thing", fr: "Un fichier sur une chose" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

const codes = (rows: readonly SaveRow[]): SaveProblemCode[] => validateSave(rows).map((p) => p.code);

describe("the real register", () => {
  it("is well formed and passes the start-up check", () => {
    expect(validateSave(SAVE_REGISTER)).toEqual([]);
    expect(() => assertSave(SAVE_REGISTER)).not.toThrow();
  });

  it("has 40 rows at 42 places in 40 files", () => {
    expect(saveCounts(SAVE_REGISTER)).toEqual({ total: 40, uses: 42, files: 40, named: 36, caller: 4 });
  });

  it("counts the kinds as the scan found them", () => {
    const by = (k: (typeof SAVE_KINDS)[number]): number => saveOfKind(SAVE_REGISTER, k).reduce((n, r) => n + r.uses, 0);
    expect(SAVE_KINDS.map(by)).toEqual([8, 23, 3, 1, 3, 4]);
  });

  it("has rows of every kind", () => {
    for (const k of SAVE_KINDS) expect(saveOfKind(SAVE_REGISTER, k).length, k).toBeGreaterThan(0);
  });

  it("has one row for each file", () => {
    expect(new Set(SAVE_REGISTER.map((r) => r.path)).size).toBe(SAVE_REGISTER.length);
  });

  it("covers the web app and the packages", () => {
    const pkg = SAVE_REGISTER.filter((r) => r.path.startsWith("packages/")).map((r) => r.path);
    expect(pkg).toEqual([
      "packages/trip-check/src/export.ts",
      "packages/advocacy/src/ui/ReportsPanel.tsx",
      "packages/advocacy/src/ui/App.tsx",
      "packages/proposals/src/ReviewQueue.tsx",
      "packages/contribute/src/export.ts",
    ]);
    expect(SAVE_REGISTER.filter((r) => r.path.startsWith("apps/web/src/")).length).toBe(35);
  });

  it("lists this panel's own download, so the panel is not left out of its own list", () => {
    expect(SAVE_REGISTER.find((r) => r.path === "apps/web/src/privacy/panel/mount.ts")?.kind).toBe("none");
  });

  it("is written in both languages, with different text, of a few words", () => {
    for (const r of SAVE_REGISTER) {
      expect(r.makes.fr, r.path).not.toBe(r.makes.en);
      expect(r.makes.en.split(/\s+/).length, r.path).toBeGreaterThanOrEqual(3);
      expect(r.makes.fr.split(/\s+/).length, r.path).toBeGreaterThanOrEqual(3);
    }
  });

  it("has no placeholder text left in", () => {
    for (const r of SAVE_REGISTER) for (const t of [r.makes.en, r.makes.fr]) expect(t, r.path).not.toMatch(/\bXX\b|TODO|lorem|\{|\}/i);
  });

  it("passes the copy rules in both languages", () => {
    for (const r of SAVE_REGISTER) {
      expect(lintCopy("en", r.makes.en), r.makes.en).toEqual([]);
      expect(lintCopy("fr", r.makes.fr), r.makes.fr).toEqual([]);
    }
    for (const k of SAVE_KINDS) for (const l of ["en", "fr"] as const) expect(lintCopy(l, SAVE_KIND_LABELS[k][l]), SAVE_KIND_LABELS[k][l]).toEqual([]);
  });

  it("never says verified or its French forms, and never names an organisation it must not", () => {
    for (const r of SAVE_REGISTER) {
      for (const t of [r.makes.en, r.makes.fr, ...SAVE_KINDS.flatMap((k) => [SAVE_KIND_LABELS[k].en, SAVE_KIND_LABELS[k].fr])]) {
        expect(t).not.toMatch(/verif|vérif/i);
        expect(containsForbiddenOrg(t)).toBe(false);
      }
    }
  });

  it("never claims that a file is sent or kept", () => {
    for (const r of SAVE_REGISTER) expect(r.makes.en, r.path).not.toMatch(/\b(?:sends?|sent|uploads?|saves?|stores?|keeps?|shares?|tracks?)\b/i);
  });

  it("uses the French apostrophe, never a straight one", () => {
    for (const r of SAVE_REGISTER) expect(r.makes.fr, r.path).not.toContain("'");
  });

  it("names no file in a plain-language row", () => {
    for (const r of SAVE_REGISTER) for (const t of [r.makes.en, r.makes.fr]) expect(t, r.path).not.toMatch(/\.(?:ts|tsx|js)\b|\/|\bblob\b|createObjectURL/i);
  });

  it("is dated on a real day", () => {
    for (const r of SAVE_REGISTER) expect(r.recordedOn).toMatch(/^2026-11-\d\d$/);
  });

  it("has a label in both languages for every kind", () => {
    for (const k of SAVE_KINDS) {
      expect(SAVE_KIND_LABELS[k].en.length).toBeGreaterThan(5);
      expect(SAVE_KIND_LABELS[k].fr).not.toBe(SAVE_KIND_LABELS[k].en);
    }
    expect(Object.keys(SAVE_KIND_LABELS).sort()).toEqual([...SAVE_KINDS].sort());
  });
});

describe("validateSave", () => {
  it("accepts a good row", () => {
    expect(codes([good()])).toEqual([]);
  });

  it("rejects a path outside the web app and the packages", () => {
    for (const path of ["", "src/a.ts", "apps/web/a.ts", "apps/web/src/a.js", "../apps/web/src/a.ts", "apps/web/src/../a.ts", "apps/web/src//a.ts", "packages/Bad/src/a.ts", "packages/x/lib/a.ts"]) {
      expect(codes([good({ path })]), path).toContain("bad-path");
    }
  });

  it("accepts a package path with a hyphen", () => {
    expect(codes([good({ path: "packages/data-client/src/index.ts" })])).toEqual([]);
  });

  it("rejects a kind that is not in the list", () => {
    expect(codes([good({ kind: "xml" as never })])).toEqual(["bad-kind"]);
  });

  it("rejects a count that is not a whole number of 1 or more", () => {
    for (const uses of [0, -1, 1.5, Number.NaN, Infinity]) expect(codes([good({ uses })]), String(uses)).toContain("bad-count");
  });

  it("rejects empty text in either language, and the same text in both", () => {
    expect(codes([good({ makes: { en: "", fr: "Un fichier" } })])).toEqual(["empty-text"]);
    expect(codes([good({ makes: { en: "A file", fr: "  " } })])).toEqual(["empty-text"]);
    expect(codes([good({ makes: { en: "Same", fr: "Same" } })])).toEqual(["same-text"]);
  });

  it("rejects an empty source and a date that is not a day", () => {
    expect(codes([good({ source: " " })])).toEqual(["empty-source"]);
    for (const recordedOn of ["", "2026-13-01", "2026-02-30", "yesterday"]) expect(codes([good({ recordedOn })]), recordedOn).toEqual(["bad-date"]);
  });

  it("rejects two rows for one file, even with different kinds", () => {
    expect(codes([good(), good({ kind: "text" })])).toEqual(["duplicate-row"]);
  });

  it("reports every problem in a row, in a stable order", () => {
    const rows = [good({ path: "x", uses: 0, source: "", recordedOn: "x" })];
    expect(codes(rows)).toEqual(["bad-count", "bad-date", "bad-path", "empty-source"]);
    expect(validateSave(rows)).toEqual(validateSave([...rows]));
  });

  it("gives the same answer whatever the order of the rows", () => {
    const rows = [good({ path: "apps/web/src/b.ts", uses: 0 }), good({ path: "apps/web/src/a.ts", source: "" })];
    expect(validateSave(rows)).toEqual(validateSave([...rows].reverse()));
  });
});

describe("assertSave", () => {
  it("throws a message that names the file and the problem", () => {
    expect(() => assertSave([good({ uses: 0 })])).toThrow(/bad-count apps\/web\/src\/a\/B\.tsx \(0\)/);
  });

  it("does not throw for no rows", () => {
    expect(() => assertSave([])).not.toThrow();
  });
});

describe("counts and order", () => {
  it("counts rows, places, files and the two ways of naming a format", () => {
    const rows = [good({ uses: 2 }), good({ path: "apps/web/src/c.ts", kind: "none" }), good({ path: "apps/web/src/d.ts", kind: "csv", uses: 3 })];
    expect(saveCounts(rows)).toEqual({ total: 3, uses: 6, files: 3, named: 2, caller: 1 });
    expect(saveCounts([])).toEqual({ total: 0, uses: 0, files: 0, named: 0, caller: 0 });
  });

  it("sorts by the order of the kinds and then by path, without changing the rows it was given", () => {
    const rows = [good({ kind: "none", path: "apps/web/src/z.ts" }), good({ kind: "json", path: "apps/web/src/b.ts" }), good({ kind: "json", path: "apps/web/src/a.ts" })];
    const copy = [...rows];
    expect(saveKindOrder(rows).map((r) => r.path.split("/").pop())).toEqual(["a.ts", "b.ts", "z.ts"]);
    expect(rows).toEqual(copy);
  });

  it("sorts the real register with the kinds in the order of the list", () => {
    const order = saveKindOrder(SAVE_REGISTER).map((r) => SAVE_KINDS.indexOf(r.kind));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("gives the rows of one kind in the order they were given", () => {
    const rows = [good({ path: "apps/web/src/b.ts" }), good({ path: "apps/web/src/a.ts", kind: "text" }), good({ path: "apps/web/src/c.ts" })];
    expect(saveOfKind(rows, "json").map((r) => r.path)).toEqual(["apps/web/src/b.ts", "apps/web/src/c.ts"]);
    expect(saveOfKind(rows, "csv")).toEqual([]);
  });
});
