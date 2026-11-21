import { describe, expect, it } from "vitest";
import { RUN_TIME_NAME, type NotQuery, type QueryRow } from "../panel/queryRegister";
import { arrayConstant, compareQueries, compareValues, formatQueryComparison, formatWrongValues, isClean, isQueryName, scanQueries, type FoundQuery } from "./queryScan";

const file = (text: string, path = "apps/web/src/a.ts") => ({ path, text });
const one = (text: string) => scanQueries([file(text)]);
const names = (found: readonly FoundQuery[]): string[] => found.map((f) => `${f.name ?? "~"} ${f.access}`);

const row = (name: string, reads: number, builds: number, path = "apps/web/src/a.ts", extra: Partial<QueryRow> = {}): QueryRow => ({
  name,
  kind: "choice",
  holds: { en: "a", fr: "a" },
  places: [{ path, reads, builds }],
  limits: [],
  source: "s",
  recordedOn: "2026-11-21",
  ...extra,
});

describe("scanQueries", () => {
  it("finds a read and a build by the name in quotes", () => {
    expect(names(one('const a = params.get("near"); params.set("q", x);'))).toEqual(["near read", "q build"]);
  });
  it("treats get, getAll and has as reads and set and append as builds", () => {
    const f = one('p.get("a"); p.getAll("b"); p.has("c"); p.set("d", 1); p.append("e", 2);');
    expect(names(f)).toEqual(["a read", "b read", "c read", "d build", "e build"]);
  });
  it("reads single quotes and double quotes alike", () => {
    expect(names(one("p.get('lang'); p.get(\"lang2\");"))).toEqual(["lang read", "lang2 read"]);
  });
  it("finds every receiver that holds a query", () => {
    for (const r of ["params", "query", "search", "searchParams", "qs", "sp", "p", "q", "url.searchParams", "key.searchParams", "this.u.searchParams"]) {
      expect(names(one(`${r}.get("x");`)), r).toEqual(["x read"]);
    }
  });
  it("finds a call on the object made by new URLSearchParams at once", () => {
    expect(names(one("const lang = new URLSearchParams(search.slice(1)).get('lang');"))).toEqual(["lang read"]);
    expect(names(one("new URLSearchParams(f(a, b)).get('x');"))).toEqual(["x read"]);
  });
  it("does not find a call on a map, a header list or a settings object", () => {
    expect(one('headers.get("content-type"); map.get("a"); settings.get("b"); directives.get("script-src");')).toEqual([]);
  });
  it("does not find a receiver that only ends the same way", () => {
    expect(one('myp.get("a"); xq.get("b"); subquery.get("c");')).toEqual([]);
  });
  it("finds a name built at run time as null", () => {
    const f = one("p.set(k, v); p.get(`stale_${kind}`); p.set(id, 1);");
    expect(names(f)).toEqual(["~ build", "~ read"]);
    expect(f.find((x) => x.access === "build")?.lines).toEqual([1, 1]);
  });
  it("counts each place and gives its line", () => {
    const f = one('\np.get("a");\n\np.get("a");');
    expect(f).toEqual([{ name: "a", access: "read", path: "apps/web/src/a.ts", lines: [2, 4] }]);
  });
  it("keeps a read and a build of one name apart", () => {
    expect(names(one('p.get("a"); p.set("a", 1);'))).toEqual(["a build", "a read"]);
  });
  it("skips a comment line", () => {
    expect(one('// p.get("a")\n * p.set("b", 1)\n/* p.get("c") */')).toEqual([]);
  });
  it("skips tests, test helpers, declaration files, the audit folder and narrow sample files", () => {
    for (const path of ["apps/web/src/a.test.ts", "apps/web/src/a.test-util.ts", "apps/web/src/a.d.ts", "apps/web/src/privacy/audit/x.ts", "apps/web/src/narrow/x.ts", "apps/web/src/e2e/x.ts", "apps/web/src/readme.md"]) {
      expect(scanQueries([file('p.get("a")', path)]), path).toEqual([]);
    }
  });
  it("skips a name that cannot be a query name", () => {
    expect(one('p.get("a b"); p.get("1x"); p.get(""); p.get("' + "x".repeat(70) + '");')).toEqual([]);
  });
  it("orders by path, then name, then access", () => {
    const f = scanQueries([file('p.get("z");', "apps/web/src/b.ts"), file('p.get("y"); p.set("y", 1);', "apps/web/src/a.ts"), file('p.get("a");', "apps/web/src/b.ts")]);
    expect(f.map((x) => `${x.path.slice(-4)} ${x.name} ${x.access}`)).toEqual(["a.ts y build", "a.ts y read", "b.ts a read", "b.ts z read"]);
  });
  it("finds nothing in an empty file or one with no calls", () => {
    expect(one("")).toEqual([]);
    expect(one("export const x = 1;\n")).toEqual([]);
  });
});

