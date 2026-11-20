import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** Local decisions are suggestions for manual review, never pack operations. */
export type MatrixOperation = "pack" | "download" | "export";
export type MatrixCondition = "UNKNOWN" | "missing" | "damaged" | "interrupted" | "storage" | "permission";
export type MatrixChoice = "inspect" | "retry-later" | "review-source" | "free-space" | "defer";
export type MatrixTier = "UNKNOWN" | "user-observation" | "source-document" | "file-metadata";
export type MatrixStatus = "draft" | "reviewed" | "deferred";
export type MatrixIssue = "format" | "limit" | "identifier" | "duplicate" | "date" | "source" |
  "licence" | "text" | "condition" | "choice" | "tier" | "state" | "transition" |
  "conflict" | "time" | "invalid-link" | "missing";
export interface MatrixSource {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: MatrixTier;
  readonly reference: string;
}
export interface MatrixCandidate {
  readonly id: string;
  readonly packId: string;
  readonly operation: MatrixOperation;
  readonly condition: MatrixCondition;
  readonly choice: MatrixChoice;
  readonly reason: string;
  readonly source: MatrixSource;
  readonly createdAt: string;
}
export interface MatrixReview {
  readonly id: string;
  readonly candidateId: string;
  readonly status: Exclude<MatrixStatus, "draft">;
  readonly note: string;
  readonly at: string;
}
export interface MatrixDocument {
  readonly format: "local-recovery-decision-matrix";
  readonly version: 1;
  readonly candidates: readonly MatrixCandidate[];
  readonly reviews: readonly MatrixReview[];
}
export type MatrixResult<T> = { readonly ok: true; readonly value: T } |
  { readonly ok: false; readonly issue: MatrixIssue };
