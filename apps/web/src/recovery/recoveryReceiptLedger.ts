/** Local handoff receipt ledger. It records evidence, never certifies pack readiness. */
export type ReceiptLocale = "en" | "fr";
export type ReceiptOperation = "pack" | "download" | "export" | "handoff";
export type ReceiptCondition = "UNKNOWN" | "interrupted" | "incomplete" | "unavailable" | "needs-review";
export type ReceiptEvidenceTier = "UNKNOWN" | "self-reported" | "documented" | "reviewed";
export type ReceiptStage = "draft" | "sent" | "acknowledged" | "disputed" | "closed";
export type ReceiptEventAction = "created" | "sent" | "acknowledged" | "disputed" | "reopened" | "closed" | "note";
export type ReceiptIssue = "format" | "limit" | "identity" | "duplicate" | "source" | "date" | "timestamp" | "reference" | "transition" | "conflict" | "text";

export const RECEIPT_LIMITS = Object.freeze({ bytes: 512000, entries: 360, events: 2000, id: 96, text: 700, reference: 240 });
export const RECEIPT_OPERATIONS: readonly ReceiptOperation[] = ["pack", "download", "export", "handoff"];
export const RECEIPT_CONDITIONS: readonly ReceiptCondition[] = ["UNKNOWN", "interrupted", "incomplete", "unavailable", "needs-review"];
export const RECEIPT_TIERS: readonly ReceiptEvidenceTier[] = ["UNKNOWN", "self-reported", "documented", "reviewed"];
export const RECEIPT_STAGES: readonly ReceiptStage[] = ["draft", "sent", "acknowledged", "disputed", "closed"];
export const RECEIPT_ACTIONS: readonly ReceiptEventAction[] = ["created", "sent", "acknowledged", "disputed", "reopened", "closed", "note"];

export interface ReceiptSource {
  readonly name: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: ReceiptEvidenceTier;
  readonly reference: string;
}
export interface ReceiptObservation {
  readonly condition: ReceiptCondition;
  readonly summary: string;
  readonly expectedBytes: number | null;
  readonly observedBytes: number | null;
  readonly digest: string | null;
}
export interface ReceiptEntry {
  readonly id: string;
  readonly packId: string;
  readonly operation: ReceiptOperation;
  readonly stage: ReceiptStage;
  readonly createdAt: string;
  readonly source: ReceiptSource;
  readonly observation: ReceiptObservation;
  /** Local role label, not an identity or personal contact detail. */
  readonly handoffRole: string;
  readonly handoffReference: string;
}
export interface ReceiptEvent {
  readonly id: string;
  readonly entryId: string;
  readonly action: ReceiptEventAction;
  readonly at: string;
  readonly note: string;
  readonly source: ReceiptSource;
}
export interface ReceiptDocument {
  readonly schema: "the-app.recovery-receipt-ledger.v1";
  readonly entries: readonly ReceiptEntry[];
  readonly events: readonly ReceiptEvent[];
}
export interface ReceiptFilter {
  readonly packId?: string;
  readonly operation?: ReceiptOperation;
  readonly stage?: ReceiptStage;
  readonly condition?: ReceiptCondition;
  readonly contains?: string;
}
export interface ReceiptCounts {
  readonly entries: number;
  readonly events: number;
  readonly open: number;
  readonly acknowledged: number;
  readonly disputed: number;
  readonly closed: number;
  readonly unknown: number;
  readonly distinctPacks: number;
  readonly contentReady: false;
}
export interface ReceiptMergePreview {
  readonly incomingEntries: number;
  readonly incomingEvents: number;
  readonly duplicates: number;
  readonly conflicts: number;
  readonly missingReferences: number;
  readonly canMerge: boolean;
}
export type ReceiptResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: ReceiptIssue };

