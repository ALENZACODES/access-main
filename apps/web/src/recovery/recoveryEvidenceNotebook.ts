import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";
import { isSafePackId } from "./packInventory";

/** A local note describes a file, never a physical location's accessibility. */
export type EvidenceValue = string | number | boolean | "UNKNOWN";
export type EvidenceTier = "official" | "community" | "self-reported" | "unknown";
export type EvidenceDecision = "open" | "accepted" | "superseded" | "dismissed";
export type EvidenceIssue =
  | "invalid-shape" | "invalid-version" | "too-large" | "too-many"
  | "invalid-date" | "future-date" | "invalid-id" | "duplicate-id"
  | "invalid-key" | "invalid-value" | "invalid-source" | "closed-licence"
  | "invalid-tier" | "invalid-note" | "invalid-decision" | "invalid-timestamp"
  | "invalid-history" | "unexpected-key" | "unsafe-text" | "conflict";

export interface EvidenceProvenance {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: EvidenceTier;
}

export interface EvidenceEntry {
  readonly id: string;
  readonly packId: string;
  readonly field: string;
  readonly value: EvidenceValue;
  readonly provenance: EvidenceProvenance;
  readonly note: string;
  readonly decision: EvidenceDecision;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EvidenceNotebook {
  readonly format: "recovery-evidence-notebook-v1";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entries: readonly EvidenceEntry[];
}

export type EvidenceResult =
  | { readonly ok: true; readonly notebook: EvidenceNotebook }
  | { readonly ok: false; readonly reason: EvidenceIssue; readonly path: string };

export interface EvidenceDraft {
  readonly packId: string;
  readonly field: string;
  readonly value: EvidenceValue;
  readonly provenance: EvidenceProvenance;
  readonly note?: string;
}

export interface EvidenceSummary {
  readonly total: number;
  readonly known: number;
  readonly unknown: number;
  readonly awaitingReview: number;
  readonly closed: number;
  readonly packs: number;
  readonly fields: number;
  readonly sources: number;
}

export interface EvidenceConflict {
  readonly id: string;
  readonly kind: "different-history" | "field-collision";
}

export interface EvidenceMergePreview {
  readonly incoming: number;
  readonly added: number;
  readonly duplicates: number;
  readonly conflicts: readonly EvidenceConflict[];
  readonly additions: readonly EvidenceEntry[];
}

export const EVIDENCE_LIMITS = {
  maxBytes: 512 * 1024,
  maxEntries: 600,
  maxText: 240,
  maxNote: 800,
  maxField: 80,
} as const;

const FORMAT = "recovery-evidence-notebook-v1" as const;
const DECISIONS: readonly EvidenceDecision[] = ["open", "accepted", "superseded", "dismissed"];
const TIERS: readonly EvidenceTier[] = ["official", "community", "self-reported", "unknown"];
const FIELD = /^[a-z][a-z0-9._-]*$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL = /\p{Cc}/u;
const DANGEROUS = /[<>]/;
const MAX_DATE = 8_640_000_000_000_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key)) &&
    required.every((key) => Object.hasOwn(value, key));
}

function safeText(value: unknown, maximum: number, empty = false): value is string {
  return typeof value === "string" && value.length <= maximum &&
    (empty || value.trim().length > 0) && !CONTROL.test(value) && !DANGEROUS.test(value);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && Math.abs(time) <= MAX_DATE && new Date(time).toISOString() === value;
}

function validDate(value: unknown, at: string): value is string {
  if (typeof value !== "string") return false;
  const timestamp = parseCalendarDate(value);
  return timestamp !== null && timestamp <= Date.parse(at.slice(0, 10) + "T00:00:00.000Z");
}

function isTier(value: unknown): value is EvidenceTier {
  return typeof value === "string" && TIERS.includes(value as EvidenceTier);
}

function isDecision(value: unknown): value is EvidenceDecision {
  return typeof value === "string" && DECISIONS.includes(value as EvidenceDecision);
}

function validateValue(value: unknown): value is EvidenceValue {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && Number.isSafeInteger(value);
  return safeText(value, EVIDENCE_LIMITS.maxText);
}

function validateProvenance(value: unknown, at: string): EvidenceIssue | null {
  if (!isObject(value) || !exactKeys(value,
    ["source", "licence", "date", "tier"], ["source", "licence", "date", "tier"])) return "invalid-source";
  if (!safeText(value.source, EVIDENCE_LIMITS.maxText)) return "invalid-source";
  if (!isOpenLicence(value.licence)) return "closed-licence";
  if (typeof value.date !== "string" || parseCalendarDate(value.date) === null) return "invalid-date";
  if (!validDate(value.date, at)) return "future-date";
  if (!isTier(value.tier)) return "invalid-tier";
  return null;
}

