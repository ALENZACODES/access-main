import type { DownloadResult, Provenance, RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** A journal describes local copies, not the accessibility of a place. */
export type JournalStatus = "saved" | "UNKNOWN";
export type JournalCause = "present" | "missing" | "stale" | "unreadable" |
  "not-inspected" | "metadata-conflict" | "unlisted" | "invalid-listing";
export type JournalHealth = "complete" | "partial" | "UNKNOWN";
export type JournalEvent = "snapshot" | "after-download" | "before-cleanup" | "manual-review";
export type JournalChange = "new" | "became-saved" | "became-unknown" |
  "cause-changed" | "source-changed" | "size-changed" | "unchanged" | "removed";

export interface JournalCell {
  readonly id: string;
  readonly status: JournalStatus;
  readonly cause: JournalCause;
  readonly bytes: number | null;
  readonly provenance: Provenance | null;
}
export interface JournalEntry {
  readonly sequence: number;
  readonly capturedAt: string;
  readonly event: JournalEvent;
  readonly regionId: string;
  readonly health: JournalHealth;
  readonly cells: readonly JournalCell[];
  readonly downloadReason: DownloadResult["reason"] | null;
  readonly warnings: readonly string[];
}
export interface RecoveryJournal {
  readonly schema: "offline-recovery-journal-v1";
  readonly regionId: string;
  readonly entries: readonly JournalEntry[];
}
export interface JournalDelta {
  readonly id: string;
  readonly kind: JournalChange;
  readonly before: JournalCell | null;
  readonly after: JournalCell | null;
}
export interface JournalComparison {
  readonly fromSequence: number | null;
  readonly toSequence: number;
  readonly rows: readonly JournalDelta[];
  readonly newlySaved: number;
  readonly newlyUnknown: number;
  readonly changedSource: number;
  readonly changedSize: number;
  readonly unchanged: number;
  readonly removed: number;
}
export interface JournalQuery {
  readonly search: string;
  readonly filter: "all" | "saved" | "UNKNOWN" | "changed" | "needs-inspection";
  readonly sort: "listed" | "id" | "status" | "size";
  readonly page: number;
  readonly pageSize: number;
}
export interface JournalPage {
  readonly rows: readonly JournalDelta[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

export const JOURNAL_LIMITS = {
  maxEntries: 32,
  maxCells: 4_000,
  maxIdLength: 160,
  maxWarnings: 24,
  maxReportBytes: 2 * 1024 * 1024,
} as const;

export function emptyRecoveryJournal(regionId: string): RecoveryJournal {
  if (!safeId(regionId)) throw new RangeError("Invalid region identifier");
  return { schema: "offline-recovery-journal-v1", regionId, entries: [] };
}

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= JOURNAL_LIMITS.maxIdLength &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) && !value.includes("..");
}

function safeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function safeTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const moment = new Date(value);
  return !Number.isNaN(moment.getTime()) && moment.toISOString().slice(0, 19) === value.slice(0, 19);
}

function cleanMetadata(value: string): boolean {
  return value.length > 0 && value.length <= 500 && value.trim().length > 0 &&
    !/[\p{Cc}\p{Cf}]/u.test(value);
}

export function validJournalProvenance(p: Provenance): boolean {
  return cleanMetadata(p.source) && OPEN_LICENCES.some((license) => license === p.licence) &&
    safeDate(p.date) && cleanMetadata(p.licence);
}

