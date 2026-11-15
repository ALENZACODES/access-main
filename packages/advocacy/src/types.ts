/**
 * Typed input interface and output records for the advocacy slice.
 * Unknown is a value: counts, periods, dates and areas may be the token "UNKNOWN".
 * No field holds personal data.
 */

export const UNKNOWN = "UNKNOWN" as const;
export type UnknownToken = typeof UNKNOWN;

export const OBSERVATION_SCHEMA_VERSION = "advocacy-observation-1.0.0" as const;
export const CELL_SCHEMA_VERSION = "advocacy-cell-1.0.0" as const;
export const PACK_SCHEMA_VERSION = "advocacy-pack-1.0.0" as const;

export const CATEGORIES = ["parking", "outage", "unknown"] as const;
export type Category = (typeof CATEGORIES)[number];

export const GEOGRAPHY_LEVELS = ["region", "unknown"] as const;
export type GeographyLevel = (typeof GEOGRAPHY_LEVELS)[number];

/** Coarse community size. It is metadata about an area, never about a person. */
export const COMMUNITY_BANDS = ["small", "medium", "large", "unknown"] as const;
export type CommunityBand = (typeof COMMUNITY_BANDS)[number];

/** Prototype records may carry tiers 0, 1 and E only. Tiers 2, 3 and 4 are refused. */
export const PROTOTYPE_TIERS = [0, 1, "E"] as const;
export type Tier = (typeof PROTOTYPE_TIERS)[number];

/** Prototype records may carry these two labels only. VERIFIED is refused. */
export const PROTOTYPE_LABELS = ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA"] as const;
export type PrototypeLabel = (typeof PROTOTYPE_LABELS)[number];

export interface Geography {
  level: GeographyLevel;
  /** A coarse area id, or "UNKNOWN" when level is "unknown". */
  id: string;
}

export interface Observation {
  record_type: "advocacy_observation";
  schema_version: typeof OBSERVATION_SCHEMA_VERSION;
  id: string;
  /** True for demonstration records. They are never headline counts. */
  example: boolean;
  category: Category;
  geography: Geography & { community_size_band: CommunityBand };
  /** YYYY-MM or "UNKNOWN". */
  period: string;
  count: number | UnknownToken;
  source_id: string;
  source_name: string;
  source_url: string | null;
  licence: string;
  /** YYYY-MM-DD or "UNKNOWN". */
  source_date: string;
  tier: Tier;
  prototype_label: PrototypeLabel | null;
}

export const HEADLINE_EXCLUSIONS = [
  "example_record",
  "fixture_record",
  "undated",
  "future_dated",
  "too_old",
  "status_window",
] as const;
export type HeadlineExclusion = (typeof HEADLINE_EXCLUSIONS)[number];

export interface CellProvenance {
  source_ids: string[];
  licences: string[];
  tiers: Tier[];
  prototype_labels: PrototypeLabel[];
  latest_source_date: string;
}

interface CellBase {
  record_type: "advocacy_cell";
  schema_version: typeof CELL_SCHEMA_VERSION;
  category: Category;
  geography: Geography;
  period: string;
}

export interface PublishedCell extends CellBase {
  state: "published";
  count: number;
  example: boolean;
  headline_eligible: boolean;
  headline_exclusions: HeadlineExclusion[];
  provenance: CellProvenance;
}

export interface UnknownCell extends CellBase {
  state: "unknown";
  example: boolean;
  provenance: CellProvenance;
}

/** A suppressed cell carries no count, no reason, and no provenance. */
export interface SuppressedCell extends CellBase {
  state: "suppressed";
}

export type Cell = PublishedCell | UnknownCell | SuppressedCell;

export interface LocalisedText {
  en: string;
  fr: string;
}

export interface EvidencePack {
  record_type: "advocacy_evidence_pack";
  schema_version: typeof PACK_SCHEMA_VERSION;
  publication_context: "prototype";
  as_of: string;
  demonstration: boolean;
  methodology: { en: string[]; fr: string[] };
  suppression: {
    k: number;
    small_community_factor: number;
    small_community_minimum: number;
    raw_counts_withheld: true;
    totals_published: false;
    rules: Array<{ id: string } & LocalisedText>;
  };
  counting: {
    reference: "packages/schema/docs/counting-rules.md";
    headline_max_age_days: 730;
    status_window_days: 30;
    note: LocalisedText;
  };
  headline: { eligible_cells: number; province_wide_total: null };
  inputs: {
    observations_received: number;
    observations_accepted: number;
    observations_rejected: number;
    example_observations: number;
  };
  counts: { published: number; suppressed: number; unknown: number };
  cells: Cell[];
}
