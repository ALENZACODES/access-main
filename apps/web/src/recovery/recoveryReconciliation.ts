/** Manual evidence reconciliation. This record never changes installed-pack state. */
export type ReconciliationCondition = "UNKNOWN" | "unavailable" | "incomplete" | "interrupted" | "needs-review";
export type ReconciliationTier = "UNKNOWN" | "self-reported" | "documented" | "reviewed";
export type ReconciliationOperation = "pack" | "download" | "export" | "handoff";
export type ReconciliationStatus = "open" | "in-review" | "deferred" | "closed";
export type ReconciliationDisposition = "UNKNOWN" | "retain" | "seek-source" | "dispute" | "document-only";
export type ReconciliationAction = "opened" | "noted" | "reviewed" | "deferred" | "reopened" | "closed";
export type ReconciliationIssue = "format" | "size" | "count" | "id" | "duplicate" | "source" | "date" | "time" | "text" | "reference" | "transition" | "conflict" | "version";
export const RECONCILIATION_LIMITS = Object.freeze({ bytes: 524_288, cases: 300, observations: 1200, events: 2000, text: 600, id: 100 });
export const RECONCILIATION_CONDITIONS: readonly ReconciliationCondition[] = ["UNKNOWN", "unavailable", "incomplete", "interrupted", "needs-review"];
export const RECONCILIATION_TIERS: readonly ReconciliationTier[] = ["UNKNOWN", "self-reported", "documented", "reviewed"];
export const RECONCILIATION_OPERATIONS: readonly ReconciliationOperation[] = ["pack", "download", "export", "handoff"];
export const RECONCILIATION_STATUSES: readonly ReconciliationStatus[] = ["open", "in-review", "deferred", "closed"];
export const RECONCILIATION_DISPOSITIONS: readonly ReconciliationDisposition[] = ["UNKNOWN", "retain", "seek-source", "dispute", "document-only"];
export const RECONCILIATION_ACTIONS: readonly ReconciliationAction[] = ["opened", "noted", "reviewed", "deferred", "reopened", "closed"];
export interface ReconciliationSource {
  readonly name: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: ReconciliationTier;
  readonly reference: string;
}
export interface ReconciliationObservation {
  readonly id: string;
  readonly caseId: string;
  readonly condition: ReconciliationCondition;
  readonly recordedAt: string;
  readonly source: ReconciliationSource;
  readonly note: string;
}
export interface ReconciliationCase {
  readonly id: string;
  readonly packId: string;
  readonly operation: ReconciliationOperation;
  readonly status: ReconciliationStatus;
  readonly disposition: ReconciliationDisposition;
  readonly openedAt: string;
  readonly title: string;
  readonly summary: string;
  readonly source: ReconciliationSource;
}
export interface ReconciliationEvent {
  readonly id: string;
  readonly caseId: string;
  readonly action: ReconciliationAction;
  readonly at: string;
  readonly note: string;
  readonly source: ReconciliationSource;
}
export interface ReconciliationDocument {
  readonly schema: "the-app.recovery-reconciliation.v1";
  readonly cases: readonly ReconciliationCase[];
  readonly observations: readonly ReconciliationObservation[];
  readonly events: readonly ReconciliationEvent[];
}
export type ReconciliationResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: ReconciliationIssue };
export interface ReconciliationMergePreview {
  readonly newCases: number;
  readonly newObservations: number;
  readonly newEvents: number;
  readonly overlappingCases: number;
  readonly conflictingCases: number;
  readonly conflictingObservations: number;
  readonly conflictingEvents: number;
  readonly canMerge: boolean;
}
export interface ReconciliationFilter {
  readonly packId?: string;
  readonly operation?: ReconciliationOperation;
  readonly status?: ReconciliationStatus;
  readonly disposition?: ReconciliationDisposition;
  readonly query?: string;
  readonly conflictingOnly?: boolean;
}
export interface ReconciliationSummary {
  readonly cases: number;
  readonly observations: number;
  readonly events: number;
  readonly open: number;
  readonly inReview: number;
  readonly deferred: number;
  readonly closed: number;
  readonly unknown: number;
  readonly contradictions: number;
  readonly packs: number;
  readonly contentReady: false;
}

