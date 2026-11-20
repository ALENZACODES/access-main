import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { CHANGE_FIELDS, DEFAULT_MOVED_METRES, changesFor, diffPacks, isUnchanged } from "./packDiff";
import { readEarlierFile, type EarlierPlace } from "./packEarlier";
import { packPlacesToCsv, readExportRecords } from "./packExport";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";

const OSM = "OpenStreetMap, Geofabrik Ontario extract";
const raw = (id: string, over: Record<string, unknown> = {}, prov: Record<string, unknown> | null = {}) => ({
  id,
  name: `Place ${id}`,
  category: "cafe",
  address: "1 Main Street",
  wheelchair: "yes",
  lat: 43.65,
  lon: -79.38,
  provenance: prov === null ? null : { source_name: OSM, licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0, ...prov },
  ...over,
});
const current = (...items: ReturnType<typeof raw>[]): PackPlaceRecord[] => [...parsePackPlaces(items).places];
const before = (id: string, over: Partial<EarlierPlace> = {}): EarlierPlace => ({
  id,
  name: `Place ${id}`,
  kind: "cafe",
  address: "1 Main Street",
  lat: 43.65,
  lon: -79.38,
  tag: "yes",
  source: OSM,
  retrievedOn: "2026-11-10",
  tier: null,
  ...over,
});
const one = (b: Partial<EarlierPlace>, a: Record<string, unknown> = {}, prov: Record<string, unknown> | null = {}) =>
  changesFor(before("a", b), current(raw("a", a, prov))[0]!);

describe("changesFor", () => {
  it("finds nothing when nothing differs", () => {
    expect(one({})).toEqual([]);
  });
  it("lists a tag change with UNKNOWN as the token", () => {
    expect(one({ tag: "yes" }, { wheelchair: "no" })).toEqual([{ field: "tag", before: "yes", after: "no" }]);
    expect(one({ tag: "unknown" }, { wheelchair: "yes" })).toEqual([{ field: "tag", before: "UNKNOWN", after: "yes" }]);
    expect(one({ tag: "limited" }, { wheelchair: "" })).toEqual([{ field: "tag", before: "limited", after: "UNKNOWN" }]);
  });
  it("counts a tag that lost its source as a change to UNKNOWN", () => {
    expect(one({ tag: "yes" }, { wheelchair: "yes" }, null)).toContainEqual({ field: "tag", before: "yes", after: "UNKNOWN" });
  });
  it("lists a name change and an added or removed name", () => {
    expect(one({}, { name: "New Name" })).toEqual([{ field: "name", before: "Place a", after: "New Name" }]);
    expect(one({ name: null }, { name: "Named" })).toEqual([{ field: "name", before: "UNKNOWN", after: "Named" }]);
    expect(one({}, { name: "" })).toEqual([{ field: "name", before: "Place a", after: "UNKNOWN" }]);
  });
  it("ignores case, spacing and accent composition in text", () => {
    expect(one({ name: "  PLACE   a " })).toEqual([]);
    expect(one({ address: "1 main street" })).toEqual([]);
    expect(one({ name: "Café" }, { name: "Café" })).toEqual([]);
  });
  it("lists a kind and an address change", () => {
    expect(one({ kind: "bar" })).toEqual([{ field: "kind", before: "bar", after: "cafe" }]);
    expect(one({ address: null })).toEqual([{ field: "address", before: "UNKNOWN", after: "1 Main Street" }]);
  });
  it("does not call a small shift a move, but does call a larger one", () => {
    expect(one({ lat: 43.65002 })).toEqual([]);
    const moved = one({ lat: 43.66 });
    expect(moved).toEqual([{ field: "position", before: "43.66000, -79.38000", after: "43.65000, -79.38000" }]);
  });
  it("uses the limit given", () => {
    const place = current(raw("a"))[0]!;
    const b = before("a", { lat: 43.6501 });
    expect(changesFor(b, place, { movedMetres: 20 })).toEqual([]);
    expect(changesFor(b, place, { movedMetres: 5 })).toHaveLength(1);
    expect(DEFAULT_MOVED_METRES).toBe(5);
  });
  it("lists a position that appeared or disappeared", () => {
    expect(one({ lat: null, lon: null })).toEqual([{ field: "position", before: "UNKNOWN", after: "43.65000, -79.38000" }]);
    expect(one({}, { lat: undefined, lon: undefined })).toEqual([{ field: "position", before: "43.65000, -79.38000", after: "UNKNOWN" }]);
  });
  it("lists a source and a retrieval date change", () => {
    expect(one({ source: "Another source" })).toEqual([{ field: "source", before: "Another source", after: OSM }]);
    expect(one({ retrievedOn: "2026-01-01" })).toEqual([{ field: "retrieved", before: "2026-01-01", after: "2026-11-10" }]);
    expect(one({ retrievedOn: null }, {}, null)).toContainEqual({ field: "source", before: OSM, after: "UNKNOWN" });
  });
  it("compares tiers only when they are given", () => {
    const place = current(raw("a"))[0]!;
    const b = before("a", { tier: "1" });
    expect(changesFor(b, place)).toEqual([]);
    expect(changesFor(b, place, { tiers: new Map([["a", "0"]]) })).toEqual([{ field: "tier", before: "1", after: "0" }]);
    expect(changesFor(b, place, { tiers: new Map([["a", "1"]]) })).toEqual([]);
    expect(changesFor(b, place, { tiers: new Map() })).toEqual([{ field: "tier", before: "1", after: "UNKNOWN" }]);
  });
  it("lists several changes in the field order", () => {
    const changes = one({ tag: "no", name: "Old", kind: "bar" });
    expect(changes.map((c) => c.field)).toEqual(["tag", "name", "kind"]);
  });
});

