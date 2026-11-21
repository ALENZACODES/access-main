// CI audit: every name the App reads from, or builds into, the part of a web address after the question mark has a
// row in queryRegister.ts, and every row is still true. A new filter, a new place on a link or a new search box
// that puts a value into the address fails here, so what a shared or bookmarked link can carry is always a
// visible decision.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NOT_QUERY, PERSONAL_KINDS, QUERY_REGISTER, RUN_TIME_NAME, queryCounts, validateQueries } from "../panel/queryRegister";
import { compareQueries, compareValues, formatQueryComparison, formatWrongValues, isClean, scanQueries } from "./queryScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("web address names in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const found = scanQueries(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(files.map((f) => f.path)).toContain("apps/web/src/states/urlState.ts");
    expect(found.map((f) => f.name)).toEqual(expect.arrayContaining(["near", "need", "q", null]));
    expect(found.length).toBeGreaterThan(40);
  });

  it("matches the register in both directions", () => {
    const c = compareQueries(found, QUERY_REGISTER);
    expect(isClean(c), `\n${formatQueryComparison(c)}\n`).toBe(true);
  });

  it("has a well-formed register", () => {
    expect(validateQueries(QUERY_REGISTER)).toEqual([]);
  });

  it("has limits and name lists that are the numbers and lists in the source", () => {
    const w = compareValues(files, QUERY_REGISTER);
    expect(w, `\n${formatWrongValues(w)}\n`).toEqual([]);
  });

  it("names a file that exists for every row and every limit", () => {
    const paths = new Set(files.map((f) => f.path));
    for (const r of QUERY_REGISTER) for (const p of r.places) expect(paths.has(p.path), p.path).toBe(true);
    for (const n of NOT_QUERY) expect(paths.has(n.path), n.path).toBe(true);
  });

  it("leaves out only the names the not-a-query list gives a reason for", () => {
    const listed = new Set(QUERY_REGISTER.flatMap((r) => r.places.map((p) => `${p.path} ${r.name}`)));
    const left = found.filter((f) => f.name !== null && !listed.has(`${f.path} ${f.name}`)).map((f) => `${f.path} ${f.name}`);
    expect(left.sort()).toEqual(NOT_QUERY.map((n) => `${n.path} ${n.name}`).sort());
  });

  it("lists a place on the map and typed words as personal", () => {
    expect(PERSONAL_KINDS.has("place") && PERSONAL_KINDS.has("typed")).toBe(true);
    const personal = QUERY_REGISTER.filter((r) => PERSONAL_KINDS.has(r.kind)).map((r) => r.name);
    expect(personal).toEqual(["near", "lat", "lon", "q", "ids", "place"]);
  });

  it("counts what the register lists", () => {
    expect(queryCounts(QUERY_REGISTER)).toEqual({ names: 29, runTime: 3, places: 56, files: 16, built: 22, personal: 6, personalBuilt: 1 });
  });

  describe("fails when the source and the register disagree", () => {
    const rows = QUERY_REGISTER;
    it("for a name added in a new file", () => {
      const extra = [...files, { path: "apps/web/src/new/Share.ts", text: 'export const read = (params: URLSearchParams) => params.get("email");\n' }];
      const c = compareQueries(scanQueries(extra), rows);
      expect(c.unlisted.map((u) => `${u.name} ${u.path}`)).toEqual(["email apps/web/src/new/Share.ts"]);
      expect(formatQueryComparison(c)).toContain('apps/web/src/new/Share.ts:1: the App reads "email" (1 place) and no row lists it');
    });
    it("for a name that is now put into links", () => {
      const geo = files.find((f) => f.path === "apps/web/src/states/geo.ts")!;
      const mutated = files.map((f) => (f === geo ? { ...f, text: `${f.text}\nexport const link = (p: URLSearchParams) => p.set("near", "1,2");\n` } : f));
      const c = compareQueries(scanQueries(mutated), rows);
      expect(c.unlisted.map((u) => `${u.name} ${u.access}`)).toEqual(["near build"]);
    });
    it("for a second place in a listed file", () => {
      const url = files.find((f) => f.path === "apps/web/src/states/urlState.ts")!;
      const mutated = files.map((f) => (f === url ? { ...f, text: `${f.text}\nexport const again = (q: URLSearchParams) => q.get("need");\n` } : f));
      const c = compareQueries(scanQueries(mutated), rows);
      expect(c.wrongCount).toEqual([{ name: "need", path: "apps/web/src/states/urlState.ts", access: "read", listed: 1, found: 2 }]);
    });
    it("for a name taken out of a listed file", () => {
      const geo = files.find((f) => f.path === "apps/web/src/states/geo.ts")!;
      const mutated = files.map((f) => (f === geo ? { ...f, text: f.text.replace('q.get("near")', 'q.get("nearby")') } : f));
      const c = compareQueries(scanQueries(mutated), rows);
      expect(c.gone).toEqual([{ name: "near", path: "apps/web/src/states/geo.ts", access: "read" }]);
      expect(c.unlisted.map((u) => u.name)).toEqual(["nearby"]);
    });
    it("for a name built at run time in a new file", () => {
      const extra = [...files, { path: "apps/web/src/new/Dyn.ts", text: "export const put = (p: URLSearchParams, k: string) => p.set(k, 'x');\n" }];
      const c = compareQueries(scanQueries(extra), rows);
      expect(c.unlisted.map((u) => u.name)).toEqual([null]);
      expect(formatQueryComparison(c)).toContain(`the App builds ${RUN_TIME_NAME} (1 place)`);
    });
    it("for a limit that is no longer the number in the source", () => {
      const url = files.find((f) => f.path === "apps/web/src/states/urlState.ts")!;
      const mutated = files.map((f) => (f === url ? { ...f, text: f.text.replace("MAX_QUERY_LENGTH = 100", "MAX_QUERY_LENGTH = 400") } : f));
      expect(compareValues(mutated, rows)).toEqual([{ name: "q", what: "apps/web/src/states/urlState.ts MAX_QUERY_LENGTH", listed: "100", found: "400" }]);
    });
    it("for a list of names that has changed", () => {
      const pf = files.find((f) => f.path === "apps/web/src/states/packFacets.ts")!;
      const mutated = files.map((f) => (f === pf ? { ...f, text: f.text.replace('["source", "licence", "tier", "age"]', '["source", "licence", "tier", "age", "email"]') } : f));
      expect(compareValues(mutated, rows).map((w) => w.found)).toEqual(["source,licence,tier,age,email"]);
    });
  });
});
