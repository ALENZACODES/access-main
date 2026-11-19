import type { TransferCandidate, TransferDocument, TransferIssue } from "./recoveryTransferPreflight";
import { validateTransferCandidate, validateTransferDocument } from "./recoveryTransferPreflight";

/** A timeline records manual reviews without conferring readiness or changing downloaded files. */
export type TransferHistoryAction = "add" | "review" | "discard" | "import";
export interface TransferHistoryEvent {
  readonly id: string;
  readonly candidateId: string;
  readonly action: TransferHistoryAction;
  readonly at: string;
  readonly note: string;
}
export interface TransferHistory {
  readonly format: "local-transfer-history";
  readonly version: 1;
  readonly events: readonly TransferHistoryEvent[];
}
export type HistoryIssue = TransferIssue | "event" | "sequence" | "missing-candidate";
export type HistoryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: HistoryIssue };
export interface TransferBundle {
  readonly format: "local-transfer-bundle";
  readonly version: 1;
  readonly records: TransferDocument;
  readonly history: TransferHistory;
}
export interface TransferBundleMerge {
  readonly addedCandidates: number;
  readonly newEvents: number;
  readonly conflicts: readonly string[];
}
export const HISTORY_LIMIT = 600;
export const HISTORY_BYTE_LIMIT = 768 * 1024;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ACTIONS: readonly TransferHistoryAction[] = ["add", "review", "discard", "import"];
const CONTROL = /\p{Cc}/u;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strictKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !INSTANT.test(value)) return false;
  const numeric = Date.parse(value);
  if (!Number.isFinite(numeric)) return false;
  const canonical = new Date(numeric).toISOString();
  return canonical === (value.includes(".")
    ? value.replace(/\.(\d{1,3})Z$/, (_, fraction: string) => `.${fraction.padEnd(3, "0")}Z`)
    : value.replace("Z", ".000Z"));
}

export function validateHistoryEvent(value: unknown): HistoryIssue | null {
  if (!object(value) || !strictKeys(value, ["id", "candidateId", "action", "at", "note"])) return "event";
  if (typeof value.id !== "string" || !EVENT_ID.test(value.id) ||
    typeof value.candidateId !== "string" || !EVENT_ID.test(value.candidateId)) return "identifier";
  if (!ACTIONS.includes(value.action as TransferHistoryAction)) return "event";
  if (!timestamp(value.at)) return "date";
  if (typeof value.note !== "string" || value.note.length > 500 || CONTROL.test(value.note) ||
    value.note.includes("<") || value.note.includes(">")) return "text";
  return null;
}

export function emptyHistory(): TransferHistory {
  return { format: "local-transfer-history", version: 1, events: [] };
}

export function validateHistory(value: unknown): HistoryResult<TransferHistory> {
  if (!object(value) || !strictKeys(value, ["format", "version", "events"]) ||
    value.format !== "local-transfer-history" || value.version !== 1 || !Array.isArray(value.events)) return { ok: false, issue: "format" };
  if (value.events.length > HISTORY_LIMIT) return { ok: false, issue: "limit" };
  const events: TransferHistoryEvent[] = [];
  const ids = new Set<string>();
  let last = "";
  for (const raw of value.events as unknown[]) {
    const issue = validateHistoryEvent(raw);
    if (issue !== null) return { ok: false, issue };
    const item = raw as TransferHistoryEvent;
    if (ids.has(item.id)) return { ok: false, issue: "duplicate" };
    if (last && item.at < last) return { ok: false, issue: "sequence" };
    ids.add(item.id);
    last = item.at;
    events.push({ ...item });
  }
  return { ok: true, value: { format: "local-transfer-history", version: 1, events } };
}

export function appendHistoryEvent(history: TransferHistory, event: TransferHistoryEvent): HistoryResult<TransferHistory> {
  const checked = validateHistory(history);
  if (!checked.ok) return checked;
  const issue = validateHistoryEvent(event);
  if (issue !== null) return { ok: false, issue };
  if (checked.value.events.length >= HISTORY_LIMIT) return { ok: false, issue: "limit" };
  if (checked.value.events.some((old) => old.id === event.id)) return { ok: false, issue: "duplicate" };
  const last = checked.value.events.at(-1);
  if (last && event.at < last.at) return { ok: false, issue: "sequence" };
  return { ok: true, value: { ...checked.value, events: [...checked.value.events, { ...event }] } };
}

/** Existing events are append-only and the identifier is immutable. */
export function amendHistoryEvent(_history: TransferHistory, _event: TransferHistoryEvent): HistoryResult<TransferHistory> {
  // Explicitly consume the arguments without allowing editing.
  void _history;
  void _event;
  return { ok: false, issue: "transition" };
}

export function historyForCandidate(history: TransferHistory, candidateId: string): TransferHistoryEvent[] {
  return history.events.filter((event) => event.candidateId === candidateId);
}

export function countHistoryActions(history: TransferHistory): Readonly<Record<TransferHistoryAction, number>> {
  const result: Record<TransferHistoryAction, number> = { add: 0, review: 0, discard: 0, import: 0 };
  for (const event of history.events) result[event.action] += 1;
  return result;
}

