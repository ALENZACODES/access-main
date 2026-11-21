import "fake-indexeddb/auto";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { checkPackRecord, createPackSource, type PackManifest, type PackRecord, type PackSourceEntry } from "./index.ts";

/** Labelled fixtures. Not real places or sources. */
const source: PackSourceEntry = { sourceId: "fixture-source", name: "Fixture source", licence: "Fixture licence", retrieved: "2026-11-01", inWebPack: true };
const CELL = "n43.5_w079.5";
const PART = `venues/${source.sourceId}/${CELL}.ndjson.gz`;
const SEARCH = `pack/v1/search/${CELL}.json.gz`;
const field = (value: unknown, over: Record<string, unknown> = {}) => ({ value, source_id: source.sourceId, licence: source.licence, retrieved_at: source.retrieved, tier: 0, ...over });
const record = (id: string): PackRecord => ({ id, tranche: "venue", region: CELL, fields: { name: field(`Fixture ${id}`), lat: field(43.7), lon: field(-79.4) } });
const line = (value: unknown) => JSON.stringify(value);
const hit = (id: string, over: Record<string, unknown> = {}) => ({ id, tranche: "venue", name: `Fixture ${id}`, nameNorm: `fixture ${id}`, lat: 43.7, lon: -79.4, ...over });

function packed(text: string | Uint8Array) {
  const bytes = typeof text === "string" ? new Uint8Array(gzipSync(text)) : text;
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), length: bytes.byteLength };
}

interface Options { lines: string[]; hits?: unknown[]; corrupt?: "always" | "once"; withheld?: PackManifest["withheld"]; omitPart?: boolean; db?: "memory" | "indexeddb" }

