/**
 * Conservative continuity rules for evidence while moving between routes,
 * languages and offline modes. These do not establish place accessibility.
 */
import { isOpenLicence, isUnknown, parseCalendarDate, type Locale } from "./p20l-provenance";

export type EvidenceState = "KNOWN" | "UNKNOWN";
export type Connectivity = "online" | "offline";
export type EvidenceKey = "source" | "licence" | "date" | "tier";

export interface EvidenceSnapshot {
  readonly id: string;
  readonly route: string;
  readonly locale: Locale;
  readonly connectivity: Connectivity;
  readonly source: string | null;
  readonly licence: string | null;
  readonly date: string | null;
  readonly tier: string | null;
  readonly state: EvidenceState;
}

export interface TransitionIssue {
  readonly code: string;
  readonly id: string;
  readonly detail: string;
}

const FIELDS: readonly EvidenceKey[] = ["source", "licence", "date", "tier"];

function issue(code: string, id: string, detail: string): TransitionIssue {
  return { code, id, detail };
}

/** Only a non-empty record ID can form a stable identity. */
export function safeIdentity(value: string): string | null {
  const id = value.normalize("NFC").trim();
  if (!id || id.length > 160 || [...id].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  })) return null;
  return id;
}

/** Reject unsupported or malformed route identifiers without decoding them. */
export function isLocalRoute(route: string): boolean {
  if (!route.startsWith("/") || route.startsWith("//")) return false;
  if (/[?#\\]/u.test(route)) return false;
  return !route.split("/").some((part) => part === "." || part === "..");
}

/** Missing metadata can never be transformed into an affirmative state. */
export function hasCompleteEvidence(entry: EvidenceSnapshot): boolean {
  if (!safeIdentity(entry.id) || !isLocalRoute(entry.route)) return false;
  for (const field of FIELDS) {
    if (isUnknown(entry[field])) return false;
  }
  return parseCalendarDate(entry.date ?? "") && isOpenLicence(entry.licence ?? "");
}

/** Preserve a visible UNKNOWN state even if metadata happens to be populated. */
export function effectiveEvidenceState(entry: EvidenceSnapshot): EvidenceState {
  return entry.state === "KNOWN" && hasCompleteEvidence(entry) ? "KNOWN" : "UNKNOWN";
}

/**
 * A translation must not silently add evidence fields that were absent on the
 * preceding screen. Localised labels may change, but metadata must not.
 */
export function compareLocaleEvidence(
  before: EvidenceSnapshot,
  after: EvidenceSnapshot,
): TransitionIssue[] {
  const result: TransitionIssue[] = [];
  const id = safeIdentity(before.id) ?? "unknown-record";
  if (before.id !== after.id) return [issue("record-identity", id, "Record identity changed")];
  if (before.locale === after.locale) {
    result.push(issue("locale-not-changed", id, "Both snapshots use the same language"));
  }
  for (const field of FIELDS) {
    const left = before[field];
    const right = after[field];
    if (isUnknown(left) && !isUnknown(right)) {
      result.push(issue("unknown-upgraded", id, field));
    } else if (!isUnknown(left) && isUnknown(right)) {
      result.push(issue("evidence-disappeared", id, field));
    } else if (!isUnknown(left) && !isUnknown(right) && left !== right) {
      result.push(issue("evidence-changed", id, field));
    }
  }
  if (effectiveEvidenceState(before) === "UNKNOWN" && effectiveEvidenceState(after) === "KNOWN") {
    result.push(issue("state-upgraded", id, "Uncertain evidence became known"));
  }
  return result;
}

/**
 * Connectivity changes must never supply new positive evidence. Local copies
 * may lose fields or become unavailable; that is reported separately.
 */
export function compareOfflineEvidence(
  online: EvidenceSnapshot,
  offline: EvidenceSnapshot,
): TransitionIssue[] {
  const id = safeIdentity(online.id) ?? "unknown-record";
  const result: TransitionIssue[] = [];
  if (online.id !== offline.id) return [issue("record-identity", id, "Record identity changed")];
  if (online.connectivity !== "online" || offline.connectivity !== "offline") {
    result.push(issue("connectivity-order", id, "Expected online followed by offline"));
  }
  if (online.locale !== offline.locale) {
    result.push(issue("locale-changed-offline", id, "Language changed without a selection"));
  }
  for (const field of FIELDS) {
    if (isUnknown(online[field]) && !isUnknown(offline[field])) {
      result.push(issue("offline-inferred", id, field));
    }
    if (!isUnknown(online[field]) && !isUnknown(offline[field]) && online[field] !== offline[field]) {
      result.push(issue("offline-metadata-changed", id, field));
    }
  }
  if (effectiveEvidenceState(online) === "UNKNOWN" && effectiveEvidenceState(offline) === "KNOWN") {
    result.push(issue("offline-state-upgraded", id, "Uncertain evidence became known while offline"));
  }
  return result;
}

/** Multiple cards with the same ID need the same evidence state. */
export function duplicateEvidenceIssues(entries: readonly EvidenceSnapshot[]): TransitionIssue[] {
  const seen = new Map<string, EvidenceSnapshot>();
  const result: TransitionIssue[] = [];
  for (const entry of entries) {
    const id = safeIdentity(entry.id);
    if (!id) {
      result.push(issue("invalid-identity", "unknown-record", "Missing or malformed identifier"));
      continue;
    }
    const previous = seen.get(id);
    if (!previous) {
      seen.set(id, entry);
      continue;
    }
    if (previous.route === entry.route && previous.locale === entry.locale) {
      result.push(issue("duplicate-record", id, "Repeated record in one route and language"));
    }
    if (effectiveEvidenceState(previous) !== effectiveEvidenceState(entry)) {
      result.push(issue("inconsistent-state", id, "Same record has inconsistent evidence status"));
    }
  }
  return result;
}

export function formatTransitionIssues(issues: readonly TransitionIssue[]): string {
  return issues.map((entry) => `${entry.code} (${entry.id}): ${entry.detail}`).join("\n");
}