export function validateTransferBundle(value: unknown): HistoryResult<TransferBundle> {
  if (!object(value) || !strictKeys(value, ["format", "version", "records", "history"]) ||
    value.format !== "local-transfer-bundle" || value.version !== 1) return { ok: false, issue: "format" };
  const records = validateTransferDocument(value.records);
  if (!records.ok) return records;
  const history = validateHistory(value.history);
  if (!history.ok) return history;
  const known = new Set(records.value.candidates.map((entry) => entry.id));
  if (history.value.events.some((event) => !known.has(event.candidateId))) return { ok: false, issue: "missing-candidate" };
  return { ok: true, value: { format: "local-transfer-bundle", version: 1, records: records.value, history: history.value } };
}

export function prepareTransferBundle(records: TransferDocument, history: TransferHistory): HistoryResult<TransferBundle> {
  return validateTransferBundle({ format: "local-transfer-bundle", version: 1, records, history });
}

export function serializeTransferBundle(bundle: TransferBundle): HistoryResult<string> {
  const checked = validateTransferBundle(bundle);
  if (!checked.ok) return checked;
  const text = `${JSON.stringify(checked.value, null, 2)}\n`;
  if (new TextEncoder().encode(text).byteLength > HISTORY_BYTE_LIMIT) return { ok: false, issue: "limit" };
  return { ok: true, value: text };
}

export function parseTransferBundle(raw: string): HistoryResult<TransferBundle> {
  if (new TextEncoder().encode(raw).byteLength > HISTORY_BYTE_LIMIT) return { ok: false, issue: "limit" };
  let decoded: unknown;
  try { decoded = JSON.parse(raw) as unknown; } catch { return { ok: false, issue: "format" }; }
  return validateTransferBundle(decoded);
}

export function previewTransferBundleMerge(current: TransferBundle, incoming: TransferBundle): HistoryResult<TransferBundleMerge> {
  const a = validateTransferBundle(current);
  if (!a.ok) return a;
  const b = validateTransferBundle(incoming);
  if (!b.ok) return b;
  const candidates = new Map(a.value.records.candidates.map((candidate) => [candidate.id, candidate]));
  const events = new Map(a.value.history.events.map((event) => [event.id, event]));
  const conflicts: string[] = [];
  let addedCandidates = 0;
  let newEvents = 0;
  for (const candidate of b.value.records.candidates) {
    const existing = candidates.get(candidate.id);
    if (!existing) addedCandidates += 1;
    else if (JSON.stringify(existing) !== JSON.stringify(candidate)) conflicts.push(candidate.id);
  }
  for (const event of b.value.history.events) {
    const existing = events.get(event.id);
    if (!existing) newEvents += 1;
    else if (JSON.stringify(existing) !== JSON.stringify(event)) conflicts.push(event.id);
  }
  if (a.value.records.candidates.length + addedCandidates > 300 ||
    a.value.history.events.length + newEvents > HISTORY_LIMIT) return { ok: false, issue: "limit" };
  return { ok: true, value: { addedCandidates, newEvents, conflicts } };
}

export function mergeTransferBundles(current: TransferBundle, incoming: TransferBundle): HistoryResult<TransferBundle> {
  const preview = previewTransferBundleMerge(current, incoming);
  if (!preview.ok) return preview;
  if (preview.value.conflicts.length) return { ok: false, issue: "conflict" };
  const newCandidates = incoming.records.candidates.filter((candidate) => !current.records.candidates.some((old) => old.id === candidate.id));
  const newEvents = incoming.history.events.filter((event) => !current.history.events.some((old) => old.id === event.id));
  const combined: TransferBundle = {
    format: "local-transfer-bundle", version: 1,
    records: { ...current.records, candidates: [...current.records.candidates, ...newCandidates] },
    history: { ...current.history, events: [...current.history.events, ...newEvents].sort((a, b) => a.at.localeCompare(b.at, "en")) },
  };
  return validateTransferBundle(combined);
}

export function reconcileTransferHistory(records: TransferDocument, history: TransferHistory): HistoryResult<ReadonlyMap<string, {
  readonly candidate: TransferCandidate;
  readonly events: readonly TransferHistoryEvent[];
  readonly lastAction: TransferHistoryAction | "UNKNOWN";
}>> {
  const bundle = prepareTransferBundle(records, history);
  if (!bundle.ok) return bundle;
  const map = new Map<string, { candidate: TransferCandidate; events: readonly TransferHistoryEvent[]; lastAction: TransferHistoryAction | "UNKNOWN" }>();
  for (const candidate of bundle.value.records.candidates) {
    const events = historyForCandidate(bundle.value.history, candidate.id);
    map.set(candidate.id, { candidate, events, lastAction: events.at(-1)?.action ?? "UNKNOWN" });
  }
  return { ok: true, value: map };
}

/** No journal event, including a user-reported completion, changes actual pack status. */
export function candidateLatestCondition(candidate: TransferCandidate, _history: TransferHistory): TransferCandidate["condition"] {
  void _history;
  return candidate.condition;
}

/** Used for explicit testing of fail-closed schema limits. */
export function transferBundleHasCandidate(bundle: TransferBundle, candidate: unknown): boolean {
  if (validateTransferCandidate(candidate) !== null) return false;
  const checked = validateTransferBundle(bundle);
  if (!checked.ok) return false;
  return checked.value.records.candidates.some((row) => row.id === (candidate as TransferCandidate).id);
}
