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
  it("downloads one cell at a time and keeps earlier cells after a later cell fails", async () => {
    const f = fixture();
    const later = f.manifest.search[cells[1]!]?.path;
    if (!later) throw new Error("missing search fixture");
    f.setCorrupt(later);
    const client = createPackSource({ baseUrl: "/data/", fetch: f.fetcher, db: "memory" });
    let seen = 0;
    const bytes = await client.downloadCell!("toronto", cells[0]!, (size) => { seen += size; });
    expect(bytes).toBeGreaterThan(0);
    expect(seen).toBe(bytes);
    await expect(client.downloadCell!("toronto", cells[1]!)).rejects.toMatchObject({ code: "bytes", part: later });
    const status = (await client.regions())[0];
    expect(status?.downloaded).toBe(false);
    expect(status?.missingCells).toEqual([cells[1]]);
    expect(await client.get("osm:one")).not.toBeNull();
    expect(await client.get("osm:two")).toBeNull();
    await expect(client.downloadCell!("toronto", "outside")).rejects.toMatchObject({ code: "missing" });
    f.setCorrupt("");
    await client.downloadCell!("toronto", cells[1]!);
    expect((await client.regions())[0]?.downloaded).toBe(true);
    await client.deleteRegion("toronto");
    expect((await client.regions())[0]?.missingCells).toEqual(cells);
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
  it("keeps raw part bytes so a later integrity check can hash them", async () => {
    const f = fixture();
    const client = createPackSource({ baseUrl: "/data/", fetch: f.fetcher, db: "memory" });
    expect(await client.storedRegionIntegrity("toronto")).toBeNull();
    await client.downloadRegion("toronto");
    const snapshot = await client.storedRegionIntegrity("toronto");
    expect(snapshot?.parts.length).toBeGreaterThan(0);
    for (const part of snapshot!.parts) {
      expect(part.data?.byteLength).toBe(part.expectedBytes);
      expect(part.actualCount).toBe(part.expectedCount);
      expect(part.structurallyValid).toBe(true);
      expect(part.source.name).toBe("OpenStreetMap");
      expect(part.source.licence).toBe("ODbL-1.0");
      expect(part.source.date).toBe("2026-11-01");
    }
    const firstPart = snapshot!.parts[0]!;
    const before = f.calls();
    const fetched = await client.fetchRegionPartBytes(firstPart.path);
    expect(fetched.byteLength).toBe(firstPart.expectedBytes);
    expect(f.calls()).toBe(before + 1);
  });
  it("does not replace a stored region when a re-commit fails its digest", async () => {
    const f = fixture();
    const client = createPackSource({ baseUrl: "/data/", fetch: f.fetcher, db: "memory" });
    await client.downloadRegion("toronto");
    const snapshot = await client.storedRegionIntegrity("toronto");
    if (!snapshot) throw new Error("expected a stored region");
    const tampered = snapshot.parts.map((part) => ({ sha256: part.expectedSha256, data: new Uint8Array(part.expectedBytes) }));
    await expect(client.commitCheckedRegion("toronto", tampered)).rejects.toMatchObject({ code: "sha256" });
    expect(await client.get("osm:one")).toEqual(first);
    const again = await client.storedRegionIntegrity("toronto");
    expect(again?.parts.every((part) => part.structurallyValid && part.actualCount === part.expectedCount)).toBe(true);
  });
  it("flags stored records that no longer match the kept bytes", async () => {
    const f = fixture();
    const client = createPackSource({ baseUrl: "/data/", fetch: f.fetcher });
    await client.downloadRegion("toronto");
    await mutateStoredRecords((record) => {
      if (record && typeof record === "object" && Array.isArray((record as { records?: unknown[] }).records)) {
        const records = (record as { records: Array<{ id: string }> }).records;
        if (records[0]) records[0] = { ...records[0], id: "tampered" };
      }
      return record;
    });
    const snapshot = await client.storedRegionIntegrity("toronto");
    expect(snapshot?.parts.some((part) => part.structurallyValid === false)).toBe(true);
  });
});

