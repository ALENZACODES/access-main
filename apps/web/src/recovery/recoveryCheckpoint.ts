import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** Manually recorded file observations; never a claim about a place or person. */
export type CheckpointOperation = "pack" | "download" | "export";
export type CheckpointCondition = "UNKNOWN" | "missing" | "interrupted" | "damaged" | "available";
export type CheckpointTier = "UNKNOWN" | "user-observation" | "file-metadata" | "source-document";
export type CheckpointPhase = "draft" | "reviewed" | "disputed";
export type CheckpointIssue =
  | "shape" | "format" | "limit" | "identity" | "date" | "time" | "text"
  | "source" | "licence" | "tier" | "condition" | "phase" | "duplicate"
  | "sequence" | "transition" | "conflict" | "missing";

export interface CheckpointSource {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: CheckpointTier;
  readonly reference: string;
}
export interface FileObservation {
  /** A recorded size, or null when it was unavailable to the person. */
  readonly bytes: number | null;
  /** A caller-supplied digest, or null. This module does not digest files. */
  readonly digest: string | null;
  /** No status is inferred from a digest or reported byte count. */
  readonly condition: CheckpointCondition;
  readonly note: string;
}
export interface CheckpointEntry {
  readonly id: string;
  readonly packId: string;
  readonly operation: CheckpointOperation;
  readonly capturedAt: string;
  readonly source: CheckpointSource;
  readonly observation: FileObservation;
  readonly phase: CheckpointPhase;
}
export interface CheckpointDocument {
  readonly format: "local-recovery-checkpoints";
  readonly version: 1;
  readonly entries: readonly CheckpointEntry[];
}
export type CheckpointResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: CheckpointIssue };

