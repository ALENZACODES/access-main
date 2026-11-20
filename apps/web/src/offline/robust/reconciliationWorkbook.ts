import type { RegionManifest, Provenance } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

/** Explicitly captured metadata; an older workbook is never a current device reading. */
export type WorkbookState = "saved" | "UNKNOWN";
export type WorkbookCause = "present" | "missing" | "stale" | "unreadable" | "UNKNOWN";
export type WorkbookChange = "unchanged" | "lost" | "gained" | "changed" | "UNKNOWN";
export type WorkbookDisposition = "open" | "reviewing" | "closed";
export type WorkbookKind = "observation" | "follow-up" | "question";
export type WorkbookFilter = "all" | "attention" | "saved" | "UNKNOWN" | "lost" | "gained";
export type WorkbookSort = "listed" | "id" | "bytes" | "change";
export const WORKBOOK_MAX_CELLS = 2048;
export const WORKBOOK_MAX_NOTES = 256;
export const WORKBOOK_MAX_NOTE_CHARS = 1200;
export const WORKBOOK_MAX_JSON_BYTES = 524288;
export const WORKBOOK_PAGE_MAX = 50;

export interface WorkbookSource extends Provenance { readonly bytes: number }
export interface WorkbookCell {
  readonly id: string;
  readonly state: WorkbookState;
  readonly cause: WorkbookCause;
  readonly source: WorkbookSource;
}
export interface WorkbookCapture {
  readonly format: "offline-reconciliation-capture-v1";
  readonly regionId: string;
  readonly capturedAt: string;
  readonly status: "recorded" | "UNKNOWN";
  readonly cells: readonly WorkbookCell[];
}
export interface WorkbookRow {
  readonly id: string;
  readonly before: WorkbookCell | null;
  readonly after: WorkbookCell | null;
  readonly change: WorkbookChange;
  readonly action: "none" | "inspect" | "consider-download";
  readonly sourceChanged: boolean;
}
export interface WorkbookComparison {
  readonly regionId: string;
  readonly beforeAt: string;
  readonly afterAt: string;
  readonly status: "recorded" | "UNKNOWN";
  readonly rows: readonly WorkbookRow[];
  readonly counts: Readonly<Record<WorkbookChange, number>>;
}
export interface WorkbookNote {
  readonly id: string;
  readonly cellId: string;
  readonly kind: WorkbookKind;
  readonly disposition: WorkbookDisposition;
  readonly text: string;
  readonly at: string;
}
export interface Workbook {
  readonly format: "offline-reconciliation-workbook-v1";
  readonly regionId: string;
  readonly startedAt: string;
  readonly before: WorkbookCapture;
  readonly after: WorkbookCapture | null;
  readonly notes: readonly WorkbookNote[];
}
export interface WorkbookQuery {
  readonly search: string;
  readonly filter: WorkbookFilter;
  readonly sort: WorkbookSort;
  readonly offset: number;
  readonly limit: number;
}
export interface WorkbookPage {
  readonly rows: readonly WorkbookRow[];
  readonly total: number;
  readonly previous: boolean;
  readonly next: boolean;
}
export interface WorkbookSummary {
  readonly listed: number;
  readonly beforeSaved: number;
  readonly afterSaved: number | null;
  readonly changed: number | null;
  readonly unknown: number;
  readonly bytesBefore: number;
  readonly bytesAfter: number | null;
  readonly openNotes: number;
  readonly reviewingNotes: number;
  readonly closedNotes: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const CALENDAR = /^\d{4}-\d{2}-\d{2}$/u;
const CAUSES: readonly WorkbookCause[] = ["present", "missing", "stale", "unreadable", "UNKNOWN"];
const FILTERS: readonly WorkbookFilter[] = ["all", "attention", "saved", "UNKNOWN", "lost", "gained"];
const SORTS: readonly WorkbookSort[] = ["listed", "id", "bytes", "change"];
const KINDS: readonly WorkbookKind[] = ["observation", "follow-up", "question"];
const DISPOSITIONS: readonly WorkbookDisposition[] = ["open", "reviewing", "closed"];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function checkedText(value: unknown, maximum: number, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum ||
      [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new TypeError(`Invalid ${label}`);
  }
}
function checkedTimestamp(value: unknown): asserts value is string {
  if (typeof value !== "string" || !ISO.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== new Date(Date.parse(value)).toISOString()) {
    throw new TypeError("Invalid capture time");
  }
}
function checkedDate(value: unknown): asserts value is string {
  if (typeof value !== "string" || !CALENDAR.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new TypeError("Invalid source date");
  }
}
function checkedBytes(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2 ** 40) {
    throw new TypeError("Invalid byte count");
  }
}
function validateSource(value: unknown): WorkbookSource {
  if (!isObject(value)) throw new TypeError("Missing source");
  checkedText(value.source, 160, "source name");
  checkedText(value.licence, 160, "source licence");
  checkedDate(value.date);
  checkedBytes(value.bytes);
  return { source: value.source, licence: value.licence, date: value.date, bytes: value.bytes };
}
function sourcesEqual(a: WorkbookSource, b: WorkbookSource): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date && a.bytes === b.bytes;
}
function checkedManifest(manifest: RegionManifest): void {
  checkedText(manifest.regionId, 160, "region ID");
  if (manifest.cells.length > WORKBOOK_MAX_CELLS) throw new RangeError("Too many manifest cells");
  const seen = new Set<string>();
  for (const cell of manifest.cells) {
    checkedText(cell.id, 160, "cell ID");
    if (seen.has(cell.id)) throw new TypeError("Repeated manifest cell");
    seen.add(cell.id);
    validateSource({ ...cell.provenance, bytes: cell.bytes });
  }
}
function validateCell(value: unknown): WorkbookCell {
  if (!isObject(value)) throw new TypeError("Invalid cell");
  checkedText(value.id, 160, "cell ID");
  if (value.state !== "saved" && value.state !== "UNKNOWN") throw new TypeError("Invalid cell state");
  if (!CAUSES.includes(value.cause as WorkbookCause)) throw new TypeError("Invalid cell cause");
  if (value.state === "saved" && value.cause !== "present") throw new TypeError("Inconsistent saved cell");
  if (value.state === "UNKNOWN" && value.cause === "present") throw new TypeError("Inconsistent unknown cell");
  return { id: value.id, state: value.state, cause: value.cause as WorkbookCause,
    source: validateSource(value.source) };
}

