import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** Manual, portable recovery handoff. No record changes pack availability. */
export type HandoffOperation = "pack" | "download" | "export" | "storage";
export type HandoffCondition = "UNKNOWN" | "missing" | "damaged" | "interrupted" | "failed";
export type HandoffDecision = "UNKNOWN" | "review" | "retry-requested" | "deferred" | "closed";
export type HandoffTier = "UNKNOWN" | "local-observation" | "source-document" | "third-party-report";
export type HandoffIssue =
  | "format" | "limit" | "identifier" | "duplicate" | "text" | "source"
  | "licence" | "date" | "tier" | "condition" | "decision" | "transition"
  | "collision" | "time" | "sequence" | "unknown-pack" | "unavailable";

export interface HandoffSource {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: HandoffTier;
  readonly reference: string;
}
export interface HandoffEvent {
  readonly id: string;
  readonly at: string;
  readonly decision: HandoffDecision;
  readonly note: string;
}
export interface HandoffCase {
  readonly id: string;
  readonly packId: string;
  readonly operation: HandoffOperation;
  readonly condition: HandoffCondition;
  readonly openedAt: string;
  readonly summary: string;
  readonly source: HandoffSource;
  readonly events: readonly HandoffEvent[];
}
export interface HandoffDocument {
  readonly format: "local-recovery-handoff";
  readonly version: 1;
  readonly cases: readonly HandoffCase[];
}
export type HandoffResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: HandoffIssue };
export interface HandoffMergePreview {
  readonly added: readonly string[];
  readonly unchanged: readonly string[];
  readonly collisions: readonly string[];
}
export interface HandoffFilter {
  readonly packId?: string;
  readonly operation?: HandoffOperation;
  readonly decision?: HandoffDecision;
  readonly search?: string;
}
export interface HandoffSummary {
  readonly count: number;
  readonly unknown: number;
  readonly pending: number;
  readonly closed: number;
  readonly distinctPacks: number;
  readonly lastUpdated: string | null;
}
export interface HandoffPackCoverage {
  readonly packId: string;
  readonly count: number;
  readonly unknown: number;
  readonly pending: number;
  readonly latest: string | null;
  readonly decision: HandoffDecision;
}
export const HANDOFF_LIMITS = {
  maxBytes: 512 * 1024,
  maxCases: 200,
  maxEvents: 50,
  maxId: 96,
  maxSource: 180,
  maxReference: 256,
  maxSummary: 400,
  maxNote: 600,
} as const;
export const HANDOFF_OPERATIONS: readonly HandoffOperation[] = ["pack", "download", "export", "storage"];
export const HANDOFF_CONDITIONS: readonly HandoffCondition[] = ["UNKNOWN", "missing", "damaged", "interrupted", "failed"];
export const HANDOFF_DECISIONS: readonly HandoffDecision[] = ["UNKNOWN", "review", "retry-requested", "deferred", "closed"];
export const HANDOFF_TIERS: readonly HandoffTier[] = ["UNKNOWN", "local-observation", "source-document", "third-party-report"];
export const HANDOFF_LICENCES = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"] as const;
const CONTROL = /\p{Cc}/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CASE_KEYS = ["id", "packId", "operation", "condition", "openedAt", "summary", "source", "events"];
const SOURCE_KEYS = ["name", "licence", "date", "tier", "reference"];
const EVENT_KEYS = ["id", "at", "decision", "note"];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function text(value: unknown, limit: number, allowEmpty = false): value is string {
  if (typeof value !== "string" || value.length > limit || CONTROL.test(value)) return false;
  if (value.includes("<") || value.includes(">") || value.includes("\u2028") || value.includes("\u2029")) return false;
  return allowEmpty || value.trim().length > 0;
}
function id(value: unknown): value is string {
  return text(value, HANDOFF_LIMITS.maxId) && ID.test(value) && value !== "." && value !== "..";
}
function instant(value: unknown): value is string {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.some((option) => option === value);
}

export function validHandoffSource(value: unknown): value is HandoffSource {
  return record(value) && keys(value, SOURCE_KEYS) &&
    text(value.name, HANDOFF_LIMITS.maxSource) &&
    isOpenLicence(value.licence) &&
    typeof value.date === "string" && parseCalendarDate(value.date) !== null &&
    oneOf(value.tier, HANDOFF_TIERS) && text(value.reference, HANDOFF_LIMITS.maxReference, true);
}

export function validateHandoffEvent(value: unknown): HandoffIssue | null {
  if (!record(value) || !keys(value, EVENT_KEYS)) return "format";
  if (!id(value.id)) return "identifier";
  if (!instant(value.at)) return "time";
  if (!oneOf(value.decision, HANDOFF_DECISIONS)) return "decision";
  if (!text(value.note, HANDOFF_LIMITS.maxNote, true)) return "text";
  return null;
}