export const CHECKPOINT_LIMITS = {
  entries: 300,
  bytes: 384 * 1024,
  id: 96,
  note: 700,
  name: 180,
  reference: 180,
} as const;
export const CHECKPOINT_OPERATIONS: readonly CheckpointOperation[] = ["pack", "download", "export"];
export const CHECKPOINT_CONDITIONS: readonly CheckpointCondition[] = ["UNKNOWN", "missing", "interrupted", "damaged", "available"];
export const CHECKPOINT_TIERS: readonly CheckpointTier[] = ["UNKNOWN", "user-observation", "file-metadata", "source-document"];
export const CHECKPOINT_PHASES: readonly CheckpointPhase[] = ["draft", "reviewed", "disputed"];
export const CHECKPOINT_LICENCES = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"] as const;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DIGEST = /^[a-f0-9]{64}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL = /\p{Cc}/u;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length &&
    Object.keys(value).every((key) => expected.includes(key));
}
function text(value: unknown, max: number, optional = false): value is string {
  return typeof value === "string" && value.length <= max &&
    (optional || value.trim().length > 0) &&
    !CONTROL.test(value) && !value.includes("<") && !value.includes(">");
}
function id(value: unknown): value is string {
  return text(value, CHECKPOINT_LIMITS.id) && IDENTIFIER.test(value) &&
    value !== "." && value !== "..";
}
export function checkpointInstant(value: unknown): value is string {
  if (typeof value !== "string" || !INSTANT.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
export function checkpointDate(value: unknown): value is string {
  return typeof value === "string" && parseCalendarDate(value) !== null;
}
export function validateCheckpointSource(value: unknown): CheckpointIssue | null {
  if (!record(value) || !exactKeys(value, ["name", "licence", "date", "tier", "reference"])) {
    return "source";
  }
  if (!text(value.name, CHECKPOINT_LIMITS.name) || !text(value.reference, CHECKPOINT_LIMITS.reference, true)) {
    return "source";
  }
  if (!isOpenLicence(value.licence)) return "licence";
  if (!checkpointDate(value.date)) return "date";
  if (!CHECKPOINT_TIERS.includes(value.tier as CheckpointTier)) return "tier";
  return null;
}
export function validateFileObservation(value: unknown): CheckpointIssue | null {
  if (!record(value) || !exactKeys(value, ["bytes", "digest", "condition", "note"])) return "shape";
  if (value.bytes !== null && (!Number.isSafeInteger(value.bytes) || (value.bytes as number) < 0)) return "shape";
  if (value.digest !== null && (typeof value.digest !== "string" || !DIGEST.test(value.digest))) return "shape";
  if (!CHECKPOINT_CONDITIONS.includes(value.condition as CheckpointCondition)) return "condition";
  if (!text(value.note, CHECKPOINT_LIMITS.note, true)) return "text";
  return null;
}
export function validateCheckpoint(value: unknown): CheckpointIssue | null {
  if (!record(value) || !exactKeys(value,
    ["id", "packId", "operation", "capturedAt", "source", "observation", "phase"])) return "shape";
  if (!id(value.id) || !isSafePackId(value.packId)) return "identity";
  if (!CHECKPOINT_OPERATIONS.includes(value.operation as CheckpointOperation)) return "shape";
  if (!checkpointInstant(value.capturedAt)) return "time";
  const issue = validateCheckpointSource(value.source);
  if (issue !== null) return issue;
  const observationIssue = validateFileObservation(value.observation);
  if (observationIssue !== null) return observationIssue;
  if (!CHECKPOINT_PHASES.includes(value.phase as CheckpointPhase)) return "phase";
  return null;
}
export function emptyCheckpointDocument(): CheckpointDocument {
  return { format: "local-recovery-checkpoints", version: 1, entries: [] };
}
function copyCheckpoint(entry: CheckpointEntry): CheckpointEntry {
  return { ...entry, source: { ...entry.source }, observation: { ...entry.observation } };
}
export function validateCheckpointDocument(value: unknown): CheckpointResult<CheckpointDocument> {
  if (!record(value) || !exactKeys(value, ["format", "version", "entries"]) ||
    value.format !== "local-recovery-checkpoints" || value.version !== 1 || !Array.isArray(value.entries)) {
    return { ok: false, issue: "format" };
  }
  if (value.entries.length > CHECKPOINT_LIMITS.entries) return { ok: false, issue: "limit" };
  const entries: CheckpointEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value.entries as unknown[]) {
    const issue = validateCheckpoint(raw);
    if (issue !== null) return { ok: false, issue };
    const entry = raw as CheckpointEntry;
    if (seen.has(entry.id)) return { ok: false, issue: "duplicate" };
    seen.add(entry.id);
    entries.push(copyCheckpoint(entry));
  }
  return { ok: true, value: { format: "local-recovery-checkpoints", version: 1, entries } };
}
export function addCheckpoint(document: CheckpointDocument, entry: CheckpointEntry): CheckpointResult<CheckpointDocument> {
  const current = validateCheckpointDocument(document);
  if (!current.ok) return current;
  const issue = validateCheckpoint(entry);
  if (issue !== null) return { ok: false, issue };
  if (current.value.entries.some((item) => item.id === entry.id)) return { ok: false, issue: "duplicate" };
  if (current.value.entries.length === CHECKPOINT_LIMITS.entries) return { ok: false, issue: "limit" };
  return { ok: true, value: { ...current.value, entries: [...current.value.entries, copyCheckpoint(entry)] } };
}
/** A manual review changes only the review flag, never the observed condition. */
export function reviewCheckpoint(
  document: CheckpointDocument, checkpointId: string, phase: Exclude<CheckpointPhase, "draft">,
): CheckpointResult<CheckpointDocument> {
  const current = validateCheckpointDocument(document);
  if (!current.ok) return current;
  const item = current.value.entries.find((entry) => entry.id === checkpointId);
  if (!item) return { ok: false, issue: "missing" };
  if (item.phase !== "draft") return { ok: false, issue: "transition" };
  return { ok: true, value: {
    ...current.value,
    entries: current.value.entries.map((entry) => entry.id === checkpointId ? { ...entry, phase } : entry),
  } };
}
export function parseCheckpointDocument(raw: string): CheckpointResult<CheckpointDocument> {
  if (new TextEncoder().encode(raw).byteLength > CHECKPOINT_LIMITS.bytes) {
    return { ok: false, issue: "limit" };
  }
  try {
    return validateCheckpointDocument(JSON.parse(raw) as unknown);
  } catch {
    return { ok: false, issue: "format" };
  }
}
export function serializeCheckpointDocument(document: CheckpointDocument): CheckpointResult<string> {
  const parsed = validateCheckpointDocument(document);
  if (!parsed.ok) return parsed;
  const value = `${JSON.stringify(parsed.value, null, 2)}\n`;
  if (new TextEncoder().encode(value).byteLength > CHECKPOINT_LIMITS.bytes) {
    return { ok: false, issue: "limit" };
  }
  return { ok: true, value };
}
export interface CheckpointMergePreview {
  readonly added: readonly string[];
  readonly unchanged: readonly string[];
  readonly conflicts: readonly string[];
}
export function previewCheckpointMerge(
  current: CheckpointDocument, incoming: CheckpointDocument,
): CheckpointResult<CheckpointMergePreview> {
  const left = validateCheckpointDocument(current);
  if (!left.ok) return left;
  const right = validateCheckpointDocument(incoming);
  if (!right.ok) return right;
  const known = new Map(left.value.entries.map((item) => [item.id, item]));
  const added: string[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];
  for (const entry of right.value.entries) {
    const old = known.get(entry.id);
    if (old === undefined) added.push(entry.id);
    else if (JSON.stringify(old) === JSON.stringify(entry)) unchanged.push(entry.id);
    else conflicts.push(entry.id);
  }
  if (left.value.entries.length + added.length > CHECKPOINT_LIMITS.entries) return { ok: false, issue: "limit" };
  return { ok: true, value: { added, unchanged, conflicts } };
}
export function mergeCheckpointDocuments(
  current: CheckpointDocument, incoming: CheckpointDocument,
): CheckpointResult<CheckpointDocument> {
  const preview = previewCheckpointMerge(current, incoming);
  if (!preview.ok) return preview;
  if (preview.value.conflicts.length > 0) return { ok: false, issue: "conflict" };
  const additions = incoming.entries.filter((entry) => preview.value.added.includes(entry.id)).map(copyCheckpoint);
  return { ok: true, value: { ...current, entries: [...current.entries.map(copyCheckpoint), ...additions] } };
}
export function nextCheckpointId(document: CheckpointDocument): string {
  const used = new Set(document.entries.map((entry) => entry.id));
  for (let n = 1; n <= CHECKPOINT_LIMITS.entries + 1; n++) {
    const candidate = `checkpoint-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return "checkpoint-unavailable";
}
export interface CheckpointFilter {
  readonly packId?: string;
  readonly operation?: CheckpointOperation;
  readonly condition?: CheckpointCondition;
  readonly phase?: CheckpointPhase;
  readonly search?: string;
}
export function filterCheckpoints(document: CheckpointDocument, filter: CheckpointFilter): CheckpointEntry[] {
  const checked = validateCheckpointDocument(document);
  if (!checked.ok) return [];
  const search = (filter.search ?? "").trim().toLocaleLowerCase("en-CA");
  return checked.value.entries.filter((entry) =>
    (filter.packId === undefined || entry.packId === filter.packId) &&
    (filter.operation === undefined || entry.operation === filter.operation) &&
    (filter.condition === undefined || entry.observation.condition === filter.condition) &&
    (filter.phase === undefined || entry.phase === filter.phase) &&
    (!search || `${entry.packId} ${entry.observation.note} ${entry.source.name}`.toLocaleLowerCase("en-CA").includes(search)));
}
export function checkpointSummary(document: CheckpointDocument): {
  total: number; unknown: number; disputed: number; reviewed: number; recordedBytes: number; withoutBytes: number;
} {
  const checked = validateCheckpointDocument(document);
  if (!checked.ok) return { total: 0, unknown: 0, disputed: 0, reviewed: 0, recordedBytes: 0, withoutBytes: 0 };
  const entries = checked.value.entries;
  return {
    total: entries.length,
    unknown: entries.filter((item) => item.observation.condition === "UNKNOWN").length,
    disputed: entries.filter((item) => item.phase === "disputed").length,
    reviewed: entries.filter((item) => item.phase === "reviewed").length,
    recordedBytes: entries.reduce((sum, item) => sum + (item.observation.bytes ?? 0), 0),
    withoutBytes: entries.filter((item) => item.observation.bytes === null).length,
  };
}