function server(options: Options) {
  const body = packed(options.lines.join("\n") + "\n");
  const hits = options.hits ?? [hit("a")];
  const search = packed(JSON.stringify(hits));
  const manifest: PackManifest = {
    version: 1, builtAt: "2026-11-16T00:00:00Z", sourceCommit: "fixture", sources: [source],
    regions: [{ id: "fixture-region", label: { en: "Fixture region", fr: "Région d’exemple" }, bbox: [-80, 43.5, -79, 44], cells: [CELL] }],
    tranches: { venue: { cells: options.omitPart ? {} : { [CELL]: { bbox: [-79.5, 43.5, -79, 44], parts: [{ path: PART, bytes: body.length, sha256: body.sha256, count: options.lines.length, sourceId: source.sourceId }] } } } },
    search: { [CELL]: { path: SEARCH, bytes: search.length, sha256: search.sha256, count: hits.length } },
    tiles: {}, counts: { records: options.lines.length, byTranche: {}, bySource: {} },
    ...(options.withheld ? { withheld: options.withheld } : {}),
  };
  let partCalls = 0;
  const fetcher = (async (input: RequestInfo | URL) => {
    const path = String(input).replace("/data/", "");
    if (path === "pack/v1/manifest.json") return Response.json(manifest);
    if (path === PART) {
      partCalls += 1;
      const broken = options.corrupt === "always" || (options.corrupt === "once" && partCalls === 1);
      const copy = new Uint8Array(body.bytes);
      if (broken) copy[copy.length - 6] = (copy[copy.length - 6] ?? 0) ^ 0xff;
      return new Response(copy);
    }
    if (path === SEARCH) return new Response(new Uint8Array(search.bytes));
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const client = createPackSource({ baseUrl: "/data/", fetch: fetcher, db: options.db ?? "memory" });
  return { client, manifest, partCalls: () => partCalls };
}

async function ids(client: ReturnType<typeof server>["client"]): Promise<string[]> {
  const found: string[] = [];
  for await (const item of client.records("venue", CELL)) found.push(item.id);
  return found;
}

afterEach(async () => {
  for (const entry of await indexedDB.databases()) if (entry.name) indexedDB.deleteDatabase(entry.name);
});

describe("a record that fails the device check is dropped, counted and never shown", () => {
  const good = [line(record("a")), line(record("b"))];
  const faults: Array<[string, string]> = [
    ["malformed JSON line", "{not json"],
    ["unknown tranche", line({ ...record("x"), tranche: "shop" })],
    ["missing provenance", line({ ...record("x"), fields: { name: { value: "Fixture x" } } })],
    ["missing licence", line({ ...record("x"), fields: { ...record("x").fields, name: field("Fixture x", { licence: "" }) } })],
    ["unknown enum: tier 9", line({ ...record("x"), fields: { ...record("x").fields, name: field("Fixture x", { tier: 9 }) } })],
    ["out-of-range coordinate", line({ ...record("x"), fields: { ...record("x").fields, lat: field(4370) } })],
    ["wrong type: latitude as a string", line({ ...record("x"), fields: { ...record("x").fields, lat: field("43.7") } })],
    ["source the manifest does not list", line({ ...record("x"), fields: { ...record("x").fields, name: field("Fixture x", { source_id: "unlisted" }) } })],
    ["missing id", line({ ...record("x"), id: "" })],
  ];
  for (const [label, bad] of faults) {
    it(`${label}: the other records in the part are shown`, async () => {
      const { client } = server({ lines: [good[0]!, bad, good[1]!] });
      await client.downloadCell!("fixture-region", CELL);
      expect(await ids(client)).toEqual(["a", "b"]);
      const status = (await client.regions())[0];
      expect(status?.downloaded).toBe(true);
      expect(status?.droppedRecords).toBe(1);
      const integrity = await client.storedRegionIntegrity("fixture-region");
      expect(integrity?.parts.every((part) => part.structurallyValid && part.actualCount === part.expectedCount)).toBe(true);
    });
  }

  it("a bad search entry is dropped and the rest of the index still works", async () => {
    const { client } = server({ lines: [line(record("a"))], hits: [hit("a"), hit("bad", { lat: Number.MAX_VALUE }), { id: 3 }] });
    await client.downloadCell!("fixture-region", CELL);
    expect((await client.search("fixture", {})).map((item) => item.id)).toEqual(["a"]);
    expect((await client.regions())[0]?.droppedRecords).toBe(2);
  });
});

describe("a part that fails its hash", () => {
  it("is fetched again once, and a good second copy is used", async () => {
    const f = server({ lines: [line(record("a"))], corrupt: "once" });
    await f.client.downloadCell!("fixture-region", CELL);
    expect(f.partCalls()).toBe(2);
    expect(await ids(f.client)).toEqual(["a"]);
  });

  it("is never stored when the second copy also fails, and the cell stays missing", async () => {
    const f = server({ lines: [line(record("a"))], corrupt: "always" });
    await expect(f.client.downloadCell!("fixture-region", CELL)).rejects.toMatchObject({ code: "sha256", part: PART });
    expect(f.partCalls()).toBe(2);
    expect(await ids(f.client)).toEqual([]);
    expect((await f.client.regions())[0]?.missingCells).toEqual([CELL]);
  });
});

describe("the last verified copy is kept until a new one verifies", () => {
  it("a rebuilt pack whose new part fails keeps showing the stored copy, marked stale", async () => {
    const first = server({ lines: [line(record("a")), line(record("b"))], db: "indexeddb" });
    await first.client.downloadCell!("fixture-region", CELL);
    const second = server({ lines: [line(record("a")), line(record("b")), line(record("c"))], corrupt: "always", db: "indexeddb" });
    expect(await ids(second.client)).toEqual(["a", "b"]);
    await expect(second.client.downloadCell!("fixture-region", CELL)).rejects.toMatchObject({ code: "sha256" });
    expect(await ids(second.client)).toEqual(["a", "b"]);
    const status = (await second.client.regions())[0];
    expect(status?.staleCells).toEqual([CELL]);
    expect(status?.downloaded).toBe(false);
  });

  it("a part the builder withheld keeps the stored copy; with no copy the region lists it as unavailable", async () => {
    const withheld = [{ path: PART, sourceId: source.sourceId, tranche: "venue" as const, cell: CELL, reason: "line 2 is not JSON" }];
    const fresh = server({ lines: [line(record("a"))], withheld, omitPart: true });
    await fresh.client.downloadCell!("fixture-region", CELL);
    expect(await ids(fresh.client)).toEqual([]);
    expect((await fresh.client.regions())[0]?.unavailable).toEqual(withheld);

    const first = server({ lines: [line(record("a"))], db: "indexeddb" });
    await first.client.downloadCell!("fixture-region", CELL);
    const rebuilt = server({ lines: [line(record("a"))], withheld, omitPart: true, db: "indexeddb" });
    expect(await ids(rebuilt.client)).toEqual(["a"]);
    const status = (await rebuilt.client.regions())[0];
    expect(status?.unavailable).toEqual([]);
    expect(status?.staleCells).toEqual([CELL]);
  });
});

describe("a bad manifest", () => {
  it("falls back to the saved manifest and keeps showing stored records", async () => {
    const first = server({ lines: [line(record("a"))], db: "indexeddb" });
    await first.client.downloadCell!("fixture-region", CELL);
    const broken = createPackSource({ baseUrl: "/data/", db: "indexeddb", fetch: (async () => new Response("{\"version\": 1, \"regions\": ")) as typeof fetch });
    expect((await broken.manifest()).builtAt).toBe("2026-11-16T00:00:00Z");
    expect(await ids(broken as ReturnType<typeof server>["client"])).toEqual(["a"]);
  });
});

describe("checkPackRecord under seeded fuzzing", () => {
  it("never throws and never accepts a record without full provenance", () => {
    let state = 7;
    const next = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    const nasty: unknown[] = [null, undefined, Number.NaN, "", "UNKNOWN", 9, -1, [], {}, "43.7", 1e9, true];
    for (let i = 0; i < 500; i += 1) {
      const value = JSON.parse(JSON.stringify(record(`f${i}`))) as Record<string, unknown>;
      const fields = value.fields as Record<string, Record<string, unknown>>;
      const name = ["name", "lat", "lon"][Math.floor(next() * 3)]!;
      const key = ["value", "source_id", "licence", "retrieved_at", "tier"][Math.floor(next() * 5)]!;
      const replacement = nasty[Math.floor(next() * nasty.length)];
      if (next() < 0.5) fields[name]![key] = replacement; else delete fields[name]![key];
      const result = checkPackRecord(value, new Set([source.sourceId]));
      if (result.ok) {
        for (const item of Object.values(fields)) {
          expect(typeof item.source_id === "string" && item.source_id !== "").toBe(true);
          expect(typeof item.licence === "string" && item.licence !== "").toBe(true);
          expect("value" in item).toBe(true);
        }
      }
    }
  });
});