describe("isQueryName", () => {
  it("accepts letters, digits, underscore, dot and hyphen after a letter or underscore", () => {
    for (const n of ["q", "near", "stale_places", "a.b", "a-b", "_x", "__sha256", "A1"]) expect(isQueryName(n), n).toBe(true);
  });
  it("refuses the rest", () => {
    for (const n of ["", "1a", "a b", "a&b", "a=b", "é", "x".repeat(65), "-a"]) expect(isQueryName(n), n).toBe(false);
  });
});

describe("compareQueries", () => {
  const found = (text: string, path = "apps/web/src/a.ts") => scanQueries([file(text, path)]);
  it("is clean when rows and source agree", () => {
    const c = compareQueries(found('p.get("a"); p.set("a", 1);'), [row("a", 1, 1)]);
    expect(isClean(c)).toBe(true);
    expect(formatQueryComparison(c)).toBe("");
  });
  it("is clean for nothing against nothing", () => {
    expect(isClean(compareQueries([], []))).toBe(true);
  });
  it("lists a name found and in no row", () => {
    const c = compareQueries(found('\np.get("near");'), []);
    expect(c.unlisted).toHaveLength(1);
    expect(formatQueryComparison(c)).toBe('apps/web/src/a.ts:2: the App reads "near" (1 place) and no row lists it');
  });
  it("says builds for a name put into a link, and counts places", () => {
    expect(formatQueryComparison(compareQueries(found('p.set("a", 1); p.set("a", 2);'), []))).toBe('apps/web/src/a.ts:1: the App builds "a" (2 places) and no row lists it');
  });
  it("lists a row whose place is not found", () => {
    const c = compareQueries([], [row("a", 1, 0)]);
    expect(c.gone).toEqual([{ name: "a", path: "apps/web/src/a.ts", access: "read" }]);
    expect(formatQueryComparison(c)).toBe('apps/web/src/a.ts: the row for "a" says it reads it, and the scan finds no such place');
  });
  it("lists a row that says builds when the source only reads", () => {
    const c = compareQueries(found('p.get("a");'), [row("a", 1, 1)]);
    expect(c.gone).toEqual([{ name: "a", path: "apps/web/src/a.ts", access: "build" }]);
  });
  it("lists a count that is wrong, in the singular and the plural", () => {
    const two = compareQueries(found('p.get("a"); p.get("a");'), [row("a", 1, 0)]);
    expect(formatQueryComparison(two)).toBe('apps/web/src/a.ts: the row for "a" says 1 place reads it but 2 found');
    const one1 = compareQueries(found('p.get("a");'), [row("a", 3, 0)]);
    expect(formatQueryComparison(one1)).toContain("says 3 places reads it but 1 found");
  });
  it("matches a run-time row to a name built at run time in the same file", () => {
    const c = compareQueries(found("p.set(k, 1);"), [row(RUN_TIME_NAME, 0, 1)]);
    expect(isClean(c)).toBe(true);
  });
  it("lists a run-time place in no row", () => {
    const c = compareQueries(found("p.set(k, 1);"), []);
    expect(formatQueryComparison(c)).toContain(`the App builds ${RUN_TIME_NAME} (1 place)`);
  });
  it("does not match a name in one file to a row for another file", () => {
    const c = compareQueries(found('p.get("a");', "apps/web/src/b.ts"), [row("a", 1, 0, "apps/web/src/a.ts")]);
    expect(c.unlisted).toHaveLength(1);
    expect(c.gone).toHaveLength(1);
  });
  it("leaves out a name the not-a-query list gives a reason for, in that file only", () => {
    const not: NotQuery[] = [{ path: "apps/web/src/a.ts", name: "tmp", why: "x" }];
    expect(isClean(compareQueries(found('p.set("tmp", 1);'), [], not))).toBe(true);
    expect(isClean(compareQueries(found('p.set("tmp", 1);', "apps/web/src/b.ts"), [], not))).toBe(false);
    expect(isClean(compareQueries(found('p.set("other", 1);'), [], not))).toBe(false);
  });
  it("gives one line for each difference", () => {
    const c = compareQueries(found('p.get("a"); p.get("b"); p.get("b");'), [row("b", 1, 0), row("c", 1, 0)]);
    expect(formatQueryComparison(c).split("\n")).toHaveLength(3);
  });
});

