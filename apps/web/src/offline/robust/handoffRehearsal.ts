import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

/** Historical observations are notes, not claims about the current device. */
export type HandoffState = "saved" | "UNKNOWN";
export type HandoffCause = "present" | "missing" | "stale" | "unreadable" | "UNKNOWN";
export type HandoffChange = "unchanged" | "lost" | "gained" | "changed" | "UNKNOWN";
export type HandoffFilter = "all" | "attention" | "lost" | "UNKNOWN";
export type HandoffOrder = "manifest" | "state" | "size";
export type HandoffNoteKind = "observation" | "action" | "question";
export type HandoffResolution = "open" | "reviewing" | "closed";
export const HANDOFF_MAX_CELLS = 2048;
export const HANDOFF_MAX_NOTES = 200;
export const HANDOFF_MAX_NOTE_CHARS = 1000;
export const HANDOFF_MAX_JSON_BYTES = 524288;
export const HANDOFF_PAGE_LIMIT = 20;

export interface HandoffSource {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly bytes: number;
}
export interface HandoffCell {
  readonly id: string;
  readonly source: HandoffSource;
  readonly state: HandoffState;
  readonly cause: HandoffCause;
}
export interface HandoffCapture {
  readonly format: "offline-handoff-capture-v1";
  readonly regionId: string;
  readonly capturedAt: string;
  readonly cells: readonly HandoffCell[];
  readonly status: "recorded" | "UNKNOWN";
}
export interface HandoffRow {
  readonly id: string;
  readonly before: HandoffCell | null;
  readonly after: HandoffCell | null;
  readonly change: HandoffChange;
  readonly issue: boolean;
}
export interface HandoffComparison {
  readonly regionId: string;
  readonly beforeAt: string;
  readonly afterAt: string;
  readonly rows: readonly HandoffRow[];
  readonly status: "recorded" | "UNKNOWN";
  readonly counts: Readonly<Record<HandoffChange, number>>;
}
export interface HandoffNote {
  readonly id: string;
  readonly cellId: string;
  readonly kind: HandoffNoteKind;
  readonly resolution: HandoffResolution;
  readonly text: string;
  readonly at: string;
}
export interface HandoffBook {
  readonly format: "offline-handoff-book-v1";
  readonly regionId: string;
  readonly startedAt: string;
  readonly before: HandoffCapture;
  readonly after: HandoffCapture | null;
  readonly notes: readonly HandoffNote[];
}
export interface HandoffQuery {
  readonly search: string;
  readonly filter: HandoffFilter;
  readonly order: HandoffOrder;
  readonly offset: number;
  readonly limit: number;
}
export interface HandoffPage {
  readonly rows: readonly HandoffRow[];
  readonly total: number;
  readonly previous: boolean;
  readonly next: boolean;
}

const SAFE_ID = /^.{1,160}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

function assertText(value: unknown, max: number, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || !SAFE_ID.test(value) || [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    throw new TypeError(`Invalid ${label}`);
  }
}
function assertTimestamp(value: unknown): asserts value is string {
  if (typeof value !== "string" || !ISO.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError("Invalid timestamp");
  }
}
function assertSource(source: HandoffSource): void {
  assertText(source.source, 160, "source");
  assertText(source.licence, 160, "licence");
  if (!DATE.test(source.date) || !Number.isFinite(Date.parse(`${source.date}T00:00:00Z`)) ||
      new Date(`${source.date}T00:00:00Z`).toISOString().slice(0, 10) !== source.date) {
    throw new TypeError("Invalid source date");
  }
  if (!Number.isSafeInteger(source.bytes) || source.bytes < 0 || source.bytes > HANDOFF_MAX_JSON_BYTES * 1024) {
    throw new TypeError("Invalid source byte count");
  }
}
function safeSource(cell: RegionManifest["cells"][number]): HandoffSource {
  return {
    source: cell.provenance.source,
    licence: cell.provenance.licence,
    date: cell.provenance.date,
    bytes: cell.bytes,
  };
}
function equalSource(a: HandoffSource, b: HandoffSource): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date && a.bytes === b.bytes;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function checkedManifest(manifest: RegionManifest): void {
  assertText(manifest.regionId, 160, "region");
  if (!Array.isArray(manifest.cells) || manifest.cells.length > HANDOFF_MAX_CELLS) {
    throw new RangeError("Too many cells");
  }
  const ids = new Set<string>();
  for (const cell of manifest.cells) {
    assertText(cell.id, 160, "cell");
    if (ids.has(cell.id)) throw new TypeError("Duplicate cell");
    ids.add(cell.id);
    assertSource(safeSource(cell));
  }
}

