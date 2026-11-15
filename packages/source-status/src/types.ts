/** Dashboard-only inventory: never a statement about place accessibility. */
export type PrototypeTier = 0 | 1;
export type PrototypeLabel = "PROTOTYPE-UNVERIFIED" | "SEEDED-OPEN-DATA";
export type UnknownValue = "Unknown";
export type Count = number | UnknownValue;

export interface TierCount {
  tier: PrototypeTier;
  prototype_label: PrototypeLabel;
  count: number;
}

export interface SourceEntry {
  id: string;
  display_name: string;
  official_url: string | UnknownValue;
  licence: string;
  /** UTC calendar date (YYYY-MM-DD) when the source was fetched, or Unknown. */
  retrieved_on?: string | UnknownValue;
  /** UTC calendar date (YYYY-MM-DD) the data applies to, or Unknown. */
  as_of: string | UnknownValue;
  record_count: Count;
  unknown_field_count: Count;
  tier_histogram: TierCount[];
  geography: string;
  kind: "places" | "directory links" | "help" | "tiles" | "other";
  demonstration: boolean;
  example?: boolean;
  provenance: {
    source: string;
    licence: string;
    source_date: string | UnknownValue;
    tier: PrototypeTier;
    prototype_label: PrototypeLabel;
  };
}
