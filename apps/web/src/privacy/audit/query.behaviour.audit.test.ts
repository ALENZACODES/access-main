// CI audit: the register says which names the App builds into a link, which it reads, and how long a value it
// reads. Here the App's own functions build the query strings and read them back, so a change that adds a name,
// stops reading one or changes a limit fails here and not only in the register.

import { describe, expect, it } from "vitest";
import { BATCH_SIZES } from "../../data-status/reviewBatches";
import { COLUMN_IDS, columnParams } from "../../data-status/columns";
import { DATASET_KINDS, DEFAULT_STALE_DAYS } from "../../data-status/freshnessPolicy";
import { FILTER_AGES, FILTER_KINDS, FILTER_STATES, FILTER_TIERS, MAX_QUERY_LENGTH as DS_MAX_QUERY, parseFilters, serializeFilters, type Filters } from "../../data-status/filters";
import { PAGE_SIZES, pagingParams } from "../../data-status/paging";
import { pivotParams } from "../../data-status/pivot";
import { batchParams } from "../../data-status/reviewBatches";
import { sortParams } from "../../data-status/sorting";
import { layoutParams } from "../../data-status/tableView";
import { parseThresholds, serializeViewState } from "../../data-status/thresholds";
import { FEATURE_IDS } from "../../states/dataStatus";
import { nearFromQuery } from "../../states/geo";
import { EMPTY_FACETS, FACET_IDS, MAX_SOURCE_LENGTH, UNKNOWN_FACET, decodeFacets, encodeFacets, selectFacet } from "../../states/packFacets";
import { MAX_QUERY_LENGTH, decodeFilter, encodeFilter } from "../../states/urlState";
import { QUERY_REGISTER, RUN_TIME_NAME, isBuilt, namesOf, rowForName } from "../panel/queryRegister";

const URL_STATE = "apps/web/src/states/urlState.ts";
const FILTERS = "apps/web/src/data-status/filters.ts";
const FACETS = "apps/web/src/states/packFacets.ts";

const keys = (qs: string): string[] => [...new Set(new URLSearchParams(qs.replace(/^\?/, "")).keys())].sort();
const rowOf = (name: string) => rowForName(QUERY_REGISTER, name);

/** Every name must have a row, and the row must say the App builds it into a link. */
function expectBuiltAndListed(names: readonly string[], where: string): void {
  for (const n of names) {
    const row = rowOf(n);
    expect(row, `${where}: ${n} has no row`).not.toBeNull();
    expect(isBuilt(QUERY_REGISTER, row!), `${where}: ${n} is built but its row says it is only read`).toBe(true);
  }
}

describe("the search and filter address of the places pages", () => {
  const full = { required: [...FEATURE_IDS], includeUnknown: true, query: "library" };
  it("builds exactly the names the register says urlState.ts builds", () => {
    const built = keys(encodeFilter(full));
    expect(built).toEqual(["need", "q", "unk"]);
    for (const n of built) expect(rowOf(n)?.places.find((p) => p.path === URL_STATE)?.builds, n).toBeGreaterThan(0);
  });
  it("builds nothing for the empty filter, so a plain page has a plain address", () => {
    expect(encodeFilter({ required: [], includeUnknown: false, query: "" })).toBe("");
  });
  it("cuts typed words to the number the register lists", () => {
    const row = rowOf("q")!;
    const limit = row.limits.find((l) => l.appliesTo === URL_STATE)!.max;
    expect(limit).toBe(MAX_QUERY_LENGTH);
    expect(decodeFilter(`q=${"x".repeat(limit * 3)}`).query).toHaveLength(limit);
    expect(new URLSearchParams(encodeFilter({ required: [], includeUnknown: false, query: "y".repeat(limit * 3) })).get("q")).toHaveLength(limit);
  });
  it("drops a feature name it does not know, as the register's long-value claim assumes", () => {
    expect(decodeFilter("need=bogus").required).toEqual([]);
    expect(decodeFilter(`need=${FEATURE_IDS[0]},bogus`).required).toEqual([FEATURE_IDS[0]]);
  });
  it("strips control characters from typed words", () => {
    expect(decodeFilter("q=a%00b%1fc").query).toBe("abc");
  });
  it("reads every name it builds", () => {
    const back = decodeFilter(encodeFilter(full));
    expect(back.required).toEqual(full.required);
    expect(back.includeUnknown).toBe(true);
    expect(back.query).toBe("library");
  });
});