describe("diffPacks", () => {
  it("finds added, removed, changed and unchanged places by id", () => {
    const d = diffPacks([before("a"), before("b", { tag: "no" }), before("gone")], current(raw("a"), raw("b"), raw("new")));
    expect(d.added.map((p) => p.id)).toEqual(["new"]);
    expect(d.removed.map((p) => p.id)).toEqual(["gone"]);
    expect(d.changed.map((c) => c.id)).toEqual(["b"]);
    expect(d.unchanged).toBe(1);
    expect(d.earlierCount).toBe(3);
    expect(d.currentCount).toBe(3);
  });
  it("is unchanged when the two lists agree, in any order", () => {
    const d = diffPacks([before("b"), before("a")], current(raw("a"), raw("b")));
    expect(isUnchanged(d)).toBe(true);
    expect(d.unchanged).toBe(2);
  });
  it("counts how many places changed in each field", () => {
    const d = diffPacks([before("a", { tag: "no", name: "x" }), before("b", { tag: "limited" })], current(raw("a"), raw("b")));
    expect(d.byField).toMatchObject({ tag: 2, name: 1, kind: 0, address: 0, position: 0, source: 0, retrieved: 0, tier: 0 });
    expect(Object.keys(d.byField).sort()).toEqual([...CHANGE_FIELDS].sort());
  });
  it("sorts every list by id so the result does not depend on input order", () => {
    const a = diffPacks([before("z", { tag: "no" }), before("c", { tag: "no" })], current(raw("z"), raw("c"), raw("y"), raw("b")));
    const b = diffPacks([before("c", { tag: "no" }), before("z", { tag: "no" })], current(raw("b"), raw("y"), raw("c"), raw("z")));
    expect(a).toEqual(b);
    expect(a.added.map((p) => p.id)).toEqual(["b", "y"]);
    expect(a.changed.map((c) => c.id)).toEqual(["c", "z"]);
  });
  it("keeps the earlier name for a changed place that has lost its name", () => {
    const d = diffPacks([before("a", { name: "Old Name" })], current(raw("a", { name: "" })));
    expect(d.changed[0]).toMatchObject({ id: "a", name: "Old Name" });
  });
  it("has a null name when neither side knows one", () => {
    const d = diffPacks([before("a", { name: null, tag: "no" })], current(raw("a", { name: "" })));
    expect(d.changed[0]!.name).toBeNull();
  });
  it("compares nothing for two empty lists", () => {
    const d = diffPacks([], []);
    expect(isUnchanged(d)).toBe(true);
    expect(d).toMatchObject({ unchanged: 0, earlierCount: 0, currentCount: 0 });
  });
  it("calls every place added when the earlier list is empty, and every one removed when the pack is", () => {
    expect(diffPacks([], current(raw("a"), raw("b"))).added).toHaveLength(2);
    expect(diffPacks([before("a")], []).removed).toHaveLength(1);
  });
  it("counts each place once in exactly one group", () => {
    const earlier = ["a", "b", "c", "d", "e"].map((id, i) => before(id, i % 2 ? { tag: "no" } : {}));
    const now = current(raw("a"), raw("b"), raw("c"), raw("f"), raw("g"));
    const d = diffPacks(earlier, now);
    expect(d.added.length + d.changed.length + d.unchanged).toBe(now.length);
    expect(d.removed.length + d.changed.length + d.unchanged).toBe(earlier.length);
  });
  it("does not change its inputs", () => {
    const earlier = [before("b"), before("a")];
    const now = current(raw("b"), raw("a"));
    const copy = JSON.stringify([earlier, now]);
    diffPacks(earlier, now);
    expect(JSON.stringify([earlier, now])).toBe(copy);
  });
});

describe("diffPacks against the App's own saved file", () => {
  const places = (JSON.parse(contentText) as { places: Record<string, unknown>[] }).places;
  const saved = (items: unknown[]) => {
    const r = readEarlierFile(packPlacesToCsv(readExportRecords(items).records));
    if (!r.ok) throw new Error(r.problem);
    return r.places;
  };
  const tiersOf = (items: unknown[]) => new Map(readExportRecords(items).records.map((x) => [x.place.id, x.tier] as const));
  it("finds no difference between a pack and the file saved from it", () => {
    const d = diffPacks(saved(places), [...parsePackPlaces(places).places], { tiers: tiersOf(places) });
    expect(isUnchanged(d)).toBe(true);
    expect(d.unchanged).toBe(places.length);
  });
  it("finds the one change made after saving", () => {
    const earlier = saved(places);
    const edited = places.map((p, i) => (i === 3 ? { ...p, wheelchair: p.wheelchair === "yes" ? "no" : "yes" } : p));
    const d = diffPacks(earlier, [...parsePackPlaces(edited).places], { tiers: tiersOf(edited) });
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]!.id).toBe(places[3]!.id);
    expect(d.changed[0]!.changes.map((c) => c.field)).toEqual(["tag"]);
  });
  it("finds a place removed from and a place added to the pack since saving", () => {
    const earlier = saved(places);
    const edited = [...places.slice(1), { ...places[0]!, id: "osm:node/999" }];
    const d = diffPacks(earlier, [...parsePackPlaces(edited).places], { tiers: tiersOf(edited) });
    expect(d.removed.map((p) => p.id)).toEqual([places[0]!.id]);
    expect(d.added.map((p) => p.id)).toEqual(["osm:node/999"]);
    expect(d.changed).toEqual([]);
  });
});
