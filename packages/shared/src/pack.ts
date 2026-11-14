import { findForbiddenKeys, validateProvenance, type FieldIssue, type Provenance } from "./provenance.ts";

/**
 * Offline pack for one city. The pack is records the person downloads on purpose, with a manifest
 * that states size, dates, and counts before the download starts.
 *
 * Places and help numbers are prototype records (tier 0, 1, or E). Elevator status is a separate,
 * dated copy of an operator feed (tier 4). It is never shown as current: the screen labels it
 * last-checked with the feed time. A pack has no journey unless a planner produced one; an empty
 * list is stated, not filled.
 */
export const PACK_SCHEMA_VERSION = "offline-pack-1.0.0";

export interface PackSourceDate {
  source_name: string;
  licence: string;
  retrieved_at: string;
}

export interface PackCounts {
  places: number;
  help_numbers: number;
  elevator_status: number;
  journeys: number;
}

export interface PackManifest {
  schema_version: typeof PACK_SCHEMA_VERSION;
  pack_id: string;
  title: { en: string; fr: string };
  /** Date the pack file was built (YYYY-MM-DD). */
  built_at: string;
  /** Same-origin path of the content file. */
  content_path: string;
  /** Exact byte length of the content file. */
  size_bytes: number;
  /** Hex SHA-256 of the content file. */
  sha256: string;
  source_dates: PackSourceDate[];
  counts: PackCounts;
}

export interface PackPlace {
  id: string;
  name: string;
  category: string;
  /** OpenStreetMap wheelchair value as tagged, or UNKNOWN. Not a measurement. */
  wheelchair: string;
  wheelchair_description: string;
  address: string;
  lat: number;
  lon: number;
  provenance: Provenance;
}

export interface PackHelpNumber {
  id: string;
  name: { en: string; fr: string };
  contact: string;
  how: { en: string; fr: string };
  url: string | null;
  provenance: Provenance;
}

export interface PackElevatorStatus {
  id: string;
  station: string;
  /** Operator text, copied. */
  operator_text: string;
  operator_text_language: string;
  stop_ids: string[];
  /** Operator feed time (ISO). Shown as last checked. */
  checked_at: string;
  label: "last-checked";
  source_name: string;
  source_url: string | null;
  licence: string;
  retrieved_at: string;
  tier: 4;
}

export interface PackContent {
  schema_version: typeof PACK_SCHEMA_VERSION;
  pack_id: string;
  places: PackPlace[];
  help_numbers: PackHelpNumber[];
  elevator_status: PackElevatorStatus[];
  /** Saved journeys. Empty when no planner output is in the pack. */
  journeys: never[];
}

export interface StoredPack {
  pack_id: string;
  manifest: PackManifest;
  content: PackContent;
  stored_at: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/;

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isoTime(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

export function validateManifest(manifest: PackManifest): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (manifest?.schema_version !== PACK_SCHEMA_VERSION) issues.push({ field: "schema_version", code: "invalid_enum" });
  if (!text(manifest?.pack_id)) issues.push({ field: "pack_id", code: "missing_id" });
  if (!text(manifest?.title?.en) || !text(manifest?.title?.fr)) issues.push({ field: "title", code: "empty_title" });
  if (!DATE.test(manifest?.built_at ?? "")) issues.push({ field: "built_at", code: "invalid_date" });
  if (!text(manifest?.content_path) || !manifest.content_path.startsWith("/packs/")) issues.push({ field: "content_path", code: "invalid_path" });
  if (!Number.isInteger(manifest?.size_bytes) || manifest.size_bytes <= 0) issues.push({ field: "size_bytes", code: "invalid_size" });
  if (!HEX64.test(manifest?.sha256 ?? "")) issues.push({ field: "sha256", code: "invalid_hash" });
  if (!Array.isArray(manifest?.source_dates) || manifest.source_dates.length === 0) {
    issues.push({ field: "source_dates", code: "missing_source" });
  } else {
    manifest.source_dates.forEach((item, index) => {
      if (!text(item.source_name)) issues.push({ field: `source_dates[${index}].source_name`, code: "missing_source" });
      if (!text(item.licence)) issues.push({ field: `source_dates[${index}].licence`, code: "missing_licence" });
      if (!DATE.test(item.retrieved_at ?? "")) issues.push({ field: `source_dates[${index}].retrieved_at`, code: "invalid_date" });
    });
  }
  for (const key of ["places", "help_numbers", "elevator_status", "journeys"] as const) {
    const value = manifest?.counts?.[key];
    if (!Number.isInteger(value) || (value as number) < 0) issues.push({ field: `counts.${key}`, code: "invalid_count" });
  }
  return issues;
}

/** Content checks, including that every count matches the manifest. */
export function validatePackContent(content: PackContent, manifest: PackManifest): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (content?.schema_version !== PACK_SCHEMA_VERSION) issues.push({ field: "schema_version", code: "invalid_enum" });
  if (content?.pack_id !== manifest.pack_id) issues.push({ field: "pack_id", code: "pack_mismatch" });
  const lists = {
    places: content?.places,
    help_numbers: content?.help_numbers,
    elevator_status: content?.elevator_status,
    journeys: content?.journeys,
  };
  for (const [key, list] of Object.entries(lists)) {
    if (!Array.isArray(list)) {
      issues.push({ field: key, code: "missing_list" });
      continue;
    }
    if (list.length !== manifest.counts[key as keyof PackCounts]) issues.push({ field: key, code: "count_mismatch" });
  }
  if (issues.some((issue) => issue.code === "missing_list")) return issues;

