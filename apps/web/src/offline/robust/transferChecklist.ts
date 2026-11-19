import { type Provenance, type RegionManifest } from "./regionDownload";
import { type RegionInventory } from "./regionInventory";

/** A device-local metadata checklist. It never carries cell payloads. */
export type ChecklistStatus = "saved" | "UNKNOWN";
export type ChecklistTier = "UNKNOWN" | "community" | "documented";
export interface ChecklistEntry {
  readonly id: string;
  readonly expectedBytes: number;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: ChecklistTier;
  readonly previousStatus: ChecklistStatus;
}
export interface TransferChecklist {
  readonly schema: "offline-transfer-checklist-v1";
  readonly regionId: string;
  readonly createdOn: string;
  readonly entries: readonly ChecklistEntry[];
}
export type ComparisonKind = "same" | "new" | "removed" | "changed" | "UNKNOWN";
export interface ChecklistComparisonRow {
  readonly id: string;
  readonly kind: ComparisonKind;
  readonly previous: ChecklistEntry | null;
  readonly current: ChecklistEntry | null;
  readonly currentStatus: ChecklistStatus;
}
export interface ChecklistComparison {
  readonly regionId: string;
  readonly rows: readonly ChecklistComparisonRow[];
  readonly notes: readonly string[];
  readonly unknown: number;
  readonly changed: number;
}

