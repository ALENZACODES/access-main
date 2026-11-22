import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { PackManifest, PackPart, PackRecord } from "../../../../packages/data-client/src/types.ts";

/** Small, independent packs with real compressed bytes, record counts and digests. */
export function regionDownloadQueueFixture() {
  const source = {
    sourceId: "queue-test", name: "Example source", licence: "CC0-1.0",
    retrieved: "2026-01-15", inWebPack: true,
  };
  const manifest: PackManifest = {
    version: 1, sourceCommit: "fixture", builtAt: "2026-01-18T12:00:00Z",
    sources: [source], regions: [], search: {}, tranches: { venue: { cells: {} } }, tiles: {},
    counts: { records: 0, byTranche: {}, bySource: {} },
  };
  const parts = new Map<string, Buffer>();
  const northCells = ["n46.0_w082.0", "n46.5_w082.0"];
  const southCells = ["n44.0_w081.0"];
  const northLabel = { en: "North sample", fr: "Échantillon nord" };
  const southLabel = { en: "South sample", fr: "Échantillon sud" };

  function addRegion(id: string, label: { en: string; fr: string }, cells: string[]) {
    const bbox: [number, number, number, number] = [-83, 43, -80, 48];
    manifest.regions.push({ id, label, cells, bbox });
    return cells.map((cell) => {
      const record: PackRecord = {
        id: `example:${cell}`, tranche: "venue", region: id,
        fields: {
          name: {
            value: "UNKNOWN", source_id: source.sourceId, licence: source.licence,
            retrieved_at: source.retrieved, tier: 1,
          },
        },
      };
      const body = gzipSync(JSON.stringify(record) + "\n");
      const part: PackPart = {
        path: `venues/queue-test/${cell}.ndjson.gz`, bytes: body.byteLength,
        sha256: createHash("sha256").update(body).digest("hex"),
        count: 1, sourceId: source.sourceId,
      };
      manifest.tranches.venue!.cells[cell] = { bbox, parts: [part] };
      parts.set(part.path, body);
      manifest.counts.records++;
      return part.path;
    });
  }

  const north = addRegion("sample-north", northLabel, northCells);
  const south = addRegion("sample-south", southLabel, southCells);
  manifest.counts.byTranche.venue = manifest.counts.records;
  manifest.counts.bySource[source.sourceId] = manifest.counts.records;
  return {
    manifest, parts, north, south, northCells, southCells, northLabel, southLabel,
  };
}