export const newReconciliationDocument = (): ReconciliationDocument => ({
  schema: "the-app.recovery-reconciliation.v1", cases: [], observations: [], events: [],
});
const success = <T>(value: T): ReconciliationResult<T> => ({ ok: true, value });
const failure = <T>(issue: ReconciliationIssue): ReconciliationResult<T> => ({ ok: false, issue });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const inSet = <T extends string>(v: unknown, values: readonly T[]): v is T => typeof v === "string" && values.includes(v as T);
const validText = (v: unknown, max = RECONCILIATION_LIMITS.text): v is string => {
  if (typeof v !== "string" || v.length > max) return false;
  for (let i = 0; i < v.length; i += 1) {
    const n = v.charCodeAt(i);
    if (n <= 31 && n !== 9 && n !== 10 && n !== 13) return false;
  }
  return true;
};
const validId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= RECONCILIATION_LIMITS.id && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(v);
const validDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const validInstant = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(v) && !Number.isNaN(Date.parse(v));
const exactKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(v, k));
const sorted = <T extends { readonly id: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => a.id.localeCompare(b.id));
const distinct = <T extends { readonly id: string }>(list: readonly T[]): boolean => new Set(list.map((item) => item.id)).size === list.length;

export function checkReconciliationSource(value: unknown): ReconciliationResult<ReconciliationSource> {
  if (!isRecord(value) || !exactKeys(value, ["name", "licence", "retrievedOn", "tier", "reference"])) return failure("source");
  if (!validText(value.name) || value.name.trim().length === 0) return failure("source");
  if (!validText(value.licence) || value.licence.trim().length === 0) return failure("source");
  if (!validDate(value.retrievedOn)) return failure("date");
  if (!inSet(value.tier, RECONCILIATION_TIERS)) return failure("source");
  if (!validText(value.reference) || value.reference.trim().length === 0) return failure("source");
  return success(value as unknown as ReconciliationSource);
}
export function checkReconciliationCase(value: unknown): ReconciliationResult<ReconciliationCase> {
  if (!isRecord(value) || !exactKeys(value, ["id", "packId", "operation", "status", "disposition", "openedAt", "title", "summary", "source"])) return failure("format");
  if (!validId(value.id) || !validId(value.packId)) return failure("id");
  if (!inSet(value.operation, RECONCILIATION_OPERATIONS)) return failure("format");
  if (!inSet(value.status, RECONCILIATION_STATUSES) || !inSet(value.disposition, RECONCILIATION_DISPOSITIONS)) return failure("format");
  if (!validInstant(value.openedAt)) return failure("time");
  if (!validText(value.title) || !value.title.trim() || !validText(value.summary)) return failure("text");
  const source = checkReconciliationSource(value.source);
  if (!source.ok) return failure(source.issue);
  return success(value as unknown as ReconciliationCase);
}
export function checkReconciliationObservation(value: unknown): ReconciliationResult<ReconciliationObservation> {
  if (!isRecord(value) || !exactKeys(value, ["id", "caseId", "condition", "recordedAt", "source", "note"])) return failure("format");
  if (!validId(value.id) || !validId(value.caseId)) return failure("id");
  if (!inSet(value.condition, RECONCILIATION_CONDITIONS)) return failure("format");
  if (!validInstant(value.recordedAt)) return failure("time");
  if (!validText(value.note)) return failure("text");
  const source = checkReconciliationSource(value.source);
  if (!source.ok) return failure(source.issue);
  return success(value as unknown as ReconciliationObservation);
}
export function checkReconciliationEvent(value: unknown): ReconciliationResult<ReconciliationEvent> {
  if (!isRecord(value) || !exactKeys(value, ["id", "caseId", "action", "at", "note", "source"])) return failure("format");
  if (!validId(value.id) || !validId(value.caseId)) return failure("id");
  if (!inSet(value.action, RECONCILIATION_ACTIONS)) return failure("format");
  if (!validInstant(value.at)) return failure("time");
  if (!validText(value.note)) return failure("text");
  const source = checkReconciliationSource(value.source);
  if (!source.ok) return failure(source.issue);
  return success(value as unknown as ReconciliationEvent);
}
export function checkReconciliationDocument(value: unknown): ReconciliationResult<ReconciliationDocument> {
  if (!isRecord(value) || !exactKeys(value, ["schema", "cases", "observations", "events"])) return failure("format");
  if (value.schema !== "the-app.recovery-reconciliation.v1") return failure("version");
  if (!Array.isArray(value.cases) || !Array.isArray(value.observations) || !Array.isArray(value.events)) return failure("format");
  if (value.cases.length > RECONCILIATION_LIMITS.cases || value.observations.length > RECONCILIATION_LIMITS.observations || value.events.length > RECONCILIATION_LIMITS.events) return failure("count");
  const cases: ReconciliationCase[] = [];
  for (const item of value.cases) { const r = checkReconciliationCase(item); if (!r.ok) return failure(r.issue); cases.push(r.value); }
  const observations: ReconciliationObservation[] = [];
  for (const item of value.observations) { const r = checkReconciliationObservation(item); if (!r.ok) return failure(r.issue); observations.push(r.value); }
  const events: ReconciliationEvent[] = [];
  for (const item of value.events) { const r = checkReconciliationEvent(item); if (!r.ok) return failure(r.issue); events.push(r.value); }
  if (!distinct(cases) || !distinct(observations) || !distinct(events)) return failure("duplicate");
  const ids = new Set(cases.map((item) => item.id));
  if (observations.some((item) => !ids.has(item.caseId)) || events.some((item) => !ids.has(item.caseId))) return failure("reference");
  const opened = new Map(cases.map((item) => [item.id, item.openedAt]));
  if (observations.some((item) => item.recordedAt < (opened.get(item.caseId) ?? ""))) return failure("time");
  if (events.some((item) => item.at < (opened.get(item.caseId) ?? ""))) return failure("time");
  return success({ schema: "the-app.recovery-reconciliation.v1", cases, observations, events });
}
export function serializeReconciliation(document: ReconciliationDocument): ReconciliationResult<string> {
  const inspected = checkReconciliationDocument(document);
  if (!inspected.ok) return failure(inspected.issue);
  const value = JSON.stringify({ ...inspected.value, cases: sorted(inspected.value.cases), observations: sorted(inspected.value.observations), events: sorted(inspected.value.events) }, null, 2);
  if (new TextEncoder().encode(value).byteLength > RECONCILIATION_LIMITS.bytes) return failure("size");
  return success(value);
}
export function parseReconciliation(json: string): ReconciliationResult<ReconciliationDocument> {
  if (new TextEncoder().encode(json).byteLength > RECONCILIATION_LIMITS.bytes) return failure("size");
  try { return checkReconciliationDocument(JSON.parse(json) as unknown); } catch { return failure("format"); }
}
export function nextReconciliationId(document: ReconciliationDocument, prefix: "case" | "obs" | "evt"): string {
  const all = [...document.cases, ...document.observations, ...document.events];
  const taken = new Set(all.map((item) => item.id));
  let index = 1;
  while (taken.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
export function addReconciliationCase(document: ReconciliationDocument, item: ReconciliationCase): ReconciliationResult<ReconciliationDocument> {
  const base = checkReconciliationDocument(document);
  if (!base.ok) return base;
  const candidate = checkReconciliationCase(item);
  if (!candidate.ok) return failure(candidate.issue);
  if (document.cases.some((existing) => existing.id === item.id)) return failure("duplicate");
  return checkReconciliationDocument({ ...document, cases: [...document.cases, item] });
}
export function addReconciliationObservation(document: ReconciliationDocument, item: ReconciliationObservation): ReconciliationResult<ReconciliationDocument> {
  const base = checkReconciliationDocument(document);
  if (!base.ok) return base;
  const candidate = checkReconciliationObservation(item);
  if (!candidate.ok) return failure(candidate.issue);
  if (!document.cases.some((entry) => entry.id === item.caseId)) return failure("reference");
  if (document.observations.some((entry) => entry.id === item.id)) return failure("duplicate");
  return checkReconciliationDocument({ ...document, observations: [...document.observations, item] });
}
const allowed: Readonly<Record<ReconciliationStatus, readonly ReconciliationAction[]>> = {
  open: ["noted", "reviewed", "deferred", "closed"],
  "in-review": ["noted", "deferred", "closed"],
  deferred: ["noted", "reviewed", "closed"],
  closed: ["reopened"],
};
const statusAfter = (status: ReconciliationStatus, action: ReconciliationAction): ReconciliationStatus => {
  if (action === "reviewed") return "in-review";
  if (action === "deferred") return "deferred";
  if (action === "closed") return "closed";
  if (action === "reopened") return "open";
  return status;
};
export function addReconciliationEvent(document: ReconciliationDocument, item: ReconciliationEvent, disposition?: ReconciliationDisposition): ReconciliationResult<ReconciliationDocument> {
  const base = checkReconciliationDocument(document);
  if (!base.ok) return base;
  const candidate = checkReconciliationEvent(item);
  if (!candidate.ok) return failure(candidate.issue);
  const entry = document.cases.find((c) => c.id === item.caseId);
  if (!entry) return failure("reference");
  if (!allowed[entry.status].includes(item.action) || item.action === "opened") return failure("transition");
  if (item.at < entry.openedAt) return failure("time");
  if (document.events.some((event) => event.id === item.id)) return failure("duplicate");
  if (disposition !== undefined && !RECONCILIATION_DISPOSITIONS.includes(disposition)) return failure("format");
  if (item.action === "closed" && (disposition === undefined || disposition === "UNKNOWN")) return failure("transition");
  if (item.action !== "closed" && disposition !== undefined) return failure("transition");
  const updated: ReconciliationCase = { ...entry, status: statusAfter(entry.status, item.action), disposition: disposition ?? entry.disposition };
  return checkReconciliationDocument({ ...document, cases: document.cases.map((c) => c.id === entry.id ? updated : c), events: [...document.events, item] });
}
export function observationsForCase(document: ReconciliationDocument, caseId: string): readonly ReconciliationObservation[] {
  return document.observations.filter((item) => item.caseId === caseId).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
}
export function eventsForCase(document: ReconciliationDocument, caseId: string): readonly ReconciliationEvent[] {
  return document.events.filter((item) => item.caseId === caseId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function caseHasContradiction(document: ReconciliationDocument, caseId: string): boolean {
  const conditions = new Set(observationsForCase(document, caseId).map((item) => item.condition));
  return conditions.size > 1;
}
export function caseCurrentCondition(document: ReconciliationDocument, caseId: string): ReconciliationCondition {
  const observations = observationsForCase(document, caseId);
  if (!observations.length || caseHasContradiction(document, caseId)) return "UNKNOWN";
  return observations[observations.length - 1]?.condition ?? "UNKNOWN";
}
export function reconciliationSummary(document: ReconciliationDocument): ReconciliationSummary {
  const cases = document.cases;
  return {
    cases: cases.length, observations: document.observations.length, events: document.events.length,
    open: cases.filter((c) => c.status === "open").length,
    inReview: cases.filter((c) => c.status === "in-review").length,
    deferred: cases.filter((c) => c.status === "deferred").length,
    closed: cases.filter((c) => c.status === "closed").length,
    unknown: cases.filter((c) => caseCurrentCondition(document, c.id) === "UNKNOWN").length,
    contradictions: cases.filter((c) => caseHasContradiction(document, c.id)).length,
    packs: new Set(cases.map((c) => c.packId)).size,
    contentReady: false,
  };
}
export function filterReconciliationCases(document: ReconciliationDocument, filter: ReconciliationFilter): readonly ReconciliationCase[] {
  const query = filter.query?.trim().toLocaleLowerCase() ?? "";
  return document.cases.filter((item) =>
    (filter.packId === undefined || item.packId === filter.packId)
    && (filter.operation === undefined || item.operation === filter.operation)
    && (filter.status === undefined || item.status === filter.status)
    && (filter.disposition === undefined || item.disposition === filter.disposition)
    && (!filter.conflictingOnly || caseHasContradiction(document, item.id))
    && (query.length === 0 || [item.id, item.packId, item.title, item.summary, item.source.name].some((v) => v.toLocaleLowerCase().includes(query)))
  ).sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id));
}
const overlap = <T extends { readonly id: string }>(base: readonly T[], incoming: readonly T[]): { added: number; same: number; conflicts: number } => {
  const byId = new Map(base.map((item) => [item.id, item]));
  let added = 0; let same = 0; let conflicts = 0;
  for (const item of incoming) {
    const old = byId.get(item.id);
    if (!old) added += 1;
    else if (JSON.stringify(old) === JSON.stringify(item)) same += 1;
    else conflicts += 1;
  }
  return { added, same, conflicts };
};
export function previewReconciliationMerge(base: ReconciliationDocument, incoming: ReconciliationDocument): ReconciliationMergePreview {
  const a = overlap(base.cases, incoming.cases);
  const b = overlap(base.observations, incoming.observations);
  const c = overlap(base.events, incoming.events);
  return {
    newCases: a.added, newObservations: b.added, newEvents: c.added,
    overlappingCases: a.same, conflictingCases: a.conflicts,
    conflictingObservations: b.conflicts, conflictingEvents: c.conflicts,
    canMerge: a.conflicts === 0 && b.conflicts === 0 && c.conflicts === 0,
  };
}
export function mergeReconciliationDocuments(base: ReconciliationDocument, incoming: ReconciliationDocument): ReconciliationResult<ReconciliationDocument> {
  const a = checkReconciliationDocument(base);
  if (!a.ok) return failure(a.issue);
  const b = checkReconciliationDocument(incoming);
  if (!b.ok) return failure(b.issue);
  if (!previewReconciliationMerge(base, incoming).canMerge) return failure("conflict");
  const append = <T extends { readonly id: string }>(left: readonly T[], right: readonly T[]): readonly T[] => {
    const ids = new Set(left.map((item) => item.id));
    return [...left, ...right.filter((item) => !ids.has(item.id))];
  };
  return checkReconciliationDocument({
    schema: "the-app.recovery-reconciliation.v1",
    cases: append(base.cases, incoming.cases),
    observations: append(base.observations, incoming.observations),
    events: append(base.events, incoming.events),
  });
}
/** Local review only: no case status grants pack access. */
export function reconciliationContentReady(document: ReconciliationDocument): false {
  void document;
  return false;
}
