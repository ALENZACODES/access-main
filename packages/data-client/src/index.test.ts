import "fake-indexeddb/auto";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureSource, createPackSource, fieldValue, type PackManifest, type PackRecord, type PackSourceEntry } from "./index.ts";

const source: PackSourceEntry = { sourceId: "osm-ontario", name: "OpenStreetMap", licence: "ODbL-1.0", retrieved: "2026-11-01", inWebPack: true };
const field = (value: unknown) => ({ value, source_id: source.sourceId, licence: source.licence, retrieved_at: source.retrieved, tier: 1 });
const first: PackRecord = { id: "osm:one", tranche: "venue", region: "toronto", fields: { name: field("Café Park"), wheelchair: field("UNKNOWN") } };
const second: PackRecord = { id: "osm:two", tranche: "venue", region: "toronto", fields: { name: field("Park Library") } };
const third: PackRecord = { id: "osm:three", tranche: "venue", region: "toronto", fields: { name: field("City Park") } };
const fourth: PackRecord = { id: "osm:four", tranche: "washroom", region: "toronto", fields: { name: field("UNKNOWN") } };
const fifth: PackRecord = { id: "osm:five", tranche: "path", region: "toronto", fields: { name: field("Trail") } };
const records = [first, second, third, fourth, fifth];
const cells = ["n43.5_w079.5", "n44.0_w079.5"];
const packed = (contents: string) => { const bytes = gzipSync(contents); return { bytes: new Uint8Array(bytes), sha256: createHash("sha256").update(bytes).digest("hex"), length: bytes.byteLength }; };
function fixture() {
  const urls = new Map<string, Uint8Array>();
  const manifest: PackManifest = { version: 1, builtAt: "2026-11-01T00:00:00Z", sourceCommit: "fixture", sources: [source], regions: [{ id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-80, 43.5, -79.5, 44.5], cells }], tranches: { venue: { cells: {} }, washroom: { cells: {} }, path: { cells: {} } }, search: {}, tiles: {}, counts: { records: 5, byTranche: { venue: 3, washroom: 1, path: 1 }, bySource: { "osm-ontario": 5 } } };
  for (const [i, cell] of cells.entries()) {
    for (const tranche of ["venue", "washroom", "path"] as const) {
      const items = records.filter((r, j) => j % 2 === i && r.tranche === tranche);
      if (!items.length) continue;
      const path = `venues/osm-ontario/${cell}-${tranche}.ndjson.gz`;
      const data = packed(items.map((record) => JSON.stringify(record)).join("\n") + "\n");
      urls.set(path, data.bytes);
      manifest.tranches[tranche]!.cells[cell] = { bbox: [-80, i ? 44 : 43.5, -79.5, i ? 44.5 : 44], parts: [{ path, bytes: data.length, sha256: data.sha256, count: items.length, sourceId: source.sourceId }] };
    }
    const hits = records.filter((_, j) => j % 2 === i).map((record) => ({ id: record.id, tranche: record.tranche, name: record.fields.name?.value === "UNKNOWN" ? null : String(record.fields.name?.value ?? ""), nameNorm: String(record.fields.name?.value ?? "").toLowerCase(), lat: 43.7 + i / 2, lon: -79.7 }));
    const path = `pack/v1/search/${cell}.json.gz`;
    const data = packed(JSON.stringify(hits));
    urls.set(path, data.bytes);
    manifest.search[cell] = { path, bytes: data.length, sha256: data.sha256, count: hits.length };
  }
  let calls = 0;
  let offline = false;
  let corrupt = "";
  const fetcher = async (input: RequestInfo | URL) => {
    const path = String(input).replace("/data/", "");
    calls++;
    if (offline) throw new Error("offline");
    if (path === "pack/v1/manifest.json") return Response.json(manifest);
    const bytes = urls.get(path);
    if (!bytes) return new Response(null, { status: 404 });
    const body = new Uint8Array((corrupt === path ? new Uint8Array([0]) : bytes).byteLength);
    body.set(corrupt === path ? new Uint8Array([0]) : bytes);
    return new Response(body);
  };
  return { manifest, fetcher: fetcher as typeof fetch, setOffline: (value: boolean) => { offline = value; }, setCorrupt: (path: string) => { corrupt = path; }, calls: () => calls };
}
afterEach(async () => { const db = await indexedDB.databases(); for (const entry of db) if (entry.name === "access-pack-v1") indexedDB.deleteDatabase(entry.name); });
describe("data client", () => {
  it("indexes only downloaded cells and preserves UNKNOWN through a cache round trip", async () => {
    const f = fixture();
    const client = createPackSource({ baseUrl: "/data/", fetch: f.fetcher, db: "memory" });
    expect(await client.cellsFor({ lat: 43.7, lon: -79.7, radiusM: 1000 })).toContain(cells[0]);
    await client.downloadRegion("toronto");
    expect((await client.search("park", {})).map((hit) => hit.id)).toEqual(["osm:two", "osm:one", "osm:three"]);
    expect(fieldValue((await client.get("osm:one"))!, "wheelchair")?.value).toBe("UNKNOWN");
    f.setOffline(true);
    expect((await client.get("osm:one"))?.fields.wheelchair?.value).toBe("UNKNOWN");
    expect((await client.search("park", {}))).toHaveLength(3);
    await client.deleteRegion("toronto");
    expect(await client.get("osm:one")).toBeNull();
    expect((await client.regions())[0]?.missingCells).toEqual(cells);
  });
  it("never commits partial downloads after a byte mismatch", async () => {
    const f = fixture();
    const searchCell = cells[1]!;
    const searchPath = f.manifest.search[searchCell]?.path;
    if (!searchPath) throw new Error("missing search fixture");
    f.setCorrupt(searchPath);
    const client = createPackSource({ baseUrl: "/data/", fetch: f.fetcher, db: "memory" });
    await expect(client.downloadRegion("toronto")).rejects.toMatchObject({ code: "bytes", part: searchPath });
    expect((await client.regions())[0]?.downloaded).toBe(false);
    expect(await client.get("osm:one")).toBeNull();
  });
  it("fetches a manifest once and excludes held sources", async () => {
    const f = fixture();
    const client = createPackSource({ baseUrl: "/data/", fetch: f.fetcher, db: "memory" });
    await Promise.all([client.manifest(), client.manifest()]);
    expect(f.calls()).toBe(1);
    const held = { ...source, inWebPack: false };
    const sample = createFixtureSource([first], [held]);
    expect(await sample.search("cafe", {})).toEqual([]);
    expect(await sample.get(first.id)).toEqual(first);
  });
});