const MAX_CELLS = 20_000;
const MAX_DOCUMENT_BYTES = 256 * 1024;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function calendarDate(input: string): boolean {
  if (!DATE_PATTERN.test(input)) return false;
  const parsed = new Date(`${input}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input;
}

function safeText(input: string, length: number): boolean {
  return input.trim().length > 0 && input.length <= length &&
    !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(input);
}

function validEntry(entry: ChecklistEntry): boolean {
  return ID_PATTERN.test(entry.id) && Number.isSafeInteger(entry.expectedBytes) &&
    entry.expectedBytes >= 0 && safeText(entry.source, 500) &&
    safeText(entry.licence, 100) && calendarDate(entry.date) &&
    ["UNKNOWN", "community", "documented"].includes(entry.tier) &&
    (entry.previousStatus === "saved" || entry.previousStatus === "UNKNOWN");
}

function entryOf(
  id: string, bytes: number, provenance: Provenance,
  status: ChecklistStatus,
): ChecklistEntry {
  return {
    id, expectedBytes: bytes, source: provenance.source,
    licence: provenance.licence, date: provenance.date,
    // No evidence tier is supplied by a region manifest. Do not infer one.
    tier: "UNKNOWN", previousStatus: status,
  };
}

/**
 * Export source metadata and the result of an explicitly supplied local scan.
 * If the scan is absent, inconsistent, or incomplete, the record is UNKNOWN.
 * Exporting this file does not establish offline access on another device.
 */
export function buildTransferChecklist(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  day: string,
): TransferChecklist {
  if (!ID_PATTERN.test(manifest.regionId) || !calendarDate(day) ||
    manifest.cells.length > MAX_CELLS) throw new TypeError("Invalid checklist input");
  const seen = new Set<string>();
  const entries: ChecklistEntry[] = [];
  const trustworthy = inventory !== null && inventory.regionId === manifest.regionId &&
    inventory.cells.length === manifest.cells.length &&
    new Set(inventory.cells.map((cell) => cell.id)).size === inventory.cells.length &&
    inventory.cells.every((cell) => manifest.cells.some((listed) => listed.id === cell.id));
  const observations = new Map(inventory?.cells.map((cell) => [cell.id, cell] as const) ?? []);
  for (const cell of manifest.cells) {
    if (seen.has(cell.id)) throw new TypeError("Duplicate checklist entry");
    seen.add(cell.id);
    const observation = trustworthy ? observations.get(cell.id) : undefined;
    const matching = observation?.state === "saved" && observation.cause === "present" &&
      observation.expectedBytes === cell.bytes &&
      observation.provenance.source === cell.provenance.source &&
      observation.provenance.licence === cell.provenance.licence &&
      observation.provenance.date === cell.provenance.date;
    const entry = entryOf(cell.id, cell.bytes, cell.provenance, matching ? "saved" : "UNKNOWN");
    if (!validEntry(entry)) throw new TypeError("Invalid checklist entry");
    entries.push(entry);
  }
  return { schema: "offline-transfer-checklist-v1", regionId: manifest.regionId,
    createdOn: day, entries };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

/** Fail closed on malformed, oversized, or ambiguous external documents. */
export function parseTransferChecklist(text: string): TransferChecklist {
  if (new TextEncoder().encode(text).byteLength > MAX_DOCUMENT_BYTES) {
    throw new RangeError("Checklist exceeds local size limit");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; }
  catch { throw new TypeError("Malformed checklist"); }
  if (!isRecord(parsed) || !exactKeys(parsed, ["schema", "regionId", "createdOn", "entries"]) ||
    parsed.schema !== "offline-transfer-checklist-v1" ||
    typeof parsed.regionId !== "string" || !ID_PATTERN.test(parsed.regionId) ||
    typeof parsed.createdOn !== "string" || !calendarDate(parsed.createdOn) ||
    !Array.isArray(parsed.entries) || parsed.entries.length > MAX_CELLS) {
    throw new TypeError("Invalid checklist structure");
  }
  const entries: ChecklistEntry[] = [];
  const seen = new Set<string>();
  for (const value of parsed.entries as unknown[]) {
    if (!isRecord(value) || !exactKeys(value, [
      "id", "expectedBytes", "source", "licence", "date", "tier", "previousStatus",
    ]) || typeof value.id !== "string" || typeof value.expectedBytes !== "number" ||
      typeof value.source !== "string" || typeof value.licence !== "string" ||
      typeof value.date !== "string" || typeof value.tier !== "string" ||
      typeof value.previousStatus !== "string") {
      throw new TypeError("Invalid checklist entry");
    }
    const entry: ChecklistEntry = {
      id: value.id, expectedBytes: value.expectedBytes,
      source: value.source, licence: value.licence, date: value.date,
      tier: value.tier as ChecklistTier,
      previousStatus: value.previousStatus as ChecklistStatus,
    };
    if (!validEntry(entry) || seen.has(entry.id)) {
      throw new TypeError("Duplicate or invalid checklist entry");
    }
    seen.add(entry.id);
    entries.push(entry);
  }
  return {
    schema: "offline-transfer-checklist-v1", regionId: parsed.regionId,
    createdOn: parsed.createdOn, entries,
  };
}

export function encodeTransferChecklist(checklist: TransferChecklist): string {
  // Encoding also subjects internal callers to the same strict input contract.
  const text = `${JSON.stringify(checklist, null, 2)}\n`;
  parseTransferChecklist(text);
  return text;
}

function sameMetadata(a: ChecklistEntry, b: ChecklistEntry): boolean {
  return a.expectedBytes === b.expectedBytes && a.source === b.source &&
    a.licence === b.licence && a.date === b.date && a.tier === b.tier;
}

/** Imported 'saved' is historical only. Current status comes from local scan. */
export function compareTransferChecklist(
  previous: TransferChecklist,
  manifest: RegionManifest,
  currentInventory: RegionInventory | null,
  day: string,
): ChecklistComparison {
  const current = buildTransferChecklist(manifest, currentInventory, day);
  // Guard even direct object callers against forged or incomplete data.
  const prior = parseTransferChecklist(encodeTransferChecklist(previous));
  const notes: string[] = [];
  if (prior.regionId !== current.regionId) notes.push("region-mismatch");
  const existing = new Map(prior.entries.map((entry) => [entry.id, entry] as const));
  const rows: ChecklistComparisonRow[] = [];
  for (const entry of current.entries) {
    const earlier = existing.get(entry.id) ?? null;
    existing.delete(entry.id);
    let kind: ComparisonKind = earlier === null ? "new" :
      !sameMetadata(earlier, entry) ? "changed" :
      entry.previousStatus === "UNKNOWN" ? "UNKNOWN" : "same";
    if (prior.regionId !== current.regionId) kind = "UNKNOWN";
    rows.push({ id: entry.id, kind, previous: earlier, current: entry,
      currentStatus: entry.previousStatus });
  }
  for (const entry of existing.values()) {
    rows.push({ id: entry.id, kind: prior.regionId === current.regionId ? "removed" : "UNKNOWN",
      previous: entry, current: null, currentStatus: "UNKNOWN" });
  }
  return { regionId: current.regionId, rows, notes,
    unknown: rows.filter((row) => row.currentStatus === "UNKNOWN").length,
    changed: rows.filter((row) => row.kind !== "same").length };
}

export function transferChecklistFilename(regionId: string, day: string): string {
  const safe = regionId.toLowerCase().replace(/[^a-z0-9_-]/gu, "-").slice(0, 64) || "region";
  return `offline-checklist-${safe}-${calendarDate(day) ? day : "unknown"}.json`;
}

export function filteredChecklistRows(
  comparison: ChecklistComparison,
  filter: "all" | "changed" | "UNKNOWN",
  search: string,
  page: number,
  pageSize = 10,
): { readonly rows: readonly ChecklistComparisonRow[]; readonly pages: number; readonly total: number } {
  const query = search.trim().toLocaleLowerCase().slice(0, 160);
  const matching = comparison.rows.filter((row) =>
    (filter === "all" || (filter === "changed" ? row.kind !== "same" :
      row.currentStatus === "UNKNOWN")) &&
    (!query || [row.id, row.current?.source, row.current?.licence, row.previous?.source]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLocaleLowerCase().includes(query))));
  const safeSize = Number.isSafeInteger(pageSize) ? Math.max(1, Math.min(pageSize, 100)) : 10;
  const pages = Math.max(1, Math.ceil(matching.length / safeSize));
  const currentPage = Number.isSafeInteger(page) ? Math.min(pages - 1, Math.max(0, page)) : 0;
  return { rows: matching.slice(currentPage * safeSize, (currentPage + 1) * safeSize),
    pages, total: matching.length };
}
