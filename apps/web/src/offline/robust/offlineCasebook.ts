import type { Provenance, RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** Notes are an explicit user's device-local records, never accessibility facts. */
export type CaseStatus = "open" | "in-review" | "closed";
export type CaseReason =
  | "not-downloaded" | "out-of-date" | "unreadable" | "source-conflict"
  | "storage-limit" | "interrupted" | "other";
export type CaseEvidence = "matching" | "missing" | "stale" | "unreadable" | "UNKNOWN";
export type CaseAction = "opened" | "commented" | "status-changed" | "reconciled";
export type CaseFilter = "all" | "open" | "in-review" | "closed" | "attention" | "unknown";
export type CaseOrder = "newest" | "oldest" | "cell" | "status";

export interface CaseEvent {
  readonly sequence: number;
  readonly at: string;
  readonly action: CaseAction;
  readonly status: CaseStatus;
  readonly evidence: CaseEvidence;
  readonly note: string;
}

export interface OfflineCase {
  readonly id: string;
  readonly regionId: string;
  readonly cellId: string;
  readonly reason: CaseReason;
  readonly status: CaseStatus;
  readonly evidence: CaseEvidence;
  readonly sourceTier: "UNKNOWN";
  readonly source: Provenance;
  readonly expectedBytes: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly events: readonly CaseEvent[];
}

export interface Casebook {
  readonly schema: "offline-casebook-v1";
  readonly regionId: string;
  readonly cases: readonly OfflineCase[];
  readonly revision: number;
}

export interface CaseReview {
  readonly id: string;
  readonly cellId: string;
  readonly status: CaseStatus;
  readonly evidence: CaseEvidence;
  readonly reason: CaseReason;
  readonly sourceTier: "UNKNOWN";
  readonly nextStep: "none" | "inspect" | "retry-manually";
  readonly changedSinceOpening: boolean;
  readonly source: Provenance;
  readonly expectedBytes: number;
  readonly updatedAt: string;
  readonly noteCount: number;
}

export interface CasebookSummary {
  readonly total: number;
  readonly open: number;
  readonly inReview: number;
  readonly closed: number;
  readonly unknown: number;
  readonly needsInspection: number;
  readonly potentialRetry: number;
  readonly recordedBytes: number | null;
}

export interface CasebookPage {
  readonly rows: readonly CaseReview[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly previous: boolean;
  readonly next: boolean;
}

export interface CasebookQuery {
  readonly filter: CaseFilter;
  readonly order: CaseOrder;
  readonly search: string;
  readonly offset: number;
  readonly limit: number;
}

export interface ReconcileResult {
  readonly book: Casebook;
  readonly changed: readonly string[];
  readonly unchanged: readonly string[];
  readonly blocked: readonly string[];
}

export const CASEBOOK_MAX_CASES = 300;
export const CASEBOOK_MAX_EVENTS = 30;
export const CASEBOOK_MAX_NOTE_LENGTH = 500;
export const CASEBOOK_MAX_ID_LENGTH = 120;
export const CASEBOOK_MAX_BYTES = 512 * 1024;

const statuses: readonly CaseStatus[] = ["open", "in-review", "closed"];
const reasons: readonly CaseReason[] = [
  "not-downloaded", "out-of-date", "unreadable", "source-conflict",
  "storage-limit", "interrupted", "other",
];
const evidenceKinds: readonly CaseEvidence[] = ["matching", "missing", "stale", "unreadable", "UNKNOWN"];
const actions: readonly CaseAction[] = ["opened", "commented", "status-changed", "reconciled"];

function dateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const result = new Date(value);
  return !Number.isNaN(result.valueOf()) && result.toISOString().slice(0, 19) === value.slice(0, 19);
}

function dateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const result = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(result.valueOf()) && result.toISOString().slice(0, 10) === value;
}

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= CASEBOOK_MAX_ID_LENGTH &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) && !value.includes("..");
}

export function validCaseProvenance(value: Provenance): boolean {
  return value.source.trim().length > 0 && value.source.length <= 500 &&
    OPEN_LICENCES.some((licence) => licence === value.licence) && dateOnly(value.date) &&
    !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value.source);
}

