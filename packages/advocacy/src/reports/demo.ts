/**
 * DEMONSTRATION DATA. Every region, input set, consent entry and report below is synthetic,
 * defined by this package, and marked example: true. The region codes are invented ids, not
 * real places, and the population bands are invented too. Nothing here is a real statistic.
 */
import {
  CONSENT_ENTRY_SCHEMA_VERSION,
  INPUT_SET_SCHEMA_VERSION,
  REGION_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  type AdvocacyReport,
  type ConsentEntry,
  type InputSet,
  type PopulationBand,
  type Region,
  type ReportKind,
  type RequiredPurpose,
} from "./types.ts";
import type { CitationRecord, IncidentReview, PackDelivery } from "./kpi.ts";

export const DEMO_REPORT_AS_OF = "2026-11-15";
export const DEMO_PURPOSE: RequiredPurpose = { purpose_id: "example-advocacy-evidence", purpose_version: 1 };

function region(code: string, parent: string | null, band: PopulationBand): Region {
  return { record_type: "advocacy_region", schema_version: REGION_SCHEMA_VERSION, code, parent, population_band: band, example: true };
}

export const DEMO_REGIONS: readonly Region[] = [
  region("demo-area-north", null, "large"),
  region("demo-north-1", "demo-area-north", "large"),
  region("demo-north-2", "demo-area-north", "medium"),
  region("demo-area-east", null, "medium"),
  region("demo-east-1", "demo-area-east", "medium"),
  // A small community: the whole of demo-area-east is always shown as one row.
  region("demo-east-2", "demo-area-east", "small"),
  region("demo-area-west", null, "large"),
];

export const DEMO_INPUT_SETS: readonly InputSet[] = [
  {
    record_type: "advocacy_input_set",
    schema_version: INPUT_SET_SCHEMA_VERSION,
    id: "example-reports-a",
    example: true,
    source_name: "Demonstration reports defined by this package",
    source_url: null,
    licence: "not-a-real-dataset",
    source_date: "2026-11-01",
    tier: 0,
    label: "PROTOTYPE-UNVERIFIED",
  },
];

/** [kind, topic, region, month, number of synthetic reports] */
const ROWS: ReadonlyArray<readonly [ReportKind, string, string, string, number]> = [
  ["parking", "bay_misused", "demo-north-1", "2026-10", 14],
  ["parking", "bay_blocked", "demo-north-1", "2026-10", 9],
  ["parking", "no_bay_available", "demo-north-1", "2026-10", 2],
  ["parking", "bay_misused", "demo-north-2", "2026-10", 8],
  ["parking", "bay_blocked", "demo-north-2", "2026-10", 6],
  ["parking", "no_bay_available", "demo-north-2", "2026-10", 7],
  ["parking", "bay_misused", "demo-east-1", "2026-10", 5],
  ["parking", "bay_misused", "demo-east-2", "2026-10", 2],
  ["parking", "bay_blocked", "demo-east-2", "2026-10", 6],
  ["parking", "no_bay_available", "demo-east-1", "2026-10", 9],
  ["parking", "bay_misused", "demo-area-west", "2026-10", 11],
  ["parking", "bay_blocked", "demo-area-west", "2026-10", 7],
  ["parking", "no_bay_available", "demo-area-west", "2026-10", 6],
  ["barrier", "blocked_curb_cut", "demo-north-1", "2026-10", 12],
  ["barrier", "lift_out_of_service", "demo-north-1", "2026-10", 6],
  ["barrier", "blocked_curb_cut", "demo-area-west", "2026-10", 7],
  ["barrier", "lift_out_of_service", "demo-area-west", "2026-10", 8],
  ["barrier", "washroom_not_usable", "demo-area-west", "2026-10", 3],
  // Too few reports for a table: this one is withheld whole.
  ["coverage", "request_delayed", "demo-north-2", "2026-10", 3],
  ["housing_wait", "wait_12_to_35_months", "demo-north-1", "2026-09", 6],
  ["housing_wait", "wait_36_months_or_more", "demo-north-1", "2026-09", 5],
  ["housing_wait", "wait_12_to_35_months", "demo-area-west", "2026-09", 5],
  ["housing_wait", "wait_36_months_or_more", "demo-area-west", "2026-09", 9],
];

function expand(): { reports: AdvocacyReport[]; ledger: ConsentEntry[] } {
  const reports: AdvocacyReport[] = [];
  const ledger: ConsentEntry[] = [];
  for (const [kind, topic, regionCode, period, n] of ROWS) {
    for (let i = 0; i < n; i += 1) {
      const serial = String(reports.length + 1).padStart(4, "0");
      reports.push({
        record_type: "advocacy_report",
        schema_version: REPORT_SCHEMA_VERSION,
        id: `example-report-${serial}`,
        example: true,
        kind,
        topic,
        region_code: regionCode,
        period,
        set_id: "example-reports-a",
        consent_ref: `example-consent-${serial}`,
      });
      ledger.push({
        record_type: "advocacy_consent_entry",
        schema_version: CONSENT_ENTRY_SCHEMA_VERSION,
        ref: `example-consent-${serial}`,
        purpose_id: DEMO_PURPOSE.purpose_id,
        purpose_version: DEMO_PURPOSE.purpose_version,
        status: "granted",
      });
    }
  }
  return { reports, ledger };
}

const expanded = expand();
export const DEMO_REPORTS: readonly AdvocacyReport[] = expanded.reports;
export const DEMO_CONSENT_LEDGER: readonly ConsentEntry[] = expanded.ledger;

/** No delivery, citation or review has happened, so the demonstration logs are empty. */
export const DEMO_DELIVERIES: readonly PackDelivery[] = [];
export const DEMO_CITATIONS: readonly CitationRecord[] = [];
export const DEMO_REVIEWS: readonly IncidentReview[] = [];