describe("the place on the map", () => {
  it("is read from near, or from lat and lon, and the register says nothing builds them", () => {
    for (const n of ["near", "lat", "lon"]) expect(rowOf(n)?.places.every((p) => p.builds === 0), n).toBe(true);
    expect(nearFromQuery(new URLSearchParams("near=43.65,-79.38")).near).toEqual({ lat: 43.65, lon: -79.38 });
    expect(nearFromQuery(new URLSearchParams("lat=43.65&lon=-79.38")).near).toEqual({ lat: 43.65, lon: -79.38 });
  });
  it("is not built back into a link by the function that reads it", () => {
    const q = new URLSearchParams("near=43.65,-79.38");
    nearFromQuery(q);
    expect(q.toString()).toBe("near=43.65%2C-79.38");
  });
  it("refuses a place outside the earth and says so, so a bad link does not move the map", () => {
    expect(nearFromQuery(new URLSearchParams("near=91,0"))).toMatchObject({ near: null, error: true });
    expect(nearFromQuery(new URLSearchParams("lat=1&lon=181"))).toMatchObject({ near: null, error: true });
  });
  it("reads at most 20 characters of each of lat and lon", () => {
    const r = nearFromQuery(new URLSearchParams(`lat=${"1".repeat(50)}&lon=2`));
    expect(r.input.lat.length).toBeLessThanOrEqual(20);
  });
  it("lists the three names as holding a place on the map", () => {
    for (const n of ["near", "lat", "lon"]) expect(rowOf(n)?.kind).toBe("place");
  });
});

describe("the facets of the offline pack list", () => {
  it("builds only names the run-time row lists, and the register lists the same facets as the source", () => {
    const row = QUERY_REGISTER.find((r) => r.places.some((p) => p.path === FACETS))!;
    expect(row.name).toBe(RUN_TIME_NAME);
    expect(namesOf(row)).toEqual([...FACET_IDS]);
    const sel = { source: "A source", licence: "ODbL-1.0" as const, tier: "0" as const, age: UNKNOWN_FACET };
    const built = keys(encodeFacets(sel));
    expect(built).toEqual([...FACET_IDS].sort());
    expectBuiltAndListed(built, "encodeFacets");
  });
  it("cuts a source name at the number the register lists", () => {
    const limit = rowOf("source")?.limits[0]?.max ?? QUERY_REGISTER.find((r) => r.places.some((p) => p.path === FACETS))!.limits[0]!.max;
    expect(limit).toBe(MAX_SOURCE_LENGTH);
    expect(selectFacet(EMPTY_FACETS, "source", "x".repeat(limit)).source).toBe("x".repeat(limit));
    expect(selectFacet(EMPTY_FACETS, "source", "x".repeat(limit + 1)).source).toBeNull();
  });
  it("reads nothing but the listed facets", () => {
    expect(decodeFacets("email=a&source=Maple")).toEqual({ ...EMPTY_FACETS, source: "Maple" });
  });
});

describe("the filters of the data page", () => {
  const all: Filters = {
    state: FILTER_STATES[0]!,
    kind: FILTER_KINDS[0]!,
    query: "roads",
    onlyIssues: true,
    tier: FILTER_TIERS[0]!,
    licence: "open",
    dataset: "d1",
    gap: "source",
    age: FILTER_AGES[0]!,
    due: "d7",
  };
  it("builds exactly the names the register says filters.ts builds", () => {
    const built = keys(serializeFilters(all));
    expect(built).toEqual(["age", "ds", "due", "gap", "issues", "kind", "lic", "q", "state", "tier"]);
    for (const n of built) expect(rowOf(n)?.places.find((p) => p.path === FILTERS)?.builds, n).toBe(1);
  });
  it("reads every name it builds", () => {
    expect(parseFilters(serializeFilters(all))).toEqual(all);
  });
  it("cuts typed words at the number the register lists", () => {
    const limit = rowOf("q")!.limits.find((l) => l.appliesTo === FILTERS)!.max;
    expect(limit).toBe(DS_MAX_QUERY);
    expect(parseFilters(`?q=${"x".repeat(limit * 4)}`).query).toHaveLength(limit);
  });
  it("builds nothing for no filters", () => {
    expect(serializeFilters({ state: "any", kind: "any", query: "", onlyIssues: false })).toBe("");
  });
});

