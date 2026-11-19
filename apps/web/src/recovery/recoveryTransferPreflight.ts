import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** Preparation is read-only. No result authorises a pack or an accessibility claim. */
export type TransferKind = "pack" | "download" | "export";
export type TransferCondition = "unknown" | "interrupted" | "damaged" | "missing" | "permission" | "storage";
export type EvidenceTier = "UNKNOWN" | "file-metadata" | "user-observation" | "source-document";
export type TransferStage = "draft" | "reviewed" | "discarded";
export type TransferIssue =
  | "format" | "limit" | "identifier" | "duplicate" | "date" | "source" | "licence"
  | "tier" | "text" | "condition" | "bytes" | "kind" | "stage" | "transition"
  | "conflict" | "unexpected" | "future-date";
export type TransferDecision = "UNKNOWN" | "review-input" | "review-space" | "review-permissions" | "review-source" | "manual-retry";
export type TransferReadiness = "UNKNOWN" | "needs-review";

export interface TransferProvenance {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: EvidenceTier;
  readonly reference: string;
}

export interface TransferCandidate {
  readonly id: string;
  readonly packId: string;
  readonly kind: TransferKind;
  readonly condition: TransferCondition;
  readonly stage: TransferStage;
  readonly recordedAt: string;
  readonly source: TransferProvenance;
  /** Null means UNKNOWN; zero is a known quantity and is not inferred. */
  readonly expectedBytes: number | null;
  readonly availableBytes: number | null;
  readonly note: string;
}

export interface TransferDocument {
  readonly format: "local-transfer-preflight";
  readonly version: 1;
  readonly candidates: readonly TransferCandidate[];
}

export type TransferResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: TransferIssue };

export interface PreflightFinding {
  readonly id: string;
  readonly packId: string;
  readonly issue: "UNKNOWN" | "missing-size" | "not-enough-space" | "damaged" | "interrupted" | "permission" | "missing" | "manual-review" | "ready-to-review";
  readonly decision: TransferDecision;
  readonly readiness: TransferReadiness;
  readonly deficit: number | null;
}

export interface PreflightOverview {
  readonly count: number;
  readonly unknown: number;
  readonly reviewed: number;
  readonly discarded: number;
  readonly knownBytes: number;
  readonly unknownByteCount: number;
  readonly byKind: Readonly<Record<TransferKind, number>>;
  readonly byCondition: Readonly<Record<TransferCondition, number>>;
}

export interface PreflightFilter {
  readonly packId?: string;
  readonly kind?: TransferKind;
  readonly condition?: TransferCondition;
  readonly stage?: TransferStage;
  readonly search?: string;
}

export interface PreflightMergePreview {
  readonly added: readonly TransferCandidate[];
  readonly unchanged: readonly string[];
  readonly conflicts: readonly string[];
}

export const PREFLIGHT_LIMITS = {
  candidates: 300,
  bytes: 512 * 1024,
  note: 900,
  reference: 200,
  source: 160,
  id: 96,
  packId: 128,
} as const;
export const TRANSFER_KINDS: readonly TransferKind[] = ["pack", "download", "export"];
export const TRANSFER_CONDITIONS: readonly TransferCondition[] = ["unknown", "interrupted", "damaged", "missing", "permission", "storage"];
export const TRANSFER_STAGES: readonly TransferStage[] = ["draft", "reviewed", "discarded"];
export const EVIDENCE_TIERS: readonly EvidenceTier[] = ["UNKNOWN", "file-metadata", "user-observation", "source-document"];
export const TRANSFER_LICENCES = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"] as const;
const CONTROL = /\p{Cc}/u;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function cleanText(value: unknown, limit: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= limit &&
    (allowEmpty || value.trim().length > 0) && !CONTROL.test(value) &&
    !value.includes("<") && !value.includes(">");
}

function validDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_TIME.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  const canonical = new Date(time).toISOString();
  return canonical === (value.includes(".")
    ? value.replace(/\.(\d{1,3})Z$/, (_, digits: string) => `.${digits.padEnd(3, "0")}Z`)
    : value.replace("Z", ".000Z"));
}

function quantity(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_073_741_824);
}

export function validTransferProvenance(value: unknown): value is TransferProvenance {
  if (!isObject(value) || !onlyKeys(value, ["name", "licence", "date", "tier", "reference"])) return false;
  return cleanText(value.name, PREFLIGHT_LIMITS.source) &&
    isOpenLicence(value.licence) &&
    typeof value.date === "string" && parseCalendarDate(value.date) !== null &&
    EVIDENCE_TIERS.includes(value.tier as EvidenceTier) &&
    cleanText(value.reference, PREFLIGHT_LIMITS.reference, true);
}