/** Reads only the supplied, explicitly observed manifest and inventory. */
export function captureWorkbook(manifest: RegionManifest, inventory: RegionInventory | null,
  at: string): WorkbookCapture {
  checkedManifest(manifest);
  checkedTimestamp(at);
  const aligned = inventory !== null && inventory.regionId === manifest.regionId &&
    inventory.cells.length === manifest.cells.length &&
    new Set(inventory.cells.map((cell) => cell.id)).size === inventory.cells.length;
  const lookup = aligned && inventory !== null ? new Map(inventory.cells.map((cell) => [cell.id, cell])) : null;
  const cells: WorkbookCell[] = manifest.cells.map((cell) => {
    const source = { ...cell.provenance, bytes: cell.bytes };
    const recorded = lookup?.get(cell.id);
    const exact = recorded !== undefined && recorded.expectedBytes === cell.bytes &&
      recorded.provenance.source === source.source && recorded.provenance.licence === source.licence &&
      recorded.provenance.date === source.date &&
      ((recorded.state === "saved" && recorded.cause === "present") ||
       (recorded.state === "unknown" && recorded.cause !== "present"));
    const cause: WorkbookCause = exact && recorded !== undefined ? recorded.cause : "UNKNOWN";
    return { id: cell.id, source, cause, state: cause === "present" ? "saved" : "UNKNOWN" };
  });
  return { format: "offline-reconciliation-capture-v1", regionId: manifest.regionId,
    capturedAt: at, status: aligned && cells.every((cell) => cell.cause !== "UNKNOWN") ? "recorded" : "UNKNOWN", cells };
}

/** Parse against a strict schema before displaying imported history. */
export function validateWorkbookCapture(input: unknown): WorkbookCapture {
  if (!isObject(input) || input.format !== "offline-reconciliation-capture-v1") throw new TypeError("Invalid capture format");
  checkedText(input.regionId, 160, "region ID");
  checkedTimestamp(input.capturedAt);
  if (input.status !== "recorded" && input.status !== "UNKNOWN") throw new TypeError("Invalid capture status");
  if (!Array.isArray(input.cells) || input.cells.length > WORKBOOK_MAX_CELLS) throw new TypeError("Invalid capture cells");
  const cells = input.cells.map(validateCell);
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length) throw new TypeError("Repeated captured cell");
  if (input.status === "recorded" && cells.some((cell) => cell.cause === "UNKNOWN")) {
    throw new TypeError("Unknown evidence cannot be recorded as complete");
  }
  return { format: "offline-reconciliation-capture-v1", regionId: input.regionId,
    capturedAt: input.capturedAt, status: input.status, cells };
}