/** A later event is a decision note, not an assertion about actual file integrity. */
export function validateHandoffCase(value: unknown): HandoffIssue | null {
  if (!record(value) || !keys(value, CASE_KEYS)) return "format";
  if (!id(value.id) || !isSafePackId(value.packId)) return "identifier";
  if (!oneOf(value.operation, HANDOFF_OPERATIONS)) return "format";
  if (!oneOf(value.condition, HANDOFF_CONDITIONS)) return "condition";
  if (!instant(value.openedAt)) return "time";
  if (!text(value.summary, HANDOFF_LIMITS.maxSummary)) return "text";
  if (!validHandoffSource(value.source)) return "source";
  if (!Array.isArray(value.events) || value.events.length > HANDOFF_LIMITS.maxEvents) return "limit";
  const seen = new Set<string>();
  let previous = value.openedAt;
  let closed = false;
  for (const event of value.events as unknown[]) {
    const error = validateHandoffEvent(event);
    if (error !== null) return error;
    const valid = event as HandoffEvent;
    if (seen.has(valid.id)) return "duplicate";
    if (valid.at < previous) return "sequence";
    if (closed) return "transition";
    if (valid.decision === "retry-requested" && value.condition === "UNKNOWN") return "transition";
    if (valid.decision === "closed") closed = true;
    seen.add(valid.id);
    previous = valid.at;
  }
  return null;
}

export function newHandoffDocument(): HandoffDocument {
  return { format: "local-recovery-handoff", version: 1, cases: [] };
}
export function validateHandoffDocument(value: unknown): HandoffResult<HandoffDocument> {
  if (!record(value) || !keys(value, ["format", "version", "cases"]) ||
    value.format !== "local-recovery-handoff" || value.version !== 1 || !Array.isArray(value.cases)) {
    return { ok: false, issue: "format" };
  }
  if (value.cases.length > HANDOFF_LIMITS.maxCases) return { ok: false, issue: "limit" };
  const seen = new Set<string>();
  const cases: HandoffCase[] = [];
  for (const item of value.cases as unknown[]) {
    const error = validateHandoffCase(item);
    if (error !== null) return { ok: false, issue: error };
    const current = item as HandoffCase;
    if (seen.has(current.id)) return { ok: false, issue: "duplicate" };
    seen.add(current.id);
    cases.push({ ...current, source: { ...current.source }, events: current.events.map((event) => ({ ...event })) });
  }
  return { ok: true, value: { format: "local-recovery-handoff", version: 1, cases } };
}

export function appendHandoffCase(document: HandoffDocument, item: HandoffCase): HandoffResult<HandoffDocument> {
  const existing = validateHandoffDocument(document);
  if (!existing.ok) return existing;
  const error = validateHandoffCase(item);
  if (error !== null) return { ok: false, issue: error };
  if (existing.value.cases.length >= HANDOFF_LIMITS.maxCases) return { ok: false, issue: "limit" };
  if (existing.value.cases.some((candidate) => candidate.id === item.id)) return { ok: false, issue: "duplicate" };
  return validateHandoffDocument({ ...existing.value, cases: [...existing.value.cases, item] });
}

export function appendHandoffEvent(document: HandoffDocument, caseId: string, event: HandoffEvent): HandoffResult<HandoffDocument> {
  const existing = validateHandoffDocument(document);
  if (!existing.ok) return existing;
  const selected = existing.value.cases.find((item) => item.id === caseId);
  if (!selected) return { ok: false, issue: "unknown-pack" };
  if (selected.events.length >= HANDOFF_LIMITS.maxEvents) return { ok: false, issue: "limit" };
  return validateHandoffDocument({ ...existing.value, cases: existing.value.cases.map((item) =>
    item.id === caseId ? { ...item, events: [...item.events, event] } : item,
  ) });
}

