import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createPackSource } from "../../../../../packages/data-client/src/index.ts";
import type { PackManifest, PackPart, PackSourceEntry, Tranche } from "../../../../../packages/data-client/src/types.ts";
import { buildFootprintIndex, type FootprintIndex } from "./packFootprintIndex.ts";

const bbox: [number, number, number, number] = [-80, 43, -79, 44];

function source(id: string, inWebPack = true): PackSourceEntry {
  return { sourceId: id, name: id, licence: "CC0", retrieved: "2026-11-01", inWebPack };
}

function region(id: string, ...cells: string[]): PackManifest["regions"][number] {
  return { id, label: { en: `English ${id}`, fr: `Français ${id}` }, bbox, cells };
}

function manifest(...regions: PackManifest["regions"]): PackManifest {
  return {
    version: 1,
    builtAt: "2026-11-19T12:00:00Z",
    sourceCommit: "index-test",
    regions,
    sources: [source("city"), source("agency"), source("restricted", false)],
    tranches: {},
    search: {},
    tiles: {},
    counts: { records: 0, byTranche: {}, bySource: {} },
  };
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function part(label: string, bytes: number, sourceId?: string): PackPart {
  return { path: `pack/${label}.gz`, bytes, sha256: hash(label), count: 1, sourceId };
}

function trancheCell(pack: PackManifest, kind: Tranche, cell: string, ...parts: PackPart[]): void {
  const tranche = pack.tranches[kind] ?? { cells: Object.create(null) };
  tranche.cells[cell] = { bbox, parts };
  pack.tranches[kind] = tranche;
}

function regionHashes(index: FootprintIndex, id: string): Set<string> {
  const region = index.regions.get(id);
  if (!region) throw new Error(`Missing region ${id}`);
  return new Set(region.cellIds.flatMap((cell) => index.cells.get(cell)?.hashes ?? []));
}

describe("manifest download identities", () => {
  it("includes an aggregate search index and eligible record tranches only", () => {
    const pack = manifest(region("centre", "east"));
    const search = part("search", 9);
    const city = part("venue", 15, "city");
    const agency = part("path", 12, "agency");
    const held = part("private", 1_000, "restricted");
    pack.search.east = search;
    trancheCell(pack, "venue", "east", city, held);
    trancheCell(pack, "path", "east", agency);
    pack.tiles.east = { path: "east.pmtiles", bytes: 20_000, licence: "CC0" };
    const index = buildFootprintIndex(pack);
    expect(index.builtAt).toBe(pack.builtAt);
    expect(index.cells.get("east")).toEqual({
      id: "east", complete: true, hashes: [search.sha256, city.sha256, agency.sha256],
    });
    expect(index.parts.size).toBe(3);
    expect(index.parts.has(held.sha256)).toBe(false);
    expect(index.parts.get(search.sha256)?.sources).toEqual([]);
    expect(index.parts.get(city.sha256)).toEqual({
      hash: city.sha256, bytes: 15, sources: [{ name: "city", licence: "CC0", date: "2026-11-01" }],
    });
  });

  it("indexes a cell shared by several regions only once and keeps region order and labels", () => {
    const north = region("north", "shared", "north-only", "shared");
    const south = region("south", "south-only", "shared");
    const pack = manifest(north, south);
    const data = part("records", 19, "city");
    trancheCell(pack, "venue", "shared", data);
    trancheCell(pack, "venue", "north-only");
    trancheCell(pack, "transit", "south-only");
    const index = buildFootprintIndex(pack);
    expect([...index.regions.keys()]).toEqual(["north", "south"]);
    expect(index.regions.get("north")).toEqual({
      id: "north", label: north.label, cellIds: ["shared", "north-only"], complete: true, withheldCount: 0,
    });
    expect(index.regions.get("south")?.cellIds).toEqual(["south-only", "shared"]);
    expect(index.cells.size).toBe(3);
    expect(index.parts.size).toBe(1);
    expect(regionHashes(index, "south")).toEqual(regionHashes(index, "north"));
  });

  it("deduplicates by digest across tranches and paths, without merging files by pathname", () => {
    const pack = manifest(region("one", "a", "b"));
    const first = part("first", 54, "city");
    const renamed = { ...first, path: "other/location.gz", sourceId: "agency" };
    const replaced = { ...part("second", 54, "city"), path: first.path };
    trancheCell(pack, "venue", "a", first, first);
    trancheCell(pack, "path", "a", renamed);
    trancheCell(pack, "venue", "b", replaced, renamed);
    const index = buildFootprintIndex(pack);
    expect(index.cells.get("a")?.hashes).toEqual([first.sha256]);
    expect(regionHashes(index, "one")).toEqual(new Set([first.sha256, replaced.sha256]));
    expect(index.parts.get(first.sha256)?.sources.map((entry) => entry.name)).toEqual(["city", "agency"]);
    expect(index.parts.get(replaced.sha256)?.sources.map((entry) => entry.name)).toEqual(["city"]);
  });

  it("keeps orphan and tile metadata outside selectable regions from affecting known sizes", () => {
    const pack = manifest(region("shown", "in"));
    const selected = part("shared", 88, "city");
    trancheCell(pack, "venue", "in", selected);
    trancheCell(pack, "venue", "out", { ...selected, bytes: 17 });
    pack.search.out = part("unreachable", 45);
    pack.tiles.in = { path: selected.path, bytes: 12, licence: "CC0" };
    const index = buildFootprintIndex(pack);
    expect(index.cells.has("out")).toBe(false);
    expect(index.parts.has(pack.search.out.sha256)).toBe(false);
    expect(index.parts.get(selected.sha256)?.bytes).toBe(88);
    expect(index.regions.get("shown")?.complete).toBe(true);
  });

  it("copies manifest-owned arrays and labels so later edits cannot rewrite a finished comparison", () => {
    const north = region("north", "a");
    const pack = manifest(north);
    const original = part("a", 6, "city");
    trancheCell(pack, "venue", "a", original);
    const index = buildFootprintIndex(pack);
    north.label.en = "Changed";
    north.cells.push("b");
    original.bytes = 3;
    pack.sources[0]!.name = "Changed credit";
    expect(index.regions.get("north")?.label.en).toBe("English north");
    expect(index.regions.get("north")?.cellIds).toEqual(["a"]);
    expect(index.parts.get(original.sha256)).toMatchObject({
      bytes: 6, sources: [{ name: "city", licence: "CC0", date: "2026-11-01" }],
    });
  });
});

describe("uncertainty in the catalog", () => {
  it("propagates conflicting sizes to every affected cell and region, regardless of traversal order", () => {
    const known = part("agreed", 17, "city");
    const disputed = part("mixed", 20, "agency");
    for (const order of [["a", "b", "c"], ["b", "a", "c"], ["c", "b", "a"]]) {
      const pack = manifest(...order.map((id) => region(id, id)), region("independent", "d"));
      trancheCell(pack, "venue", "a", disputed);
      trancheCell(pack, "venue", "b", { ...disputed, bytes: 10 }, known);
      trancheCell(pack, "venue", "c", disputed);
      trancheCell(pack, "venue", "d", known);
      const index = buildFootprintIndex(pack);
      expect(index.parts.get(disputed.sha256)?.bytes).toBeNull();
      for (const id of order) {
        expect(index.cells.get(id)?.complete).toBe(false);
        expect(index.regions.get(id)?.complete).toBe(false);
      }
      expect(index.regions.get("independent")?.complete).toBe(true);
      expect(index.parts.get(known.sha256)?.bytes).toBe(17);
    }
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "retains the identity but rejects an unusable declared size of %s",
    (size) => {
      const pack = manifest(region("one", "a"));
      const data = part("a", size, "city");
      trancheCell(pack, "venue", "a", data);
      const index = buildFootprintIndex(pack);
      expect(index.cells.get("a")).toEqual({ id: "a", complete: false, hashes: [data.sha256] });
      expect(index.parts.get(data.sha256)?.bytes).toBeNull();
      expect(index.regions.get("one")?.complete).toBe(false);
    },
  );

  it("separates declared zero-byte files, empty tranches, held-only cells and absent cell details", () => {
    const cells = ["zero-size", "no-parts", "held-only", "unknown"];
    const pack = manifest(...cells.map((id) => region(id, id)), region("no-cells"));
    const emptyFile = part("zero", 0, "city");
    trancheCell(pack, "venue", "zero-size", emptyFile);
    trancheCell(pack, "path", "no-parts");
    trancheCell(pack, "venue", "held-only", part("held", 9, "restricted"));
    const index = buildFootprintIndex(pack);
    expect(index.parts.get(emptyFile.sha256)?.bytes).toBe(0);
    for (const id of ["no-parts", "held-only"]) {
      expect(index.cells.get(id)).toEqual({ id, complete: true, hashes: [] });
    }
    expect(index.cells.get("unknown")).toEqual({ id: "unknown", complete: false, hashes: [] });
    expect(index.regions.get("unknown")?.complete).toBe(false);
    expect(index.regions.get("no-cells")).toMatchObject({ complete: true, cellIds: [] });
  });

  it("reports usable identities beside a record part with a missing or malformed digest or path", () => {
    const pack = manifest(region("one", "a"));
    const valid = part("usable", 40, "city");
    trancheCell(pack, "venue", "a", valid, { ...valid, sha256: "" }, { ...valid, sha256: "123" },
      { ...valid, sha256: valid.sha256.toUpperCase() }, { ...part("bad path", 40, "city"), path: "" });
    const index = buildFootprintIndex(pack);
    expect(index.parts.size).toBe(1);
    expect(index.cells.get("a")).toEqual({ id: "a", complete: false, hashes: [valid.sha256] });
  });

  it("never credits an unknown or excluded record source to another included publisher", () => {
    const pack = manifest(region("one", "a"));
    const unknown = part("missing-source", 10, "absent");
    const unlabelled = part("unlabelled", 5);
    const aggregate = part("search", 6);
    pack.search.a = aggregate;
    trancheCell(pack, "venue", "a", unknown, unlabelled);
    const index = buildFootprintIndex(pack);
    expect(index.parts.size).toBe(1);
    expect(index.parts.get(aggregate.sha256)?.sources).toEqual([]);
    expect(index.cells.get("a")?.complete).toBe(false);
    expect(index.regions.get("one")?.complete).toBe(false);
  });

  it("handles ambiguous eligibility while preserving the client's any-eligible inclusion rule", () => {
    const pack = manifest(region("one", "a"));
    pack.sources = [source("city", false), source("city"), source("city")];
    const city = part("city", 7, "city");
    trancheCell(pack, "venue", "a", city);
    const index = buildFootprintIndex(pack);
    expect(index.cells.get("a")).toEqual({ id: "a", hashes: [city.sha256], complete: false });
    expect(index.parts.get(city.sha256)?.sources).toEqual([{ name: "city", licence: "CC0", date: "2026-11-01" }]);
  });

  it("keeps separately documented credits for one content hash and preserves missing credit fields", () => {
    const pack = manifest(region("one", "a"));
    pack.sources = [
      { ...source("city"), name: " Old publisher ", retrieved: "2025-01-16T10:30:00Z" },
      { ...source("city"), name: "New publisher", licence: "", retrieved: "" },
      { ...source("city", false), name: "Private report" },
    ];
    const aggregate = part("named search", 17, "city");
    pack.search.a = aggregate;
    const credits = buildFootprintIndex(pack).parts.get(aggregate.sha256)?.sources;
    expect(credits).toEqual([
      { name: "Old publisher", licence: "CC0", date: "2025-01-16" },
      { name: "New publisher", licence: "", date: "" },
    ]);
  });

  it("keeps the source calendar day for offset timestamps and leaves invalid dates unknown", () => {
    const pack = manifest(region("one", "a"));
    const dates = [
      "2024-02-29T23:59:00-05:00",
      "2025-02-29",
      "2024-04-31",
      "2026-01-18Tnot-a-time",
      "",
    ];
    pack.sources = dates.map((retrieved, i) => ({ ...source("city"), name: String(i), retrieved }));
    const data = part("credit date", 28, "city");
    trancheCell(pack, "venue", "a", data);
    const credits = buildFootprintIndex(pack).parts.get(data.sha256)?.sources;
    expect(credits?.map((credit) => credit.date)).toEqual(["2024-02-29", "", "", "", ""]);
  });

  it("preserves unaffected regions when a shallowly validated manifest contains invalid nested rows", () => {
    const pack = manifest(region("good", "a"), region("broken", "b"));
    pack.search.a = part("a", 5);
    const incoming = JSON.parse(JSON.stringify(pack));
    incoming.tranches.venue = { cells: { b: { parts: null } } };
    incoming.regions[1].label = { en: {}, fr: "   " };
    incoming.regions.push(null, { id: "unknown-cells", cells: null });
    incoming.sources.push(null, { sourceId: "bad", name: 1, licence: 2, inWebPack: true });
    incoming.withheld = {};
    const index = buildFootprintIndex(incoming);
    expect(index.regions.get("good")).toMatchObject({ complete: true, withheldCount: 0 });
    expect(index.regions.get("broken")).toMatchObject({
      complete: false, label: { en: "broken", fr: "broken" },
    });
    expect(index.regions.get("unknown-cells")?.complete).toBe(false);
    expect(index.parts.get(pack.search.a.sha256)?.bytes).toBe(5);
  });

  it("retains the first downloadable region definition and flags conflicting cell lists", () => {
    const pack = manifest(region("same", "a", "b", "a"), region("same", "b", "a"));
    pack.search.a = part("search a", 3);
    pack.search.b = part("search b", 11);
    pack.search.c = part("search c", 5);
    expect(buildFootprintIndex(pack).regions.get("same")?.complete).toBe(true);
    pack.regions.push(region("same", "a", "c"), region("same", "a", "b"));
    const index = buildFootprintIndex(pack);
    expect(index.regions.size).toBe(1);
    expect(index.regions.get("same")).toMatchObject({ cellIds: ["a", "b"], complete: false });
    expect(index.parts.has(pack.search.c.sha256)).toBe(false);
  });

  it("recognizes arbitrary JSON object keys without assigning inherited data to a region", () => {
    const pack = manifest(region("__proto__", "constructor", "toString"));
    pack.search = JSON.parse(JSON.stringify({ constructor: part("named", 41) })) as PackManifest["search"];
    const index = buildFootprintIndex(pack);
    expect(index.regions.get("__proto__")?.cellIds).toEqual(["constructor", "toString"]);
    expect(index.cells.get("constructor")?.complete).toBe(true);
    expect(index.cells.get("toString")).toEqual({ id: "toString", hashes: [], complete: false });
  });

  it("keeps withheld counts tied to the specified cell even when no bytes were released for it", () => {
    const pack = manifest(region("one", "a", "b", "a"), region("two", "a"));
    const row = { path: "private.gz", sourceId: "restricted", tranche: "venue" as const, cell: "a", reason: "held" };
    pack.withheld = [
      row, { ...row, reason: "duplicate notice" }, { ...row, cell: "b" },
      { ...row, cell: null }, { ...row, cell: "outside" },
    ];
    trancheCell(pack, "venue", "a");
    const index = buildFootprintIndex(pack);
    expect(index.regions.get("one")).toMatchObject({ complete: false, withheldCount: 2 });
    expect(index.regions.get("two")).toMatchObject({ complete: true, withheldCount: 1 });
    expect(index.parts.size).toBe(0);
  });
});

describe("download policy parity with the memory-backed pack client", () => {
  it("predicts the content identities and sizes committed for overlapping regions", async () => {
    const pack = manifest(region("north", "a", "shared"), region("south", "shared", "b"));
    const payloads = new Map<string, Uint8Array<ArrayBuffer>>();
    const requested: string[] = [];

    function compressed(path: string, text: string, sourceId?: string): PackPart {
      const data = new Uint8Array(gzipSync(text));
      payloads.set(path, data);
      return {
        path, bytes: data.byteLength, sha256: createHash("sha256").update(data).digest("hex"),
        count: 0, sourceId,
      };
    }
    const northSearch = compressed("search/north.json.gz", "[]");
    const sharedSearch = compressed("search/shared.json.gz", "[ ]");
    const southSearch = compressed("search/south.json.gz", "[\n]");
    pack.search = { a: northSearch, shared: sharedSearch, b: southSearch };
    const blankRecords = compressed("venue/a.gz", "", "city");
    const sameContent = compressed("venue/b.gz", "", "city");
    const transit = compressed("transit/shared.gz", "\n", "agency");
    const restricted = compressed("restricted/a.gz", "\n\n", "restricted");
    trancheCell(pack, "venue", "a", blankRecords, restricted);
    trancheCell(pack, "transit", "shared", transit);
    trancheCell(pack, "venue", "b", sameContent);
    pack.tiles.a = { path: "tiles/regional.pmtiles", bytes: 20_000, licence: "CC0" };
    pack.withheld = [{
      path: "washroom/a.gz", cell: "a", sourceId: "restricted",
      tranche: "washroom", reason: "Redistribution is restricted",
    }];

    const client = createPackSource({
      baseUrl: "/downloads/",
      db: "memory",
      fetch: async (url) => {
        const path = String(url).slice("/downloads/".length);
        requested.push(path);
        if (path === "pack/v1/manifest.json") return Response.json(pack);
        const data = payloads.get(path);
        return data ? new Response(data) : new Response(null, { status: 404 });
      },
    });
    const index = buildFootprintIndex(await client.manifest());
    expect(requested).toEqual(["pack/v1/manifest.json"]);
    const beforeDownload = await client.regions();
    for (const status of beforeDownload) {
      const hashes = regionHashes(index, status.id);
      const bytes = [...hashes].reduce((sum, id) => sum + index.parts.get(id)!.bytes!, 0);
      expect(status.bytes).toBe(bytes);
      expect(status.unavailable?.length).toBe(index.regions.get(status.id)?.withheldCount);
      expect(status.downloaded).toBe(false);
      expect(index.regions.get(status.id)?.complete).toBe(true);
      const done = await client.downloadRegion(status.id);
      expect(done).toMatchObject({ downloaded: true, bytes });
      const snapshot = await client.storedRegionIntegrity(status.id);
      expect(new Set(snapshot?.parts.map((p) => p.expectedSha256))).toEqual(hashes);
      for (const committed of snapshot!.parts) {
        const planned = index.parts.get(committed.expectedSha256);
        expect(planned?.bytes).toBe(committed.data?.byteLength);
      }
    }
    // The first region has already committed both the shared cell and the other
    // cell's identical record content. Only the second search index transfers.
    expect(requested.slice(-1)).toEqual([southSearch.path]);
    expect(requested).not.toContain(sameContent.path);
    expect(requested).not.toContain(restricted.path);
    expect(requested).not.toContain(pack.tiles.a.path);
    expect(requested).not.toContain("washroom/a.gz");
    expect(requested).toHaveLength(index.parts.size + 1);
    expect(buildFootprintIndex(await client.manifest())).toEqual(index);
  });
});