/** Two historical readings cannot establish the present state of a place. */
export function compareWorkbook(before: WorkbookCapture, after: WorkbookCapture): WorkbookComparison {
  const a = validateWorkbookCapture(before);
  const b = validateWorkbookCapture(after);
  if (a.regionId !== b.regionId) throw new TypeError("Different regions");
  if (Date.parse(a.capturedAt) > Date.parse(b.capturedAt)) throw new TypeError("Reversed captures");
  const older = new Map(a.cells.map((cell) => [cell.id, cell]));
  const newer = new Map(b.cells.map((cell) => [cell.id, cell]));
  const ids = [...new Set([...older.keys(), ...newer.keys()])];
  const counts: Record<WorkbookChange, number> = { unchanged: 0, lost: 0, gained: 0, changed: 0, UNKNOWN: 0 };
  const rows = ids.map((id): WorkbookRow => {
    const first = older.get(id) ?? null;
    const second = newer.get(id) ?? null;
    const sourceChanged = first !== null && second !== null && !sourcesEqual(first.source, second.source);
    let change: WorkbookChange = "UNKNOWN";
    if (first !== null && second !== null && !sourceChanged &&
        first.cause !== "UNKNOWN" && second.cause !== "UNKNOWN") {
      if (first.state === "saved" && second.cause === "missing") change = "lost";
      else if (first.cause === "missing" && second.state === "saved") change = "gained";
      else if (first.cause === second.cause) change = "unchanged";
      else change = "changed";
    }
    counts[change] += 1;
    const action: WorkbookRow["action"] = change === "unchanged" ? "none" :
      change === "lost" ? "consider-download" : "inspect";
    return { id, before: first, after: second, change, sourceChanged, action };
  });
  return { regionId: a.regionId, beforeAt: a.capturedAt, afterAt: b.capturedAt,
    status: a.status === "UNKNOWN" || b.status === "UNKNOWN" || counts.UNKNOWN > 0 ? "UNKNOWN" : "recorded",
    counts, rows };
}