/** Never silently replace an existing case with imported history. */
export function previewHandoffMerge(current: HandoffDocument, incoming: HandoffDocument): HandoffResult<HandoffMergePreview> {
  const left = validateHandoffDocument(current);
  if (!left.ok) return left;
  const right = validateHandoffDocument(incoming);
  if (!right.ok) return right;
  const known = new Map(left.value.cases.map((entry) => [entry.id, entry]));
  const added: string[] = [];
  const unchanged: string[] = [];
  const collisions: string[] = [];
  for (const entry of right.value.cases) {
    const previous = known.get(entry.id);
    if (previous === undefined) added.push(entry.id);
    else if (JSON.stringify(previous) === JSON.stringify(entry)) unchanged.push(entry.id);
    else collisions.push(entry.id);
  }
  if (left.value.cases.length + added.length > HANDOFF_LIMITS.maxCases) return { ok: false, issue: "limit" };
  return { ok: true, value: { added, unchanged, collisions } };
}
export function mergeHandoffDocuments(current: HandoffDocument, incoming: HandoffDocument): HandoffResult<HandoffDocument> {
  const preview = previewHandoffMerge(current, incoming);
  if (!preview.ok) return preview;
  if (preview.value.collisions.length !== 0) return { ok: false, issue: "collision" };
  const ids = new Set(current.cases.map((entry) => entry.id));
  return validateHandoffDocument({ ...current, cases: [...current.cases, ...incoming.cases.filter((entry) => !ids.has(entry.id))] });
}
export function parseHandoffDocument(raw: string): HandoffResult<HandoffDocument> {
  if (new TextEncoder().encode(raw).byteLength > HANDOFF_LIMITS.maxBytes) return { ok: false, issue: "limit" };
  try { return validateHandoffDocument(JSON.parse(raw) as unknown); }
  catch { return { ok: false, issue: "format" }; }
}
export function exportHandoffDocument(document: HandoffDocument): HandoffResult<string> {
  const result = validateHandoffDocument(document);
  if (!result.ok) return result;
  const json = `${JSON.stringify(result.value, null, 2)}\n`;
  if (new TextEncoder().encode(json).byteLength > HANDOFF_LIMITS.maxBytes) return { ok: false, issue: "limit" };
  return { ok: true, value: json };
}
export function currentHandoffDecision(item: HandoffCase): HandoffDecision {
  return item.events.at(-1)?.decision ?? "UNKNOWN";
}
export function handoffUpdatedAt(item: HandoffCase): string {
  return item.events.at(-1)?.at ?? item.openedAt;
}
export function handoffSummary(document: HandoffDocument): HandoffSummary {
  const cases = document.cases;
  return {
    count: cases.length,
    unknown: cases.filter((item) => currentHandoffDecision(item) === "UNKNOWN").length,
    pending: cases.filter((item) => !["UNKNOWN", "closed"].includes(currentHandoffDecision(item))).length,
    closed: cases.filter((item) => currentHandoffDecision(item) === "closed").length,
    distinctPacks: new Set(cases.map((item) => item.packId)).size,
    lastUpdated: cases.length === 0 ? null : cases.map(handoffUpdatedAt).sort().at(-1) ?? null,
  };
}
export function handoffForPack(document: HandoffDocument, packId: string): HandoffPackCoverage {
  const cases = document.cases.filter((item) => item.packId === packId);
  return {
    packId,
    count: cases.length,
    unknown: cases.filter((item) => currentHandoffDecision(item) === "UNKNOWN").length,
    pending: cases.filter((item) => !["UNKNOWN", "closed"].includes(currentHandoffDecision(item))).length,
    latest: cases.length === 0 ? null : cases.map(handoffUpdatedAt).sort().at(-1) ?? null,
    decision: cases.length === 0 ? "UNKNOWN" : currentHandoffDecision([...cases].sort((a, b) => handoffUpdatedAt(a).localeCompare(handoffUpdatedAt(b))).at(-1)!),
  };
}
export function filterHandoffCases(document: HandoffDocument, filter: HandoffFilter): HandoffCase[] {
  const needle = filter.search?.trim().toLocaleLowerCase("en") ?? "";
  return document.cases.filter((item) => {
    if (filter.packId && item.packId !== filter.packId) return false;
    if (filter.operation && item.operation !== filter.operation) return false;
    if (filter.decision && currentHandoffDecision(item) !== filter.decision) return false;
    if (!needle) return true;
    return [item.id, item.packId, item.summary, item.source.name, item.source.reference]
      .some((value) => value.toLocaleLowerCase("en").includes(needle));
  });
}
export function nextHandoffId(document: HandoffDocument): string {
  const used = new Set(document.cases.map((item) => item.id));
  for (let i = 1; i <= HANDOFF_LIMITS.maxCases + 1; i += 1) {
    if (!used.has(`handoff-${i}`)) return `handoff-${i}`;
  }
  return "handoff-overflow";
}
export function nextEventId(item: HandoffCase): string {
  const used = new Set(item.events.map((event) => event.id));
  for (let i = 1; i <= HANDOFF_LIMITS.maxEvents + 1; i += 1) {
    if (!used.has(`event-${i}`)) return `event-${i}`;
  }
  return "event-overflow";
}
