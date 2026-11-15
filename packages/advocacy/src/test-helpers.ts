import { OBSERVATION_SCHEMA_VERSION, UNKNOWN, type Observation } from "./types.ts";

/** A synthetic observation for tests. Marked example by default so it is never a headline count. */
export function obs(overrides: Partial<Omit<Observation, "geography">> & { area?: string; band?: Observation["geography"]["community_size_band"] } = {}): Observation {
  const { area = "test-area-a", band = "large", ...rest } = overrides;
  return {
    record_type: "advocacy_observation",
    schema_version: OBSERVATION_SCHEMA_VERSION,
    id: "example-test-01",
    example: true,
    category: "parking",
    geography: { level: area === UNKNOWN ? "unknown" : "region", id: area, community_size_band: band },
    period: "2026-10",
    count: 10,
    source_id: "example",
    source_name: "Test data",
    source_url: null,
    licence: "not-a-real-dataset",
    source_date: "2026-11-01",
    tier: 0,
    prototype_label: "PROTOTYPE-UNVERIFIED",
    ...rest,
  };
}
