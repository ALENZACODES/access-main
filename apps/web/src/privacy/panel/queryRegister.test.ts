import { describe, expect, it } from "vitest";
import {
  NOT_QUERY,
  PERSONAL_KINDS,
  QUERY_KINDS,
  QUERY_REGISTER,
  RUN_TIME_NAME,
  assertQueries,
  longestAllowed,
  namesOf,
  queryCounts,
  rowForName,
  validateQueries,
  type QueryProblemCode,
  type QueryRow,
} from "./queryRegister";

const row = (over: Partial<QueryRow> = {}): QueryRow => ({
  name: "q",
  kind: "typed",
  holds: { en: "Words", fr: "Des mots" },
  places: [{ path: "apps/web/src/a.ts", reads: 1, builds: 0 }],
  limits: [],
  source: "Read from the source",
  recordedOn: "2026-11-21",
  ...over,
});

const codes = (rows: readonly QueryRow[], not = NOT_QUERY): QueryProblemCode[] => validateQueries(rows, not).map((p) => p.code);

describe("the register", () => {
  it("is well formed and asserts", () => {
    expect(validateQueries(QUERY_REGISTER)).toEqual([]);
    expect(() => assertQueries(QUERY_REGISTER)).not.toThrow();
  });
  it("starts with the names that hold a place, then typed words", () => {
    expect(QUERY_REGISTER.slice(0, 4).map((r) => `${r.name} ${r.kind}`)).toEqual(["near place", "lat place", "lon place", "q typed"]);
  });
  it("has text in both languages for every row", () => {
    for (const r of QUERY_REGISTER) expect(r.holds.en.length > 8 && r.holds.fr.length > 8, r.name).toBe(true);
  });
  it("never claims what a browser or the people who get a link do", () => {
    for (const r of QUERY_REGISTER) expect(JSON.stringify(r), r.name).not.toMatch(/verified|vérif|confirmed|confirmé|private|privé|safe|secure|sécuris|encrypt|chiffr/i);
  });
  it("uses the typographic apostrophe in French", () => {
    for (const r of QUERY_REGISTER) expect(r.holds.fr, r.name).not.toContain("'");
  });
  it("lists the places a place on the map can come from, and says the code reads them only", () => {
    for (const n of ["near", "lat", "lon"]) {
      const r = rowForName(QUERY_REGISTER, n)!;
      expect(r.kind).toBe("place");
      expect(r.places.every((p) => p.builds === 0)).toBe(true);
    }
  });
  it("says typed words are put into links in two files and limited to 100 characters in each", () => {
    const r = rowForName(QUERY_REGISTER, "q")!;
    expect(r.places.map((p) => p.builds)).toEqual([1, 1]);
    expect(r.limits.map((l) => l.max)).toEqual([100, 100]);
    expect(longestAllowed(r)).toBe(100);
  });
  it("has three rows for names built at run time, each with a different file", () => {
    const rt = QUERY_REGISTER.filter((r) => r.name === RUN_TIME_NAME);
    expect(rt).toHaveLength(3);
    expect(new Set(rt.flatMap((r) => r.places.map((p) => p.path))).size).toBe(4);
  });
  it("gives the prefix of the names built from a template", () => {
    const r = QUERY_REGISTER.find((x) => x.names?.prefix === "stale_")!;
    expect(namesOf(r)).toEqual(["stale_places", "stale_routes", "stale_transit", "stale_boundaries", "stale_reference"]);
  });
  it("keeps every kind in the list of kinds", () => {
    for (const r of QUERY_REGISTER) expect(QUERY_KINDS).toContain(r.kind);
    expect([...PERSONAL_KINDS].sort()).toEqual(["ids", "place", "typed"]);
  });
  it("gives a reason for each name it leaves out", () => {
    expect(NOT_QUERY.map((n) => n.name)).toEqual(["__sha256"]);
    for (const n of NOT_QUERY) expect(n.why.length).toBeGreaterThan(20);
  });
});

