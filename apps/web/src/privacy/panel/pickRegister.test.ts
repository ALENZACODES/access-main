import { describe, expect, it } from "vitest";
import {
  PICK_ACCEPTS,
  PICK_ACCEPT_LABELS,
  PICK_KINDS,
  PICK_KIND_LABELS,
  PICK_LIMITS,
  PICK_LIMIT_LABELS,
  PICK_REGISTER,
  acceptsText,
  assertPick,
  pickCounts,
  pickKindOrder,
  picksOfKind,
  validatePick,
  type PickProblemCode,
  type PickRow,
} from "./pickRegister";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy } from "./copyLint";

const good = (over: Partial<PickRow> = {}): PickRow => ({
  kind: "pick",
  path: "apps/web/src/a/B.tsx",
  uses: 1,
  reads: { en: "An example file", fr: "Un fichier d’exemple" },
  accepts: ["json"],
  limit: "before-read",
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

const codes = (rows: readonly PickRow[]): PickProblemCode[] => validatePick(rows).map((p) => p.code);

describe("the real register", () => {
  it("is well formed and passes the start-up check", () => {
    expect(validatePick(PICK_REGISTER)).toEqual([]);
    expect(() => assertPick(PICK_REGISTER)).not.toThrow();
  });

  it("has 35 rows: 34 picks and one reader, at 37 places in 34 files", () => {
    expect(PICK_REGISTER).toHaveLength(35);
    expect(picksOfKind(PICK_REGISTER, "pick")).toHaveLength(34);
    expect(picksOfKind(PICK_REGISTER, "reader")).toHaveLength(1);
    const c = pickCounts(PICK_REGISTER);
    expect(c.uses).toBe(37);
    expect(c.files).toBe(34);
  });

  it("counts limits: 29 before reading, 2 after, 1 mixed, 1 with no check found in its own file", () => {
    const c = pickCounts(PICK_REGISTER);
    expect(c.before).toBe(30);
    expect(c.after).toBe(2);
    expect(c.unlimited).toBe(2);
  });

  it("is written in both languages, with different text, at least three words each", () => {
    for (const r of PICK_REGISTER) {
      expect(r.reads.fr, r.path).not.toBe(r.reads.en);
      expect(r.reads.en.split(/\s+/).length, r.path).toBeGreaterThanOrEqual(2);
      expect(r.reads.fr.split(/\s+/).length, r.path).toBeGreaterThanOrEqual(2);
    }
  });

  it("has no placeholder text left in", () => {
    for (const r of PICK_REGISTER) for (const t of [r.reads.en, r.reads.fr]) expect(t, r.path).not.toMatch(/\bXX\b|TODO|lorem|\{|\}/i);
  });

  it("passes the copy rules in both languages", () => {
    for (const r of PICK_REGISTER) {
      expect(lintCopy("en", r.reads.en), r.reads.en).toEqual([]);
      expect(lintCopy("fr", r.reads.fr), r.reads.fr).toEqual([]);
    }
    for (const kind of PICK_KINDS) for (const l of ["en", "fr"] as const) expect(lintCopy(l, PICK_KIND_LABELS[kind][l])).toEqual([]);
    for (const limit of PICK_LIMITS) for (const l of ["en", "fr"] as const) expect(lintCopy(l, PICK_LIMIT_LABELS[limit][l])).toEqual([]);
  });

  it("never says verified or its French forms, and never names an organisation it must not", () => {
    const all = [...PICK_REGISTER.flatMap((r) => [r.reads.en, r.reads.fr]), ...PICK_LIMITS.flatMap((l) => [PICK_LIMIT_LABELS[l].en, PICK_LIMIT_LABELS[l].fr])];
    for (const t of all) {
      expect(t).not.toMatch(/verif|vérif/i);
      expect(containsForbiddenOrg(t)).toBe(false);
    }
  });

  it("gives every pick at least one kind of file and no reader any", () => {
    for (const r of PICK_REGISTER) {
      if (r.kind === "pick") expect(r.accepts.length, r.path).toBeGreaterThan(0);
      else expect(r.accepts, r.path).toEqual([]);
    }
  });

  it("only uses CSV for the earlier-list comparison and pictures for the contribution photos", () => {
    expect(PICK_REGISTER.filter((r) => r.accepts.includes("csv")).map((r) => r.path)).toEqual(["apps/web/src/states/PackCompare.tsx"]);
    expect(PICK_REGISTER.filter((r) => r.accepts.includes("image")).map((r) => r.path)).toEqual(["apps/web/src/contribute/ContributePage.tsx"]);
  });

  it("names the file that applies the limit for every after-read row, and only for those", () => {
    for (const r of PICK_REGISTER) expect(r.checkedIn !== undefined, r.path).toBe(r.limit === "after-read");
  });

  it("is dated on a real day", () => {
    for (const r of PICK_REGISTER) expect(r.recordedOn).toMatch(/^2026-11-\d\d$/);
  });

  it("keeps the privacy panel's own import before-read, now that the size is checked first", () => {
    const mount = PICK_REGISTER.find((r) => r.path.endsWith("privacy/panel/mount.ts"));
    expect(mount?.uses).toBe(2);
    expect(mount?.limit).toBe("before-read");
  });
});

describe("validatePick", () => {
  it("accepts a good row", () => {
    expect(validatePick([good()])).toEqual([]);
  });

  it("rejects a bad path", () => {
    for (const path of ["", "src/a.ts", "apps/web/src/a.js", "apps/web/src/../x.ts", "apps/web/src//x.ts", "apps/web/src/a b.ts"]) expect(codes([good({ path })]), path).toContain("bad-path");
  });

  it("rejects a kind that is not in the list", () => {
    expect(codes([good({ kind: "drop" as never })])).toContain("bad-kind");
  });

  it("rejects a count that is not a whole number of at least one", () => {
    for (const uses of [0, -1, 1.5, Number.NaN]) expect(codes([good({ uses })]), String(uses)).toContain("bad-count");
  });

  it("rejects empty or blank text in either language, and an empty source", () => {
    expect(codes([good({ reads: { en: " ", fr: "x y" } })])).toContain("empty-text");
    expect(codes([good({ reads: { en: "x y", fr: "" } })])).toContain("empty-text");
    expect(codes([good({ source: "  " })])).toContain("empty-source");
  });

  it("rejects a date that is not a real day", () => {
    for (const recordedOn of ["", "2026-13-01", "2026-02-30", "21-11-2026", "2026-11-21T00:00"]) expect(codes([good({ recordedOn })]), recordedOn).toContain("bad-date");
  });

  it("rejects an accept kind that is not in the list", () => {
    expect(codes([good({ accepts: ["pdf" as never] })])).toContain("bad-accept");
  });

  it("rejects a limit that is not in the list", () => {
    expect(codes([good({ limit: "soon" as never })])).toContain("bad-limit");
  });

  it("rejects kinds of file on a reader, and none on a pick", () => {
    expect(codes([good({ kind: "reader", limit: "not-applicable", accepts: ["json"] })])).toContain("accepts-on-reader");
    expect(codes([good({ accepts: [] })])).toContain("pick-without-accepts");
  });

  it("rejects UNKNOWN mixed with other kinds, and repeated kinds", () => {
    expect(codes([good({ accepts: ["UNKNOWN", "json"] })])).toContain("unknown-with-others");
    expect(validatePick([good({ accepts: ["UNKNOWN"] })])).toEqual([]);
    expect(codes([good({ accepts: ["json", "json"] })])).toContain("duplicate-accepts");
  });

  it("rejects a reader with a limit and a pick that is not applicable", () => {
    expect(codes([good({ kind: "reader", accepts: [], limit: "before-read" })])).toContain("reader-limit");
    expect(codes([good({ limit: "not-applicable" })])).toContain("pick-not-applicable");
    expect(validatePick([good({ kind: "reader", accepts: [], limit: "not-applicable" })])).toEqual([]);
  });

  it("requires checkedIn for after-read, and forbids it otherwise", () => {
    expect(codes([good({ limit: "after-read" })])).toContain("checked-in-missing");
    expect(codes([good({ limit: "after-read", checkedIn: "not a path" })])).toContain("checked-in-missing");
    expect(codes([good({ limit: "after-read", checkedIn: "apps/web/src/a/limit.ts" })])).toEqual([]);
    expect(codes([good({ checkedIn: "apps/web/src/a/limit.ts" })])).toContain("checked-in-unexpected");
  });

  it("needs two places for a mixed row", () => {
    expect(codes([good({ limit: "mixed", uses: 1 })])).toContain("mixed-needs-two");
    expect(codes([good({ limit: "mixed", uses: 2 })])).toEqual([]);
  });

  it("rejects the same kind and path twice, but allows one path as a pick and a reader", () => {
    expect(codes([good(), good()])).toContain("duplicate-row");
    expect(validatePick([good(), good({ kind: "reader", accepts: [], limit: "not-applicable" })])).toEqual([]);
  });

  it("returns the problems in a stable order, and reports every problem in a row", () => {
    const a = validatePick([good({ path: "apps/web/src/z.ts", uses: 0 }), good({ path: "apps/web/src/a.ts", source: "" })]);
    expect(a.map((p) => `${p.path} ${p.code}`)).toEqual(["pick apps/web/src/a.ts empty-source", "pick apps/web/src/z.ts bad-count"].map((x) => x.replace(/^pick /, "")));
    expect(validatePick([good({ uses: 0, source: "", accepts: [] })]).length).toBe(3);
  });

  it("does not change the rows it is given", () => {
    const rows = [good({ uses: 0 })];
    const copy = JSON.stringify(rows);
    validatePick(rows);
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

describe("assertPick", () => {
  it("throws with every problem named", () => {
    expect(() => assertPick([good({ uses: 0 }), good({ path: "x" })])).toThrow(/bad-count pick apps\/web\/src\/a\/B\.tsx \(0\).*bad-path pick x/s);
  });
});

describe("pickCounts", () => {
  it("is zero for no rows", () => {
    expect(pickCounts([])).toEqual({ total: 0, uses: 0, files: 0, before: 0, after: 0, unlimited: 0 });
  });

  it("counts files once when a file is both a pick and a reader", () => {
    const rows = [good({ uses: 2 }), good({ kind: "reader", accepts: [], limit: "not-applicable" })];
    expect(pickCounts(rows)).toEqual({ total: 2, uses: 3, files: 1, before: 1, after: 0, unlimited: 0 });
  });

  it("counts mixed and none-found as without a full check", () => {
    const rows = [good({ path: "apps/web/src/a.ts", limit: "mixed", uses: 2 }), good({ path: "apps/web/src/b.ts", limit: "none-found" })];
    expect(pickCounts(rows).unlimited).toBe(2);
    expect(pickCounts(rows).before).toBe(0);
  });
});

describe("pickKindOrder and picksOfKind", () => {
  it("puts picks before readers and sorts by path within a kind", () => {
    const rows = [
      good({ kind: "reader", path: "apps/web/src/a.ts", accepts: [], limit: "not-applicable" }),
      good({ path: "apps/web/src/z.ts" }),
      good({ path: "apps/web/src/b.ts" }),
    ];
    expect(pickKindOrder(rows).map((r) => `${r.kind} ${r.path.split("/").pop()}`)).toEqual(["pick b.ts", "pick z.ts", "reader a.ts"]);
  });

  it("does not change the order of the list it is given", () => {
    const rows = [good({ path: "apps/web/src/z.ts" }), good({ path: "apps/web/src/b.ts" })];
    pickKindOrder(rows);
    expect(rows[0]?.path).toBe("apps/web/src/z.ts");
  });

  it("picksOfKind keeps the order of the rows", () => {
    expect(picksOfKind(PICK_REGISTER, "pick")[0]?.path).toBe("apps/web/src/contribute/ContributePage.tsx");
  });
});

describe("labels", () => {
  it("has a label in both languages for every kind, kind of file and limit", () => {
    for (const k of PICK_KINDS) expect(Object.keys(PICK_KIND_LABELS[k]).sort()).toEqual(["en", "fr"]);
    for (const a of PICK_ACCEPTS) expect(PICK_ACCEPT_LABELS[a].en.length).toBeGreaterThan(0);
    for (const l of PICK_LIMITS) expect(PICK_LIMIT_LABELS[l].fr).not.toBe(PICK_LIMIT_LABELS[l].en);
  });

  it("joins kinds of file in the order given, and says nothing for none", () => {
    expect(acceptsText("en", ["image", "json", "geojson"])).toBe("pictures, JSON, GeoJSON");
    expect(acceptsText("fr", ["image"])).toBe("images");
    expect(acceptsText("en", [])).toBe("");
    expect(acceptsText("fr", ["UNKNOWN"])).toBe("Inconnu");
  });

  it("states the after-read limit as after, never as before", () => {
    expect(PICK_LIMIT_LABELS["after-read"].en).toContain("after");
    expect(PICK_LIMIT_LABELS["before-read"].en).toContain("before");
    expect(PICK_LIMIT_LABELS["none-found"].en).toContain("found");
  });

  it("uses the French typography in the labels", () => {
    for (const l of PICK_LIMITS) expect(PICK_LIMIT_LABELS[l].fr).not.toContain("'");
  });
});
