import { describe, expect, it } from "vitest";
import { HANDOFF_REGISTER, assertHandoffs, handoffCounts, rowsFor, validateHandoffs, type HandoffRow } from "./handoffRegister";

const row = (over: Partial<HandoffRow> = {}): HandoffRow => ({
  scheme: "mailto",
  path: "apps/web/src/a.ts",
  uses: 1,
  opens: { en: "Mail", fr: "Courriel" },
  carries: { en: "A draft", fr: "Un brouillon" },
  source: "s",
  recordedOn: "2026-11-20",
  ...over,
});
const codes = (rows: readonly HandoffRow[]): string[] => validateHandoffs(rows).map((p) => p.code);

describe("the real register", () => {
  it("is well formed", () => {
    expect(validateHandoffs(HANDOFF_REGISTER)).toEqual([]);
    expect(() => assertHandoffs(HANDOFF_REGISTER)).not.toThrow();
  });
  it("lists the email, map and phone links, one place each", () => {
    expect(HANDOFF_REGISTER.map((r) => `${r.scheme} ${r.uses}`)).toEqual(["mailto 1", "geo 1", "tel 1"]);
  });
  it("says in each row what opens and what is passed on, in both languages", () => {
    for (const r of HANDOFF_REGISTER) for (const t of [r.opens, r.carries]) expect(t.en.length > 8 && t.fr.length > 8).toBe(true);
  });
  it("says the email draft has no address and the map link has five decimal places", () => {
    expect(rowsFor(HANDOFF_REGISTER, "mailto")[0]?.carries.en).toContain("no address");
    expect(rowsFor(HANDOFF_REGISTER, "geo")[0]?.carries.en).toContain("five decimal places");
  });
  it("never says verified, confirmed or private", () => {
    for (const r of HANDOFF_REGISTER) expect(JSON.stringify(r)).not.toMatch(/verified|vérif|confirmed|confirmé|private|privé/i);
  });
});

describe("validateHandoffs", () => {
  it("accepts a plain row", () => {
    expect(codes([row()])).toEqual([]);
  });
  it("refuses a scheme it does not know", () => {
    expect(codes([row({ scheme: "ftp" as never })])).toEqual(["bad-scheme"]);
  });
  it("refuses a path that is not a plain source path", () => {
    for (const p of ["", "a b.ts", "a/b", "../x.ts", "a/b.txt"]) expect(codes([row({ path: p })]), p).toContain("bad-path");
    expect(codes([row({ path: "x/y.mjs" })])).toEqual([]);
    expect(codes([row({ path: "x/y.tsx" })])).toEqual([]);
  });
  it("refuses a count that is not a whole number of at least one", () => {
    for (const n of [0, -1, 1.5, Number.NaN]) expect(codes([row({ uses: n })]), String(n)).toContain("bad-count");
    expect(codes([row({ uses: 12 })])).toEqual([]);
  });
  it("needs text in both languages for what opens and what is passed on", () => {
    expect(codes([row({ opens: { en: "x", fr: " " } })])).toContain("empty-text");
    expect(codes([row({ carries: { en: "", fr: "x" } })])).toContain("empty-text");
  });
  it("needs a source and a real date", () => {
    expect(codes([row({ source: " " })])).toContain("empty-source");
    expect(codes([row({ recordedOn: "2026-02-30" })])).toContain("bad-date");
    expect(codes([row({ recordedOn: "today" })])).toContain("bad-date");
  });
  it("refuses a kind and file listed twice, and accepts the same file for another kind", () => {
    expect(codes([row(), row()])).toEqual(["duplicate-row"]);
    expect(codes([row(), row({ scheme: "tel" })])).toEqual([]);
  });
  it("sorts the problems", () => {
    const p = validateHandoffs([row({ scheme: "tel", uses: 0 }), row({ scheme: "geo", uses: 0 })]);
    expect(p.map((x) => x.scheme)).toEqual(["geo", "tel"]);
  });
  it("gives the bad value as the detail", () => {
    expect(validateHandoffs([row({ uses: 0 })])[0]?.detail).toBe("0");
    expect(validateHandoffs([row({ recordedOn: "x" })])[0]?.detail).toBe("x");
  });
});

describe("assertHandoffs", () => {
  it("throws a message that names each problem", () => {
    expect(() => assertHandoffs([row({ uses: 0 })])).toThrow("bad-count mailto apps/web/src/a.ts (0)");
    expect(() => assertHandoffs([row({ source: "" })])).toThrow("empty-source mailto");
  });
});

describe("handoffCounts", () => {
  it("counts rows, places, kinds and files", () => {
    const rows = [row({ uses: 2 }), row({ scheme: "tel", uses: 3 }), row({ path: "apps/web/src/b.ts" })];
    expect(handoffCounts(rows)).toEqual({ total: 3, uses: 6, schemes: 2, files: 2 });
    expect(handoffCounts([])).toEqual({ total: 0, uses: 0, schemes: 0, files: 0 });
  });
});

describe("rowsFor", () => {
  it("gives the rows of one kind, or none", () => {
    expect(rowsFor(HANDOFF_REGISTER, "tel")).toHaveLength(1);
    expect(rowsFor(HANDOFF_REGISTER, "sms")).toEqual([]);
  });
});