export interface MatrixImportPreview {
  readonly additions: readonly MatrixCandidate[];
  readonly reviews: readonly MatrixReview[];
  readonly unchanged: readonly string[];
  readonly conflicts: readonly string[];
}
export interface MatrixFilters {
  readonly packId?: string;
  readonly condition?: MatrixCondition;
  readonly status?: MatrixStatus;
  readonly operation?: MatrixOperation;
  readonly query?: string;
}
export interface MatrixSummary {
  readonly total: number;
  readonly unknown: number;
  readonly reviewed: number;
  readonly deferred: number;
  readonly draft: number;
  readonly packs: number;
  readonly byOperation: Readonly<Record<MatrixOperation, number>>;
}
export interface MatrixGroup {
  readonly packId: string;
  readonly entries: readonly MatrixCandidate[];
  readonly unknown: boolean;
  readonly currentStatus: MatrixStatus;
}
export const MATRIX_LIMITS = { candidates: 250, reviews: 500, bytes: 256 * 1024, text: 600, reference: 240 } as const;
export const MATRIX_OPERATIONS: readonly MatrixOperation[] = ["pack", "download", "export"];
export const MATRIX_CONDITIONS: readonly MatrixCondition[] = ["UNKNOWN", "missing", "damaged", "interrupted", "storage", "permission"];
export const MATRIX_CHOICES: readonly MatrixChoice[] = ["inspect", "retry-later", "review-source", "free-space", "defer"];
export const MATRIX_TIERS: readonly MatrixTier[] = ["UNKNOWN", "user-observation", "source-document", "file-metadata"];
export const MATRIX_STATUSES: readonly MatrixStatus[] = ["draft", "reviewed", "deferred"];
export const MATRIX_LICENCES = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"] as const;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CONTROL = /\p{Cc}/u;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function text(value: unknown, max: number, empty = false): value is string {
  return typeof value === "string" && value.length <= max &&
    (empty || value.trim().length > 0) && !CONTROL.test(value) &&
    !value.includes("<") && !value.includes(">");
}
export function matrixId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value) && value !== "." && value !== "..";
}
export function matrixInstant(value: unknown): value is string {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return false;
  const parsed = new Date(epoch).toISOString();
  const normalised = value.includes(".")
    ? value.replace(/\.(\d{1,3})Z$/, (_match, digits: string) => `.${digits.padEnd(3, "0")}Z`)
    : value.replace("Z", ".000Z");
  return parsed === normalised;
}
export function matrixSource(value: unknown): value is MatrixSource {
  if (!object(value) || !keys(value, ["name", "licence", "date", "tier", "reference"])) return false;
  return text(value.name, 180) && isOpenLicence(value.licence) &&
    typeof value.date === "string" && parseCalendarDate(value.date) !== null &&
    MATRIX_TIERS.includes(value.tier as MatrixTier) && text(value.reference, MATRIX_LIMITS.reference, true);
}
export function validateCandidate(value: unknown): MatrixIssue | null {
  if (!object(value) || !keys(value, ["id", "packId", "operation", "condition", "choice", "reason", "source", "createdAt"])) return "format";
  if (!matrixId(value.id) || !isSafePackId(value.packId)) return "identifier";
  if (!MATRIX_OPERATIONS.includes(value.operation as MatrixOperation)) return "format";
  if (!MATRIX_CONDITIONS.includes(value.condition as MatrixCondition)) return "condition";
  if (!MATRIX_CHOICES.includes(value.choice as MatrixChoice)) return "choice";
  if (!text(value.reason, MATRIX_LIMITS.text, true)) return "text";
  if (!matrixSource(value.source)) return "source";
  if (!matrixInstant(value.createdAt)) return "date";
  return null;
}
export function validateReview(value: unknown): MatrixIssue | null {
  if (!object(value) || !keys(value, ["id", "candidateId", "status", "note", "at"])) return "format";
  if (!matrixId(value.id) || !matrixId(value.candidateId)) return "identifier";
  if (value.status !== "reviewed" && value.status !== "deferred") return "state";
  if (!text(value.note, MATRIX_LIMITS.text, true)) return "text";
  if (!matrixInstant(value.at)) return "time";
  return null;
}
export function emptyMatrix(): MatrixDocument {
  return { format: "local-recovery-decision-matrix", version: 1, candidates: [], reviews: [] };
}
export function validateMatrix(input: unknown): MatrixResult<MatrixDocument> {
  if (!object(input) || !keys(input, ["format", "version", "candidates", "reviews"]) ||
    input.format !== "local-recovery-decision-matrix" || input.version !== 1 ||
    !Array.isArray(input.candidates) || !Array.isArray(input.reviews)) return { ok: false, issue: "format" };
  if (input.candidates.length > MATRIX_LIMITS.candidates || input.reviews.length > MATRIX_LIMITS.reviews) return { ok: false, issue: "limit" };
  const candidates: MatrixCandidate[] = [];
  const reviews: MatrixReview[] = [];
  const ids = new Set<string>();
  for (const value of input.candidates as unknown[]) {
    const issue = validateCandidate(value);
    if (issue) return { ok: false, issue };
    const candidate = value as MatrixCandidate;
    if (ids.has(candidate.id)) return { ok: false, issue: "duplicate" };
    ids.add(candidate.id);
    candidates.push({ ...candidate, source: { ...candidate.source } });
  }
  const reviewIds = new Set<string>();
  const lastStatus = new Map<string, MatrixStatus>();
  const latest = new Map<string, number>();
  for (const value of input.reviews as unknown[]) {
    const issue = validateReview(value);
    if (issue) return { ok: false, issue };
    const review = value as MatrixReview;
    if (reviewIds.has(review.id)) return { ok: false, issue: "duplicate" };
    if (!ids.has(review.candidateId)) return { ok: false, issue: "invalid-link" };
    const candidate = candidates.find((item) => item.id === review.candidateId)!;
    const epoch = Date.parse(review.at);
    if (epoch < Date.parse(candidate.createdAt) || epoch < (latest.get(review.candidateId) ?? 0)) return { ok: false, issue: "time" };
    if ((lastStatus.get(review.candidateId) ?? "draft") !== "draft") return { ok: false, issue: "transition" };
    latest.set(review.candidateId, epoch);
    lastStatus.set(review.candidateId, review.status);
    reviewIds.add(review.id);
    reviews.push({ ...review });
  }
  return { ok: true, value: { format: "local-recovery-decision-matrix", version: 1, candidates, reviews } };
}
export function addMatrixCandidate(document: MatrixDocument, candidate: MatrixCandidate): MatrixResult<MatrixDocument> {
  const base = validateMatrix(document);
  if (!base.ok) return base;
  const issue = validateCandidate(candidate);
  if (issue) return { ok: false, issue };
  if (base.value.candidates.some((item) => item.id === candidate.id)) return { ok: false, issue: "duplicate" };
  if (base.value.candidates.length >= MATRIX_LIMITS.candidates) return { ok: false, issue: "limit" };
  return { ok: true, value: { ...base.value, candidates: [...base.value.candidates, { ...candidate, source: { ...candidate.source } }] } };
}
export function matrixStatus(document: MatrixDocument, id: string): MatrixStatus {
  const latest = document.reviews.find((review) => review.candidateId === id);
  return latest?.status ?? "draft";
}
export function addMatrixReview(document: MatrixDocument, review: MatrixReview): MatrixResult<MatrixDocument> {
  const base = validateMatrix(document);
  if (!base.ok) return base;
  const issue = validateReview(review);
  if (issue) return { ok: false, issue };
  if (base.value.reviews.length >= MATRIX_LIMITS.reviews) return { ok: false, issue: "limit" };
  if (base.value.reviews.some((item) => item.id === review.id)) return { ok: false, issue: "duplicate" };
  const candidate = base.value.candidates.find((item) => item.id === review.candidateId);
  if (!candidate) return { ok: false, issue: "invalid-link" };
  if (matrixStatus(base.value, review.candidateId) !== "draft") return { ok: false, issue: "transition" };
  if (Date.parse(review.at) < Date.parse(candidate.createdAt)) return { ok: false, issue: "time" };
  return { ok: true, value: { ...base.value, reviews: [...base.value.reviews, { ...review }] } };
}
export function exportMatrix(document: MatrixDocument): MatrixResult<string> {
  const result = validateMatrix(document);
  if (!result.ok) return result;
  const data = `${JSON.stringify(result.value, null, 2)}\n`;
  if (new TextEncoder().encode(data).byteLength > MATRIX_LIMITS.bytes) return { ok: false, issue: "limit" };
  return { ok: true, value: data };
}
export function importMatrix(raw: string): MatrixResult<MatrixDocument> {
  if (new TextEncoder().encode(raw).byteLength > MATRIX_LIMITS.bytes) return { ok: false, issue: "limit" };
  try { return validateMatrix(JSON.parse(raw) as unknown); }
  catch { return { ok: false, issue: "format" }; }
}
export function previewMatrixMerge(current: MatrixDocument, incoming: MatrixDocument): MatrixResult<MatrixImportPreview> {
  const a = validateMatrix(current);
  if (!a.ok) return a;
  const b = validateMatrix(incoming);
  if (!b.ok) return b;
  const indexed = new Map(a.value.candidates.map((item) => [item.id, item]));
  const reviews = new Map(a.value.reviews.map((item) => [item.id, item]));
  const additions: MatrixCandidate[] = [];
  const addReviews: MatrixReview[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];
  for (const item of b.value.candidates) {
    const old = indexed.get(item.id);
    if (!old) additions.push(item);
    else if (JSON.stringify(old) === JSON.stringify(item)) unchanged.push(item.id);
    else conflicts.push(item.id);
  }
  for (const item of b.value.reviews) {
    const old = reviews.get(item.id);
    if (!old) {
      const existingForCandidate = a.value.reviews.find((entry) => entry.candidateId === item.candidateId);
      if (existingForCandidate) conflicts.push(item.id);
      else addReviews.push(item);
    } else if (JSON.stringify(old) === JSON.stringify(item)) unchanged.push(item.id);
    else conflicts.push(item.id);
  }
  if (a.value.candidates.length + additions.length > MATRIX_LIMITS.candidates ||
    a.value.reviews.length + addReviews.length > MATRIX_LIMITS.reviews) return { ok: false, issue: "limit" };
  return { ok: true, value: { additions, reviews: addReviews, unchanged, conflicts } };
}
export function mergeMatrix(current: MatrixDocument, incoming: MatrixDocument): MatrixResult<MatrixDocument> {
  const preview = previewMatrixMerge(current, incoming);
  if (!preview.ok) return preview;
  if (preview.value.conflicts.length > 0) return { ok: false, issue: "conflict" };
  return validateMatrix({ ...current,
    candidates: [...current.candidates, ...preview.value.additions],
    reviews: [...current.reviews, ...preview.value.reviews],
  });
}
export function filterMatrix(document: MatrixDocument, filters: MatrixFilters): readonly MatrixCandidate[] {
  const q = (filters.query ?? "").trim().toLocaleLowerCase("en");
  return document.candidates.filter((item) => {
    if (filters.packId && item.packId !== filters.packId) return false;
    if (filters.condition && item.condition !== filters.condition) return false;
    if (filters.status && matrixStatus(document, item.id) !== filters.status) return false;
    if (filters.operation && item.operation !== filters.operation) return false;
    if (q && ![item.packId, item.id, item.reason, item.source.name, item.source.reference]
      .some((value) => value.toLocaleLowerCase("en").includes(q))) return false;
    return true;
  });
}
export function summarizeMatrix(document: MatrixDocument): MatrixSummary {
  return {
    total: document.candidates.length,
    unknown: document.candidates.filter((item) => item.condition === "UNKNOWN").length,
    reviewed: document.candidates.filter((item) => matrixStatus(document, item.id) === "reviewed").length,
    deferred: document.candidates.filter((item) => matrixStatus(document, item.id) === "deferred").length,
    draft: document.candidates.filter((item) => matrixStatus(document, item.id) === "draft").length,
    packs: new Set(document.candidates.map((item) => item.packId)).size,
    byOperation: {
      pack: document.candidates.filter((item) => item.operation === "pack").length,
      download: document.candidates.filter((item) => item.operation === "download").length,
      export: document.candidates.filter((item) => item.operation === "export").length,
    },
  };
}
export function groupMatrix(document: MatrixDocument): readonly MatrixGroup[] {
  const packs = new Map<string, MatrixCandidate[]>();
  for (const item of document.candidates) packs.set(item.packId, [...(packs.get(item.packId) ?? []), item]);
  return [...packs].sort(([a], [b]) => a.localeCompare(b, "en")).map(([packId, entries]) => ({
    packId, entries,
    unknown: entries.some((item) => item.condition === "UNKNOWN"),
    currentStatus: entries.some((item) => matrixStatus(document, item.id) === "draft") ? "draft" :
      entries.some((item) => matrixStatus(document, item.id) === "deferred") ? "deferred" : "reviewed",
  }));
}
export function nextMatrixId(document: MatrixDocument, prefix: "choice" | "review"): string {
  const used = new Set([...document.candidates.map((item) => item.id), ...document.reviews.map((item) => item.id)]);
  for (let i = 1; i <= 100000; i += 1) {
    const id = `${prefix}-${i}`;
    if (!used.has(id)) return id;
  }
  throw new Error("No local ID available");
}