export function validateTransferCandidate(value: unknown): TransferIssue | null {
  if (!isObject(value) || !onlyKeys(value, [
    "id", "packId", "kind", "condition", "stage", "recordedAt", "source",
    "expectedBytes", "availableBytes", "note",
  ])) return "format";
  if (!cleanText(value.id, PREFLIGHT_LIMITS.id) || !KEY.test(value.id) ||
    !isSafePackId(value.packId)) return "identifier";
  if (!TRANSFER_KINDS.includes(value.kind as TransferKind)) return "kind";
  if (!TRANSFER_CONDITIONS.includes(value.condition as TransferCondition)) return "condition";
  if (!TRANSFER_STAGES.includes(value.stage as TransferStage)) return "stage";
  if (!validDateTime(value.recordedAt)) return "date";
  if (!isObject(value.source)) return "source";
  if (!validTransferProvenance(value.source)) {
    if (!isOpenLicence(value.source.licence)) return "licence";
    if (!EVIDENCE_TIERS.includes(value.source.tier as EvidenceTier)) return "tier";
    return "source";
  }
  if (!quantity(value.expectedBytes) || !quantity(value.availableBytes)) return "bytes";
  if (!cleanText(value.note, PREFLIGHT_LIMITS.note, true)) return "text";
  return null;
}

export function newTransferDocument(): TransferDocument {
  return { format: "local-transfer-preflight", version: 1, candidates: [] };
}

export function validateTransferDocument(value: unknown): TransferResult<TransferDocument> {
  if (!isObject(value) || !onlyKeys(value, ["format", "version", "candidates"]) ||
    value.format !== "local-transfer-preflight" || value.version !== 1 || !Array.isArray(value.candidates)) {
    return { ok: false, issue: "format" };
  }
  if (value.candidates.length > PREFLIGHT_LIMITS.candidates) return { ok: false, issue: "limit" };
  const candidates: TransferCandidate[] = [];
  const seen = new Set<string>();
  for (const row of value.candidates as unknown[]) {
    const issue = validateTransferCandidate(row);
    if (issue !== null) return { ok: false, issue };
    const entry = row as TransferCandidate;
    if (seen.has(entry.id)) return { ok: false, issue: "duplicate" };
    seen.add(entry.id);
    candidates.push({ ...entry, source: { ...entry.source } });
  }
  return { ok: true, value: { format: "local-transfer-preflight", version: 1, candidates } };
}

export function appendTransferCandidate(document: TransferDocument, candidate: TransferCandidate): TransferResult<TransferDocument> {
  const current = validateTransferDocument(document);
  if (!current.ok) return current;
  const issue = validateTransferCandidate(candidate);
  if (issue !== null) return { ok: false, issue };
  if (current.value.candidates.some((row) => row.id === candidate.id)) return { ok: false, issue: "duplicate" };
  if (current.value.candidates.length >= PREFLIGHT_LIMITS.candidates) return { ok: false, issue: "limit" };
  return { ok: true, value: {
    ...current.value,
    candidates: [...current.value.candidates, { ...candidate, source: { ...candidate.source } }],
  } };
}

/** A reviewed or discarded entry cannot be reclassified; append a new entry instead. */
export function transitionTransferCandidate(document: TransferDocument, id: string, stage: TransferStage): TransferResult<TransferDocument> {
  const current = validateTransferDocument(document);
  if (!current.ok) return current;
  const existing = current.value.candidates.find((row) => row.id === id);
  if (!existing) return { ok: false, issue: "identifier" };
  if (existing.stage !== "draft" || stage === "draft") return { ok: false, issue: "transition" };
  return { ok: true, value: {
    ...current.value,
    candidates: current.value.candidates.map((row) => row.id === id ? { ...row, stage } : row),
  } };
}

export function summarizeTransferDocument(document: TransferDocument): PreflightOverview {
  const byKind: Record<TransferKind, number> = { pack: 0, download: 0, export: 0 };
  const byCondition: Record<TransferCondition, number> = { unknown: 0, interrupted: 0, damaged: 0, missing: 0, permission: 0, storage: 0 };
  let knownBytes = 0;
  let unknownByteCount = 0;
  let reviewed = 0;
  let discarded = 0;
  for (const row of document.candidates) {
    byKind[row.kind] += 1;
    byCondition[row.condition] += 1;
    if (row.expectedBytes === null) unknownByteCount += 1;
    else knownBytes += row.expectedBytes;
    if (row.stage === "reviewed") reviewed += 1;
    if (row.stage === "discarded") discarded += 1;
  }
  return {
    count: document.candidates.length,
    unknown: byCondition.unknown,
    reviewed, discarded, knownBytes, unknownByteCount, byKind, byCondition,
  };
}

export function filterTransferCandidates(document: TransferDocument, filter: PreflightFilter): TransferCandidate[] {
  const needle = (filter.search ?? "").trim().toLocaleLowerCase("en");
  return document.candidates.filter((row) =>
    (!filter.packId || row.packId === filter.packId) &&
    (!filter.kind || row.kind === filter.kind) &&
    (!filter.condition || row.condition === filter.condition) &&
    (!filter.stage || row.stage === filter.stage) &&
    (!needle || [row.id, row.packId, row.note, row.source.name, row.source.reference].some((text) => text.toLocaleLowerCase("en").includes(needle))),
  );
}

