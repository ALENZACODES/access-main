import type { SourceEntry } from "../types.ts";

/** Entirely synthetic metadata. No real place, agency, or accessibility facts. */
export const DEMONSTRATION_REGISTER: SourceEntry[] = [
  {
    id: "synthetic-seed",
    display_name: "Synthetic open-data illustration",
    official_url: "Unknown",
    licence: "Demonstration fixture (not an external data licence)",
    retrieved_on: "2026-11-01",
    as_of: "2026-11-01",
    record_count: 3,
    unknown_field_count: 2,
    tier_histogram: [{ tier: 0, prototype_label: "SEEDED-OPEN-DATA", count: 3 }],
    geography: "Ontario (illustrative only)",
    kind: "other",
    demonstration: true,
    example: true,
    provenance: {
      source: "Locally authored synthetic demonstration",
      licence: "Demonstration fixture (not an external data licence)",
      source_date: "2026-11-01",
      tier: 0,
      prototype_label: "SEEDED-OPEN-DATA",
    },
  },
  {
    id: "empty-feed",
    display_name: "Empty official-feed placeholder",
    official_url: "Unknown",
    licence: "No imported data",
    as_of: "Unknown",
    record_count: 0,
    unknown_field_count: 0,
    tier_histogram: [],
    geography: "Ontario (illustrative only)",
    kind: "directory links",
    demonstration: true,
    provenance: {
      source: "Locally authored empty placeholder; no feed connected",
      licence: "No imported data",
      source_date: "Unknown",
      tier: 0,
      prototype_label: "PROTOTYPE-UNVERIFIED",
    },
  },
];
