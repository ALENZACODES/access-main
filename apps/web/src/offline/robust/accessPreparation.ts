import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

/** User-authored preparation notes, not statements of place accessibility. */
export type PreparationTopic =
  | "entry" | "route" | "washroom" | "rest" | "transport"
  | "communication" | "storage" | "contact" | "other";
export type PreparationStatus = "open" | "answered" | "UNKNOWN" | "not-needed";
export type PreparationEvidence = "personal-note" | "source-note" | "UNKNOWN";
export type PreparationFilter = "all" | "open" | "answered" | "UNKNOWN" | "not-needed";
export type PreparationSort = "created" | "updated" | "topic" | "status";
export type LocalCopyStatus = "saved" | "UNKNOWN";

export interface PreparationPrompt {
  readonly code: string;
  readonly topic: PreparationTopic;
  readonly question: string;
}
export interface PreparationEntry {
  readonly id: string;
  readonly topic: PreparationTopic;
  readonly question: string;
  readonly answer: string;
  readonly status: PreparationStatus;
  readonly evidence: PreparationEvidence;
  readonly sourceName: string;
  readonly sourceDate: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly cellId: string | null;
}
export interface PreparationHistoryEvent {
  readonly entryId: string;
  readonly at: string;
  readonly operation: "add" | "answer" | "reopen" | "skip" | "uncertain" | "delete";
  readonly revision: number;
}
export interface PreparationNotebook {
  readonly format: "offline-access-preparation-v1";
  readonly regionId: string;
  readonly createdAt: string;
  readonly entries: readonly PreparationEntry[];
  readonly history: readonly PreparationHistoryEvent[];
}
export interface PreparationChange {
  readonly question?: string;
  readonly topic?: PreparationTopic;
  readonly answer?: string;
  readonly evidence?: PreparationEvidence;
  readonly sourceName?: string;
  readonly sourceDate?: string;
  readonly status?: PreparationStatus;
  readonly cellId?: string | null;
}
export interface PreparationTotals {
  readonly total: number;
  readonly open: number;
  readonly answered: number;
  readonly UNKNOWN: number;
  readonly notNeeded: number;
  readonly withSourceNote: number;
  readonly linkedToCell: number;
}
export interface PreparationQuery {
  readonly search: string;
  readonly filter: PreparationFilter;
  readonly topic: PreparationTopic | "all";
  readonly sort: PreparationSort;
  readonly offset: number;
  readonly limit: number;
}
export interface PreparationPage {
  readonly rows: readonly PreparationEntry[];
  readonly total: number;
  readonly previous: boolean;
  readonly next: boolean;
}
export interface CopyAssessment {
  readonly regionId: string;
  readonly status: LocalCopyStatus;
  readonly totalCells: number;
  readonly savedCells: number;
  readonly unknownCells: number;
  readonly linked: readonly { id: string; status: LocalCopyStatus }[];
}

export const PREPARATION_MAX_ENTRIES = 120;
export const PREPARATION_MAX_EVENTS = 600;
export const PREPARATION_MAX_JSON_BYTES = 262144;
export const PREPARATION_MAX_QUESTION = 240;
export const PREPARATION_MAX_ANSWER = 1600;
export const PREPARATION_MAX_SOURCE = 160;
export const PREPARATION_PAGE_MAX = 25;
export const PREPARATION_TOPICS: readonly PreparationTopic[] = [
  "entry", "route", "washroom", "rest", "transport", "communication", "storage", "contact", "other",
];
export const PREPARATION_FILTERS: readonly PreparationFilter[] = [
  "all", "open", "answered", "UNKNOWN", "not-needed",
];
export const PREPARATION_SORTS: readonly PreparationSort[] = ["created", "updated", "topic", "status"];

