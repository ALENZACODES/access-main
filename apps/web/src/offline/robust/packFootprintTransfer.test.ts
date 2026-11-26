import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  createPackSource,
  type PackManifest,
  type PackPart,
} from "../../../../../packages/data-client/src/index";
import { measureFootprint, readFootprintEvidence } from "./packFootprint";
import { buildFootprintIndex } from "./packFootprintIndex";
import { measureRegionOmissions } from "./packFootprintOmissions";

// Exercise the same content-addressed pack client that supplies the offline page.
// Capture bytes at its fetch boundary: downloadCell's progress callback also
// counts bytes it found locally and cannot be used as network ground truth.
function transferFixture() {
  const payloads = new Map<string, Uint8Array<ArrayBuffer>>();
  const requests: { path: string; bytes: number }[] = [];
  const bounds: [number, number, number, number] = [-80, 43, -79, 44];
  function part(id: string): PackPart {
    const hit = { id, name: id, nameNorm: id, tranche: "venue", lat: 43.5, lon: -79.5 };
    const body = Uint8Array.from(gzipSync(JSON.stringify([hit])));
    const path = `pack/v1/search/${id}.json.gz`;
    payloads.set(path, body);
    return { path, bytes: body.length, count: 1, sha256: createHash("sha256").update(body).digest("hex") };
  }
  const crossing = part("crossing");
  const west = part("west");
  const east = part("eastern-shore");
  const regions = [
    { id: "west", cells: ["crossing", "west"] },
    { id: "east", cells: ["crossing", "east"] },
    { id: "bridge", cells: ["crossing"] },
  ].map(({ id, cells }) => ({ id, cells, bbox: bounds, label: { en: id, fr: id } }));
  const pack: PackManifest = {
    version: 1,
    builtAt: "2026-09-15T12:00:00Z",
    sourceCommit: "test",
    counts: { records: 0, bySource: {}, byTranche: {} },
    regions,
    sources: [],
    tiles: {},
    tranches: {},
    search: { crossing, west, east },
  };
  let rejectPath: string | null = null;
  const source = createPackSource({
    db: "memory",
    baseUrl: "/data/",
    async fetch(input) {
      const path = String(input).slice("/data/".length);
      if (path === "pack/v1/manifest.json") return Response.json(pack);
      const body = payloads.get(path);
      if (!body || rejectPath === path) return new Response(null, { status: 503 });
      requests.push({ path, bytes: body.byteLength });
      return new Response(body);
    },
  });
  async function forecast(ids: readonly string[]) {
    const [manifest, statuses] = await Promise.all([source.manifest(), source.regions()]);
    const index = buildFootprintIndex(manifest);
    const evidence = readFootprintEvidence(index, statuses);
    const before = requests.length;
    const plan = measureFootprint(index, evidence, ids);
    const omissions = measureRegionOmissions(index, evidence, plan);
    expect(requests).toHaveLength(before);
    return { plan, omissions };
  }
  function receivedSince(start: number) {
    return requests.slice(start).reduce((sum, row) => sum + row.bytes, 0);
  }
  return {
    crossing, east, west, source, requests, forecast, receivedSince,
    fail(path: string | null) { rejectPath = path; },
  };
}

describe("download size comparison against pack client transfers", () => {
  it("counts each shared digest once across three successive real downloads", async () => {
    const f = transferFixture();
    const ids = ["west", "east", "bridge"];
    const { plan } = await f.forecast(ids);
    for (const id of ids) await f.source.downloadRegion(id);
    const measured = f.receivedSince(0);
    expect(f.requests.map((row) => row.path)).toEqual([f.crossing.path, f.west.path, f.east.path]);
    expect(plan.transfer).toEqual({ minimumBytes: measured, maximumBytes: measured });
    expect(plan.declaredBytes).toBe(measured);
    expect(plan.countedOnceBytes).toBe(2 * f.crossing.bytes);
    const after = await f.forecast(ids);
    expect(after.plan.presentBytes).toBe(measured);
    expect(after.plan.transfer).toEqual({ minimumBytes: 0, maximumBytes: 0 });
  });

  it("updates an unowned neighbouring region after one shared cell commits", async () => {
    const f = transferFixture();
    await f.source.downloadCell!("west", "crossing");
    const rows = await f.source.regions();
    expect(rows.find((row) => row.id === "bridge")).toMatchObject({ downloaded: false, missingCells: [] });
    const before = f.requests.length;
    const { plan } = await f.forecast(["east", "bridge"]);
    expect(plan.presentBytes).toBe(f.crossing.bytes);
    expect(plan.transfer).toEqual({ minimumBytes: f.east.bytes, maximumBytes: f.east.bytes });
    await f.source.downloadRegion("bridge");
    expect(f.requests).toHaveLength(before);
    await f.source.downloadRegion("east");
    expect(f.receivedSince(before)).toBe(plan.transfer.maximumBytes);
  });

  it("keeps a failed region transaction out of the cached estimate", async () => {
    const f = transferFixture();
    const first = await f.forecast(["east"]);
    f.fail(f.east.path);
    await expect(f.source.downloadRegion("east")).rejects.toMatchObject({ code: "network" });
    // The crossing reached the client, but its region transaction never committed.
    expect(f.receivedSince(0)).toBe(f.crossing.bytes);
    const retry = await f.forecast(["east"]);
    expect(retry.plan.transfer).toEqual(first.plan.transfer);
    expect(retry.plan.presentBytes).toBe(0);
    const before = f.requests.length;
    f.fail(null);
    await f.source.downloadRegion("east");
    expect(f.receivedSince(before)).toBe(retry.plan.transfer.minimumBytes);
  });

  it("retains shared parts owned by a second region when the first is removed", async () => {
    const f = transferFixture();
    await f.source.downloadRegion("west");
    await f.source.downloadRegion("east");
    await f.source.deleteRegion("west");
    const removed = await f.forecast(["west", "east"]);
    expect(removed.plan.transfer).toEqual({ minimumBytes: f.west.bytes, maximumBytes: f.west.bytes });
    const east = removed.omissions.find((row) => row.regionId === "east");
    expect(east).toMatchObject({ exclusiveBytes: f.east.bytes, maximumTransferReduction: 0 });
    const before = f.requests.length;
    await f.source.downloadRegion("west");
    expect(f.receivedSince(before)).toBe(f.west.bytes);
  });

  it("distinguishes omitting the first region from moving it to the end", async () => {
    const f = transferFixture();
    await f.source.downloadCell!("east", "east");
    const original = await f.forecast(["west", "east", "bridge"]);
    const reordered = await f.forecast(["east", "bridge", "west"]);
    const omitted = await f.forecast(["east", "bridge"]);
    expect(original.plan.transfer).toEqual(reordered.plan.transfer);
    expect(original.plan.steps[0]?.additionalBytes).toBe(f.crossing.bytes + f.west.bytes);
    expect(reordered.plan.steps[2]?.additionalBytes).toBe(f.west.bytes);
    const west = original.omissions.find((row) => row.regionId === "west");
    expect(west?.maximumTransferReduction).toBe(f.west.bytes);
    const before = f.requests.length;
    await f.source.downloadRegion("east");
    await f.source.downloadRegion("bridge");
    expect(omitted.plan.transfer.maximumBytes).toBe(f.receivedSince(before));
    expect(f.receivedSince(before) + west!.maximumTransferReduction!).toBe(original.plan.transfer.maximumBytes);
  });
});
