import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import {
  EMPTY_FACETS,
  FACET_IDS,
  MAX_SOURCE_LENGTH,
  UNKNOWN_FACET,
  activeFacetCount,
  applyFacets,
  decodeFacets,
  encodeFacets,
  facetGroups,
  facetLabel,
  facetOptions,
  facetSummary,
  facetValueLabel,
  facetValueOf,
  matchesFacets,
  selectFacet,
  type FacetSelection,
} from "./packFacets";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { OPEN_LICENCES } from "./provenance";

const TODAY = "2026-11-19";
const OSM = "OpenStreetMap, Geofabrik Ontario extract";
const dayOffset = (days: number): string => new Date(Date.UTC(2026, 10, 19) - days * 86_400_000).toISOString().slice(0, 10);
const raw = (id: string, over: Record<string, unknown> = {}, prov: Record<string, unknown> | null = {}) => ({
  id,
  name: `Place ${id}`,
  wheelchair: "yes",
  lat: 43.65,
  lon: -79.38,
  provenance: prov === null ? null : { source_name: OSM, licence: "ODbL-1.0", retrieved_at: dayOffset(5), tier: 0, ...prov },
  ...over,
});
const parse = (items: unknown[]): PackPlaceRecord[] => [...parsePackPlaces(items).places];

const places = parse([
  raw("a"),
  raw("b", {}, { tier: 1 }),
  raw("c", {}, { tier: "E", retrieved_at: dayOffset(60) }),
  raw("d", {}, { source_name: "Open Data Toronto", licence: "OGL-Ontario-1.0", retrieved_at: dayOffset(200), tier: 0 }),
  raw("e", {}, { source_name: "Open Data Toronto", licence: "OGL-Ontario-1.0", retrieved_at: dayOffset(500), tier: undefined }),
  raw("f", { wheelchair: "UNKNOWN" }, null),
]);
const sel = (over: Partial<FacetSelection>): FacetSelection => ({ ...EMPTY_FACETS, ...over });
const ids = (list: readonly PackPlaceRecord[]) => list.map((p) => p.id);

describe("facetValueOf", () => {
  it("reads each facet of a sourced record", () => {
    const a = places[0]!;
    expect(facetValueOf(a, "source", TODAY)).toBe(OSM);
    expect(facetValueOf(a, "licence", TODAY)).toBe("ODbL-1.0");
    expect(facetValueOf(a, "tier", TODAY)).toBe("0");
    expect(facetValueOf(a, "age", TODAY)).toBe("within-30");
  });
  it("is UNKNOWN for a record with no usable source, and for a tier that is not stated", () => {
    const f = places.find((p) => p.id === "f")!;
    for (const facet of FACET_IDS) expect(facetValueOf(f, facet, TODAY), facet).toBe(UNKNOWN_FACET);
    expect(facetValueOf(places.find((p) => p.id === "e")!, "tier", TODAY)).toBe(UNKNOWN_FACET);
  });
  it("uses the age bucket edges the freshness view uses", () => {
    const at = (d: number) => facetValueOf(parse([raw("x", {}, { retrieved_at: dayOffset(d) })])[0]!, "age", TODAY);
    expect([at(0), at(30), at(31), at(90), at(91), at(365), at(366), at(-1)]).toEqual(["within-30", "within-30", "within-90", "within-90", "within-year", "within-year", "older", "future"]);
  });
});