function cleanNote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > CASEBOOK_MAX_NOTE_LENGTH ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(trimmed)) {
    throw new RangeError("Invalid note text");
  }
  return trimmed;
}

function assertManifest(manifest: RegionManifest): void {
  if (!safeId(manifest.regionId) || manifest.cells.length > 50_000) {
    throw new RangeError("Invalid casebook region");
  }
  const ids = new Set<string>();
  for (const cell of manifest.cells) {
    if (!safeId(cell.id) || ids.has(cell.id) || !validCaseProvenance(cell.provenance) ||
      !Number.isSafeInteger(cell.bytes) || cell.bytes < 0) {
      throw new RangeError("Invalid casebook listing");
    }
    ids.add(cell.id);
  }
}

function sourceEqual(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

/** A mismatch or an unreadable inventory never becomes a positive saved state. */
export function inspectCaseEvidence(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  cellId: string,
): CaseEvidence {
  assertManifest(manifest);
  const cell = manifest.cells.find((entry) => entry.id === cellId);
  if (!cell || !inventory || inventory.regionId !== manifest.regionId) return "UNKNOWN";
  if (inventory.cells.length !== manifest.cells.length ||
    new Set(inventory.cells.map((entry) => entry.id)).size !== inventory.cells.length) return "UNKNOWN";
  const observed = inventory.cells.find((entry) => entry.id === cellId);
  if (!observed || observed.expectedBytes !== cell.bytes ||
    !sourceEqual(observed.provenance, cell.provenance)) return "UNKNOWN";
  if (observed.cause === "unreadable") return "unreadable";
  if (observed.cause === "stale") return "stale";
  if (observed.cause === "missing") return "missing";
  return observed.cause === "present" && observed.state === "saved" ? "matching" : "UNKNOWN";
}

export function emptyCasebook(regionId: string): Casebook {
  if (!safeId(regionId)) throw new RangeError("Invalid casebook region");
  return { schema: "offline-casebook-v1", regionId, cases: [], revision: 0 };
}

export function casebookId(regionId: string, cellId: string, sequence: number): string {
  if (!safeId(regionId) || !safeId(cellId) || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError("Invalid casebook identifier");
  }
  // Index generated by this device, not a timestamp or user identifier.
  return `case-${sequence}`;
}

/** Creates a record only following a deliberate UI action; never by polling. */
export function openCase(
  book: Casebook,
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  cellId: string,
  reason: CaseReason,
  at: string,
  note = "",
): Casebook {
  validateCasebook(book);
  assertManifest(manifest);
  if (book.regionId !== manifest.regionId || !reasons.includes(reason) || !dateTime(at)) {
    throw new RangeError("Invalid casebook opening");
  }
  if (book.cases.length >= CASEBOOK_MAX_CASES) throw new RangeError("Casebook is full");
  const cell = manifest.cells.find((entry) => entry.id === cellId);
  if (!cell) throw new RangeError("Cell is not listed");
  const text = cleanNote(note);
  let sequence = book.revision + 1;
  while (book.cases.some((row) => row.id === `case-${sequence}`)) sequence += 1;
  if (!Number.isSafeInteger(sequence)) throw new RangeError("Case index exhausted");
  const event: CaseEvent = {
    sequence: 1, at, action: "opened", status: "open",
    evidence: inspectCaseEvidence(manifest, inventory, cellId), note: text,
  };
  const record: OfflineCase = {
    id: casebookId(book.regionId, cellId, sequence), regionId: book.regionId,
    cellId, reason, status: "open", evidence: event.evidence, sourceTier: "UNKNOWN",
    source: { ...cell.provenance }, expectedBytes: cell.bytes,
    createdAt: at, updatedAt: at, events: [event],
  };
  return { ...book, revision: sequence, cases: [...book.cases, record] };
}

function updateRecord(
  book: Casebook,
  id: string,
  at: string,
  action: CaseAction,
  nextStatus: CaseStatus,
  evidence: CaseEvidence,
  note: string,
): Casebook {
  validateCasebook(book);
  if (!dateTime(at) || !statuses.includes(nextStatus) || !evidenceKinds.includes(evidence)) {
    throw new RangeError("Invalid case event");
  }
  const text = cleanNote(note);
  const current = book.cases.find((row) => row.id === id);
  if (!current) throw new RangeError("Unknown case identifier");
  if (at < current.updatedAt || current.events.length >= CASEBOOK_MAX_EVENTS) {
    throw new RangeError("Invalid event order or limit");
  }
  if (action === "status-changed" && current.status === nextStatus) return book;
  if (action === "reconciled" && current.evidence === evidence) return book;
  const event: CaseEvent = {
    sequence: current.events.length + 1, at, action, status: nextStatus, evidence, note: text,
  };
  const cases = book.cases.map((row): OfflineCase => row.id === id ? {
    ...row, updatedAt: at, status: nextStatus, evidence,
    events: [...row.events, event],
  } : row);
  return { ...book, revision: book.revision + 1, cases };
}

export function addCaseNote(book: Casebook, id: string, at: string, note: string): Casebook {
  const record = book.cases.find((row) => row.id === id);
  if (!record) throw new RangeError("Unknown case identifier");
  if (!note.trim()) throw new RangeError("A note is required");
  return updateRecord(book, id, at, "commented", record.status, record.evidence, note);
}

export function changeCaseStatus(book: Casebook, id: string, at: string, status: CaseStatus): Casebook {
  const record = book.cases.find((row) => row.id === id);
  if (!record) throw new RangeError("Unknown case identifier");
  return updateRecord(book, id, at, "status-changed", status, record.evidence, "");
}

/** Explicit inventory check, never initiated by a timer or mutation of stored cells. */
export function reconcileCasebook(
  book: Casebook,
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  at: string,
): ReconcileResult {
  validateCasebook(book);
  assertManifest(manifest);
  if (book.regionId !== manifest.regionId || !dateTime(at)) throw new RangeError("Invalid reconciliation");
  let next = book;
  const changed: string[] = [];
  const unchanged: string[] = [];
  const blocked: string[] = [];
  for (const row of book.cases) {
    const listed = manifest.cells.find((cell) => cell.id === row.cellId);
    if (!listed || listed.bytes !== row.expectedBytes || !sourceEqual(listed.provenance, row.source)) {
      blocked.push(row.id);
      continue;
    }
    const evidence = inspectCaseEvidence(manifest, inventory, row.cellId);
    if (evidence === row.evidence) {
      unchanged.push(row.id);
      continue;
    }
    try {
      next = updateRecord(next, row.id, at, "reconciled", row.status, evidence, "");
      changed.push(row.id);
    } catch {
      blocked.push(row.id);
    }
  }
  return { book: next, changed, unchanged, blocked };
}

export function caseNextStep(row: OfflineCase): CaseReview["nextStep"] {
  if (row.status === "closed" || row.evidence === "matching") return "none";
  if ((row.evidence === "missing" || row.evidence === "stale") &&
    (row.reason === "not-downloaded" || row.reason === "out-of-date")) return "retry-manually";
  return "inspect";
}

export function casebookRows(book: Casebook): readonly CaseReview[] {
  validateCasebook(book);
  return book.cases.map((row) => ({
    id: row.id, cellId: row.cellId, status: row.status, evidence: row.evidence,
    reason: row.reason, sourceTier: row.sourceTier, nextStep: caseNextStep(row),
    changedSinceOpening: row.evidence !== row.events[0]?.evidence,
    source: row.source, expectedBytes: row.expectedBytes, updatedAt: row.updatedAt,
    noteCount: row.events.filter((event) => event.note.length > 0).length,
  }));
}

export function casebookSummary(book: Casebook): CasebookSummary {
  const rows = casebookRows(book);
  let recordedBytes = 0;
  for (const row of rows) {
    recordedBytes += row.expectedBytes;
    if (!Number.isSafeInteger(recordedBytes)) {
      recordedBytes = -1;
      break;
    }
  }
  return {
    total: rows.length,
    open: rows.filter((row) => row.status === "open").length,
    inReview: rows.filter((row) => row.status === "in-review").length,
    closed: rows.filter((row) => row.status === "closed").length,
    unknown: rows.filter((row) => row.evidence === "UNKNOWN").length,
    needsInspection: rows.filter((row) => row.nextStep === "inspect").length,
    potentialRetry: rows.filter((row) => row.nextStep === "retry-manually").length,
    recordedBytes: recordedBytes < 0 ? null : recordedBytes,
  };
}

export function pageCasebook(book: Casebook, query: CasebookQuery): CasebookPage {
  let rows = [...casebookRows(book)];
  const search = query.search.trim().slice(0, 160).toLocaleLowerCase();
  rows = rows.filter((row) => {
    if (query.filter === "attention" && row.nextStep === "none") return false;
    if (query.filter === "unknown" && row.evidence !== "UNKNOWN") return false;
    if (statuses.includes(query.filter as CaseStatus) && row.status !== query.filter) return false;
    if (!search) return true;
    return [row.id, row.cellId, row.reason, row.status, row.evidence,
      row.source.source, row.source.licence, row.source.date]
      .some((value) => value.toLocaleLowerCase().includes(search));
  });
  if (query.order === "cell") rows.sort((a, b) => a.cellId.localeCompare(b.cellId) || a.id.localeCompare(b.id));
  else if (query.order === "status") rows.sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id));
  else if (query.order === "oldest") rows.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
  else rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const limit = Number.isSafeInteger(query.limit) ? Math.max(1, Math.min(query.limit, 100)) : 12;
  const offset = Number.isSafeInteger(query.offset) ? Math.max(0, query.offset) : 0;
  return { rows: rows.slice(offset, offset + limit), total: rows.length, offset, limit,
    previous: offset > 0, next: offset + limit < rows.length };
}

