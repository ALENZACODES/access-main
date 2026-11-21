/**
 * Consented, structured reports and the protected tables built from them.
 *
 * A report is one person's structured report. It holds a coarse region code and a month, never a
 * day, a time, an address or a position. Counts exist only after aggregation, and every count
 * that leaves this module has passed the disclosure rules in tables.ts.
 */
import type { LocalisedText } from "../types.ts";

export const UNKNOWN = "UNKNOWN" as const;

export const REPORT_SCHEMA_VERSION = "advocacy-report-1.0.0" as const;
export const INPUT_SET_SCHEMA_VERSION = "advocacy-input-set-1.0.0" as const;
export const REGION_SCHEMA_VERSION = "advocacy-region-1.0.0" as const;
export const CONSENT_ENTRY_SCHEMA_VERSION = "advocacy-consent-entry-1.0.0" as const;
export const REPORT_PACK_SCHEMA_VERSION = "advocacy-report-pack-1.0.0" as const;

export const REPORT_KINDS = ["barrier", "parking", "coverage", "housing_wait"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** Topic codes per kind. They are structured choices, never free text. "unknown" is a value. */
export const TOPICS = {
  barrier: ["blocked_curb_cut", "lift_out_of_service", "entrance_not_usable", "washroom_not_usable", "other", "unknown"],
  parking: ["bay_misused", "bay_blocked", "no_bay_available", "other", "unknown"],
  coverage: ["request_refused", "request_delayed", "partly_covered", "other", "unknown"],
  housing_wait: ["wait_under_12_months", "wait_12_to_35_months", "wait_36_months_or_more", "unknown"],
} as const satisfies Record<ReportKind, readonly string[]>;

/** Column that receives topics too small to stand alone. */
export const COMBINED_TOPIC = "combined_topics" as const;
/** Row that stands for every region together, after a roll-up reaches the top. */
export const ALL_REGIONS = "ALL" as const;
/** Label used on total lines in the CSV export. */
export const TOTAL = "TOTAL" as const;

export const PERIOD_GRAINS = ["month", "quarter", "year"] as const;
export type PeriodGrain = (typeof PERIOD_GRAINS)[number];

/** Coarse population size of a region. It is metadata about a place, never about a person. */
export const POPULATION_BANDS = ["small", "medium", "large", "unknown"] as const;
export type PopulationBand = (typeof POPULATION_BANDS)[number];

export const SET_TIERS = [0, 1, 2, "E"] as const;
export type SetTier = (typeof SET_TIERS)[number];
export const SET_LABELS = ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA", "COMMUNITY-REPORTED"] as const;
export type SetLabel = (typeof SET_LABELS)[number];

export interface AdvocacyReport {
  record_type: "advocacy_report";
  schema_version: typeof REPORT_SCHEMA_VERSION;
  id: string;
  /** True for demonstration records. */
  example: boolean;
  kind: ReportKind;
  topic: string;
  /** A code from the supplied region table, or "UNKNOWN". */
  region_code: string;
  /** YYYY-MM or "UNKNOWN". Nothing finer is accepted. */
  period: string;
  /** The input set this report belongs to. */
  set_id: string;
  /** Reference into the consent ledger. */
  consent_ref: string;
}

/** Provenance for one set of input reports. */
export interface InputSet {
  record_type: "advocacy_input_set";
  schema_version: typeof INPUT_SET_SCHEMA_VERSION;
  id: string;
  example: boolean;
  source_name: string;
  source_url: string | null;
  licence: string;
  /** YYYY-MM-DD or "UNKNOWN". */
  source_date: string;
  tier: SetTier;
  label: SetLabel | null;
}

export interface Region {
  record_type: "advocacy_region";
  schema_version: typeof REGION_SCHEMA_VERSION;
  code: string;
  /** The larger region this one rolls up into, or null at the top. */
  parent: string | null;
  population_band: PopulationBand;
  example: boolean;
}

/**
 * One line of the consent ledger. The status words are the ones the consent package uses for a
 * purpose (not_asked, granted, refused, revoked, outdated); only "granted" allows use.
 */
export const CONSENT_STATUSES = ["not_asked", "granted", "refused", "revoked", "outdated"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export interface ConsentEntry {
  record_type: "advocacy_consent_entry";
  schema_version: typeof CONSENT_ENTRY_SCHEMA_VERSION;
  ref: string;
  purpose_id: string;
  purpose_version: number;
  status: ConsentStatus;
}

/** The purpose a report's consent must cover before it can be counted. */
export interface RequiredPurpose {
  purpose_id: string;
  purpose_version: number;
}

export type TableCell = { state: "published"; count: number } | { state: "suppressed" };

export interface TableRow {
  region_code: string;
  /** One cell per column, in column order. */
  cells: TableCell[];
  total: number;
}

export interface PublishedTable {
  id: string;
  state: "published";
  kind: ReportKind;
  period: string;
  /** Topic codes, in a fixed order. */
  topics: string[];
  /** Topics folded into the combined column. Empty when none were. */
  combined_topics: string[];
  /** Rows that stand for a larger region and cover every region inside it. */
  rolled_up_rows: string[];
  rows: TableRow[];
  column_totals: number[];
  total: number;
  /** Primary and complementary suppressions together. The split is not published. */
  suppressed_cells: number;
}

/** A table whose total is below the minimum cell size. It carries no cell and no total. */
export interface WithheldTable {
  id: string;
  state: "withheld";
  kind: ReportKind;
  period: string;
}

export type ProtectedTable = PublishedTable | WithheldTable;

export interface ProvenanceEntry {
  set_id: string;
  source_name: string;
  source_url: string | null;
  licence: string;
  source_date: string;
  tier: SetTier;
  label: SetLabel | null;
  example: boolean;
}

export interface ReportEvidencePack {
  record_type: "advocacy_report_evidence_pack";
  schema_version: typeof REPORT_PACK_SCHEMA_VERSION;
  publication_context: "prototype";
  as_of: string;
  demonstration: boolean;
  period_grain: PeriodGrain;
  methodology: { en: string[]; fr: string[] };
  limits: { en: string[]; fr: string[] };
  suppression: {
    minimum_cell_size: number;
    rules: Array<{ id: string } & LocalisedText>;
    counts: {
      tables_published: number;
      tables_withheld: number;
      cells_published: number;
      cells_suppressed: number;
      rows_rolled_up: number;
      topics_combined: number;
    };
  };
  consent: { required_purpose: RequiredPurpose; all_reports_granted: true };
  provenance: ProvenanceEntry[];
  /** Sum of the totals of published tables. Reports in withheld tables are not counted here. */
  reports_in_published_tables: number;
  tables: ProtectedTable[];
  /** Fingerprint of everything above, so two builds can be compared. Not a security feature. */
  fingerprint: string;
}
