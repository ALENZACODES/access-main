import type { RegionManifest, Provenance } from "./regionDownload";
import type { RegionInventory, InventoryCause } from "./regionInventory";

/** All entries are device-local historical metadata, never assessments of a location. */
export type TimelineState = "saved" | "UNKNOWN";
export type TimelineCause = InventoryCause | "UNKNOWN" | "source-change" | "not-listed";
export type TimelineChange = "unchanged" | "lost" | "gained" | "changed" | "UNKNOWN";
export type TimelineFilter = "all" | "changed" | "lost" | "gained" | "UNKNOWN";
export type TimelineOrder = "listed" | "recent" | "source" | "size";
export type TimelineNoteStatus = "open" | "reviewing" | "closed";
export const TIMELINE_MAX_CELLS = 2048;
export const TIMELINE_MAX_CAPTURES = 12;
export const TIMELINE_MAX_NOTES = 240;
export const TIMELINE_MAX_NOTE_LENGTH = 1000;
export const TIMELINE_MAX_BYTES = 524288;
export const TIMELINE_PAGE_SIZE = 20;
export interface TimelineSource extends Provenance { readonly bytes: number; }
export interface TimelineCell { readonly id: string; readonly source: TimelineSource; readonly state: TimelineState; readonly cause: TimelineCause; }
export interface TimelineCapture { readonly capturedAt: string; readonly regionId: string; readonly cells: readonly TimelineCell[]; readonly status: "recorded" | "UNKNOWN"; }
export interface TimelineNote { readonly id: string; readonly cellId: string; readonly at: string; readonly text: string; readonly status: TimelineNoteStatus; }
export interface TimelineBook { readonly schema: "offline-evidence-timeline-v1"; readonly regionId: string; readonly captures: readonly TimelineCapture[]; readonly notes: readonly TimelineNote[]; }
export interface TimelineRow { readonly cellId: string; readonly before: TimelineCell | null; readonly after: TimelineCell | null; readonly change: TimelineChange; readonly noteCount: number; readonly sourceChanged: boolean; }
export interface TimelineComparison { readonly regionId: string; readonly from: string; readonly to: string; readonly status: "recorded" | "UNKNOWN"; readonly rows: readonly TimelineRow[]; readonly counts: Readonly<Record<TimelineChange, number>>; }
export interface TimelineQuery { readonly search: string; readonly filter: TimelineFilter; readonly order: TimelineOrder; readonly offset: number; readonly limit: number; }
export interface TimelinePage { readonly rows: readonly TimelineRow[]; readonly total: number; readonly previous: boolean; readonly next: boolean; }
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const CAUSES: readonly TimelineCause[] = ["present", "missing", "stale", "unreadable", "UNKNOWN", "source-change", "not-listed"];
const STATES: readonly TimelineState[] = ["saved", "UNKNOWN"];
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function safeString(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}
function validDay(value: unknown): value is string {
  return typeof value === "string" && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function validTime(value: unknown): value is string {
  return typeof value === "string" && ISO.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}
function validSource(source: unknown): source is TimelineSource {
  return object(source) && safeString(source.source, 160) && safeString(source.licence, 160) &&
    validDay(source.date) && typeof source.bytes === "number" && Number.isSafeInteger(source.bytes) && source.bytes >= 0;
}
function checkedManifest(manifest: RegionManifest): void {
  if (!safeString(manifest.regionId, 160) || manifest.cells.length > TIMELINE_MAX_CELLS) throw new TypeError("Invalid region");
  const ids = new Set<string>();
  for (const cell of manifest.cells) {
    if (!safeString(cell.id, 160) || ids.has(cell.id) || !validSource({ ...cell.provenance, bytes: cell.bytes })) throw new TypeError("Invalid manifest cell");
    ids.add(cell.id);
  }
}
function sourceOf(cell: RegionManifest["cells"][number]): TimelineSource {
  return { source: cell.provenance.source, licence: cell.provenance.licence, date: cell.provenance.date, bytes: cell.bytes };
}
function sameSource(a: TimelineSource, b: TimelineSource): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date && a.bytes === b.bytes;
}
function matchInventory(manifest: RegionManifest, inventory: RegionInventory | null): Map<string, RegionInventory["cells"][number]> | null {
  if (inventory === null || inventory.regionId !== manifest.regionId || inventory.cells.length !== manifest.cells.length) return null;
  const cells = new Map<string, RegionInventory["cells"][number]>();
  for (const item of inventory.cells) {
    if (cells.has(item.id) || !manifest.cells.some((cell) => cell.id === item.id)) return null;
    cells.set(item.id, item);
  }
  return cells;
}
export function captureTimeline(manifest: RegionManifest, inventory: RegionInventory | null, capturedAt: string): TimelineCapture {
  checkedManifest(manifest);
  if (!validTime(capturedAt)) throw new TypeError("Invalid time");
  const lookup = matchInventory(manifest, inventory);
  const cells: TimelineCell[] = manifest.cells.map((cell) => {
    const saved = lookup?.get(cell.id);
    const source = sourceOf(cell);
    const aligned = saved !== undefined && saved.expectedBytes === source.bytes &&
      saved.provenance.source === source.source && saved.provenance.licence === source.licence && saved.provenance.date === source.date;
    if (!aligned || saved === undefined) return { id: cell.id, source, state: "UNKNOWN", cause: "UNKNOWN" };
    if (saved.cause === "present" && saved.state === "saved") return { id: cell.id, source, state: "saved", cause: "present" };
    return { id: cell.id, source, state: "UNKNOWN", cause: saved.cause === "present" ? "UNKNOWN" : saved.cause };
  });
  return { regionId: manifest.regionId, capturedAt, cells, status: cells.some((cell) => cell.cause === "UNKNOWN") ? "UNKNOWN" : "recorded" };
}
export function validateTimelineCapture(input: unknown): TimelineCapture {
  if (!object(input) || !safeString(input.regionId, 160) || !validTime(input.capturedAt) || !Array.isArray(input.cells) ||
    input.cells.length > TIMELINE_MAX_CELLS || !["recorded", "UNKNOWN"].includes(String(input.status))) throw new TypeError("Invalid capture");
  const ids = new Set<string>();
  const cells: TimelineCell[] = input.cells.map((raw: unknown): TimelineCell => {
    if (!object(raw) || !safeString(raw.id, 160) || ids.has(raw.id) || !validSource(raw.source) ||
      !STATES.includes(raw.state as TimelineState) || !CAUSES.includes(raw.cause as TimelineCause)) throw new TypeError("Invalid timeline cell");
    ids.add(raw.id);
    if ((raw.state === "saved") !== (raw.cause === "present")) throw new TypeError("Contradictory cell");
    return { id: raw.id, source: { ...raw.source }, state: raw.state as TimelineState, cause: raw.cause as TimelineCause };
  });
  if (input.status === "recorded" && cells.some((cell) => cell.cause === "UNKNOWN")) throw new TypeError("Contradictory capture");
  return { regionId: input.regionId, capturedAt: input.capturedAt, cells, status: input.status as "recorded" | "UNKNOWN" };
}
export function newTimeline(capture: TimelineCapture): TimelineBook {
  const first = validateTimelineCapture(capture);
  return { schema: "offline-evidence-timeline-v1", regionId: first.regionId, captures: [first], notes: [] };
}
export function appendTimeline(book: TimelineBook, capture: TimelineCapture): TimelineBook {
  const next = validateTimelineCapture(capture);
  if (book.captures.length >= TIMELINE_MAX_CAPTURES) throw new RangeError("Too many captures");
  if (next.regionId !== book.regionId) throw new TypeError("Different region");
  const previous = book.captures.at(-1);
  if (previous !== undefined && Date.parse(next.capturedAt) <= Date.parse(previous.capturedAt)) throw new RangeError("Non-increasing times");
  return { ...book, captures: [...book.captures, next] };
}
export function compareTimeline(first: TimelineCapture, second: TimelineCapture, notes: readonly TimelineNote[] = []): TimelineComparison {
  const a = validateTimelineCapture(first);
  const b = validateTimelineCapture(second);
  if (a.regionId !== b.regionId || Date.parse(a.capturedAt) > Date.parse(b.capturedAt)) throw new RangeError("Incompatible captures");
  const one = new Map(a.cells.map((cell) => [cell.id, cell]));
  const two = new Map(b.cells.map((cell) => [cell.id, cell]));
  const ids = [...new Set([...one.keys(), ...two.keys()])];
  const counts: Record<TimelineChange, number> = { unchanged: 0, lost: 0, gained: 0, changed: 0, UNKNOWN: 0 };
  const rows: TimelineRow[] = ids.map((id) => {
    const before = one.get(id) ?? null;
    const after = two.get(id) ?? null;
    const sourceChanged = before !== null && after !== null && !sameSource(before.source, after.source);
    let change: TimelineChange = "UNKNOWN";
    if (before !== null && after !== null && !sourceChanged) {
      if (before.state === "saved" && after.state === "saved") change = "unchanged";
      else if (before.state === "saved" && after.cause === "missing") change = "lost";
      else if (before.cause === "missing" && after.state === "saved") change = "gained";
      else if (before.cause !== "UNKNOWN" && after.cause !== "UNKNOWN") change = before.cause === after.cause ? "unchanged" : "changed";
    }
    counts[change]++;
    return { cellId: id, before, after, change, sourceChanged, noteCount: notes.filter((note) => note.cellId === id).length };
  });
  return { regionId: a.regionId, from: a.capturedAt, to: b.capturedAt, rows, counts,
    status: a.status === "UNKNOWN" || b.status === "UNKNOWN" || counts.UNKNOWN > 0 ? "UNKNOWN" : "recorded" };
}
export function pageTimeline(comparison: TimelineComparison, query: TimelineQuery): TimelinePage {
  if (!Number.isSafeInteger(query.offset) || query.offset < 0 || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > TIMELINE_PAGE_SIZE ||
    !["all", "changed", "lost", "gained", "UNKNOWN"].includes(query.filter) ||
    !["listed", "recent", "source", "size"].includes(query.order)) throw new TypeError("Invalid page query");
  const term = query.search.trim().toLocaleLowerCase();
  const rows = comparison.rows.filter((row) => {
    if (query.filter !== "all" && (query.filter === "changed" ? row.change === "unchanged" : row.change !== query.filter)) return false;
    return row.cellId.toLocaleLowerCase().includes(term) || (row.after?.source.source ?? row.before?.source.source ?? "").toLocaleLowerCase().includes(term);
  });
  if (query.order === "source") rows.sort((a, b) => (a.after?.source.source ?? "").localeCompare(b.after?.source.source ?? "") || a.cellId.localeCompare(b.cellId));
  if (query.order === "size") rows.sort((a, b) => (b.after?.source.bytes ?? b.before?.source.bytes ?? 0) - (a.after?.source.bytes ?? a.before?.source.bytes ?? 0) || a.cellId.localeCompare(b.cellId));
  if (query.order === "recent") rows.reverse();
  return { rows: rows.slice(query.offset, query.offset + query.limit), total: rows.length, previous: query.offset > 0, next: query.offset + query.limit < rows.length };
}
export function appendTimelineNote(book: TimelineBook, note: TimelineNote): TimelineBook {
  if (book.notes.length >= TIMELINE_MAX_NOTES || !safeString(note.id, 160) || !safeString(note.cellId, 160) ||
    !safeString(note.text, TIMELINE_MAX_NOTE_LENGTH) || !validTime(note.at) ||
    !["open", "reviewing", "closed"].includes(note.status)) throw new TypeError("Invalid note");
  if (book.notes.some((item) => item.id === note.id)) throw new TypeError("Duplicate note");
  if (!book.captures.some((capture) => capture.cells.some((cell) => cell.id === note.cellId))) throw new TypeError("Unlisted cell");
  if (Date.parse(note.at) < Date.parse(book.captures[0]?.capturedAt ?? "")) throw new TypeError("Note predates capture");
  return { ...book, notes: [...book.notes, { ...note }] };
}
export function updateTimelineNote(book: TimelineBook, id: string, status: TimelineNoteStatus): TimelineBook {
  if (!["open", "reviewing", "closed"].includes(status) || !book.notes.some((note) => note.id === id)) throw new TypeError("Unknown note");
  return { ...book, notes: book.notes.map((note) => note.id === id ? { ...note, status } : note) };
}
export function parseTimelineBook(text: string, regionId: string): TimelineBook {
  if (new TextEncoder().encode(text).length > TIMELINE_MAX_BYTES) throw new RangeError("Import too large");
  const raw: unknown = JSON.parse(text);
  if (!object(raw) || raw.schema !== "offline-evidence-timeline-v1" || raw.regionId !== regionId ||
    !Array.isArray(raw.captures) || raw.captures.length < 1 || raw.captures.length > TIMELINE_MAX_CAPTURES ||
    !Array.isArray(raw.notes) || raw.notes.length > TIMELINE_MAX_NOTES) throw new TypeError("Invalid timeline book");
  const first = validateTimelineCapture(raw.captures[0]);
  let book = newTimeline(first);
  for (const cap of raw.captures.slice(1)) book = appendTimeline(book, validateTimelineCapture(cap));
  for (const note of raw.notes) {
    if (!object(note)) throw new TypeError("Invalid imported note");
    book = appendTimelineNote(book, note as unknown as TimelineNote);
  }
  if (book.regionId !== regionId) throw new TypeError("Different region");
  return book;
}
export function serializeTimelineBook(book: TimelineBook): string {
  const result = JSON.stringify(parseTimelineBook(JSON.stringify(book), book.regionId), null, 2);
  if (new TextEncoder().encode(result).length > TIMELINE_MAX_BYTES) throw new RangeError("Export too large");
  return result;
}
export function compareLatestTimeline(book: TimelineBook): TimelineComparison | null {
  const next = book.captures.at(-1);
  const previous = book.captures.at(-2);
  return previous === undefined || next === undefined ? null : compareTimeline(previous, next, book.notes);
}