describe("arrayConstant", () => {
  const f = (text: string) => [file(text)];
  it("reads a list of strings, with either kind of quote and a type", () => {
    expect(arrayConstant(f("export const IDS: readonly Id[] = [\"a\", 'b'];"), "apps/web/src/a.ts", "IDS")).toEqual(["a", "b"]);
  });
  it("reads a list that ends with as const", () => {
    expect(arrayConstant(f("export const KINDS = ['x', 'y', 'z'] as const;"), "apps/web/src/a.ts", "KINDS")).toEqual(["x", "y", "z"]);
  });
  it("reads an empty list", () => {
    expect(arrayConstant(f("const E = [];"), "apps/web/src/a.ts", "E")).toEqual([]);
  });
  it("is null for a file or a name that is not there, and for a list that is not plain strings", () => {
    expect(arrayConstant(f("const A = ['a'];"), "apps/web/src/zz.ts", "A")).toBeNull();
    expect(arrayConstant(f("const A = ['a'];"), "apps/web/src/a.ts", "B")).toBeNull();
    expect(arrayConstant(f("const A = ['a', b];"), "apps/web/src/a.ts", "A")).toBeNull();
    expect(arrayConstant(f("const A = 5;"), "apps/web/src/a.ts", "A")).toBeNull();
  });
  it("does not read a longer name that starts the same", () => {
    expect(arrayConstant(f("const IDS_MORE = ['a'];"), "apps/web/src/a.ts", "IDS")).toBeNull();
  });
});

describe("compareValues", () => {
  const limited = (max: number): QueryRow => row("q", 1, 0, "apps/web/src/a.ts", { limits: [{ max, appliesTo: "apps/web/src/a.ts", from: { path: "apps/web/src/a.ts", name: "MAX_QUERY_LENGTH" } }] });
  const listed = (list: string[]): QueryRow => row(RUN_TIME_NAME, 0, 1, "apps/web/src/a.ts", { names: { names: list, from: { path: "apps/web/src/a.ts", name: "IDS" } } });
  it("is empty when the numbers and lists agree", () => {
    expect(compareValues([file("export const MAX_QUERY_LENGTH = 100;\nconst IDS = ['a', 'b'];")], [limited(100), listed(["a", "b"])])).toEqual([]);
  });
  it("names a limit that has changed", () => {
    const w = compareValues([file("export const MAX_QUERY_LENGTH = 120;")], [limited(100)]);
    expect(w).toEqual([{ name: "q", what: "apps/web/src/a.ts MAX_QUERY_LENGTH", listed: "100", found: "120" }]);
    expect(formatWrongValues(w)).toBe('apps/web/src/a.ts MAX_QUERY_LENGTH: the row for "q" says 100 but the source has 120');
  });
  it("names a limit that cannot be read", () => {
    expect(compareValues([file("export const OTHER = 1;")], [limited(100)])[0]?.found).toBe("not a number");
  });
  it("names a list that has changed, in order and in content", () => {
    expect(compareValues([file("const IDS = ['a', 'c'];")], [listed(["a", "b"])])[0]).toMatchObject({ listed: "a,b", found: "a,c" });
    expect(compareValues([file("const IDS = ['b', 'a'];")], [listed(["a", "b"])])).toHaveLength(1);
  });
  it("names a list that cannot be read", () => {
    expect(compareValues([file("const IDS = make();")], [listed(["a"])])[0]?.found).toBe("not a list");
  });
});
