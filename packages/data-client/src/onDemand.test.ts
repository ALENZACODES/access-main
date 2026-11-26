import "fake-indexeddb/auto";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createPackSource, type PackManifest, type PackRecord, type PackSourceEntry } from "./index.ts";

// A two-region pack served over a fake network, to check what the client does when nothing is stored on the device.
const osm: PackSourceEntry = { sourceId: "osm-ontario", name: "OpenStreetMap", licence: "ODbL-1.0", retrieved: "2026-11-01", inWebPack: true };
const city: PackSourceEntry = { sourceId: "toronto-park-washrooms", name: "Toronto park washrooms", licence: "OGL-Toronto-1.0", retrieved: "2026-11-02", inWebPack: true };
const f = (source: PackSourceEntry) => (value: unknown) => ({ value, source_id: source.sourceId, licence: source.licence, retrieved_at: source.retrieved, tier: 0 });
const o = f(osm);
const c = f(city);
const TOR = "n43.5_w079.5";
const OTT = "n45.0_w076.0";
const library: PackRecord = { id: "osm:node/1", tranche: "venue", region: TOR, fields: { name: o("Union Library"), lat: o(43.645), lon: o(-79.38), wheelchair: o("yes") } };
const cafe: PackRecord = { id: "osm:node/2", tranche: "venue", region: TOR, fields: { name: o("Union Café"), lat: o(43.646), lon: o(-79.381) } };
const washroom: PackRecord = { id: "toronto-park-washrooms:9", tranche: "washroom", region: TOR, fields: { name: o("UNKNOWN"), lat: c(43.6455), lon: c(-79.3805), wheelchair: c("yes") } };
washroom.fields.name = c("Park Washroom");
const farWashroom: PackRecord = { id: "toronto-park-washrooms:10", tranche: "washroom", region: TOR, fields: { name: c("Far Washroom"), lat: c(43.9), lon: c(-79.1) } };
const ottawa: PackRecord = { id: "osm:node/3", tranche: "venue", region: OTT, fields: { name: o("Union Hall Ottawa"), lat: o(45.4), lon: o(-75.7) } };

const gz = (text: string) => {
  const bytes = gzipSync(text);
  return { bytes: new Uint8Array(bytes), sha256: createHash("sha256").update(bytes).digest("hex"), length: bytes.byteLength };
};

function pack() {
  const files = new Map<string, Uint8Array>();
  const manifest: PackManifest = {
    version: 1, builtAt: "2026-11-02T00:00:00Z", sourceCommit: "fixture", sources: [osm, city],
    regions: [
      { id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-79.5, 43.5, -79, 44], cells: [TOR] },
      { id: "ottawa", label: { en: "Ottawa", fr: "Ottawa" }, bbox: [-76, 45, -75.5, 45.5], cells: [OTT] },
    ],
    tranches: { venue: { cells: {} }, washroom: { cells: {} } }, search: {}, tiles: {},
    counts: { records: 5, byTranche: { venue: 3, washroom: 2 }, bySource: { "osm-ontario": 3, "toronto-park-washrooms": 2 } },
  };
  const put = (tranche: "venue" | "washroom", cell: string, source: PackSourceEntry, items: PackRecord[], bbox: [number, number, number, number]) => {
    const path = `pack/v1/${tranche}/${source.sourceId}/${cell}.ndjson.gz`;
    const data = gz(items.map((record) => JSON.stringify(record)).join("\n") + "\n");
    files.set(path, data.bytes);
    const entry = manifest.tranches[tranche]!.cells[cell] ?? { bbox, parts: [] };
    entry.parts.push({ path, bytes: data.length, sha256: data.sha256, count: items.length, sourceId: source.sourceId });
    manifest.tranches[tranche]!.cells[cell] = entry;
  };
  put("venue", TOR, osm, [library, cafe], [-79.5, 43.5, -79, 44]);
  put("washroom", TOR, city, [washroom, farWashroom], [-79.5, 43.5, -79, 44]);
  put("venue", OTT, osm, [ottawa], [-76, 45, -75.5, 45.5]);
  for (const [cell, items] of [[TOR, [library, cafe, washroom, farWashroom]], [OTT, [ottawa]]] as const) {
    const hits = items.map((record) => ({ id: record.id, tranche: record.tranche, name: String(record.fields.name?.value), nameNorm: String(record.fields.name?.value).toLowerCase(), lat: Number(record.fields.lat?.value), lon: Number(record.fields.lon?.value) }));
    const path = `pack/v1/search/${cell}.json.gz`;
    const data = gz(JSON.stringify(hits));
    files.set(path, data.bytes);
    manifest.search[cell] = { path, bytes: data.length, sha256: data.sha256, count: hits.length };
  }
  const requested: string[] = [];
  let offline = false;
  const fetcher = (async (input: RequestInfo | URL) => {
    const path = String(input).replace("/data/", "");
    requested.push(path);
    if (offline) throw new Error("offline");
    if (path === "pack/v1/manifest.json") return Response.json(manifest);
    const bytes = files.get(path);
    return bytes ? new Response(new Uint8Array(bytes)) : new Response(null, { status: 404 });
  }) as typeof fetch;
  return { fetcher, requested, goOffline: () => { offline = true; } };
}