describe("the layout of the data page", () => {
  const spec = {
    group: "tier" as const,
    details: true as const,
    columns: [...COLUMN_IDS],
    pivot: { rows: "state" as const, cols: "kind" as const },
    batch: BATCH_SIZES[0],
  };
  const names = (pairs: Array<[string, string]>): string[] => pairs.map(([k]) => k);
  it("builds only names that have their own row, and the run-time row lists every one", () => {
    const row = QUERY_REGISTER.find((r) => r.places.some((p) => p.path === "apps/web/src/data-status/panel.ts" && p.builds > 0 && r.name === RUN_TIME_NAME))!;
    const built = [
      ...names(sortParams({ key: "retrieved", dir: "desc" })),
      ...names(pagingParams({ page: 2, size: PAGE_SIZES[0] }, true)),
      ...names(layoutParams(spec)),
    ];
    expect([...new Set(built)].sort()).toEqual([...namesOf(row)].sort());
  });
  it("is complete: each helper adds the names the register expects", () => {
    expect(names(sortParams({ key: "source", dir: "asc" }))).toEqual(["sort"]);
    expect(names(sortParams({ key: "source", dir: "desc" }))).toEqual(["sort", "dir"]);
    expect(names(sortParams(null))).toEqual([]);
    expect(names(columnParams([...COLUMN_IDS]))).toEqual(["cols"]);
    expect(names(pivotParams({ rows: "state", cols: "kind" }))).toEqual(["pv", "pvby"]);
    expect(names(pivotParams({ rows: "state", cols: null }))).toEqual(["pv"]);
    expect(names(batchParams(BATCH_SIZES[1]))).toEqual(["batch"]);
    expect(names(pagingParams({ page: 3, size: PAGE_SIZES[0] }))).toEqual(["size", "page"]);
    expect(names(layoutParams({}))).toEqual([]);
  });
  it("says each of those names is built, though only read in the file that reads it", () => {
    for (const n of ["sort", "dir", "cols", "pv", "pvby", "batch", "size", "page", "details"]) {
      const row = rowOf(n)!;
      expect(row.places.every((p) => p.builds === 0), n).toBe(true);
      expect(isBuilt(QUERY_REGISTER, row), n).toBe(true);
    }
  });
});

describe("the thresholds of the data page", () => {
  const view = { filters: { state: "any" as const, kind: "any" as const, query: "", onlyIssues: false }, thresholds: Object.fromEntries(DATASET_KINDS.map((k) => [k, DEFAULT_STALE_DAYS[k] + 1])) };
  it("builds one name for each kind, and every one is listed by the run-time row", () => {
    const built = keys(serializeViewState(view));
    expect(built).toEqual(DATASET_KINDS.map((k) => `stale_${k}`).sort());
    expectBuiltAndListed(built, "serializeViewState");
    for (const n of built) expect(rowOf(n)?.name).toBe(RUN_TIME_NAME);
  });
  it("reads every name it builds", () => {
    expect(parseThresholds(serializeViewState(view))).toEqual(view.thresholds);
  });
  it("builds nothing for the defaults", () => {
    expect(serializeViewState({ filters: view.filters, thresholds: { ...DEFAULT_STALE_DAYS } })).toBe("");
  });
});

describe("the register as a whole", () => {
  it("lists as put into links every name the App's functions build above", () => {
    const all = new Set<string>();
    for (const n of keys(encodeFilter({ required: [...FEATURE_IDS], includeUnknown: true, query: "a" }))) all.add(n);
    for (const n of keys(encodeFacets({ source: "a", licence: "CC0-1.0" as const, tier: "0" as const, age: UNKNOWN_FACET }))) all.add(n);
    expectBuiltAndListed([...all], "all");
  });
  it("has no name that is listed as personal and is not read or built anywhere", () => {
    for (const r of QUERY_REGISTER.filter((x) => x.kind === "place" || x.kind === "typed" || x.kind === "ids")) expect(r.places.length, r.name).toBeGreaterThan(0);
  });
  it("lists typed words as the only personal name that is put into a link", () => {
    const personalBuilt = QUERY_REGISTER.filter((r) => ["place", "typed", "ids"].includes(r.kind) && isBuilt(QUERY_REGISTER, r)).map((r) => r.name);
    expect(personalBuilt).toEqual(["q"]);
  });
});
