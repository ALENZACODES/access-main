import { describe, expect, it } from "vitest";
import { buildKindRows } from "./packCategories";
import { applyFacets, selectFacet, EMPTY_FACETS } from "./packFacets";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { EMPTY_PACK_QUERY, packPlacesView, type PackQuery } from "./packPlacesView";

const TODAY = "2026-11-19";
const OSM = "OpenStreetMap, Geofabrik Ontario extract";
const raw = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Place ${id}`,
  category: "cafe",
  wheelchair: "yes",
  lat: 43.65,
  lon: -79.38,
  provenance: { source_name: OSM, licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 },
  ...over,
});
const places: PackPlaceRecord[] = [...parsePackPlaces([
  raw("a", { category: "bar", wheelchair: "yes" }),
  raw("b", { category: "Bar", wheelchair: "no" }),
  raw("c", { category: "cafe", wheelchair: "yes", name: "Corner Cafe" }),
  raw("d", { category: null, wheelchair: "limited" }),
  raw("e", { category: "pharmacy", wheelchair: "" }),
]).places];
const run = (query: Partial<PackQuery>, locale: "en" | "fr" = "en") =>
  packPlacesView(places, 0, { ...EMPTY_PACK_QUERY, ...query }, { locale, today: TODAY });
const ids = (view: ReturnType<typeof run>) => (view.kind === "list" ? view.cards.map((c) => c.id) : []);

describe("packPlacesView kind filter", () => {
  it("shows every place when no kind is chosen", () => {
    expect(ids(run({})).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids(run({ kind: null })).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("shows only the places of the chosen kind, whatever their case", () => {
    expect(ids(run({ kind: "bar" })).sort()).toEqual(["a", "b"]);
  });
  it("shows places with no kind through the UNKNOWN key", () => {
    expect(ids(run({ kind: "unknown" }))).toEqual(["d"]);
  });
  it("announces the count of the kind, not of the whole pack", () => {
    const view = run({ kind: "bar" });
    expect(view.announcement).toBe("2 places shown.");
    expect(view.count).toBe(2);
  });
  it("combines with the tag filter", () => {
    expect(ids(run({ kind: "bar", tag: "yes" }))).toEqual(["a"]);
    expect(ids(run({ kind: "bar", tag: "limited" }))).toEqual([]);
  });
  it("combines with the text search", () => {
    expect(ids(run({ kind: "cafe", text: "corner" }))).toEqual(["c"]);
    expect(ids(run({ kind: "bar", text: "corner" }))).toEqual([]);
  });
  it("combines with a facet", () => {
    const facets = selectFacet(EMPTY_FACETS, "tier", "0");
    expect(ids(run({ kind: "bar", facets })).sort()).toEqual(["a", "b"]);
    expect(ids(run({ kind: "bar", facets: selectFacet(EMPTY_FACETS, "tier", "1") }))).toEqual([]);
  });
  it("gives the empty view when the kind matches nothing, and keeps the tag options", () => {
    const view = run({ kind: "museum" });
    expect(view.kind).toBe("empty");
    expect(view.tagOptions.length).toBeGreaterThan(0);
  });
  it("counts the table from the places before the kind filter, so the other kinds stay on the page", () => {
    const view = run({ kind: "bar" });
    expect(view.beforeKind.map((p) => p.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(buildKindRows(view.beforeKind, TODAY).map((r) => r.key)).toEqual(["bar", "cafe", "pharmacy", "unknown"]);
  });
  it("narrows the table by the text, tag and facet filters but not by the kind", () => {
    const view = run({ kind: "bar", tag: "yes" });
    expect(view.beforeKind.map((p) => p.id).sort()).toEqual(["a", "c"]);
    const withFacet = run({ facets: selectFacet(EMPTY_FACETS, "tier", "0"), kind: "cafe" });
    expect(withFacet.beforeKind).toEqual(applyFacets(places, selectFacet(EMPTY_FACETS, "tier", "0"), TODAY));
  });
  it("does not hide places with UNKNOWN tags when the kind is chosen and the tag filter is any", () => {
    expect(ids(run({ kind: "pharmacy" }))).toEqual(["e"]);
    expect(run({ kind: "pharmacy" }).unknownHiddenNotice).toBeNull();
  });
  it("still says how many UNKNOWN-tag places a tag filter hides, counted before the kind filter", () => {
    const view = run({ tag: "yes", kind: "bar" });
    expect(view.unknownHiddenNotice).toContain("1");
  });
  it("gives the same order for the same kind on every run", () => {
    expect(ids(run({ kind: "bar" }))).toEqual(ids(run({ kind: "bar" })));
    expect(ids(run({ kind: "bar" }))).toEqual(["a", "b"]);
  });
  it("sorts a kind by distance when a point is given", () => {
    const view = run({ kind: "bar", near: { status: "ok", point: { lat: 43.65, lon: -79.38 } } });
    expect(view.kind === "list" && view.cards.every((c) => c.distanceText !== null)).toBe(true);
  });
  it("does not change the other fields of the view", () => {
    const base = run({});
    const kind = run({ kind: "bar" });
    expect(kind.tagOptions).toEqual(base.tagOptions);
    expect(kind.minTargetPx).toBe(base.minTargetPx);
  });
  it("works in French", () => {
    expect(run({ kind: "bar" }, "fr").announcement).toBe("2 lieux affichés.");
  });
  it("treats an unknown key as no match rather than as every place", () => {
    expect(ids(run({ kind: "" }))).toEqual([]);
  });
});