afterEach(async () => {
  for (const entry of await indexedDB.databases()) if (entry.name === "access-pack-v1") indexedDB.deleteDatabase(entry.name);
});

describe("fetchOnDemand", () => {
  it("is off by default: with nothing stored, search and get find nothing and fetch no part", async () => {
    const p = pack();
    const client = createPackSource({ baseUrl: "/data/", fetch: p.fetcher, db: "memory" });
    expect(await client.search("union", {})).toEqual([]);
    expect(await client.get(library.id)).toBeNull();
    expect(p.requested.filter((path) => path !== "pack/v1/manifest.json")).toEqual([]);
  });

  it("searches the default region online, and a named region when asked", async () => {
    const p = pack();
    const client = createPackSource({ baseUrl: "/data/", fetch: p.fetcher, db: "memory", fetchOnDemand: true });
    expect((await client.search("union", {})).map((hit) => hit.id).sort()).toEqual([library.id, cafe.id].sort());
    expect((await client.search("union", { region: "ottawa" })).map((hit) => hit.id)).toEqual([ottawa.id]);
  });

  it("reads a part once per session and stores nothing on the device", async () => {
    const p = pack();
    const client = createPackSource({ baseUrl: "/data/", fetch: p.fetcher, db: "indexeddb", fetchOnDemand: true });
    await client.search("union", {});
    await client.search("library", {});
    expect(p.requested.filter((path) => path.includes("/search/"))).toEqual([`pack/v1/search/${TOR}.json.gz`]);
    expect((await client.regions()).every((region) => !region.downloaded)).toBe(true);
    expect(await client.storedRegionIntegrity("toronto")).toBeNull();
  });

  it("gets a record from the cell it is given, reading its own source's parts first", async () => {
    const p = pack();
    const client = createPackSource({ baseUrl: "/data/", fetch: p.fetcher, db: "memory", fetchOnDemand: true });
    expect((await client.get(washroom.id, { cells: [TOR], tranche: "washroom" }))?.id).toBe(washroom.id);
    expect(p.requested.filter((path) => path.endsWith(".ndjson.gz"))).toEqual([`pack/v1/washroom/toronto-park-washrooms/${TOR}.ndjson.gz`]);
  });

  it("finds a record outside the default region with no hint, through the search index", async () => {
    const p = pack();
    const client = createPackSource({ baseUrl: "/data/", fetch: p.fetcher, db: "memory", fetchOnDemand: true });
    expect((await client.get(ottawa.id))?.fields.name?.value).toBe("Union Hall Ottawa");
    expect(await client.get("osm:node/999")).toBeNull();
  });

  it("lists nearby washrooms nearest first, within the radius, with distances", async () => {
    const p = pack();
    const client = createPackSource({ baseUrl: "/data/", fetch: p.fetcher, db: "memory", fetchOnDemand: true });
    const near = await client.nearby!({ lat: 43.645, lon: -79.38 }, { tranches: ["washroom"], radiusM: 1000, limit: 5 });
    expect(near.map((item) => item.record.id)).toEqual([washroom.id]);
    expect(near[0]!.distanceM).toBeGreaterThan(0);
    expect(near[0]!.distanceM).toBeLessThan(100);
  });

  it("offline with nothing stored, finds nothing and does not throw", async () => {
    const p = pack();
    const client = createPackSource({ baseUrl: "/data/", fetch: p.fetcher, db: "memory", fetchOnDemand: true });
    await client.manifest();
    p.goOffline();
    expect(await client.search("union", {})).toEqual([]);
    expect(await client.get(library.id, { cells: [TOR] })).toBeNull();
    expect(await client.nearby!({ lat: 43.645, lon: -79.38 }, { tranches: ["washroom"], radiusM: 1000, limit: 5 })).toEqual([]);
  });
});