/** Capture only manifest metadata and the most recent explicit inventory observation. */
export function captureHandoff(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  at: string,
): HandoffCapture {
  checkedManifest(manifest);
  assertTimestamp(at);
  const aligned = inventory !== null && inventory.regionId === manifest.regionId &&
    Array.isArray(inventory.cells) && inventory.cells.length === manifest.cells.length &&
    new Set(inventory.cells.map((cell) => cell.id)).size === inventory.cells.length;
  const indexed = aligned ? new Map(inventory.cells.map((cell) => [cell.id, cell])) : null;
  const cells: HandoffCell[] = manifest.cells.map((cell) => {
    const observation = indexed?.get(cell.id);
    const source = safeSource(cell);
    const match = observation !== undefined && observation.expectedBytes === cell.bytes &&
      observation.provenance.source === source.source &&
      observation.provenance.licence === source.licence &&
      observation.provenance.date === source.date;
    const saved = match && observation.state === "saved" && observation.cause === "present";
    const cause: HandoffCause = !match ? "UNKNOWN" :
      observation.cause === "present" && !saved ? "UNKNOWN" : observation.cause;
    return { id: cell.id, source, state: saved ? "saved" : "UNKNOWN", cause };
  });
  return {
    format: "offline-handoff-capture-v1", regionId: manifest.regionId, capturedAt: at,
    cells, status: aligned && cells.every((cell) => cell.cause !== "UNKNOWN") ? "recorded" : "UNKNOWN",
  };
}

/** Imported captures are never proof that a file remains on the device. */
export function validateHandoffCapture(value: unknown): HandoffCapture {
  if (!isObject(value) || value.format !== "offline-handoff-capture-v1") throw new TypeError("Invalid capture format");
  assertText(value.regionId, 160, "region");
  assertTimestamp(value.capturedAt);
  if (!Array.isArray(value.cells) || value.cells.length > HANDOFF_MAX_CELLS) throw new TypeError("Invalid cells");
  if (value.status !== "recorded" && value.status !== "UNKNOWN") throw new TypeError("Invalid capture status");
  const seen = new Set<string>();
  const cells = value.cells.map((entry: unknown): HandoffCell => {
    if (!isObject(entry) || !isObject(entry.source)) throw new TypeError("Invalid cell");
    assertText(entry.id, 160, "cell ID");
    if (seen.has(entry.id)) throw new TypeError("Duplicate cell ID");
    seen.add(entry.id);
    const source = entry.source as unknown as HandoffSource;
    assertSource(source);
    if (entry.state !== "saved" && entry.state !== "UNKNOWN") throw new TypeError("Invalid state");
    if (!["present", "missing", "stale", "unreadable", "UNKNOWN"].includes(String(entry.cause))) {
      throw new TypeError("Invalid cause");
    }
    if (entry.state === "saved" && entry.cause !== "present") throw new TypeError("Inconsistent saved state");
    if (entry.state === "UNKNOWN" && entry.cause === "present") throw new TypeError("Inconsistent unknown state");
    return {
      id: entry.id, state: entry.state, cause: entry.cause as HandoffCause,
      source: { source: source.source, licence: source.licence, date: source.date, bytes: source.bytes },
    };
  });
  if (value.status === "recorded" && cells.some((cell) => cell.cause === "UNKNOWN")) {
    throw new TypeError("Inconsistent capture status");
  }
  return { format: "offline-handoff-capture-v1", regionId: value.regionId,
    capturedAt: value.capturedAt, status: value.status, cells };
}