/** Open-ended questions, intentionally not assertions about a location. */
export const PREPARATION_PROMPTS: readonly PreparationPrompt[] = [
  { code: "entry-step", topic: "entry", question: "What is known about the entrance and any steps?" },
  { code: "entry-width", topic: "entry", question: "Is there information on the entrance clear width?" },
  { code: "entry-door", topic: "entry", question: "Is door operation information available?" },
  { code: "entry-alternative", topic: "entry", question: "Is an alternative entrance described?" },
  { code: "route-surface", topic: "route", question: "What is known about the surface on the approach?" },
  { code: "route-grade", topic: "route", question: "Is slope or grade information available?" },
  { code: "route-curb", topic: "route", question: "Are curb transitions described?" },
  { code: "route-obstacles", topic: "route", question: "What is known about possible route obstacles?" },
  { code: "route-turning", topic: "route", question: "Is turning space for mobility devices described?" },
  { code: "route-reachable", topic: "route", question: "Is the distance between access points documented?" },
  { code: "route-crossing", topic: "route", question: "What information is available about road crossings?" },
  { code: "entry-clearance", topic: "entry", question: "Are doorway and corridor clearances listed?" },
  { code: "washroom-turning", topic: "washroom", question: "Is turning space near facilities described?" },
  { code: "rest-seating", topic: "rest", question: "Is seating location information available?" },
  { code: "transport-level", topic: "transport", question: "Are step-free boarding options documented?" },
  { code: "transport-transfer", topic: "transport", question: "Is transfer space or assistance information listed?" },
  { code: "washroom-location", topic: "washroom", question: "Is washroom location information available?" },
  { code: "washroom-layout", topic: "washroom", question: "Is the washroom layout described?" },
  { code: "washroom-hours", topic: "washroom", question: "Are washroom access hours stated?" },
  { code: "washroom-door", topic: "washroom", question: "Is washroom entrance information available?" },
  { code: "rest-area", topic: "rest", question: "Are resting areas described along the route?" },
  { code: "rest-weather", topic: "rest", question: "Is there information on shelter from weather?" },
  { code: "transport-boarding", topic: "transport", question: "What is known about boarding arrangements?" },
  { code: "transport-stop", topic: "transport", question: "Is the stop or pickup location described?" },
  { code: "transport-return", topic: "transport", question: "What information is available for the return trip?" },
  { code: "communication-contact", topic: "communication", question: "Is a suitable contact method listed?" },
  { code: "communication-format", topic: "communication", question: "Can needed information be obtained in a useful format?" },
  { code: "communication-change", topic: "communication", question: "How could changed information be checked manually?" },
  { code: "storage-offline", topic: "storage", question: "Which local information is saved for offline use?" },
  { code: "storage-unknown", topic: "storage", question: "Which needed offline information remains UNKNOWN?" },
  { code: "contact-hours", topic: "contact", question: "Are contact hours listed with a source date?" },
  { code: "contact-alternative", topic: "contact", question: "Is another contact method available?" },
];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const containsControl = (value: string): boolean => [...value].some((char) => {
  const code = char.charCodeAt(0);
  return code < 32 || code === 127;
});
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/u;

function text(value: unknown, label: string, limit: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > limit || (label === "answer" ? containsControl(value.replaceAll("\n", "")) : containsControl(value)) ||
      (!allowEmpty && value.trim().length === 0)) throw new TypeError(`Invalid ${label}`);
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value) throw new TypeError("Invalid timestamp");
  return value;
}
function date(value: unknown): string {
  if (typeof value !== "string" || !DATE.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new TypeError("Invalid source date");
  }
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) throw new TypeError("Invalid identifier");
  return value;
}
function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new TypeError(`Invalid ${label}`);
  return value as T;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Expected object");
  return value as Record<string, unknown>;
}
function bounded(value: number, low: number, high: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < low || value > high) throw new RangeError(`Invalid ${label}`);
  return value;
}