const schema = "the-app.recovery-receipt-ledger.v1" as const;
const success = <T>(value: T): ReceiptResult<T> => ({ ok: true, value });
const failure = <T>(issue: ReceiptIssue): ReceiptResult<T> => ({ ok: false, issue });
const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasOnly = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).every((key) => keys.includes(key)) && keys.every((key) => Object.hasOwn(v, key));
const safeText = (value: unknown, max: number): value is string => {
  if (typeof value !== "string" || value.length > max) return false;
  for (let i = 0; i < value.length; i += 1) {
    const n = value.charCodeAt(i);
    if ((n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127) return false;
  }
  return true;
};
const identifier = (value: unknown): value is string => safeText(value, RECEIPT_LIMITS.id) && value.length > 0 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
const member = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === "string" && values.includes(value as T);
const day = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};
const instant = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const amount = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000);
const digest = (value: unknown): value is string | null => value === null || (typeof value === "string" && /^[a-fA-F0-9]{64}$/u.test(value));
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const sortById = <T extends { readonly id: string }>(items: readonly T[]): T[] => [...items].sort((a, b) => a.id.localeCompare(b.id));

export function emptyReceiptDocument(): ReceiptDocument { return { schema, entries: [], events: [] }; }
export function validReceiptSource(value: unknown): value is ReceiptSource {
  if (!plain(value) || !hasOnly(value, ["name", "licence", "retrievedOn", "tier", "reference"])) return false;
  return safeText(value.name, RECEIPT_LIMITS.text) && value.name.trim().length > 0
    && safeText(value.licence, RECEIPT_LIMITS.text) && value.licence.trim().length > 0
    && day(value.retrievedOn) && member(value.tier, RECEIPT_TIERS)
    && safeText(value.reference, RECEIPT_LIMITS.reference) && value.reference.trim().length > 0;
}
export function validReceiptObservation(value: unknown): value is ReceiptObservation {
  if (!plain(value) || !hasOnly(value, ["condition", "summary", "expectedBytes", "observedBytes", "digest"])) return false;
  return member(value.condition, RECEIPT_CONDITIONS) && safeText(value.summary, RECEIPT_LIMITS.text)
    && amount(value.expectedBytes) && amount(value.observedBytes) && digest(value.digest);
}
export function validReceiptEntry(value: unknown): value is ReceiptEntry {
  if (!plain(value) || !hasOnly(value, ["id", "packId", "operation", "stage", "createdAt", "source", "observation", "handoffRole", "handoffReference"])) return false;
  if (!identifier(value.id) || !identifier(value.packId) || !member(value.operation, RECEIPT_OPERATIONS) || !member(value.stage, RECEIPT_STAGES)) return false;
  if (!instant(value.createdAt) || !validReceiptSource(value.source) || !validReceiptObservation(value.observation)) return false;
  if (!safeText(value.handoffRole, RECEIPT_LIMITS.text) || !safeText(value.handoffReference, RECEIPT_LIMITS.reference)) return false;
  return value.createdAt.slice(0, 10) >= value.source.retrievedOn;
}
export function validReceiptEvent(value: unknown): value is ReceiptEvent {
  if (!plain(value) || !hasOnly(value, ["id", "entryId", "action", "at", "note", "source"])) return false;
  return identifier(value.id) && identifier(value.entryId) && member(value.action, RECEIPT_ACTIONS)
    && instant(value.at) && safeText(value.note, RECEIPT_LIMITS.text) && validReceiptSource(value.source)
    && value.at.slice(0, 10) >= value.source.retrievedOn;
}
function canTransition(stage: ReceiptStage, action: ReceiptEventAction): boolean {
  if (action === "note" || action === "created") return stage !== "closed";
  if (action === "sent") return stage === "draft";
  if (action === "acknowledged") return stage === "sent";
  if (action === "disputed") return stage === "sent" || stage === "acknowledged";
  if (action === "reopened") return stage === "disputed" || stage === "closed";
  if (action === "closed") return stage === "acknowledged" || stage === "disputed";
  return false;
}
function nextStage(stage: ReceiptStage, action: ReceiptEventAction): ReceiptStage {
  if (action === "sent") return "sent";
  if (action === "acknowledged") return "acknowledged";
  if (action === "disputed") return "disputed";
  if (action === "reopened") return "draft";
  if (action === "closed") return "closed";
  return stage;
}
export function receiptEventsFor(doc: ReceiptDocument, entryId: string): readonly ReceiptEvent[] {
  return doc.events.filter((item) => item.entryId === entryId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function validReceiptDocument(value: unknown): value is ReceiptDocument {
  if (!plain(value) || !hasOnly(value, ["schema", "entries", "events"])) return false;
  if (value.schema !== schema || !Array.isArray(value.entries) || !Array.isArray(value.events)) return false;
  if (value.entries.length > RECEIPT_LIMITS.entries || value.events.length > RECEIPT_LIMITS.events) return false;
  if (!value.entries.every(validReceiptEntry) || !value.events.every(validReceiptEvent)) return false;
  const entries = value.entries as ReceiptEntry[];
  const events = value.events as ReceiptEvent[];
  if (new Set(entries.map((item) => item.id)).size !== entries.length) return false;
  if (new Set(events.map((item) => item.id)).size !== events.length) return false;
  const byId = new Map(entries.map((item) => [item.id, item]));
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const stageMap = new Map(entries.map((item) => [item.id, "draft" as ReceiptStage]));
  let lastAt = "";
  for (const event of ordered) {
    const entry = byId.get(event.entryId);
    if (!entry || event.at < entry.createdAt || event.at < lastAt) return false;
    const stage = stageMap.get(entry.id);
    if (!stage || !canTransition(stage, event.action)) return false;
    stageMap.set(entry.id, nextStage(stage, event.action));
    lastAt = event.at;
  }
  return entries.every((entry) => stageMap.get(entry.id) === entry.stage);
}
export function validateReceiptDocument(value: unknown): ReceiptResult<ReceiptDocument> {
  return validReceiptDocument(value) ? success(value) : failure("format");
}
export function nextReceiptEntryId(doc: ReceiptDocument): string {
  let index = 1;
  const used = new Set(doc.entries.map((item) => item.id));
  while (used.has(`receipt-${index}`)) index += 1;
  return `receipt-${index}`;
}
export function nextReceiptEventId(doc: ReceiptDocument): string {
  let index = 1;
  const used = new Set(doc.events.map((item) => item.id));
  while (used.has(`receipt-event-${index}`)) index += 1;
  return `receipt-event-${index}`;
}
export function createReceipt(doc: ReceiptDocument, entry: ReceiptEntry): ReceiptResult<ReceiptDocument> {
  if (!validReceiptDocument(doc)) return failure("format");
  if (!validReceiptEntry(entry) || entry.stage !== "draft") return failure("source");
  if (doc.entries.some((item) => item.id === entry.id)) return failure("duplicate");
  if (doc.entries.length >= RECEIPT_LIMITS.entries) return failure("limit");
  const value = { ...doc, entries: [...doc.entries, entry] };
  return validReceiptDocument(value) ? success(value) : failure("format");
}
export function recordReceiptEvent(doc: ReceiptDocument, event: ReceiptEvent): ReceiptResult<ReceiptDocument> {
  if (!validReceiptDocument(doc)) return failure("format");
  if (!validReceiptEvent(event)) return failure("source");
  if (doc.events.some((item) => item.id === event.id)) return failure("duplicate");
  if (doc.events.length >= RECEIPT_LIMITS.events) return failure("limit");
  const entry = doc.entries.find((item) => item.id === event.entryId);
  if (!entry) return failure("reference");
  if (event.at < entry.createdAt || doc.events.some((item) => item.at > event.at)) return failure("timestamp");
  if (!canTransition(entry.stage, event.action)) return failure("transition");
  const entries = doc.entries.map((item) => item.id === entry.id ? { ...item, stage: nextStage(item.stage, event.action) } : item);
  const value: ReceiptDocument = { ...doc, entries, events: [...doc.events, event] };
  return validReceiptDocument(value) ? success(value) : failure("format");
}
export function filterReceipts(doc: ReceiptDocument, filter: ReceiptFilter): readonly ReceiptEntry[] {
  const q = filter.contains?.trim().toLowerCase() ?? "";
  return doc.entries.filter((item) =>
    (filter.packId === undefined || item.packId === filter.packId)
    && (filter.operation === undefined || item.operation === filter.operation)
    && (filter.stage === undefined || item.stage === filter.stage)
    && (filter.condition === undefined || item.observation.condition === filter.condition)
    && (q === "" || [item.id, item.packId, item.observation.summary, item.handoffRole, item.handoffReference].some((v) => v.toLowerCase().includes(q)))
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function receiptSummary(doc: ReceiptDocument): ReceiptCounts {
  const count = (predicate: (item: ReceiptEntry) => boolean): number => doc.entries.filter(predicate).length;
  return {
    entries: doc.entries.length, events: doc.events.length,
    open: count((item) => item.stage !== "closed"),
    acknowledged: count((item) => item.stage === "acknowledged"),
    disputed: count((item) => item.stage === "disputed"),
    closed: count((item) => item.stage === "closed"),
    unknown: count((item) => item.observation.condition === "UNKNOWN" || item.source.tier === "UNKNOWN"),
    distinctPacks: new Set(doc.entries.map((item) => item.packId)).size,
    contentReady: false,
  };
}
export function exportReceiptDocument(doc: ReceiptDocument): ReceiptResult<string> {
  if (!validReceiptDocument(doc)) return failure("format");
  const serialized = JSON.stringify({ schema, entries: sortById(doc.entries), events: sortById(doc.events) }, null, 2);
  return new TextEncoder().encode(serialized).length > RECEIPT_LIMITS.bytes ? failure("limit") : success(serialized);
}
export function importReceiptDocument(serialized: string): ReceiptResult<ReceiptDocument> {
  if (new TextEncoder().encode(serialized).length > RECEIPT_LIMITS.bytes) return failure("limit");
  try { return validateReceiptDocument(JSON.parse(serialized) as unknown); }
  catch { return failure("format"); }
}
export function previewReceiptMerge(left: ReceiptDocument, right: ReceiptDocument): ReceiptMergePreview {
  if (!validReceiptDocument(left) || !validReceiptDocument(right)) return { incomingEntries: 0, incomingEvents: 0, duplicates: 0, conflicts: 1, missingReferences: 0, canMerge: false };
  const oldEntries = new Map(left.entries.map((item) => [item.id, item]));
  const oldEvents = new Map(left.events.map((item) => [item.id, item]));
  const combinedIds = new Set([...left.entries, ...right.entries].map((item) => item.id));
  const conflicts = right.entries.filter((item) => oldEntries.has(item.id) && !equal(oldEntries.get(item.id), item)).length
    + right.events.filter((item) => oldEvents.has(item.id) && !equal(oldEvents.get(item.id), item)).length;
  const duplicates = right.entries.filter((item) => oldEntries.has(item.id)).length + right.events.filter((item) => oldEvents.has(item.id)).length;
  const missingReferences = right.events.filter((item) => !combinedIds.has(item.entryId)).length;
  const entries = [...left.entries, ...right.entries.filter((item) => !oldEntries.has(item.id))];
  const events = [...left.events, ...right.events.filter((item) => !oldEvents.has(item.id))];
  const combined = { schema, entries, events };
  const canMerge = conflicts === 0 && missingReferences === 0 && entries.length <= RECEIPT_LIMITS.entries && events.length <= RECEIPT_LIMITS.events && validReceiptDocument(combined);
  return { incomingEntries: right.entries.length - right.entries.filter((item) => oldEntries.has(item.id)).length,
    incomingEvents: right.events.length - right.events.filter((item) => oldEvents.has(item.id)).length,
    duplicates, conflicts, missingReferences, canMerge };
}
export function mergeReceiptDocuments(left: ReceiptDocument, right: ReceiptDocument): ReceiptResult<ReceiptDocument> {
  const preview = previewReceiptMerge(left, right);
  if (!preview.canMerge) return failure(preview.conflicts > 0 ? "conflict" : "reference");
  const existingEntries = new Set(left.entries.map((item) => item.id));
  const existingEvents = new Set(left.events.map((item) => item.id));
  return success({ schema, entries: sortById([...left.entries, ...right.entries.filter((item) => !existingEntries.has(item.id))]),
    events: [...left.events, ...right.events.filter((item) => !existingEvents.has(item.id))].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)) });
}
/** Receipt closure never establishes that a pack or venue is usable. */
export function receiptContentReady(): false { return false; }
