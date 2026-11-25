import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import {
  BROWSER_KINDS,
  BROWSER_KIND_LABELS,
  BROWSER_REGISTER,
  assertBrowser,
  browserCounts,
  browserKindOrder,
  browserOfKind,
  validateBrowser,
  type BrowserKind,
  type BrowserProblemCode,
  type BrowserRow,
} from "./browserRegister";
import { lintCopy } from "./copyLint";

const good = (over: Partial<BrowserRow> = {}): BrowserRow => ({
  kind: "language",
  path: "apps/web/src/a/B.tsx",
  uses: 1,
  asks: { en: "A question asked", fr: "Une question posée" },
  usedFor: { en: "A use made of it", fr: "Un usage qui en est fait" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

const codes = (rows: readonly BrowserRow[]): BrowserProblemCode[] => validateBrowser(rows).map((p) => p.code);

describe("the real register", () => {
  it("is well formed and passes the start-up check", () => {
    expect(validateBrowser(BROWSER_REGISTER)).toEqual([]);
    expect(() => assertBrowser(BROWSER_REGISTER)).not.toThrow();
  });

  it("has 25 rows at 36 places in 19 files", () => {
    const c = browserCounts(BROWSER_REGISTER);
    expect(c).toEqual({ total: 25, uses: 36, files: 19, questions: 18, identifiers: 6 });
  });

  it("has rows of every kind", () => {
    for (const k of BROWSER_KINDS) expect(browserOfKind(BROWSER_REGISTER, k).length, k).toBeGreaterThan(0);
  });

  it("counts the kinds as the scan found them", () => {
    const by = (k: BrowserKind): number => browserOfKind(BROWSER_REGISTER, k).reduce((n, r) => n + r.uses, 0);
    expect([by("language"), by("online"), by("preference"), by("storage-size"), by("privacy-signal"), by("identifier"), by("own-language")]).toEqual([4, 5, 4, 9, 5, 7, 2]);
  });

  it("is written in both languages, with different text, in every field", () => {
    for (const r of BROWSER_REGISTER) {
      for (const f of [r.asks, r.usedFor]) {
        expect(f.fr, r.path).not.toBe(f.en);
        expect(f.en.split(/\s+/).length, r.path).toBeGreaterThanOrEqual(4);
        expect(f.fr.split(/\s+/).length, r.path).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("has no placeholder text left in", () => {
    for (const r of BROWSER_REGISTER) for (const t of [r.asks.en, r.asks.fr, r.usedFor.en, r.usedFor.fr]) expect(t, r.path).not.toMatch(/\bXX\b|TODO|lorem|\{|\}/i);
  });

  it("passes the copy rules in both languages", () => {
    for (const r of BROWSER_REGISTER) {
      expect(lintCopy("en", r.asks.en), r.asks.en).toEqual([]);
      expect(lintCopy("fr", r.asks.fr), r.asks.fr).toEqual([]);
      expect(lintCopy("en", r.usedFor.en), r.usedFor.en).toEqual([]);
      expect(lintCopy("fr", r.usedFor.fr), r.usedFor.fr).toEqual([]);
    }
    for (const k of BROWSER_KINDS) for (const l of ["en", "fr"] as const) expect(lintCopy(l, BROWSER_KIND_LABELS[k][l])).toEqual([]);
  });

  it("never says verified or its French forms, and never names an organisation it must not", () => {
    for (const r of BROWSER_REGISTER) {
      for (const t of [r.asks.en, r.asks.fr, r.usedFor.en, r.usedFor.fr]) {
        expect(t).not.toMatch(/verif|vérif/i);
        expect(containsForbiddenOrg(t)).toBe(false);
      }
    }
  });

  it("never claims that an answer or an identifier is sent or kept", () => {
    for (const r of BROWSER_REGISTER) for (const t of [r.asks.en, r.usedFor.en]) expect(t, r.path).not.toMatch(/\b(?:sends?|sent|uploads?|saves?|stores?|keeps?|shares?|tracks?)\b(?! it)/i);
  });

  it("uses the French apostrophe, never a straight one", () => {
    for (const r of BROWSER_REGISTER) for (const t of [r.asks.fr, r.usedFor.fr]) expect(t, r.path).not.toContain("'");
  });

  it("covers the language pages, the online readers and the display settings, with this panel among them", () => {
    expect(browserOfKind(BROWSER_REGISTER, "language").map((r) => r.path)).toEqual(["apps/web/src/data-status/standalone/main.ts", "apps/web/src/i18n/index.ts", "apps/web/src/privacy/panel/browserLive.ts", "packages/consent/src/main.tsx"]);
    expect(browserOfKind(BROWSER_REGISTER, "online").map((r) => r.path.split("/").pop())).toEqual(["RegionPackPage.tsx", "browserLive.ts", "useOnline.ts"]);
    expect(browserOfKind(BROWSER_REGISTER, "preference").map((r) => r.path.split("/").pop())).toEqual(["camera.ts", "browserLive.ts", "useApplyPreferences.ts"]);
  });

  it("includes the package files, not only the web app", () => {
    expect(BROWSER_REGISTER.filter((r) => r.path.startsWith("packages/")).map((r) => r.path)).toEqual([
      "packages/consent/src/main.tsx",
      "packages/data-client/src/index.ts",
      "packages/caregiver/src/service.ts",
      "packages/contribute/src/schema.ts",
      "packages/proposals/src/store.ts",
    ]);
  });

  it("is dated on a real day", () => {
    for (const r of BROWSER_REGISTER) expect(r.recordedOn).toMatch(/^2026-11-\d\d$/);
  });

  it("says which identifier rows have another way to make one", () => {
    const withFallback = browserOfKind(BROWSER_REGISTER, "identifier").filter((r) => /another way|time-based/.test(r.usedFor.en));
    expect(withFallback.map((r) => r.path.split("/").pop())).toEqual(["RouteReportsPage.tsx", "service.ts"]);
  });
});

describe("validateBrowser", () => {
  it("accepts a good row", () => {
    expect(validateBrowser([good()])).toEqual([]);
  });

  it("accepts a web app path and a package path, and rejects others", () => {
    expect(validateBrowser([good({ path: "packages/consent/src/main.tsx" })])).toEqual([]);
    for (const path of ["", "src/a.ts", "apps/web/src/a.js", "apps/web/src/../x.ts", "apps/web/src//x.ts", "apps/web/src/a b.ts", "packages/Consent/src/a.ts", "packages/x/lib/a.ts", "apps/other/src/a.ts"]) {
      expect(codes([good({ path })]), path).toContain("bad-path");
    }
  });

  it("rejects a kind that is not in the list", () => {
    expect(codes([good({ kind: "tracking" as never })])).toContain("bad-kind");
  });

  it("rejects a count that is not a whole number of at least one", () => {
    for (const uses of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(codes([good({ uses })]), String(uses)).toContain("bad-count");
  });

  it("rejects empty text in either language of either field", () => {
    expect(codes([good({ asks: { en: " ", fr: "x y" } })])).toContain("empty-text");
    expect(codes([good({ asks: { en: "x y", fr: "" } })])).toContain("empty-text");
    expect(codes([good({ usedFor: { en: "", fr: "x y" } })])).toContain("empty-text");
  });

  it("rejects the same text in both languages", () => {
    expect(validateBrowser([good({ asks: { en: "Same text", fr: "Same text" } })])).toEqual([{ code: "same-text", kind: "language", path: "apps/web/src/a/B.tsx", detail: "Same text" }]);
  });

  it("rejects an empty source and a date that is not a real day", () => {
    expect(codes([good({ source: "  " })])).toContain("empty-source");
    for (const recordedOn of ["", "2026-13-01", "2026-02-30", "21-11-2026"]) expect(codes([good({ recordedOn })]), recordedOn).toContain("bad-date");
  });

  it("rejects the same kind and path twice, but allows one path with two kinds", () => {
    expect(codes([good(), good()])).toContain("duplicate-row");
    expect(validateBrowser([good(), good({ kind: "online" })])).toEqual([]);
  });

  it("reports every problem in a row, and gives them in a stable order whatever order the rows come in", () => {
    const rows = [good({ path: "apps/web/src/z.ts", uses: 0 }), good({ path: "apps/web/src/a.ts", source: "" })];
    expect(validateBrowser(rows)).toEqual(validateBrowser([...rows].reverse()));
    expect(validateBrowser([good({ uses: 0, source: "", recordedOn: "x" })]).length).toBe(3);
  });

  it("does not change the rows it is given", () => {
    const rows = [good({ uses: 0 })];
    const copy = JSON.stringify(rows);
    validateBrowser(rows);
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

describe("assertBrowser", () => {
  it("throws with every problem named", () => {
    expect(() => assertBrowser([good({ uses: 0 }), good({ path: "x" })])).toThrow(/bad-path language x.*bad-count language apps\/web\/src\/a\/B\.tsx \(0\)|bad-count.*bad-path/s);
  });
});

describe("browserCounts", () => {
  it("is zero for no rows", () => {
    expect(browserCounts([])).toEqual({ total: 0, uses: 0, files: 0, questions: 0, identifiers: 0 });
  });

  it("counts a file once when it has two kinds, and keeps identifiers and number writing apart from questions", () => {
    const rows = [good({ uses: 2 }), good({ kind: "identifier" }), good({ kind: "own-language", path: "apps/web/src/c.ts" })];
    expect(browserCounts(rows)).toEqual({ total: 3, uses: 4, files: 2, questions: 1, identifiers: 1 });
  });
});

describe("browserKindOrder and browserOfKind", () => {
  it("sorts by the order of the kinds and then by path", () => {
    const rows = [good({ kind: "identifier", path: "apps/web/src/a.ts" }), good({ path: "apps/web/src/z.ts" }), good({ path: "apps/web/src/b.ts" }), good({ kind: "online", path: "apps/web/src/c.ts" })];
    expect(browserKindOrder(rows).map((r) => `${r.kind} ${r.path.split("/").pop()}`)).toEqual(["language b.ts", "language z.ts", "online c.ts", "identifier a.ts"]);
  });

  it("does not change the order of the list it is given", () => {
    const rows = [good({ path: "apps/web/src/z.ts" }), good({ path: "apps/web/src/b.ts" })];
    browserKindOrder(rows);
    expect(rows[0]?.path).toBe("apps/web/src/z.ts");
  });

  it("keeps the order of the rows for one kind", () => {
    expect(browserOfKind(BROWSER_REGISTER, "identifier")[0]?.path).toBe("apps/web/src/contribute/ContributePage.tsx");
    expect(browserOfKind([], "language")).toEqual([]);
  });
});

describe("labels", () => {
  it("has a label in both languages for every kind, and they differ", () => {
    for (const k of BROWSER_KINDS) {
      expect(Object.keys(BROWSER_KIND_LABELS[k]).sort()).toEqual(["en", "fr"]);
      expect(BROWSER_KIND_LABELS[k].fr).not.toBe(BROWSER_KIND_LABELS[k].en);
    }
  });
});