/** Reject malformed imported records, including fabricated saved states or missing provenance. */
export function validateCasebook(book: Casebook): void {
  if (book.schema !== "offline-casebook-v1" || !safeId(book.regionId) ||
    !Number.isSafeInteger(book.revision) || book.revision < book.cases.length ||
    !Array.isArray(book.cases) || book.cases.length > CASEBOOK_MAX_CASES) {
    throw new RangeError("Invalid casebook");
  }
  const seen = new Set<string>();
  for (const row of book.cases) {
    if (!row || !safeId(row.id) || seen.has(row.id) || row.regionId !== book.regionId ||
      !safeId(row.cellId) || !reasons.includes(row.reason) || !statuses.includes(row.status) ||
      !evidenceKinds.includes(row.evidence) || row.sourceTier !== "UNKNOWN" || !validCaseProvenance(row.source) ||
      !Number.isSafeInteger(row.expectedBytes) || row.expectedBytes < 0 ||
      !dateTime(row.createdAt) || !dateTime(row.updatedAt) || row.createdAt > row.updatedAt ||
      !Array.isArray(row.events) || !row.events.length || row.events.length > CASEBOOK_MAX_EVENTS) {
      throw new RangeError("Invalid case entry");
    }
    seen.add(row.id);
    for (let i = 0; i < row.events.length; i += 1) {
      const event = row.events[i];
      if (!event || event.sequence !== i + 1 || !actions.includes(event.action) ||
        !statuses.includes(event.status) || !evidenceKinds.includes(event.evidence) ||
        !dateTime(event.at) || event.at < row.createdAt || event.at > row.updatedAt ||
        (i > 0 && event.at < (row.events[i - 1]?.at ?? "")) ||
        event.note.length > CASEBOOK_MAX_NOTE_LENGTH ||
        /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(event.note)) {
        throw new RangeError("Invalid case event");
      }
    }
    const initial = row.events[0];
    const final = row.events.at(-1);
    if (!initial || initial.action !== "opened" || !final ||
      final.status !== row.status || final.evidence !== row.evidence ||
      final.at !== row.updatedAt || initial.at !== row.createdAt) {
      throw new RangeError("Inconsistent case history");
    }
  }
}