function checkEntry(value: unknown): PreparationEntry {
  const v = object(value);
  const id = identifier(v.id);
  const topic = oneOf(v.topic, PREPARATION_TOPICS, "topic");
  const question = text(v.question, "question", PREPARATION_MAX_QUESTION);
  const answer = text(v.answer, "answer", PREPARATION_MAX_ANSWER, true);
  const status = oneOf(v.status, ["open", "answered", "UNKNOWN", "not-needed"] as const, "status");
  const evidence = oneOf(v.evidence, ["personal-note", "source-note", "UNKNOWN"] as const, "evidence");
  const sourceName = text(v.sourceName, "source", PREPARATION_MAX_SOURCE, true);
  const sourceDate = v.sourceDate === "" ? "" : date(v.sourceDate);
  const createdAt = timestamp(v.createdAt);
  const updatedAt = timestamp(v.updatedAt);
  const revision = bounded(v.revision as number, 1, PREPARATION_MAX_EVENTS, "revision");
  const cellId = v.cellId === null ? null : identifier(v.cellId);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new TypeError("Reversed entry timestamps");
  if (status === "answered" && !answer.trim()) throw new TypeError("An answer is required");
  if (evidence === "source-note" && (!sourceName.trim() || !sourceDate)) {
    throw new TypeError("A source note needs a name and date");
  }
  if (evidence !== "source-note" && (sourceName || sourceDate)) {
    throw new TypeError("Unattributed source fields");
  }
  return { id, topic, question, answer, status, evidence, sourceName,
    sourceDate, createdAt, updatedAt, revision, cellId };
}
function checkHistory(value: unknown): PreparationHistoryEvent {
  const v = object(value);
  return {
    entryId: identifier(v.entryId), at: timestamp(v.at),
    operation: oneOf(v.operation, ["add", "answer", "reopen", "skip", "uncertain", "delete"] as const, "operation"),
    revision: bounded(v.revision as number, 1, PREPARATION_MAX_EVENTS, "revision"),
  };
}
/** Validate imported structure without interpreting notes as factual evidence. */
export function validatePreparationNotebook(value: unknown, expectedRegion?: string): PreparationNotebook {
  const v = object(value);
  if (v.format !== "offline-access-preparation-v1") throw new TypeError("Unsupported notebook format");
  const regionId = identifier(v.regionId);
  if (expectedRegion !== undefined && regionId !== expectedRegion) throw new TypeError("Different region");
  const createdAt = timestamp(v.createdAt);
  if (!Array.isArray(v.entries) || v.entries.length > PREPARATION_MAX_ENTRIES) throw new RangeError("Invalid entries");
  if (!Array.isArray(v.history) || v.history.length > PREPARATION_MAX_EVENTS) throw new RangeError("Invalid history");
  const entries = v.entries.map(checkEntry);
  const history = v.history.map(checkHistory);
  if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new TypeError("Duplicate entry");
  const revisions = new Map<string, number>();
  const deleted = new Set<string>();
  let previousTime = createdAt;
  for (const event of history) {
    if (Date.parse(event.at) < Date.parse(previousTime)) throw new TypeError("Unordered events");
    previousTime = event.at;
    const expected = (revisions.get(event.entryId) ?? 0) + 1;
    if (event.revision !== expected || deleted.has(event.entryId)) throw new TypeError("Invalid revision history");
    if (expected === 1 && event.operation !== "add") throw new TypeError("Missing initial add");
    if (expected > 1 && event.operation === "add") throw new TypeError("Repeated add");
    revisions.set(event.entryId, event.revision);
    if (event.operation === "delete") deleted.add(event.entryId);
  }
  for (const entry of entries) {
    if (deleted.has(entry.id) || revisions.get(entry.id) !== entry.revision) {
      throw new TypeError("Entry/history mismatch");
    }
    const events = history.filter((event) => event.entryId === entry.id);
    if (events[0]?.at !== entry.createdAt || events.at(-1)?.at !== entry.updatedAt) {
      throw new TypeError("Timestamp/history mismatch");
    }
  }
  for (const [id] of revisions) {
    if (!entries.some((entry) => entry.id === id) && !deleted.has(id)) {
      throw new TypeError("Orphaned history");
    }
  }
  return { format: "offline-access-preparation-v1", regionId, createdAt, entries, history };
}

export function newPreparationNotebook(regionId: string, at: string): PreparationNotebook {
  return { format: "offline-access-preparation-v1", regionId: identifier(regionId),
    createdAt: timestamp(at), entries: [], history: [] };
}

function nextNotebook(
  notebook: PreparationNotebook,
  entries: readonly PreparationEntry[],
  event: PreparationHistoryEvent,
): PreparationNotebook {
  if (notebook.history.length >= PREPARATION_MAX_EVENTS) throw new RangeError("History is full");
  const prior = notebook.history.at(-1)?.at ?? notebook.createdAt;
  if (Date.parse(event.at) < Date.parse(prior)) throw new TypeError("Event predates history");
  return validatePreparationNotebook({ ...notebook, entries, history: [...notebook.history, event] });
}

export function addPreparationEntry(
  notebook: PreparationNotebook,
  entry: { id: string; topic: PreparationTopic; question: string; cellId?: string | null },
  at: string,
): PreparationNotebook {
  if (notebook.entries.length >= PREPARATION_MAX_ENTRIES) throw new RangeError("Notebook is full");
  if (notebook.history.some((event) => event.entryId === entry.id)) throw new TypeError("Identifier already used");
  const created: PreparationEntry = checkEntry({ id: entry.id, topic: entry.topic, question: entry.question,
    status: "UNKNOWN", evidence: "UNKNOWN", answer: "", sourceName: "", sourceDate: "",
    createdAt: at, updatedAt: at, revision: 1, cellId: entry.cellId ?? null });
  return nextNotebook(notebook, [...notebook.entries, created],
    { entryId: created.id, at, operation: "add", revision: 1 });
}
export function updatePreparationEntry(
  notebook: PreparationNotebook, id: string, change: PreparationChange, at: string,
): PreparationNotebook {
  const current = notebook.entries.find((entry) => entry.id === id);
  if (!current) throw new TypeError("Entry not found");
  const status = change.status ?? current.status;
  const operation: PreparationHistoryEvent["operation"] = status === "answered" ? "answer" :
    status === "open" ? "reopen" : status === "not-needed" ? "skip" : "uncertain";
  const updated: PreparationEntry = checkEntry({ ...current, ...change,
    status, updatedAt: at, revision: current.revision + 1 });
  return nextNotebook(notebook, notebook.entries.map((entry) => entry.id === id ? updated : entry),
    { entryId: id, at, operation, revision: updated.revision });
}
export function removePreparationEntry(notebook: PreparationNotebook, id: string, at: string): PreparationNotebook {
  const current = notebook.entries.find((entry) => entry.id === id);
  if (!current) throw new TypeError("Entry not found");
  return nextNotebook(notebook, notebook.entries.filter((entry) => entry.id !== id),
    { entryId: id, at, operation: "delete", revision: current.revision + 1 });
}