async function mutateStoredRecords(update: (value: unknown) => unknown): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("access-pack-v1");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("parts", "readwrite");
    const store = tx.objectStore("parts");
    const read = store.getAll();
    read.onsuccess = () => {
      for (const value of read.result as unknown[]) store.put(update(value));
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function overlappingRegions(db: "memory" | "indexeddb") {
  const f = fixture();
  const region = f.manifest.regions[0]!;
  f.manifest.regions.push(
    { ...region, id: "south", cells: [cells[0]!] },
    { ...region, id: "metro", cells: [...cells] },
    { ...region, id: "empty", cells: [] },
  );
  const client = createPackSource({ baseUrl: "/data/", fetch: f.fetcher, db });
  const status = async (id: string) => (await client.regions()).find((item) => item.id === id);
  return { ...f, client, status };
}

describe.each(["memory", "indexeddb"] as const)("region ownership in %s", (db) => {
  it("keeps the selected overlapping cells offline after the original owner is removed", async () => {
    const { client, setOffline, calls, status } = overlappingRegions(db);
    await client.downloadRegion("toronto");
    setOffline(true);
    const before = calls();
    expect(await status("south")).toMatchObject({ downloaded: false, missingCells: [] });
    expect(await client.storedRegionIntegrity("south")).toBeNull();

    expect(await client.retainCachedRegion!("south")).toBe(true);
    const kept = await client.storedRegionIntegrity("south");
    expect(kept?.cellCount).toBe(1);
    expect(kept?.parts.length).toBeGreaterThan(0);
    expect(kept?.parts.every((part) => part.structurallyValid)).toBe(true);
    expect(await client.retainCachedRegion!("south")).toBe(true);
    expect(await client.storedRegionIntegrity("south")).toEqual(kept);

    await client.deleteRegion("toronto");
    expect(await client.storedRegionIntegrity("toronto")).toBeNull();
    expect(await status("toronto")).toMatchObject({ missingCells: [cells[1]] });
    expect(await status("south")).toMatchObject({ downloaded: true, verified: true, missingCells: [] });
    expect(await client.get(first.id)).toEqual(first);
    expect(await client.get(second.id)).toBeNull();
    expect((await client.search("park", {})).map((hit) => hit.id)).toEqual([first.id, third.id]);

    await client.deleteRegion("south");
    expect(await client.retainCachedRegion!("south")).toBe(false);
    expect(await status("toronto")).toMatchObject({ missingCells: cells });
    expect(await client.search("park", {})).toEqual([]);
    expect(calls()).toBe(before);
  });

  it("creates no owner when either the entire pack or one of its cells is missing", async () => {
    const { client, setOffline, calls } = overlappingRegions(db);
    await client.manifest();
    expect(await client.retainCachedRegion!("metro")).toBe(false);
    expect(await client.storedRegionIntegrity("metro")).toBeNull();
    await client.downloadCell!("toronto", cells[0]!);
    setOffline(true);
    const before = calls();
    expect(await client.retainCachedRegion!("metro")).toBe(false);
    expect(await client.storedRegionIntegrity("metro")).toBeNull();
    await client.deleteRegion("toronto");
    expect(await client.retainCachedRegion!("south")).toBe(false);
    expect(calls()).toBe(before);
  });

  it("preserves an existing partial selection and can retain it once other owners fill the gaps", async () => {
    const { client, setOffline, status } = overlappingRegions(db);
    await client.downloadCell!("metro", cells[0]!);
    const partial = await client.storedRegionIntegrity("metro");
    expect(partial?.parts.some((part) => part.data === null)).toBe(true);
    expect(await client.retainCachedRegion!("metro")).toBe(false);
    expect(await client.storedRegionIntegrity("metro")).toEqual(partial);

    await client.downloadCell!("toronto", cells[1]!);
    setOffline(true);
    expect(await client.retainCachedRegion!("metro")).toBe(true);
    await client.deleteRegion("toronto");
    expect(await status("metro")).toMatchObject({ downloaded: true, missingCells: [] });
    expect(await client.get(first.id)).toEqual(first);
    expect(await client.get(second.id)).toEqual(second);
  });

  it("rejects an unknown region and allows a manifest region with no cells", async () => {
    const { client, setOffline, calls, status } = overlappingRegions(db);
    await client.manifest();
    setOffline(true);
    const before = calls();
    await expect(client.retainCachedRegion!("absent")).rejects.toMatchObject({ code: "missing", part: "absent" });
    expect(await client.retainCachedRegion!("empty")).toBe(true);
    expect(await client.storedRegionIntegrity("empty")).toEqual({ regionId: "empty", cellCount: 0, parts: [] });
    expect(await status("empty")).toMatchObject({ downloaded: true, bytes: 0 });
    await client.deleteRegion("empty");
    expect(await client.storedRegionIntegrity("empty")).toBeNull();
    expect(await status("empty")).toMatchObject({ downloaded: false });
    expect(calls()).toBe(before);
  });

  it("records both sets of owned hashes when two cached cells commit concurrently", async () => {
    const { client, setOffline, calls, status } = overlappingRegions(db);
    await client.downloadRegion("toronto");
    setOffline(true);
    const before = calls();
    await Promise.all(cells.map((cell) => client.downloadCell!("metro", cell)));
    await client.deleteRegion("toronto");
    expect(await status("metro")).toMatchObject({ downloaded: true, missingCells: [] });
    expect(await client.get(first.id)).toEqual(first);
    expect(await client.get(second.id)).toEqual(second);
    expect(calls()).toBe(before);
  });

  it("never leaves a successful retention pointing at bytes removed by a competing deletion", async () => {
    const { client, setOffline, status } = overlappingRegions(db);
    await client.downloadRegion("toronto");
    setOffline(true);
    const [retained] = await Promise.all([
      client.retainCachedRegion!("south"),
      client.deleteRegion("toronto"),
    ]);
    expect(await client.storedRegionIntegrity("toronto")).toBeNull();
    if (retained) {
      expect(await status("south")).toMatchObject({ downloaded: true, missingCells: [] });
      expect(await client.get(first.id)).toEqual(first);
    } else {
      expect(await client.storedRegionIntegrity("south")).toBeNull();
      expect(await status("south")).toMatchObject({ downloaded: false, missingCells: [cells[0]] });
    }
  });
});

it("retains an older verified path when a later manifest withholds it", async () => {
  const original = overlappingRegions("indexeddb");
  await original.client.downloadRegion("toronto");
  original.setOffline(true);

  const updated = overlappingRegions("indexeddb");
  const cell = cells[0]!;
  const venues = updated.manifest.tranches.venue!;
  const oldPart = venues.cells[cell]!.parts[0]!;
  delete venues.cells[cell];
  const withheld = { path: oldPart.path, sourceId: source.sourceId, tranche: "venue" as const, cell, reason: "awaiting review" };
  updated.manifest.withheld = [withheld];
  await updated.client.manifest();
  updated.setOffline(true);
  const before = updated.calls();

  expect(await updated.client.retainCachedRegion!("toronto")).toBe(true);
  expect(await updated.status("toronto")).toMatchObject({ staleCells: [cell], unavailable: [] });
  expect(await updated.client.get(first.id)).toEqual(first);
  expect(await updated.client.get(third.id)).toEqual(third);
  await updated.client.deleteRegion("toronto");
  expect(await updated.status("toronto")).toMatchObject({ staleCells: [], unavailable: [withheld] });
  expect(await updated.client.get(first.id)).toBeNull();
  // The original manifest still addresses the old hash directly.
  const oldCell: PackRecord[] = [];
  for await (const record of original.client.records("venue", cell)) oldCell.push(record);
  expect(oldCell).toEqual([]);
  expect(updated.calls()).toBe(before);
});