/** Comparison does not infer accessibility, quality or suitability of a location. */
export function compareHandoff(before: HandoffCapture, after: HandoffCapture): HandoffComparison {
  const first = validateHandoffCapture(before);
  const second = validateHandoffCapture(after);
  if (first.regionId !== second.regionId) throw new TypeError("Different regions");
  if (Date.parse(second.capturedAt) < Date.parse(first.capturedAt)) throw new RangeError("Reversed observations");
  const firstMap = new Map(first.cells.map((cell) => [cell.id, cell]));
  const secondMap = new Map(second.cells.map((cell) => [cell.id, cell]));
  const ids = [...new Set([...firstMap.keys(), ...secondMap.keys()])];
  const counts: Record<HandoffChange, number> = { unchanged: 0, lost: 0, gained: 0, changed: 0, UNKNOWN: 0 };
  const rows: HandoffRow[] = ids.map((id) => {
    const a = firstMap.get(id) ?? null;
    const b = secondMap.get(id) ?? null;
    let change: HandoffChange = "UNKNOWN";
    if (a !== null && b !== null && equalSource(a.source, b.source)) {
      if (a.state === "saved" && b.state === "saved") change = "unchanged";
      else if (a.state === "saved" && b.cause === "missing") change = "lost";
      else if (a.cause === "missing" && b.state === "saved") change = "gained";
      else if (a.cause === b.cause && a.cause !== "UNKNOWN") change = "unchanged";
      else if (a.cause !== "UNKNOWN" && b.cause !== "UNKNOWN") change = "changed";
    }
    counts[change]++;
    return { id, before: a, after: b, change, issue: change !== "unchanged" };
  });
  return {
    regionId: first.regionId, beforeAt: first.capturedAt, afterAt: second.capturedAt,
    rows, counts, status: counts.UNKNOWN > 0 || first.status === "UNKNOWN" || second.status === "UNKNOWN" ? "UNKNOWN" : "recorded",
  };
}

export function pageHandoff(comparison: HandoffComparison, query: HandoffQuery): HandoffPage {
  if (!Number.isSafeInteger(query.offset) || query.offset < 0 ||
      !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > HANDOFF_PAGE_LIMIT) {
    throw new RangeError("Invalid page");
  }
  if (!["all", "attention", "lost", "UNKNOWN"].includes(query.filter) ||
      !["manifest", "state", "size"].includes(query.order)) throw new TypeError("Invalid query");
  const search = query.search.trim().toLocaleLowerCase();
  const rows = comparison.rows.filter((row) => {
    const matches = row.id.toLocaleLowerCase().includes(search) ||
      (row.after?.source.source ?? row.before?.source.source ?? "").toLocaleLowerCase().includes(search);
    if (!matches) return false;
    if (query.filter === "attention") return row.issue;
    if (query.filter === "lost") return row.change === "lost";
    if (query.filter === "UNKNOWN") return row.change === "UNKNOWN";
    return true;
  });
  if (query.order === "state") rows.sort((a, b) => a.change.localeCompare(b.change) || a.id.localeCompare(b.id));
  if (query.order === "size") rows.sort((a, b) => (b.after?.source.bytes ?? b.before?.source.bytes ?? 0) -
    (a.after?.source.bytes ?? a.before?.source.bytes ?? 0) || a.id.localeCompare(b.id));
  return { rows: rows.slice(query.offset, query.offset + query.limit), total: rows.length,
    previous: query.offset > 0, next: query.offset + query.limit < rows.length };
}