function sameSource(a: Provenance | null, b: Provenance | null): boolean {
  if (a === null || b === null) return a === b;
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function validSize(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function validCell(cell: JournalCell): boolean {
  return safeId(cell.id) && validSize(cell.bytes) &&
    (cell.provenance === null || validJournalProvenance(cell.provenance)) &&
    (cell.status !== "saved" || (cell.cause === "present" &&
      cell.bytes !== null && cell.provenance !== null));
}

function failClosedCell(id: string, cause: JournalCause): JournalCell {
  return { id, status: "UNKNOWN", cause, bytes: null, provenance: null };
}

function hasDuplicateIds(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

function inventoryIssues(manifest: RegionManifest, inventory: RegionInventory | null): string[] {
  const warnings: string[] = [];
  if (inventory === null) return ["inventory-unavailable"];
  if (inventory.regionId !== manifest.regionId) warnings.push("region-mismatch");
  if (hasDuplicateIds(inventory.cells.map((cell) => cell.id))) warnings.push("duplicate-inventory-id");
  if (inventory.cells.length > JOURNAL_LIMITS.maxCells) warnings.push("inventory-limit");
  const listed = new Set(manifest.cells.map((cell) => cell.id));
  if (inventory.cells.some((cell) => !listed.has(cell.id))) warnings.push("unlisted-inventory-cell");
  return warnings;
}

function manifestIssues(manifest: RegionManifest): string[] {
  const warnings: string[] = [];
  if (!safeId(manifest.regionId)) warnings.push("invalid-region");
  if (manifest.cells.length > JOURNAL_LIMITS.maxCells) warnings.push("manifest-limit");
  if (hasDuplicateIds(manifest.cells.map((cell) => cell.id))) warnings.push("duplicate-manifest-id");
  if (manifest.cells.some((cell) => !safeId(cell.id))) warnings.push("invalid-cell-id");
  if (manifest.cells.some((cell) => !Number.isSafeInteger(cell.bytes) || cell.bytes < 0)) {
    warnings.push("invalid-listed-size");
  }
  if (manifest.cells.some((cell) => !validJournalProvenance(cell.provenance))) {
    warnings.push("invalid-source");
  }
  return warnings;
}

/**
 * Take a metadata-only reading from the existing dashboard. Any structural
 * ambiguity makes every listed copy UNKNOWN, never a guessed success.
 */
export function captureJournalEntry(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  capturedAt: string,
  event: JournalEvent,
  lastResult: DownloadResult | null = null,
): Omit<JournalEntry, "sequence"> {
  if (!safeTimestamp(capturedAt)) throw new RangeError("Invalid capture timestamp");
  if (!safeId(manifest.regionId)) throw new RangeError("Invalid region identifier");
  if (manifest.cells.length > JOURNAL_LIMITS.maxCells) throw new RangeError("Too many listed cells");
  const warnings = [...manifestIssues(manifest), ...inventoryIssues(manifest, inventory)];
  if (lastResult !== null && lastResult.regionId !== manifest.regionId) {
    warnings.push("download-region-mismatch");
  }
  const untrusted = warnings.length > 0;
  const observed = new Map(inventory?.cells.map((cell) => [cell.id, cell] as const) ?? []);
  const cells: JournalCell[] = [];
  for (const expected of manifest.cells) {
    if (!safeId(expected.id)) continue;
    const entry = observed.get(expected.id);
    if (untrusted) {
      cells.push(failClosedCell(expected.id, "invalid-listing"));
      continue;
    }
    if (entry === undefined) {
      cells.push(failClosedCell(expected.id, "not-inspected"));
      continue;
    }
    if (entry.expectedBytes !== expected.bytes || !sameSource(entry.provenance, expected.provenance)) {
      cells.push({ id: expected.id, status: "UNKNOWN", cause: "metadata-conflict",
        bytes: expected.bytes, provenance: expected.provenance });
      continue;
    }
    if (entry.cause === "present" && entry.state === "saved") {
      cells.push({ id: expected.id, status: "saved", cause: "present",
        bytes: expected.bytes, provenance: expected.provenance });
      continue;
    }
    cells.push({ id: expected.id, status: "UNKNOWN", cause: entry.cause,
      bytes: expected.bytes, provenance: expected.provenance });
  }
  const complete = !untrusted && cells.length === manifest.cells.length &&
    cells.every((cell) => cell.status === "saved");
  const partial = !untrusted && cells.length === manifest.cells.length &&
    cells.some((cell) => cell.status === "saved") &&
    cells.every((cell) => cell.cause !== "unreadable" &&
      cell.cause !== "not-inspected" && cell.cause !== "metadata-conflict");
  const health: JournalHealth = complete ? "complete" : partial ? "partial" : "UNKNOWN";
  return {
    capturedAt, event, regionId: manifest.regionId, health, cells,
    downloadReason: lastResult?.regionId === manifest.regionId ? lastResult.reason : null,
    warnings: warnings.slice(0, JOURNAL_LIMITS.maxWarnings),
  };
}

/** Explicit user snapshots only. Oldest entries expire when bounded capacity is reached. */
export function appendRecoveryJournal(
  journal: RecoveryJournal,
  reading: Omit<JournalEntry, "sequence">,
): RecoveryJournal {
  if (journal.regionId !== reading.regionId) throw new RangeError("Cross-region snapshot");
  if (!safeTimestamp(reading.capturedAt)) throw new RangeError("Invalid snapshot timestamp");
  if (reading.cells.length > JOURNAL_LIMITS.maxCells || reading.cells.some((cell) => !validCell(cell))) {
    throw new RangeError("Invalid snapshot cells");
  }
  if (hasDuplicateIds(reading.cells.map((cell) => cell.id))) throw new RangeError("Duplicate cell identifier");
  if (reading.warnings.length > JOURNAL_LIMITS.maxWarnings ||
    reading.warnings.some((warning) => !cleanMetadata(warning))) throw new RangeError("Invalid warnings");
  const previous = journal.entries.at(-1);
  if (previous !== undefined && Date.parse(reading.capturedAt) < Date.parse(previous.capturedAt)) {
    throw new RangeError("Snapshot date precedes previous capture");
  }
  const sequence = (previous?.sequence ?? 0) + 1;
  if (!Number.isSafeInteger(sequence)) throw new RangeError("Sequence limit exceeded");
  const entry: JournalEntry = { ...reading, sequence,
    cells: reading.cells.map((cell) => ({ ...cell,
      provenance: cell.provenance === null ? null : { ...cell.provenance } })),
    warnings: [...reading.warnings] };
  return { schema: "offline-recovery-journal-v1", regionId: journal.regionId,
    entries: [...journal.entries, entry].slice(-JOURNAL_LIMITS.maxEntries) };
}

export function clearRecoveryJournal(journal: RecoveryJournal): RecoveryJournal {
  return emptyRecoveryJournal(journal.regionId);
}

/** Compare explicit snapshots, never interpolating a missing observation. */
export function compareJournalEntries(
  before: JournalEntry | null,
  after: JournalEntry,
): JournalComparison {
  if (before !== null && before.regionId !== after.regionId) {
    throw new RangeError("Cannot compare different regions");
  }
  const old = new Map(before?.cells.map((cell) => [cell.id, cell] as const) ?? []);
  const next = new Map(after.cells.map((cell) => [cell.id, cell] as const));
  const rows: JournalDelta[] = [];
  for (const current of after.cells) {
    const prior = old.get(current.id) ?? null;
    let kind: JournalChange = "new";
    if (prior !== null) {
      if (!sameSource(prior.provenance, current.provenance)) kind = "source-changed";
      else if (prior.bytes !== current.bytes) kind = "size-changed";
      else if (prior.status !== current.status) {
        kind = current.status === "saved" ? "became-saved" : "became-unknown";
      } else if (prior.cause !== current.cause) kind = "cause-changed";
      else kind = "unchanged";
    }
    rows.push({ id: current.id, kind, before: prior, after: current });
  }
  for (const prior of before?.cells ?? []) {
    if (!next.has(prior.id)) rows.push({ id: prior.id, kind: "removed", before: prior, after: null });
  }
  const count = (kind: JournalChange): number => rows.filter((row) => row.kind === kind).length;
  return { fromSequence: before?.sequence ?? null, toSequence: after.sequence, rows,
    newlySaved: count("became-saved"), newlyUnknown: count("became-unknown"),
    changedSource: count("source-changed"), changedSize: count("size-changed"),
    unchanged: count("unchanged"), removed: count("removed") };
}

export function latestJournalComparison(journal: RecoveryJournal): JournalComparison | null {
  const last = journal.entries.at(-1);
  if (last === undefined) return null;
  return compareJournalEntries(journal.entries.at(-2) ?? null, last);
}

/** Bounded search only through explicitly recorded metadata. */
export function pageJournalChanges(comparison: JournalComparison, query: JournalQuery): JournalPage {
  const search = query.search.trim().slice(0, 120).normalize("NFKC").toLocaleLowerCase();
  const eligible = comparison.rows.filter((row) => {
    const cell = row.after ?? row.before;
    if (cell === null) return false;
    if (query.filter === "saved" && row.after?.status !== "saved") return false;
    if (query.filter === "UNKNOWN" && row.after?.status !== "UNKNOWN") return false;
    if (query.filter === "changed" && row.kind === "unchanged") return false;
    if (query.filter === "needs-inspection" && row.after?.cause !== "unreadable" &&
      row.after?.cause !== "metadata-conflict" && row.after?.cause !== "not-inspected") return false;
    const values = [row.id, row.kind, cell.cause, cell.provenance?.source,
      cell.provenance?.licence, cell.provenance?.date];
    return values.filter((value): value is string => typeof value === "string")
      .some((value) => value.normalize("NFKC").toLocaleLowerCase().includes(search));
  });
  if (query.sort !== "listed") {
    eligible.sort((a, b) => {
      if (query.sort === "id") return a.id.localeCompare(b.id);
      if (query.sort === "status") return (a.after?.status ?? "UNKNOWN").localeCompare(b.after?.status ?? "UNKNOWN") || a.id.localeCompare(b.id);
      return (b.after?.bytes ?? b.before?.bytes ?? -1) - (a.after?.bytes ?? a.before?.bytes ?? -1) || a.id.localeCompare(b.id);
    });
  }
  const size = Number.isSafeInteger(query.pageSize) ? Math.max(1, Math.min(50, query.pageSize)) : 10;
  const pages = Math.max(1, Math.ceil(eligible.length / size));
  const page = Number.isSafeInteger(query.page) ? Math.max(0, Math.min(pages - 1, query.page)) : 0;
  return { rows: eligible.slice(page * size, (page + 1) * size), page, pages,
    total: eligible.length, hasPrevious: page > 0, hasNext: page < pages - 1 };
}

export interface JournalTotals {
  readonly snapshots: number;
  readonly latestSaved: number;
  readonly latestUnknown: number;
  readonly missing: number;
  readonly stale: number;
  readonly unreadable: number;
  readonly sourceConflicts: number;
  readonly lastCapture: string | null;
  readonly health: JournalHealth;
}

export function recoveryJournalTotals(journal: RecoveryJournal): JournalTotals {
  const entry = journal.entries.at(-1);
  if (entry === undefined) return { snapshots: 0, latestSaved: 0, latestUnknown: 0,
    missing: 0, stale: 0, unreadable: 0, sourceConflicts: 0, lastCapture: null, health: "UNKNOWN" };
  const count = (cause: JournalCause): number => entry.cells.filter((cell) => cell.cause === cause).length;
  return { snapshots: journal.entries.length,
    latestSaved: entry.cells.filter((cell) => cell.status === "saved").length,
    latestUnknown: entry.cells.filter((cell) => cell.status === "UNKNOWN").length,
    missing: count("missing"), stale: count("stale"), unreadable: count("unreadable"),
    sourceConflicts: count("metadata-conflict"), lastCapture: entry.capturedAt, health: entry.health };
}

/** Diagnostic only: no automatic retry or mutation of offline records. */
export function journalActionForCell(cell: JournalCell): "none" | "download" | "inspect" | "review-source" {
  if (cell.status === "saved") return "none";
  if (cell.cause === "missing" || cell.cause === "stale") return "download";
  if (cell.cause === "metadata-conflict") return "review-source";
  return "inspect";
}

export function formatJournalByteCount(bytes: number | null, language: "en" | "fr"): string {
  if (bytes === null || !Number.isSafeInteger(bytes) || bytes < 0) return "UNKNOWN";
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(bytes)} B`;
}