export function importCasebook(text: string, expectedRegionId: string): Casebook {
  if (new TextEncoder().encode(text).byteLength > CASEBOOK_MAX_BYTES) throw new RangeError("Casebook too large");
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new RangeError("Casebook is not valid JSON"); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new RangeError("Invalid casebook root");
  const result = data as Casebook;
  validateCasebook(result);
  if (result.regionId !== expectedRegionId) throw new RangeError("Casebook region mismatch");
  return structuredClone(result);
}

export function encodeCasebook(book: Casebook): string {
  validateCasebook(book);
  const value = `${JSON.stringify(book, null, 2)}\n`;
  if (new TextEncoder().encode(value).byteLength > CASEBOOK_MAX_BYTES) throw new RangeError("Casebook too large");
  return value;
}

export interface CaseSourceSummary {
  readonly provenance: Provenance;
  readonly cases: number;
  readonly open: number;
  readonly unresolved: number;
  readonly unknown: number;
  readonly lastUpdatedAt: string;
  readonly listedBytes: number | null;
  readonly cellIds: readonly string[];
}

/** Group only by an exact source/licence/publication-date triple. */
export function summarizeCasebookSources(book: Casebook): readonly CaseSourceSummary[] {
  validateCasebook(book);
  const groups = new Map<string, {
    source: Provenance;
    rows: OfflineCase[];
  }>();
  for (const row of book.cases) {
    const key = JSON.stringify([row.source.source, row.source.licence, row.source.date]);
    const group = groups.get(key) ?? { source: row.source, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ source, rows }): CaseSourceSummary => {
    const ids = new Set<string>();
    let bytes = 0;
    let overflow = false;
    let lastUpdatedAt = "";
    for (const row of rows) {
      ids.add(row.cellId);
      bytes += row.expectedBytes;
      if (!Number.isSafeInteger(bytes)) overflow = true;
      if (row.updatedAt > lastUpdatedAt) lastUpdatedAt = row.updatedAt;
    }
    return {
      provenance: { ...source },
      cases: rows.length,
      open: rows.filter((row) => row.status === "open").length,
      unresolved: rows.filter((row) => row.status !== "closed").length,
      unknown: rows.filter((row) => row.evidence === "UNKNOWN").length,
      lastUpdatedAt,
      listedBytes: overflow ? null : bytes,
      cellIds: [...ids].sort((a, b) => a.localeCompare(b)),
    };
  }).sort((a, b) => a.provenance.source.localeCompare(b.provenance.source) ||
    a.provenance.date.localeCompare(b.provenance.date) ||
    a.provenance.licence.localeCompare(b.provenance.licence));
}