export function preparationTotals(notebook: PreparationNotebook): PreparationTotals {
  const entries = notebook.entries;
  return {
    total: entries.length,
    open: entries.filter((e) => e.status === "open").length,
    answered: entries.filter((e) => e.status === "answered").length,
    UNKNOWN: entries.filter((e) => e.status === "UNKNOWN").length,
    notNeeded: entries.filter((e) => e.status === "not-needed").length,
    withSourceNote: entries.filter((e) => e.evidence === "source-note").length,
    linkedToCell: entries.filter((e) => e.cellId !== null).length,
  };
}
export function pagePreparationEntries(notebook: PreparationNotebook, query: PreparationQuery): PreparationPage {
  bounded(query.offset, 0, Number.MAX_SAFE_INTEGER, "offset");
  bounded(query.limit, 1, PREPARATION_PAGE_MAX, "limit");
  oneOf(query.filter, PREPARATION_FILTERS, "filter");
  oneOf(query.sort, PREPARATION_SORTS, "sort");
  if (query.topic !== "all") oneOf(query.topic, PREPARATION_TOPICS, "topic");
  const search = text(query.search, "search", 160, true).trim().toLocaleLowerCase();
  const rows = notebook.entries.filter((entry) =>
    (query.filter === "all" || entry.status === query.filter) &&
    (query.topic === "all" || entry.topic === query.topic) &&
    [entry.question, entry.answer, entry.sourceName, entry.id].some((value) => value.toLocaleLowerCase().includes(search)),
  );
  if (query.sort === "updated") rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  if (query.sort === "topic") rows.sort((a, b) => a.topic.localeCompare(b.topic) || a.id.localeCompare(b.id));
  if (query.sort === "status") rows.sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id));
  return { rows: rows.slice(query.offset, query.offset + query.limit), total: rows.length,
    previous: query.offset > 0, next: query.offset + query.limit < rows.length };
}

/** Local byte availability is not evidence of physical accessibility. */
export function assessPreparationCopies(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  notebook: PreparationNotebook,
): CopyAssessment {
  const listed = new Map(manifest.cells.map((cell) => [cell.id, cell]));
  const matching = inventory !== null && inventory.regionId === manifest.regionId &&
    notebook.regionId === manifest.regionId && inventory.cells.length === manifest.cells.length &&
    new Set(manifest.cells.map((cell) => cell.id)).size === manifest.cells.length &&
    new Set(inventory.cells.map((cell) => cell.id)).size === inventory.cells.length;
  const observations = matching ? new Map(inventory.cells.map((cell) => [cell.id, cell])) : null;
  let savedCells = 0;
  const observed = manifest.cells.map((cell) => {
    const recorded = observations?.get(cell.id);
    const saved = recorded?.state === "saved" && recorded.cause === "present" &&
      recorded.expectedBytes === cell.bytes && recorded.provenance.source === cell.provenance.source &&
      recorded.provenance.licence === cell.provenance.licence && recorded.provenance.date === cell.provenance.date;
    if (saved) savedCells++;
    return { id: cell.id, status: saved ? "saved" as const : "UNKNOWN" as const };
  });
  const statusMap = new Map(observed.map((item) => [item.id, item.status]));
  return { regionId: manifest.regionId, totalCells: manifest.cells.length, savedCells,
    unknownCells: manifest.cells.length - savedCells,
    status: matching && manifest.cells.length > 0 && savedCells === manifest.cells.length ? "saved" : "UNKNOWN",
    linked: notebook.entries.filter((e) => e.cellId !== null).map((entry) => ({
      id: entry.id, status: entry.cellId !== null && listed.has(entry.cellId) ?
        statusMap.get(entry.cellId) ?? "UNKNOWN" : "UNKNOWN",
    })),
  };
}

export function serializePreparationNotebook(notebook: PreparationNotebook): string {
  const safe = validatePreparationNotebook(notebook);
  const value = JSON.stringify(safe, null, 2);
  if (new TextEncoder().encode(value).length > PREPARATION_MAX_JSON_BYTES) throw new RangeError("Export is too large");
  return value;
}
export function parsePreparationNotebook(content: string, regionId: string): PreparationNotebook {
  if (new TextEncoder().encode(content).length > PREPARATION_MAX_JSON_BYTES) throw new RangeError("Import is too large");
  return validatePreparationNotebook(JSON.parse(content) as unknown, regionId);
}