describe("applyFacets and matchesFacets", () => {
  it("returns every place, as a copy, when no facet is active", () => {
    const out = applyFacets(places, EMPTY_FACETS, TODAY);
    expect(out).toEqual(places);
    expect(out).not.toBe(places);
  });
  it("filters by one facet at a time", () => {
    expect(ids(applyFacets(places, sel({ licence: "OGL-Ontario-1.0" }), TODAY))).toEqual(["d", "e"]);
    expect(ids(applyFacets(places, sel({ tier: "1" }), TODAY))).toEqual(["b"]);
    expect(ids(applyFacets(places, sel({ age: "within-90" }), TODAY))).toEqual(["c"]);
    expect(ids(applyFacets(places, sel({ source: "Open Data Toronto" }), TODAY))).toEqual(["d", "e"]);
  });
  it("matches a source name regardless of letter case", () => {
    expect(ids(applyFacets(places, sel({ source: "open data toronto" }), TODAY))).toEqual(["d", "e"]);
  });
  it("combines facets with AND", () => {
    expect(ids(applyFacets(places, sel({ licence: "ODbL-1.0", tier: "0" }), TODAY))).toEqual(["a"]);
    expect(ids(applyFacets(places, sel({ licence: "ODbL-1.0", tier: "E", age: "within-30" }), TODAY))).toEqual([]);
  });
  it("reaches records with no source or tier through UNKNOWN, and never through a named value", () => {
    expect(ids(applyFacets(places, sel({ licence: UNKNOWN_FACET }), TODAY))).toEqual(["f"]);
    expect(ids(applyFacets(places, sel({ tier: UNKNOWN_FACET }), TODAY))).toEqual(["e", "f"]);
    expect(ids(applyFacets(places, sel({ age: UNKNOWN_FACET }), TODAY))).toEqual(["f"]);
    for (const named of [sel({ licence: "ODbL-1.0" }), sel({ source: OSM }), sel({ tier: "0" }), sel({ age: "within-30" })]) {
      expect(ids(applyFacets(places, named, TODAY))).not.toContain("f");
    }
  });
  it("can leave one facet out, for counting", () => {
    const s = sel({ licence: "ODbL-1.0", tier: "1" });
    expect(matchesFacets(places[0]!, s, TODAY)).toBe(false);
    expect(matchesFacets(places[0]!, s, TODAY, "tier")).toBe(true);
  });
  it("never changes the order of the places it keeps", () => {
    expect(ids(applyFacets([...places].reverse(), sel({ licence: "ODbL-1.0" }), TODAY))).toEqual(["c", "b", "a"]);
  });
});

describe("facetOptions", () => {
  it("lists Any first with the number of places that pass the other filters", () => {
    const o = facetOptions(places, EMPTY_FACETS, "licence", "en", TODAY);
    expect(o[0]).toEqual({ value: "", label: "Any (6)", count: 6 });
  });
  it("counts each value, sorted by name, with UNKNOWN last", () => {
    const o = facetOptions(places, EMPTY_FACETS, "licence", "en", TODAY);
    expect(o.map((x) => [x.value, x.count])).toEqual([["", 6], ["ODbL-1.0", 3], ["OGL-Ontario-1.0", 2], [UNKNOWN_FACET, 1]]);
    expect(o.map((x) => x.label)).toEqual(["Any (6)", "ODbL 1.0 (3)", "Open Government Licence – Ontario 1.0 (2)", "UNKNOWN (1)"]);
  });
  it("orders tiers and age buckets naturally, not alphabetically", () => {
    const tiers = facetOptions(places, EMPTY_FACETS, "tier", "en", TODAY).map((x) => x.value);
    expect(tiers).toEqual(["", "0", "1", "E", UNKNOWN_FACET]);
    const ages = facetOptions(places, EMPTY_FACETS, "age", "en", TODAY).map((x) => x.value);
    expect(ages).toEqual(["", "within-30", "within-90", "within-year", "older", UNKNOWN_FACET]);
  });
  it("counts an option with every other filter still applied", () => {
    const o = facetOptions(places, sel({ licence: "ODbL-1.0" }), "tier", "en", TODAY);
    expect(o.map((x) => [x.value, x.count])).toEqual([["", 3], ["0", 1], ["1", 1], ["E", 1]]);
  });
  it("does not apply the facet's own selection to its own counts, so a sibling choice stays pickable", () => {
    const o = facetOptions(places, sel({ licence: "ODbL-1.0" }), "licence", "en", TODAY);
    expect(o.find((x) => x.value === "OGL-Ontario-1.0")?.count).toBe(2);
  });
  it("keeps the current choice listed with a zero count when nothing matches it", () => {
    const o = facetOptions(places, sel({ licence: "ODbL-1.0", tier: "E", age: "within-30" }), "tier", "en", TODAY);
    expect(o.find((x) => x.value === "E")).toMatchObject({ count: 0 });
  });
  it("merges source names that differ only in letter case", () => {
    const mixed = parse([raw("a", {}, { source_name: "City Data" }), raw("b", {}, { source_name: "city data" })]);
    const o = facetOptions(mixed, EMPTY_FACETS, "source", "en", TODAY);
    expect(o.map((x) => [x.value, x.count])).toEqual([["", 2], ["City Data", 2]]);
  });
  it("labels in French with French typography and the token UNKNOWN", () => {
    const o = facetOptions(places, EMPTY_FACETS, "tier", "fr", TODAY);
    expect(o.map((x) => x.label)).toEqual(["Toutes (6)", "Niveau 0 (2)", "Niveau 1 (1)", "Niveau E (1)", "UNKNOWN (2)"]);
    expect(facetOptions(places, EMPTY_FACETS, "age", "fr", TODAY)[1]?.label).toBe("il y a 30 jours ou moins (2)");
  });
  it("lists only Any for no places", () => {
    expect(facetOptions([], EMPTY_FACETS, "licence", "en", TODAY)).toEqual([{ value: "", label: "Any (0)", count: 0 }]);
  });
});