  content.places.forEach((place, index) => {
    const at = `places[${index}]`;
    if (!text(place.id)) issues.push({ field: `${at}.id`, code: "missing_id" });
    for (const key of ["name", "category", "wheelchair", "wheelchair_description", "address"] as const) {
      if (!text(place[key])) issues.push({ field: `${at}.${key}`, code: "blank_not_unknown" });
    }
    if (typeof place.lat !== "number" || typeof place.lon !== "number") issues.push({ field: `${at}.lat`, code: "invalid_coordinate" });
    issues.push(...validateProvenance(place.provenance, `${at}.provenance`));
  });
  content.help_numbers.forEach((item, index) => {
    const at = `help_numbers[${index}]`;
    if (!text(item.id)) issues.push({ field: `${at}.id`, code: "missing_id" });
    if (!text(item.contact)) issues.push({ field: `${at}.contact`, code: "missing_contact" });
    if (!text(item.name?.en) || !text(item.name?.fr) || !text(item.how?.en) || !text(item.how?.fr)) {
      issues.push({ field: `${at}.name`, code: "missing_translation" });
    }
    issues.push(...validateProvenance(item.provenance, `${at}.provenance`));
  });
  content.elevator_status.forEach((item, index) => {
    const at = `elevator_status[${index}]`;
    if (!text(item.id)) issues.push({ field: `${at}.id`, code: "missing_id" });
    if (!text(item.station)) issues.push({ field: `${at}.station`, code: "blank_not_unknown" });
    if (!text(item.operator_text)) issues.push({ field: `${at}.operator_text`, code: "missing_text" });
    if (!isoTime(item.checked_at)) issues.push({ field: `${at}.checked_at`, code: "invalid_date" });
    if (item.label !== "last-checked") issues.push({ field: `${at}.label`, code: "must_be_last_checked" });
    if (item.tier !== 4) issues.push({ field: `${at}.tier`, code: "invalid_tier" });
    if (!text(item.source_name)) issues.push({ field: `${at}.source_name`, code: "missing_source" });
    if (!text(item.licence)) issues.push({ field: `${at}.licence`, code: "missing_licence" });
    if (!DATE.test(item.retrieved_at ?? "")) issues.push({ field: `${at}.retrieved_at`, code: "invalid_date" });
  });
  if (content.journeys.length > 0) issues.push({ field: "journeys", code: "journey_not_supported" });
  issues.push(...findForbiddenKeys(content, "content"));
  return issues;
}

/** An observation time must be a real time and not in the future (one minute of clock skew allowed). */
export function validateObservedAt(observedAt: string, nowIso: string): FieldIssue[] {
  const observed = Date.parse(observedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(observed)) return [{ field: "observed_at", code: "invalid_date" }];
  if (!Number.isNaN(now) && observed > now + 60_000) return [{ field: "observed_at", code: "in_future" }];
  return [];
}