describe("validateQueries", () => {
  it("accepts a plain row", () => {
    expect(codes([row()])).toEqual([]);
  });
  it("refuses a bad name, but not the run-time name", () => {
    expect(codes([row({ name: "a b" })])).toEqual(["bad-name"]);
    expect(codes([row({ name: "" })])).toEqual(["bad-name"]);
    expect(codes([row({ name: RUN_TIME_NAME })])).toEqual([]);
  });
  it("refuses an unknown kind", () => {
    expect(codes([row({ kind: "x" as never })])).toEqual(["bad-kind"]);
  });
  it("refuses empty text and an empty source", () => {
    expect(codes([row({ holds: { en: " ", fr: "x" } })])).toEqual(["empty-text"]);
    expect(codes([row({ holds: { en: "x", fr: "" } })])).toEqual(["empty-text"]);
    expect(codes([row({ source: "" })])).toEqual(["empty-source"]);
  });
  it("refuses a date that is not a date", () => {
    expect(validateQueries([row({ recordedOn: "21/11/2026" })])[0]).toMatchObject({ code: "bad-date", detail: "21/11/2026" });
  });
  it("refuses a row with no place", () => {
    expect(codes([row({ places: [] })])).toEqual(["no-places"]);
  });
  it("refuses a path that is not a source file, or goes up a folder", () => {
    for (const path of ["a.md", "../a.ts", "apps/../a.ts", "a b.ts", "", "/"]) expect(codes([row({ places: [{ path, reads: 1, builds: 0 }] })]), path).toContain("bad-path");
  });
  it("refuses counts that are negative, fractional, or both zero", () => {
    for (const [reads, builds] of [[0, 0], [-1, 1], [1.5, 0], [1, -1]] as const) {
      expect(codes([row({ places: [{ path: "apps/web/src/a.ts", reads, builds }] })]), `${reads}/${builds}`).toContain("bad-count");
    }
  });
  it("refuses the same file twice in a row", () => {
    const p = { path: "apps/web/src/a.ts", reads: 1, builds: 0 };
    expect(codes([row({ places: [p, p] })])).toContain("duplicate-place");
  });
  it("refuses the same name twice, but not two run-time rows in different files", () => {
    expect(codes([row(), row()])).toContain("duplicate-name");
    const a = row({ name: RUN_TIME_NAME, places: [{ path: "apps/web/src/a.ts", reads: 0, builds: 1 }] });
    const b = row({ name: RUN_TIME_NAME, places: [{ path: "apps/web/src/b.ts", reads: 0, builds: 1 }] });
    expect(codes([a, b])).toEqual([]);
    expect(codes([a, a])).toContain("duplicate-place");
  });
  it("refuses the same name and file in two rows", () => {
    expect(codes([row(), row({ kind: "choice" })])).toEqual(expect.arrayContaining(["duplicate-place", "duplicate-name"]));
  });
  it("refuses a limit that is not a whole number above zero, or names a bad constant or file", () => {
    const l = (max: number, name = "MAX_X", path = "apps/web/src/a.ts") => row({ limits: [{ max, appliesTo: "apps/web/src/a.ts", from: { path, name } }] });
    expect(codes([l(100)])).toEqual([]);
    for (const bad of [l(0), l(-1), l(1.5), l(10, "1X"), l(10, "MAX_X", "a.md")]) expect(codes([bad])).toContain("bad-limit");
  });
  it("refuses a limit for a file the row does not list", () => {
    expect(codes([row({ limits: [{ max: 5, appliesTo: "apps/web/src/other.ts", from: { path: "apps/web/src/a.ts", name: "MAX_X" } }] })])).toContain("limit-outside-places");
  });
  it("refuses a list of names on a row that names one", () => {
    expect(codes([row({ names: { names: ["a"], from: { path: "apps/web/src/a.ts", name: "IDS" } } })])).toContain("names-on-named-row");
  });
  it("refuses listed names that are not names, or repeat", () => {
    const rt = (names: string[], prefix?: string) => row({ name: RUN_TIME_NAME, names: { names, ...(prefix === undefined ? {} : { prefix }), from: { path: "apps/web/src/a.ts", name: "IDS" } } });
    expect(codes([rt(["a", "b"])])).toEqual([]);
    expect(codes([rt(["a b"])])).toContain("bad-listed-name");
    expect(codes([rt(["a", "a"])])).toContain("duplicate-listed-name");
    expect(codes([rt(["x"], "stale_")])).toEqual([]);
  });
  it("refuses a not-a-query entry with no reason or a bad path", () => {
    expect(codes([], [{ path: "apps/web/src/a.ts", name: "x", why: "" }])).toEqual(["bad-path"]);
    expect(codes([], [{ path: "nope", name: "x", why: "y" }])).toEqual(["bad-path"]);
  });
  it("sorts what it finds, so a failure reads the same each time", () => {
    const p = validateQueries([row({ name: "b", source: "" }), row({ name: "a", source: "" })]);
    expect(p.map((x) => x.name)).toEqual(["a", "b"]);
  });
});