describe("facetGroups", () => {
  it("gives one group per facet in a fixed order with its label", () => {
    const g = facetGroups(places, EMPTY_FACETS, "en", TODAY);
    expect(g.map((x) => [x.facet, x.label])).toEqual([["source", "Source"], ["licence", "Licence"], ["tier", "Tier"], ["age", "Retrieved"]]);
    expect(facetGroups(places, EMPTY_FACETS, "fr", TODAY).map((x) => x.label)).toEqual(["Source", "Licence", "Niveau", "Consulté"]);
  });
  it("accounts for every place in each facet: the specific counts add up to the Any count", () => {
    for (const group of facetGroups(places, EMPTY_FACETS, "en", TODAY)) {
      const [any, ...rest] = group.options;
      expect(rest.reduce((n, o) => n + o.count, 0), group.facet).toBe(any!.count);
    }
  });
  it("does the same under an active filter", () => {
    for (const group of facetGroups(places, sel({ tier: "0" }), "en", TODAY)) {
      const [any, ...rest] = group.options;
      if (group.facet === "tier") continue;
      expect(rest.reduce((n, o) => n + o.count, 0), group.facet).toBe(any!.count);
    }
  });
});

describe("facetValueLabel and facetSummary", () => {
  it("words each value", () => {
    expect(facetValueLabel("licence", "CC0-1.0", "en")).toBe(OPEN_LICENCES["CC0-1.0"]);
    expect(facetValueLabel("licence", "not-a-licence", "en")).toBe("not-a-licence");
    expect(facetValueLabel("tier", "E", "fr")).toBe("Niveau E");
    expect(facetValueLabel("age", "older", "en")).toBe("more than 365 days ago");
    expect(facetValueLabel("age", "weird", "en")).toBe("weird");
    expect(facetValueLabel("source", "", "fr")).toBe("Toutes");
    expect(facetLabel("age", "en")).toBe("Retrieved");
  });
  it("is null with no active filter and names the active ones otherwise", () => {
    expect(facetSummary(EMPTY_FACETS, "en")).toBeNull();
    expect(facetSummary(sel({ licence: "ODbL-1.0", tier: "0" }), "en")).toBe("Filtered by Licence: ODbL 1.0; Tier: Tier 0.");
    expect(facetSummary(sel({ tier: UNKNOWN_FACET }), "fr")).toBe("Filtré selon Niveau : UNKNOWN.");
    expect(facetSummary(sel({ licence: "CC0-1.0", age: "future" }), "fr")).toContain("\u202f; Consulté\u00a0:");
  });
  it("passes the copy linter and carries no banned organisation name", () => {
    const all = facetGroups(places, sel({ tier: "0" }), "en", TODAY);
    for (const locale of ["en", "fr"] as const) {
      const lines = [
        ...facetGroups(places, EMPTY_FACETS, locale, TODAY).flatMap((g) => [g.label, ...g.options.map((o) => o.label)]),
        facetSummary(sel({ licence: "ODbL-1.0", tier: UNKNOWN_FACET, age: "older" }), locale) ?? "",
      ];
      for (const line of lines.filter((l) => l !== OSM && !l.startsWith(OSM))) {
        expect(lintCopy(line, locale), `${locale}: ${line}`).toEqual([]);
        expect(containsForbiddenOrg(line)).toBe(false);
      }
    }
    expect(all.length).toBe(4);
  });
});

