import { isSafePackId } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** A local, user-entered account of an interrupted operation, not a pack-status source. */
export type TraceOperation = "pack" | "download" | "export";
export type TraceOutcome = "UNKNOWN" | "stopped" | "in-progress" | "reported-complete";
export type TraceStage = "started" | "reading" | "transferring" | "writing" | "stopped" | "reviewed";
export type TraceTier = "UNKNOWN" | "user-observation" | "source-document" | "file-metadata";
export type TraceIssue =
  | "format" | "limit" | "identifier" | "text" | "date" | "licence" | "source"
  | "tier" | "stage" | "outcome" | "sequence" | "duplicate" | "transition"
  | "bytes" | "conflict" | "unsafe-content" | "unknown-pack";

export interface TraceSource {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: TraceTier;
  readonly reference: string;
}
export interface TraceMoment {
  readonly id: string;
  readonly at: string;
  readonly stage: TraceStage;
  readonly observedBytes: number | "UNKNOWN";
  readonly note: string;
}
export interface TraceCase {
  readonly id: string;
  readonly packId: string;
  readonly operation: TraceOperation;
  readonly outcome: TraceOutcome;
  readonly expectedBytes: number | "UNKNOWN";
  readonly openedAt: string;
  readonly source: TraceSource;
  readonly moments: readonly TraceMoment[];
}
export interface TraceDocument {
  readonly format: "local-recovery-session-trace";
  readonly version: 1;
  readonly traces: readonly TraceCase[];
}
export type TraceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: TraceIssue };
export interface TracePreview {
  readonly added: readonly TraceCase[];
  readonly same: readonly string[];
  readonly collisions: readonly string[];
}
export interface TraceCounts {
  readonly total: number;
  readonly unknown: number;
  readonly stopped: number;
  readonly inProgress: number;
  readonly reportedComplete: number;
  readonly withMissingBytes: number;
  readonly withNoMoments: number;
}
export interface TraceFilter {
  readonly packId?: string;
  readonly outcome?: TraceOutcome;
  readonly operation?: TraceOperation;
  readonly text?: string;
}