function validateEntry(value: unknown, documentTime: string): EvidenceIssue | null {
  if (!isObject(value) || !exactKeys(value,
    ["id", "packId", "field", "value", "provenance", "note", "decision", "createdAt", "updatedAt"],
    ["id", "packId", "field", "value", "provenance", "note", "decision", "createdAt", "updatedAt"])) return "invalid-shape";
  if (typeof value.id !== "string" || !ID.test(value.id)) return "invalid-id";
  if (!isSafePackId(value.packId)) return "invalid-id";
  if (typeof value.field !== "string" || value.field.length > EVIDENCE_LIMITS.maxField || !FIELD.test(value.field)) return "invalid-key";
  if (!validateValue(value.value)) return "invalid-value";
  if (!safeText(value.note, EVIDENCE_LIMITS.maxNote, true)) return "invalid-note";
  if (!isDecision(value.decision)) return "invalid-decision";
  if (!validTimestamp(value.createdAt) || !validTimestamp(value.updatedAt) ||
      value.createdAt > value.updatedAt || value.updatedAt > documentTime) return "invalid-timestamp";
  return validateProvenance(value.provenance, value.createdAt);
}

export function emptyEvidenceNotebook(now: string): EvidenceResult {
  if (!validTimestamp(now)) return { ok: false, reason: "invalid-timestamp", path: "createdAt" };
  return { ok: true, notebook: { format: FORMAT, createdAt: now, updatedAt: now, entries: [] } };
}

/** Parses untrusted local JSON; does not query files or open the network. */
export function parseEvidenceNotebook(text: string): EvidenceResult {
  if (new TextEncoder().encode(text).byteLength > EVIDENCE_LIMITS.maxBytes) {
    return { ok: false, reason: "too-large", path: "root" };
  }
  let document: unknown;
  try { document = JSON.parse(text) as unknown; }
  catch { return { ok: false, reason: "invalid-shape", path: "root" }; }
  return validateEvidenceNotebook(document);
}

