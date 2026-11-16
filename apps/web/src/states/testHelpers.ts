/** Test-only builders. Not exported from index.ts and contain no real data. */
import type { FeatureId } from "./dataStatus";
import type { PlaceReport } from "./placeSummary";

export const PROV = { source: "Test source", licence: "CC-BY-4.0", retrievedOn: "2026-10-01" } as const;
export const TODAY = "2026-11-15";

export function mkPlace(
  name: string,
  spec: Partial<Record<FeatureId, "yes" | "no" | "partial" | "unknown">>,
  provenance: unknown = PROV,
): PlaceReport {
  return {
    name,
    features: (Object.entries(spec) as [FeatureId, string][]).map(([feature, value]) =>
      value === "unknown" ? { feature, value } : { feature, value, provenance },
    ),
  };
}

import type { PlaceRecord } from "./placeRecord";

export const LOC_PROV = { source: "OpenStreetMap contributors", licence: "ODbL-1.0", retrievedOn: "2026-09-20", url: "https://www.openstreetmap.org/copyright" } as const;

export function mkRecord(
  id: string,
  name: string,
  spec: Parameters<typeof mkPlace>[1],
  loc?: { lat: unknown; lon: unknown; provenance?: unknown },
): PlaceRecord {
  return { id, ...mkPlace(name, spec), ...(loc ? { location: loc } : {}) };
}

/** Small in-memory KeyValueStore for tests. */
export class MemoryStore {
  data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
}