export const TRACE_LIMITS = {
  maxTraces: 150,
  maxMoments: 80,
  maxBytes: 256 * 1024,
  maxText: 500,
  maxName: 180,
  maxReference: 180,
  maxId: 96,
} as const;
export const TRACE_OPERATIONS: readonly TraceOperation[] = ["pack", "download", "export"];
export const TRACE_OUTCOMES: readonly TraceOutcome[] = ["UNKNOWN", "stopped", "in-progress", "reported-complete"];
export const TRACE_STAGES: readonly TraceStage[] = ["started", "reading", "transferring", "writing", "stopped", "reviewed"];
export const TRACE_TIERS: readonly TraceTier[] = ["UNKNOWN", "user-observation", "source-document", "file-metadata"];
export const TRACE_LICENCES = ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"] as const;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL = /\p{Cc}/u;
const BANNED_MARKUP = /[<>]/u;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function clean(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max &&
    (allowEmpty || value.trim().length > 0) && !CONTROL.test(value) && !BANNED_MARKUP.test(value);
}
export function traceId(value: unknown): value is string {
  return clean(value, TRACE_LIMITS.maxId) && ID.test(value) && value !== "." && value !== "..";
}
export function traceInstant(value: unknown): value is string {
  if (typeof value !== "string" || !INSTANT.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
export function traceBytes(value: unknown): value is number | "UNKNOWN" {
  return value === "UNKNOWN" || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1024 * 1024 * 1024);
}
export function traceSource(value: unknown): value is TraceSource {
  if (!record(value) || !keys(value, ["name", "licence", "date", "tier", "reference"])) return false;
  return clean(value.name, TRACE_LIMITS.maxName) && isOpenLicence(value.licence) &&
    typeof value.date === "string" && parseCalendarDate(value.date) !== null &&
    TRACE_TIERS.includes(value.tier as TraceTier) &&
    clean(value.reference, TRACE_LIMITS.maxReference, true);
}
export function validateMoment(value: unknown): TraceIssue | null {
  if (!record(value) || !keys(value, ["id", "at", "stage", "observedBytes", "note"])) return "format";
  if (!traceId(value.id)) return "identifier";
  if (!traceInstant(value.at)) return "date";
  if (!TRACE_STAGES.includes(value.stage as TraceStage)) return "stage";
  if (!traceBytes(value.observedBytes)) return "bytes";
  if (!clean(value.note, TRACE_LIMITS.maxText, true)) return "text";
  return null;
}
export function validateTrace(value: unknown): TraceIssue | null {
  if (!record(value) || !keys(value, ["id", "packId", "operation", "outcome", "expectedBytes", "openedAt", "source", "moments"])) return "format";
  if (!traceId(value.id) || !isSafePackId(value.packId)) return "identifier";
  if (!TRACE_OPERATIONS.includes(value.operation as TraceOperation)) return "format";
  if (!TRACE_OUTCOMES.includes(value.outcome as TraceOutcome)) return "outcome";
  if (!traceBytes(value.expectedBytes)) return "bytes";
  if (!traceInstant(value.openedAt)) return "date";
  if (!traceSource(value.source)) return "source";
  if (!Array.isArray(value.moments)) return "format";
  if (value.moments.length > TRACE_LIMITS.maxMoments) return "limit";
  const seen = new Set<string>();
  let lastTime = Date.parse(value.openedAt);
  for (const moment of value.moments as unknown[]) {
    const error = validateMoment(moment);
    if (error) return error;
    const known = moment as TraceMoment;
    if (seen.has(known.id)) return "duplicate";
    seen.add(known.id);
    const at = Date.parse(known.at);
    if (at < lastTime) return "sequence";
    lastTime = at;
  }
  return null;
}
export function validateTraceDocument(value: unknown): TraceResult<TraceDocument> {
  if (!record(value) || !keys(value, ["format", "version", "traces"]) ||
    value.format !== "local-recovery-session-trace" || value.version !== 1 || !Array.isArray(value.traces)) {
    return { ok: false, issue: "format" };
  }
  if (value.traces.length > TRACE_LIMITS.maxTraces) return { ok: false, issue: "limit" };
  const seen = new Set<string>();
  const traces: TraceCase[] = [];
  for (const item of value.traces as unknown[]) {
    const issue = validateTrace(item);
    if (issue) return { ok: false, issue };
    const one = item as TraceCase;
    if (seen.has(one.id)) return { ok: false, issue: "duplicate" };
    seen.add(one.id);
    traces.push({ ...one, source: { ...one.source }, moments: one.moments.map((m) => ({ ...m })) });
  }
  return { ok: true, value: { format: "local-recovery-session-trace", version: 1, traces } };
}
export function newTraceDocument(): TraceDocument {
  return { format: "local-recovery-session-trace", version: 1, traces: [] };
}
export function appendTrace(current: TraceDocument, trace: TraceCase): TraceResult<TraceDocument> {
  const checked = validateTraceDocument(current);
  if (!checked.ok) return checked;
  const issue = validateTrace(trace);
  if (issue) return { ok: false, issue };
  if (checked.value.traces.some((item) => item.id === trace.id)) return { ok: false, issue: "duplicate" };
  if (checked.value.traces.length >= TRACE_LIMITS.maxTraces) return { ok: false, issue: "limit" };
  return { ok: true, value: { ...checked.value, traces: [...checked.value.traces, { ...trace, source: { ...trace.source }, moments: trace.moments.map((m) => ({ ...m })) }] } };
}
export function appendTraceMoment(current: TraceDocument, id: string, moment: TraceMoment): TraceResult<TraceDocument> {
  const checked = validateTraceDocument(current);
  if (!checked.ok) return checked;
  const target = checked.value.traces.find((item) => item.id === id);
  if (!target) return { ok: false, issue: "unknown-pack" };
  const issue = validateMoment(moment);
  if (issue) return { ok: false, issue };
  if (target.moments.length >= TRACE_LIMITS.maxMoments) return { ok: false, issue: "limit" };
  if (target.moments.some((m) => m.id === moment.id)) return { ok: false, issue: "duplicate" };
  const previous = target.moments[target.moments.length - 1]?.at ?? target.openedAt;
  if (Date.parse(moment.at) < Date.parse(previous)) return { ok: false, issue: "sequence" };
  const traces = checked.value.traces.map((item) => item.id === id ? { ...item, moments: [...item.moments, { ...moment }] } : item);
  return { ok: true, value: { ...checked.value, traces } };
}
/** The outcome is user-reported and never changes the saved pack inventory. */
export function changeTraceOutcome(current: TraceDocument, id: string, outcome: TraceOutcome): TraceResult<TraceDocument> {
  const checked = validateTraceDocument(current);
  if (!checked.ok) return checked;
  if (!TRACE_OUTCOMES.includes(outcome)) return { ok: false, issue: "outcome" };
  const target = checked.value.traces.find((item) => item.id === id);
  if (!target) return { ok: false, issue: "unknown-pack" };
  if (target.outcome === "reported-complete" && outcome !== "reported-complete") return { ok: false, issue: "transition" };
  if (target.outcome === "stopped" && outcome === "in-progress") return { ok: false, issue: "transition" };
  const traces = checked.value.traces.map((item) => item.id === id ? { ...item, outcome } : item);
  return { ok: true, value: { ...checked.value, traces } };
}
export function summarizeTraces(value: TraceDocument): TraceCounts {
  return {
    total: value.traces.length,
    unknown: value.traces.filter((t) => t.outcome === "UNKNOWN").length,
    stopped: value.traces.filter((t) => t.outcome === "stopped").length,
    inProgress: value.traces.filter((t) => t.outcome === "in-progress").length,
    reportedComplete: value.traces.filter((t) => t.outcome === "reported-complete").length,
    withMissingBytes: value.traces.filter((t) => t.expectedBytes === "UNKNOWN" || t.moments.some((m) => m.observedBytes === "UNKNOWN")).length,
    withNoMoments: value.traces.filter((t) => t.moments.length === 0).length,
  };
}
export function filterTraces(value: TraceDocument, filter: TraceFilter): TraceCase[] {
  const query = filter.text?.trim().toLocaleLowerCase() ?? "";
  return value.traces.filter((entry) =>
    (!filter.packId || entry.packId === filter.packId) &&
    (!filter.operation || entry.operation === filter.operation) &&
    (!filter.outcome || entry.outcome === filter.outcome) &&
    (!query || [entry.id, entry.packId, entry.source.name, entry.source.reference, ...entry.moments.map((m) => m.note)].some((s) => s.toLocaleLowerCase().includes(query)))
  );
}
export function tracePreview(current: TraceDocument, incoming: TraceDocument): TraceResult<TracePreview> {
  const a = validateTraceDocument(current);
  if (!a.ok) return a;
  const b = validateTraceDocument(incoming);
  if (!b.ok) return b;
  const known = new Map(a.value.traces.map((t) => [t.id, t]));
  const added: TraceCase[] = [];
  const same: string[] = [];
  const collisions: string[] = [];
  for (const trace of b.value.traces) {
    const existing = known.get(trace.id);
    if (!existing) added.push(trace);
    else if (JSON.stringify(existing) === JSON.stringify(trace)) same.push(trace.id);
    else collisions.push(trace.id);
  }
  if (a.value.traces.length + added.length > TRACE_LIMITS.maxTraces) return { ok: false, issue: "limit" };
  return { ok: true, value: { added, same, collisions } };
}
export function mergeTraces(current: TraceDocument, incoming: TraceDocument): TraceResult<TraceDocument> {
  const preview = tracePreview(current, incoming);
  if (!preview.ok) return preview;
  if (preview.value.collisions.length) return { ok: false, issue: "conflict" };
  return { ok: true, value: { ...current, traces: [...current.traces, ...preview.value.added] } };
}
export function traceExport(value: TraceDocument): TraceResult<string> {
  const checked = validateTraceDocument(value);
  if (!checked.ok) return checked;
  const output = JSON.stringify(checked.value, null, 2) + "\n";
  if (new TextEncoder().encode(output).byteLength > TRACE_LIMITS.maxBytes) return { ok: false, issue: "limit" };
  return { ok: true, value: output };
}
export function traceImport(input: string): TraceResult<TraceDocument> {
  if (new TextEncoder().encode(input).byteLength > TRACE_LIMITS.maxBytes) return { ok: false, issue: "limit" };
  try {
    return validateTraceDocument(JSON.parse(input) as unknown);
  } catch {
    return { ok: false, issue: "format" };
  }
}
export function nextTraceId(current: TraceDocument): string {
  const used = new Set(current.traces.map((t) => t.id));
  for (let i = 1; i <= TRACE_LIMITS.maxTraces + 1; i++) {
    const candidate = `trace-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `trace-${current.traces.length + 1}`;
}
export function nextMomentId(trace: TraceCase): string {
  const used = new Set(trace.moments.map((m) => m.id));
  for (let i = 1; i <= TRACE_LIMITS.maxMoments + 1; i++) {
    const candidate = `moment-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `moment-${trace.moments.length + 1}`;
}