describe("assertQueries", () => {
  it("throws with the problems named", () => {
    expect(() => assertQueries([row({ source: "" })])).toThrow("Web address register is wrong: empty-source q");
    expect(() => assertQueries([row({ recordedOn: "x" })])).toThrow("bad-date q (x)");
  });
});

describe("queryCounts", () => {
  it("counts names, run-time rows, places, files and personal names", () => {
    const rows = [
      row({ name: "near", kind: "place", places: [{ path: "apps/web/src/a.ts", reads: 1, builds: 0 }] }),
      row({ name: "q", kind: "typed", places: [{ path: "apps/web/src/a.ts", reads: 1, builds: 2 }, { path: "apps/web/src/b.ts", reads: 1, builds: 0 }] }),
      row({ name: "sort", kind: "layout", places: [{ path: "apps/web/src/b.ts", reads: 1, builds: 0 }] }),
      row({ name: RUN_TIME_NAME, kind: "layout", places: [{ path: "apps/web/src/c.ts", reads: 0, builds: 3 }] }),
    ];
    expect(queryCounts(rows)).toEqual({ names: 3, runTime: 1, places: 9, files: 3, built: 1, personal: 2, personalBuilt: 1 });
  });
  it("counts nothing for no rows", () => {
    expect(queryCounts([])).toEqual({ names: 0, runTime: 0, places: 0, files: 0, built: 0, personal: 0, personalBuilt: 0 });
  });
});

describe("rowForName", () => {
  it("finds the row that names it", () => {
    expect(rowForName(QUERY_REGISTER, "near")?.kind).toBe("place");
  });
  it("finds a facet name through the run-time row that lists it", () => {
    expect(rowForName(QUERY_REGISTER, "licence")?.name).toBe(RUN_TIME_NAME);
  });
  it("finds a name with a prefix, and not the prefix alone or another prefix", () => {
    expect(rowForName(QUERY_REGISTER, "stale_places")?.names?.prefix).toBe("stale_");
    for (const n of ["stale_", "stale_other", "places", "old_places"]) expect(rowForName(QUERY_REGISTER, n), n).toBeNull();
  });
  it("is null for a name no row has", () => {
    expect(rowForName(QUERY_REGISTER, "email")).toBeNull();
    expect(rowForName([], "q")).toBeNull();
  });
  it("prefers the row that names it to a run-time row", () => {
    expect(rowForName(QUERY_REGISTER, "tier")?.name).toBe("tier");
  });
});

describe("namesOf and longestAllowed", () => {
  it("gives the name of a named row", () => {
    expect(namesOf(row())).toEqual(["q"]);
  });
  it("is empty for a run-time row with no list", () => {
    expect(namesOf(row({ name: RUN_TIME_NAME }))).toEqual([]);
  });
  it("gives the longest of several limits, or null for none", () => {
    const l = (max: number) => ({ max, appliesTo: "apps/web/src/a.ts", from: { path: "apps/web/src/a.ts", name: "MAX_X" } });
    expect(longestAllowed(row({ limits: [l(10), l(30), l(20)] }))).toBe(30);
    expect(longestAllowed(row())).toBeNull();
  });
});