export interface CasebookMergePreview {
  readonly compatible: boolean;
  readonly accepted: readonly string[];
  readonly conflicts: readonly string[];
  readonly unknown: readonly string[];
}

/** Preview only. Importing another device's casebook never merges or saves cases. */
export function previewCasebookImport(
  current: Casebook,
  incoming: Casebook,
  manifest: RegionManifest,
): CasebookMergePreview {
  validateCasebook(current);
  validateCasebook(incoming);
  assertManifest(manifest);
  if (current.regionId !== manifest.regionId || incoming.regionId !== manifest.regionId) {
    return { compatible: false, accepted: [], conflicts: [], unknown: [] };
  }
  const original = new Map(current.cases.map((row) => [row.id, row]));
  const accepted: string[] = [];
  const conflicts: string[] = [];
  const unknown: string[] = [];
  for (const row of incoming.cases) {
    const existing = original.get(row.id);
    const listed = manifest.cells.find((cell) => cell.id === row.cellId);
    if (!listed || listed.bytes !== row.expectedBytes || !sourceEqual(listed.provenance, row.source)) {
      unknown.push(row.id);
      continue;
    }
    if (existing && (existing.cellId !== row.cellId ||
      existing.updatedAt !== row.updatedAt ||
      existing.events.length !== row.events.length)) {
      conflicts.push(row.id);
      continue;
    }
    if (!existing) accepted.push(row.id);
  }
  return { compatible: true, accepted, conflicts, unknown };
}
