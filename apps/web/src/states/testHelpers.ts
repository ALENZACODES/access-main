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
