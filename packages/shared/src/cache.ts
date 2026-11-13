import { findForbiddenKeys, validateProvenance, type FieldIssue, type Provenance } from "./provenance.ts";

export const CACHE_KINDS = [
  "place",
  "journey",
  "finder",
  "directory-link",
  "help-article",
  "activity-pack",
] as const;

export type CacheKind = (typeof CACHE_KINDS)[number];

export interface CacheEntry {
  id: string;
  kind: CacheKind;
  title: string;
  stored_at: string;
  provenance: Provenance;
  /** Live elevator and disruption status is never stored for offline use. */
  contains_live_status: false;
  payload: Record<string, unknown>;
}

export interface OutboxItem {
  id: string;
  created_at: string;
  kind: "correction-report";
  based_on_record_id: string | null;
  note: string;
  status: "queued-on-device";
}

const MAX_PAYLOAD_CHARS = 1_000_000;
const MAX_NOTE = 500;

export function validateCacheEntry(entry: CacheEntry): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!entry.id?.trim()) issues.push({ field: "id", code: "missing_id" });
  if (!(CACHE_KINDS as readonly string[]).includes(entry.kind)) issues.push({ field: "kind", code: "invalid_enum" });
  if (!entry.title?.trim()) issues.push({ field: "title", code: "empty_title" });
  if (entry.contains_live_status !== false) issues.push({ field: "contains_live_status", code: "live_status_not_cached" });
  issues.push(...validateProvenance(entry.provenance));
  issues.push(...findForbiddenKeys(entry.payload, "payload"));
  if (JSON.stringify(entry.payload).length > MAX_PAYLOAD_CHARS) {
    issues.push({ field: "payload", code: "too_large" });
  }
  if (entry.kind === "directory-link") {
    if (entry.payload.eligibility_advice !== false) {
      issues.push({ field: "payload.eligibility_advice", code: "eligibility_advice" });
    }
    const url = entry.payload.official_url;
    if (typeof url !== "string" || !url.startsWith("https://")) {
      issues.push({ field: "payload.official_url", code: "invalid_url" });
    }
  }
  if (entry.kind === "activity-pack") {
    if (entry.payload.clinical_claim !== false) issues.push({ field: "payload.clinical_claim", code: "clinical_claim" });
    if (entry.payload.seizure_risk_flash !== false) issues.push({ field: "payload.seizure_risk_flash", code: "flash" });
  }
  return issues;
}

export function estimateEntryBytes(entry: CacheEntry): number {
  const json = JSON.stringify(entry);
  let bytes = 0;
  for (const char of json) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export function withinStorageLimit(existingBytes: number, entry: CacheEntry, limitMb: number | null): boolean {
  if (limitMb === null) return true;
  return existingBytes + estimateEntryBytes(entry) <= limitMb * 1024 * 1024;
}

export function validateOutboxNote(note: string): FieldIssue[] {
  const trimmed = note.trim();
  if (!trimmed) return [{ field: "note", code: "empty_title" }];
  if (trimmed.length > MAX_NOTE) return [{ field: "note", code: "too_long" }];
  return [];
}