export function startHandoff(before: HandoffCapture): HandoffBook {
  const capture = validateHandoffCapture(before);
  return { format: "offline-handoff-book-v1", regionId: capture.regionId, startedAt: capture.capturedAt,
    before: capture, after: null, notes: [] };
}
export function updateHandoff(book: HandoffBook, after: HandoffCapture): HandoffBook {
  const capture = validateHandoffCapture(after);
  if (capture.regionId !== book.regionId) throw new TypeError("Different region");
  compareHandoff(book.before, capture);
  return { ...book, after: capture };
}
export function appendHandoffNote(
  book: HandoffBook, note: HandoffNote,
): HandoffBook {
  if (book.notes.length >= HANDOFF_MAX_NOTES) throw new RangeError("Too many notes");
  assertText(note.id, 160, "note ID");
  assertText(note.cellId, 160, "cell ID");
  if (!book.before.cells.some((cell) => cell.id === note.cellId) &&
      !book.after?.cells.some((cell) => cell.id === note.cellId)) throw new TypeError("Unknown cell ID");
  if (book.notes.some((existing) => existing.id === note.id)) throw new TypeError("Duplicate note");
  assertTimestamp(note.at);
  if (Date.parse(note.at) < Date.parse(book.startedAt)) throw new TypeError("Note predates handoff");
  if (!["observation", "action", "question"].includes(note.kind) ||
      !["open", "reviewing", "closed"].includes(note.resolution)) throw new TypeError("Invalid note kind or status");
  if (!note.text.trim() || note.text.length > HANDOFF_MAX_NOTE_CHARS) throw new TypeError("Invalid note text");
  return { ...book, notes: [...book.notes, { ...note }] };
}
export function changeHandoffNote(book: HandoffBook, id: string, resolution: HandoffResolution): HandoffBook {
  if (!["open", "reviewing", "closed"].includes(resolution)) throw new TypeError("Invalid note status");
  if (!book.notes.some((note) => note.id === id)) throw new TypeError("Note not found");
  return { ...book, notes: book.notes.map((note) => note.id === id ? { ...note, resolution } : note) };
}

export function parseHandoffBook(text: string, expectedRegion: string): HandoffBook {
  if (new TextEncoder().encode(text).length > HANDOFF_MAX_JSON_BYTES) throw new RangeError("Import too large");
  const value: unknown = JSON.parse(text);
  if (!isObject(value) || value.format !== "offline-handoff-book-v1") throw new TypeError("Invalid handoff file");
  assertText(value.regionId, 160, "region ID");
  if (value.regionId !== expectedRegion) throw new TypeError("Wrong region");
  const before = validateHandoffCapture(value.before);
  const after = value.after === null ? null : validateHandoffCapture(value.after);
  assertTimestamp(value.startedAt);
  if (before.capturedAt !== value.startedAt || before.regionId !== value.regionId ||
      (after !== null && after.regionId !== value.regionId)) throw new TypeError("Inconsistent region or start time");
  if (after !== null) compareHandoff(before, after);
  if (!Array.isArray(value.notes) || value.notes.length > HANDOFF_MAX_NOTES) throw new TypeError("Invalid notes");
  let book: HandoffBook = { format: "offline-handoff-book-v1", regionId: value.regionId,
    startedAt: value.startedAt, before, after, notes: [] };
  for (const item of value.notes) {
    if (!isObject(item)) throw new TypeError("Invalid note");
    book = appendHandoffNote(book, item as unknown as HandoffNote);
  }
  return book;
}
export function serializeHandoffBook(book: HandoffBook): string {
  const clean = parseHandoffBook(JSON.stringify(book), book.regionId);
  const result = JSON.stringify(clean, null, 2);
  if (new TextEncoder().encode(result).length > HANDOFF_MAX_JSON_BYTES) throw new RangeError("Export too large");
  return result;
}