/** Returns a defensive copy with a fixed schema and no unknown properties. */
export function validateEvidenceNotebook(value: unknown): EvidenceResult {
  if (!isObject(value) || !exactKeys(value,
    ["format", "createdAt", "updatedAt", "entries"],
    ["format", "createdAt", "updatedAt", "entries"])) return { ok: false, reason: "invalid-shape", path: "root" };
  if (value.format !== FORMAT) return { ok: false, reason: "invalid-version", path: "format" };
  if (!validTimestamp(value.createdAt) || !validTimestamp(value.updatedAt) ||
      value.createdAt > value.updatedAt) return { ok: false, reason: "invalid-timestamp", path: "updatedAt" };
  if (!Array.isArray(value.entries)) return { ok: false, reason: "invalid-shape", path: "entries" };
  if (value.entries.length > EVIDENCE_LIMITS.maxEntries) return { ok: false, reason: "too-many", path: "entries" };
  const ids = new Set<string>();
  const entries: EvidenceEntry[] = [];
  for (let index = 0; index < value.entries.length; index += 1) {
    const candidate: unknown = value.entries[index];
    const reason = validateEntry(candidate, value.updatedAt);
    if (reason !== null) return { ok: false, reason, path: `entries.${index}` };
    const entry = candidate as unknown as EvidenceEntry;
    if (ids.has(entry.id)) return { ok: false, reason: "duplicate-id", path: `entries.${index}.id` };
    ids.add(entry.id);
    entries.push({
      id: entry.id,
      packId: entry.packId,
      field: entry.field,
      value: entry.value,
      provenance: { ...entry.provenance },
      note: entry.note,
      decision: entry.decision,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }
  const notebook: EvidenceNotebook = {
    format: FORMAT,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    entries,
  };
  if (new TextEncoder().encode(JSON.stringify(notebook)).byteLength > EVIDENCE_LIMITS.maxBytes) {
    return { ok: false, reason: "too-large", path: "root" };
  }
  return { ok: true, notebook };
}

/** User-controlled creation; the caller provides the id and explicit timestamp. */
export function addEvidenceEntry(
  notebook: EvidenceNotebook, id: string, draft: EvidenceDraft, now: string,
): EvidenceResult {
  if (!validTimestamp(now) || now < notebook.updatedAt) {
    return { ok: false, reason: "invalid-timestamp", path: "updatedAt" };
  }
  const next: EvidenceEntry = {
    id, packId: draft.packId, field: draft.field, value: draft.value,
    provenance: draft.provenance, note: draft.note ?? "", decision: "open",
    createdAt: now, updatedAt: now,
  };
  return validateEvidenceNotebook({ ...notebook, updatedAt: now, entries: [...notebook.entries, next] });
}

/** Only review state can change; evidence and its provenance remain immutable. */
export function reviewEvidenceEntry(
  notebook: EvidenceNotebook, id: string, decision: EvidenceDecision, now: string,
): EvidenceResult {
  if (!notebook.entries.some((entry) => entry.id === id)) return { ok: false, reason: "invalid-id", path: "id" };
  if (!isDecision(decision)) return { ok: false, reason: "invalid-decision", path: "decision" };
  if (!validTimestamp(now) || now < notebook.updatedAt) return { ok: false, reason: "invalid-timestamp", path: "updatedAt" };
  const current = notebook.entries.find((entry) => entry.id === id);
  if (current?.decision !== "open" && current?.decision !== decision) {
    return { ok: false, reason: "invalid-history", path: "decision" };
  }
  const entries = notebook.entries.map((entry) => entry.id === id
    ? { ...entry, decision, updatedAt: now } : entry);
  return validateEvidenceNotebook({ ...notebook, updatedAt: now, entries });
}

export function summarizeEvidenceNotebook(notebook: EvidenceNotebook): EvidenceSummary {
  const packs = new Set(notebook.entries.map((entry) => entry.packId));
  const fields = new Set(notebook.entries.map((entry) => `${entry.packId}/${entry.field}`));
  const sources = new Set(notebook.entries.map((entry) => entry.provenance.source));
  return {
    total: notebook.entries.length,
    known: notebook.entries.filter((entry) => entry.value !== "UNKNOWN").length,
    unknown: notebook.entries.filter((entry) => entry.value === "UNKNOWN").length,
    awaitingReview: notebook.entries.filter((entry) => entry.decision === "open").length,
    closed: notebook.entries.filter((entry) => entry.decision !== "open").length,
    packs: packs.size, fields: fields.size, sources: sources.size,
  };
}

export function previewEvidenceMerge(
  current: EvidenceNotebook, incoming: EvidenceNotebook,
): EvidenceMergePreview {
  const prior = new Map(current.entries.map((entry) => [entry.id, entry]));
  const occupied = new Set(current.entries.map((entry) => `${entry.packId}/${entry.field}/${entry.createdAt}`));
  const additions: EvidenceEntry[] = [];
  const conflicts: EvidenceConflict[] = [];
  let duplicates = 0;
  for (const entry of incoming.entries) {
    const matched = prior.get(entry.id);
    if (matched) {
      if (JSON.stringify(matched) === JSON.stringify(entry)) duplicates += 1;
      else conflicts.push({ id: entry.id, kind: "different-history" });
    } else if (occupied.has(`${entry.packId}/${entry.field}/${entry.createdAt}`)) {
      conflicts.push({ id: entry.id, kind: "field-collision" });
    } else {
      additions.push(entry);
      occupied.add(`${entry.packId}/${entry.field}/${entry.createdAt}`);
    }
  }
  return { incoming: incoming.entries.length, added: additions.length, duplicates, conflicts, additions };
}

/** All-or-nothing import; existing notes can never be overwritten by a file. */
export function mergeEvidenceNotebook(
  current: EvidenceNotebook, incoming: EvidenceNotebook, now: string,
): EvidenceResult {
  if (!validTimestamp(now) || now < current.updatedAt || now < incoming.updatedAt) {
    return { ok: false, reason: "invalid-timestamp", path: "updatedAt" };
  }
  const preview = previewEvidenceMerge(current, incoming);
  if (preview.conflicts.length > 0) return { ok: false, reason: "conflict", path: "entries" };
  return validateEvidenceNotebook({
    format: FORMAT, createdAt: current.createdAt, updatedAt: now,
    entries: [...current.entries, ...preview.additions],
  });
}

export function exportEvidenceNotebook(notebook: EvidenceNotebook): string | null {
  const checked = validateEvidenceNotebook(notebook);
  if (!checked.ok) return null;
  return JSON.stringify(checked.notebook, null, 2) + "\n";
}