export function startWorkbook(before: WorkbookCapture): Workbook {
  const checked = validateWorkbookCapture(before);
  return { format: "offline-reconciliation-workbook-v1", regionId: checked.regionId,
    startedAt: checked.capturedAt, before: checked, after: null, notes: [] };
}
export function updateWorkbook(workbook: Workbook, after: WorkbookCapture): Workbook {
  compareWorkbook(workbook.before, after);
  if (workbook.regionId !== after.regionId) throw new TypeError("Different region");
  return { ...workbook, after: validateWorkbookCapture(after) };
}
export function addWorkbookNote(workbook: Workbook, note: WorkbookNote): Workbook {
  if (workbook.notes.length >= WORKBOOK_MAX_NOTES) throw new RangeError("Too many notes");
  checkedText(note.id, 160, "note ID");
  checkedText(note.cellId, 160, "note cell");
  if (!workbook.before.cells.some((cell) => cell.id === note.cellId) &&
      !workbook.after?.cells.some((cell) => cell.id === note.cellId)) throw new TypeError("Unlisted note cell");
  if (workbook.notes.some((item) => item.id === note.id)) throw new TypeError("Duplicate note ID");
  checkedTimestamp(note.at);
  if (Date.parse(note.at) < Date.parse(workbook.startedAt)) throw new TypeError("Note before start");
  if (!KINDS.includes(note.kind) || !DISPOSITIONS.includes(note.disposition)) throw new TypeError("Invalid note classification");
  checkedText(note.text, WORKBOOK_MAX_NOTE_CHARS, "note text");
  return { ...workbook, notes: [...workbook.notes, { ...note }] };
}
export function changeWorkbookNote(workbook: Workbook, id: string, disposition: WorkbookDisposition): Workbook {
  if (!DISPOSITIONS.includes(disposition)) throw new TypeError("Invalid note disposition");
  if (!workbook.notes.some((note) => note.id === id)) throw new TypeError("Missing note");
  return { ...workbook, notes: workbook.notes.map((note) => note.id === id ? { ...note, disposition } : note) };
}
export function removeWorkbookNote(workbook: Workbook, id: string): Workbook {
  if (!workbook.notes.some((note) => note.id === id)) throw new TypeError("Missing note");
  return { ...workbook, notes: workbook.notes.filter((note) => note.id !== id) };
}
export function resetWorkbookComparison(workbook: Workbook): Workbook {
  return { ...workbook, after: null };
}
export function pageWorkbook(comparison: WorkbookComparison, query: WorkbookQuery): WorkbookPage {
  if (!Number.isSafeInteger(query.offset) || query.offset < 0 ||
      !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > WORKBOOK_PAGE_MAX) {
    throw new RangeError("Invalid workbook page");
  }
  if (!FILTERS.includes(query.filter) || !SORTS.includes(query.sort)) throw new TypeError("Invalid workbook query");
  const search = query.search.trim().toLocaleLowerCase();
  if (search.length > 160) throw new RangeError("Search too long");
  const rows = comparison.rows.filter((row) => {
    const match = row.id.toLocaleLowerCase().includes(search) ||
      (row.after?.source.source ?? row.before?.source.source ?? "").toLocaleLowerCase().includes(search) ||
      (row.after?.source.licence ?? row.before?.source.licence ?? "").toLocaleLowerCase().includes(search);
    if (!match) return false;
    if (query.filter === "attention") return row.change !== "unchanged";
    if (query.filter === "saved") return row.after?.state === "saved";
    if (query.filter === "UNKNOWN") return row.change === "UNKNOWN";
    if (query.filter === "lost") return row.change === "lost";
    if (query.filter === "gained") return row.change === "gained";
    return true;
  });
  if (query.sort === "id") rows.sort((a, b) => a.id.localeCompare(b.id));
  if (query.sort === "change") rows.sort((a, b) => a.change.localeCompare(b.change) || a.id.localeCompare(b.id));
  if (query.sort === "bytes") rows.sort((a, b) =>
    (b.after?.source.bytes ?? b.before?.source.bytes ?? 0) -
    (a.after?.source.bytes ?? a.before?.source.bytes ?? 0) || a.id.localeCompare(b.id));
  return { rows: rows.slice(query.offset, query.offset + query.limit), total: rows.length,
    previous: query.offset > 0, next: query.offset + query.limit < rows.length };
}
export function workbookSummary(workbook: Workbook): WorkbookSummary {
  const comparison = workbook.after === null ? null : compareWorkbook(workbook.before, workbook.after);
  return { listed: workbook.before.cells.length,
    beforeSaved: workbook.before.cells.filter((cell) => cell.state === "saved").length,
    afterSaved: workbook.after === null ? null : workbook.after.cells.filter((cell) => cell.state === "saved").length,
    changed: comparison === null ? null : comparison.rows.filter((row) => row.change !== "unchanged").length,
    unknown: comparison?.counts.UNKNOWN ?? workbook.before.cells.filter((cell) => cell.state === "UNKNOWN").length,
    bytesBefore: workbook.before.cells.filter((cell) => cell.state === "saved").reduce((sum, cell) => sum + cell.source.bytes, 0),
    bytesAfter: workbook.after === null ? null : workbook.after.cells.filter((cell) => cell.state === "saved")
      .reduce((sum, cell) => sum + cell.source.bytes, 0),
    openNotes: workbook.notes.filter((note) => note.disposition === "open").length,
    reviewingNotes: workbook.notes.filter((note) => note.disposition === "reviewing").length,
    closedNotes: workbook.notes.filter((note) => note.disposition === "closed").length };
}

export function parseWorkbook(source: string, regionId: string): Workbook {
  if (new TextEncoder().encode(source).length > WORKBOOK_MAX_JSON_BYTES) throw new RangeError("Workbook exceeds limit");
  const raw: unknown = JSON.parse(source);
  if (!isObject(raw) || raw.format !== "offline-reconciliation-workbook-v1") throw new TypeError("Invalid workbook format");
  checkedText(raw.regionId, 160, "region ID");
  if (raw.regionId !== regionId) throw new TypeError("Wrong region");
  checkedTimestamp(raw.startedAt);
  const before = validateWorkbookCapture(raw.before);
  const after = raw.after === null ? null : validateWorkbookCapture(raw.after);
  if (before.capturedAt !== raw.startedAt || before.regionId !== regionId ||
      (after !== null && after.regionId !== regionId)) throw new TypeError("Inconsistent workbook");
  if (after !== null) compareWorkbook(before, after);
  if (!Array.isArray(raw.notes) || raw.notes.length > WORKBOOK_MAX_NOTES) throw new TypeError("Invalid notes");
  let workbook: Workbook = { format: "offline-reconciliation-workbook-v1", regionId,
    startedAt: raw.startedAt, before, after, notes: [] };
  for (const entry of raw.notes) {
    if (!isObject(entry)) throw new TypeError("Invalid imported note");
    workbook = addWorkbookNote(workbook, entry as unknown as WorkbookNote);
  }
  return workbook;
}
export function stringifyWorkbook(workbook: Workbook): string {
  const validated = parseWorkbook(JSON.stringify(workbook), workbook.regionId);
  const output = JSON.stringify(validated, null, 2);
  if (new TextEncoder().encode(output).length > WORKBOOK_MAX_JSON_BYTES) throw new RangeError("Export too large");
  return output;
}