/** Results are instructions to review, not confirmation of device or file condition. */
export function assessTransferCandidate(candidate: TransferCandidate): PreflightFinding {
  const base = { id: candidate.id, packId: candidate.packId };
  if (candidate.condition === "unknown") return { ...base, issue: "UNKNOWN", decision: "UNKNOWN", readiness: "UNKNOWN", deficit: null };
  if (candidate.condition === "damaged") return { ...base, issue: "damaged", decision: "review-input", readiness: "needs-review", deficit: null };
  if (candidate.condition === "permission") return { ...base, issue: "permission", decision: "review-permissions", readiness: "needs-review", deficit: null };
  if (candidate.condition === "missing") return { ...base, issue: "missing", decision: "review-source", readiness: "needs-review", deficit: null };
  if (candidate.condition === "interrupted") return { ...base, issue: "interrupted", decision: "manual-retry", readiness: "needs-review", deficit: null };
  if (candidate.expectedBytes === null || candidate.availableBytes === null) {
    return { ...base, issue: "missing-size", decision: "UNKNOWN", readiness: "UNKNOWN", deficit: null };
  }
  if (candidate.availableBytes < candidate.expectedBytes) {
    return { ...base, issue: "not-enough-space", decision: "review-space", readiness: "needs-review", deficit: candidate.expectedBytes - candidate.availableBytes };
  }
  return { ...base, issue: "ready-to-review", decision: "review-space", readiness: "needs-review", deficit: 0 };
}

export function assessTransferDocument(document: TransferDocument): TransferResult<PreflightFinding[]> {
  const parsed = validateTransferDocument(document);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value.candidates.map(assessTransferCandidate) };
}

export function transferPreviewMerge(current: TransferDocument, incoming: TransferDocument): TransferResult<PreflightMergePreview> {
  const a = validateTransferDocument(current);
  if (!a.ok) return a;
  const b = validateTransferDocument(incoming);
  if (!b.ok) return b;
  const indexed = new Map(a.value.candidates.map((row) => [row.id, row]));
  const added: TransferCandidate[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];
  for (const row of b.value.candidates) {
    const old = indexed.get(row.id);
    if (!old) added.push(row);
    else if (JSON.stringify(old) === JSON.stringify(row)) unchanged.push(row.id);
    else conflicts.push(row.id);
  }
  if (a.value.candidates.length + added.length > PREFLIGHT_LIMITS.candidates) return { ok: false, issue: "limit" };
  return { ok: true, value: { added, unchanged, conflicts } };
}

export function mergeTransferDocuments(current: TransferDocument, incoming: TransferDocument): TransferResult<TransferDocument> {
  const preview = transferPreviewMerge(current, incoming);
  if (!preview.ok) return preview;
  if (preview.value.conflicts.length > 0) return { ok: false, issue: "conflict" };
  return { ok: true, value: { ...current, candidates: [...current.candidates, ...preview.value.added] } };
}

export function encodeTransferDocument(document: TransferDocument): TransferResult<string> {
  const parsed = validateTransferDocument(document);
  if (!parsed.ok) return parsed;
  const value = JSON.stringify(parsed.value, null, 2) + "\n";
  if (new TextEncoder().encode(value).byteLength > PREFLIGHT_LIMITS.bytes) return { ok: false, issue: "limit" };
  return { ok: true, value };
}

export function decodeTransferDocument(raw: string): TransferResult<TransferDocument> {
  if (new TextEncoder().encode(raw).byteLength > PREFLIGHT_LIMITS.bytes) return { ok: false, issue: "limit" };
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return { ok: false, issue: "format" }; }
  return validateTransferDocument(value);
}

/** Group by pack without deducing any usable, current or accessible state. */
export function transferPackSummaries(document: TransferDocument): Array<{
  packId: string;
  count: number;
  unresolved: number;
  mostRecent: string;
  expectedBytes: number | null;
}> {
  const groups = new Map<string, TransferCandidate[]>();
  for (const row of document.candidates) groups.set(row.packId, [...(groups.get(row.packId) ?? []), row]);
  return [...groups.entries()].map(([packId, rows]) => ({
    packId,
    count: rows.length,
    unresolved: rows.filter((row) => row.stage === "draft" || row.condition === "unknown").length,
    mostRecent: rows.map((row) => row.recordedAt).sort().at(-1) ?? "",
    expectedBytes: rows.some((row) => row.expectedBytes === null) ? null : rows.reduce((sum, row) => sum + (row.expectedBytes ?? 0), 0),
  })).sort((a, b) => a.packId.localeCompare(b.packId, "en"));
}