describe("selectFacet", () => {
  it("sets and clears a facet", () => {
    const s = selectFacet(EMPTY_FACETS, "licence", "ODbL-1.0");
    expect(s.licence).toBe("ODbL-1.0");
    expect(selectFacet(s, "licence", "").licence).toBeNull();
  });
  it("leaves the other facets as they were", () => {
    const s = selectFacet(sel({ tier: "0" }), "age", "older");
    expect(s).toEqual(sel({ tier: "0", age: "older" }));
  });
  it("accepts only values that facet offers and clears anything else", () => {
    expect(selectFacet(EMPTY_FACETS, "licence", "All rights reserved").licence).toBeNull();
    expect(selectFacet(EMPTY_FACETS, "tier", "9").tier).toBeNull();
    expect(selectFacet(EMPTY_FACETS, "tier", "UNKNOWN").tier).toBeNull();
    expect(selectFacet(EMPTY_FACETS, "age", "yesterday").age).toBeNull();
    expect(selectFacet(sel({ tier: "0" }), "tier", "banana").tier).toBeNull();
    for (const v of ["unknown"]) for (const f of ["licence", "tier", "age"] as const) expect(selectFacet(EMPTY_FACETS, f, v)[f]).toBe(UNKNOWN_FACET);
  });
  it("accepts every licence, tier and age value the data can produce", () => {
    for (const id of Object.keys(OPEN_LICENCES)) expect(selectFacet(EMPTY_FACETS, "licence", id).licence).toBe(id);
    for (const tier of ["0", "1", "2", "3", "4", "E"]) expect(selectFacet(EMPTY_FACETS, "tier", tier).tier).toBe(tier);
    for (const age of ["within-30", "within-90", "within-year", "older", "future"]) expect(selectFacet(EMPTY_FACETS, "age", age).age).toBe(age);
  });
  it("rejects a blank or over-long source", () => {
    expect(selectFacet(EMPTY_FACETS, "source", "   ").source).toBeNull();
    expect(selectFacet(EMPTY_FACETS, "source", "x".repeat(MAX_SOURCE_LENGTH + 1)).source).toBeNull();
    expect(selectFacet(EMPTY_FACETS, "source", "x".repeat(MAX_SOURCE_LENGTH)).source).toBe("x".repeat(MAX_SOURCE_LENGTH));
  });
  it("counts active facets", () => {
    expect(activeFacetCount(EMPTY_FACETS)).toBe(0);
    expect(activeFacetCount(sel({ tier: "0", age: "older", licence: UNKNOWN_FACET }))).toBe(3);
  });
});

describe("encodeFacets and decodeFacets", () => {
  it("round-trips every selection of the shipped pack", () => {
    const { places: shipped } = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places);
    for (const group of facetGroups(shipped, EMPTY_FACETS, "en", TODAY)) {
      for (const o of group.options) {
        const s = selectFacet(EMPTY_FACETS, group.facet, o.value);
        expect(decodeFacets(encodeFacets(s)), `${group.facet}=${o.value}`).toEqual(s);
      }
    }
  });
  it("is empty for no selection and in a stable key order", () => {
    expect(encodeFacets(EMPTY_FACETS)).toBe("");
    expect(encodeFacets(sel({ age: "older", licence: "CC0-1.0", source: "A & B" }))).toBe("source=A+%26+B&licence=CC0-1.0&age=older");
  });
  it("keeps a source with special characters intact", () => {
    const s = sel({ source: 'A & B = "C"; ?x' });
    expect(decodeFacets(encodeFacets(s))).toEqual(s);
  });
  it("accepts a leading question mark", () => {
    expect(decodeFacets("?tier=1").tier).toBe("1");
  });
  it("ignores unknown keys, bad values and repeated keys beyond the first", () => {
    expect(decodeFacets("licence=nope&tier=9&age=never&evil=1&__proto__=x")).toEqual(EMPTY_FACETS);
    expect(decodeFacets("tier=1&tier=0").tier).toBe("1");
    expect(decodeFacets("")).toEqual(EMPTY_FACETS);
  });
  it("does not let a crafted query reach an object prototype", () => {
    decodeFacets("__proto__[tier]=0&constructor[prototype][tier]=0");
    expect(({} as Record<string, unknown>).tier).toBeUndefined();
  });
});

describe("the pack shipped in this build", () => {
  const { places: shipped } = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places);
  it("is fully reachable through each facet: the specific choices cover every place exactly once", () => {
    for (const group of facetGroups(shipped, EMPTY_FACETS, "en", TODAY)) {
      const seen = new Set<string>();
      for (const o of group.options.slice(1)) for (const p of applyFacets(shipped, selectFacet(EMPTY_FACETS, group.facet, o.value), TODAY)) seen.add(p.id);
      expect(seen.size, group.facet).toBe(shipped.length);
    }
  });
});
