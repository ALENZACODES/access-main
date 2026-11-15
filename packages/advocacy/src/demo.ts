/**
 * DEMONSTRATION DATA. Every record below is synthetic, defined by this package, and marked
 * example: true. The areas are invented ids, not real municipalities. Nothing here is a real
 * statistic, and none of it can become a headline count.
 */
import {
  OBSERVATION_SCHEMA_VERSION,
  UNKNOWN,
  type Category,
  type CommunityBand,
  type Observation,
} from "./types.ts";

export const DEMO_AS_OF = "2026-11-15";

interface DemoRow {
  n: number;
  category: Category;
  area: string;
  band: CommunityBand;
  period: string;
  count: number | typeof UNKNOWN;
  date?: string;
}

function demo(row: DemoRow): Observation {
  const known = row.area !== UNKNOWN;
  return {
    record_type: "advocacy_observation",
    schema_version: OBSERVATION_SCHEMA_VERSION,
    id: `example-obs-${String(row.n).padStart(2, "0")}`,
    example: true,
    category: row.category,
    geography: { level: known ? "region" : "unknown", id: row.area, community_size_band: row.band },
    period: row.period,
    count: row.count,
    source_id: "example",
    source_name: "Demonstration data defined by this package",
    source_url: null,
    licence: "not-a-real-dataset",
    source_date: row.date ?? "2026-11-01",
    tier: 0,
    prototype_label: "PROTOTYPE-UNVERIFIED",
  };
}

export const DEMO_OBSERVATIONS: readonly Observation[] = [
  // Two observations merge into one cell of 42.
  demo({ n: 1, category: "parking", area: "demo-region-a", band: "large", period: "2026-10", count: 30 }),
  demo({ n: 2, category: "parking", area: "demo-region-a", band: "large", period: "2026-10", count: 12 }),
  demo({ n: 3, category: "outage", area: "demo-region-a", band: "large", period: "2026-10", count: 18 }),
  demo({ n: 4, category: "parking", area: "demo-region-b", band: "medium", period: "2026-10", count: 9 }),
  demo({ n: 5, category: "outage", area: "demo-region-b", band: "medium", period: "2026-10", count: 6 }),
  // A small community with a count of 1 and a count of 2: both are suppressed.
  demo({ n: 6, category: "parking", area: "demo-region-c", band: "small", period: "2026-10", count: 1 }),
  demo({ n: 7, category: "outage", area: "demo-region-c", band: "small", period: "2026-10", count: 2 }),
  // A small community above k but below the small-community minimum: suppressed.
  demo({ n: 8, category: "parking", area: "demo-region-c", band: "small", period: "2026-09", count: 12 }),
  demo({ n: 9, category: "parking", area: "demo-region-d", band: "small", period: "2026-10", count: 25 }),
  demo({ n: 10, category: "parking", area: "demo-region-e", band: "medium", period: "2026-10", count: 3 }),
  // Unknown stays unknown.
  demo({ n: 11, category: "outage", area: "demo-region-e", band: "medium", period: "2026-10", count: UNKNOWN }),
  demo({ n: 12, category: "parking", area: UNKNOWN, band: "unknown", period: "2026-10", count: 7 }),
  demo({ n: 13, category: "parking", area: UNKNOWN, band: "unknown", period: "2026-09", count: 50 }),
  demo({ n: 14, category: "parking", area: "demo-region-b", band: "medium", period: UNKNOWN, count: 8, date: UNKNOWN }),
];
