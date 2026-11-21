import type { Provenance, RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

/** User-supplied data snapshots are not descriptions of physical accessibility. */
export type SnapshotSlot = "baseline" | "option-a" | "option-b";
export type SnapshotChange = "same" | "added" | "removed" | "metadata" | "bytes" | "missing-snapshot";
export type SnapshotFilter = "all" | "changed" | "UNKNOWN" | "saved" | SnapshotChange;
export type SnapshotOrder = "listed" | "cell" | "largest-change" | "uncertainty";
export type SnapshotLocalState = "saved" | "UNKNOWN";
export interface SnapshotCell {
  readonly id: string;
  readonly bytes: number;
  readonly provenance: Provenance;
}
export interface SnapshotDocument {
  readonly schema: "offline-region-snapshot-v1";
  readonly regionId: string;
  readonly label: string;
  readonly takenOn: string;
  readonly cells: readonly SnapshotCell[];
}
export interface SnapshotAssessment {
  readonly slot: SnapshotSlot;
  readonly kind: SnapshotChange;
  readonly before: SnapshotCell | null;
  readonly after: SnapshotCell | null;
  readonly sourceChanged: boolean;
  readonly licenceChanged: boolean;
  readonly dateChanged: boolean;
  readonly bytesChanged: boolean;
  readonly question: string;
}
export interface SnapshotMatrixRow {
  readonly cellId: string;
  readonly baseline: SnapshotCell | null;
  readonly optionA: SnapshotAssessment;
  readonly optionB: SnapshotAssessment;
  readonly localState: SnapshotLocalState;
  readonly localReason: string;
  readonly physicalAccess: "UNKNOWN";
  readonly attention: "review" | "no-change";
}
export interface SnapshotMatrix {
  readonly regionId: string;
  readonly status: "ready" | "UNKNOWN";
  readonly physicalAccess: "UNKNOWN";
  readonly rows: readonly SnapshotMatrixRow[];
  readonly optionsPresent: number;
  readonly optionAChanged: number;
  readonly optionBChanged: number;
  readonly localSaved: number;
  readonly localUnknown: number;
  readonly reviewCount: number;
  readonly baselineBytes: number;
  readonly optionABytes: number | null;
  readonly optionBBytes: number | null;
}
export interface SnapshotPage {
  readonly rows: readonly SnapshotMatrixRow[];
  readonly total: number;
  readonly next: boolean;
  readonly previous: boolean;
}
export interface SnapshotPageSettings {
  readonly search: string;
  readonly filter: SnapshotFilter;
  readonly order: SnapshotOrder;
  readonly offset: number;
  readonly limit: number;
}
export const MAX_SNAPSHOT_BYTES = 192 * 1024;
export const MAX_SNAPSHOT_CELLS = 1024;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const slots: readonly SnapshotSlot[] = ["baseline", "option-a", "option-b"];
const filters: readonly SnapshotFilter[] = ["all", "changed", "UNKNOWN", "saved", "same", "added", "removed", "metadata", "bytes", "missing-snapshot"];
const orders: readonly SnapshotOrder[] = ["listed", "cell", "largest-change", "uncertainty"];
const cleanText = (text: string, limit: number): boolean => {
  if (text.length === 0 || text.length > limit || text.trim() !== text) return false;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return false;
  }
  return true;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const hasKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
function safeBytes(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
export function snapshotDate(value: string): boolean {
  const m = DATE.exec(value);
  if (m === null) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1970 || year > 9999 || month < 1 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
function parseProvenance(value: unknown): Provenance {
  if (!record(value) || !hasKeys(value, ["source", "licence", "date"]) ||
    typeof value.source !== "string" || !cleanText(value.source, 240) ||
    typeof value.licence !== "string" || !cleanText(value.licence, 160) ||
    typeof value.date !== "string" || !snapshotDate(value.date)) throw new TypeError("Invalid source metadata");
  return { source: value.source, licence: value.licence, date: value.date };
}
function parseCell(value: unknown): SnapshotCell {
  if (!record(value) || !hasKeys(value, ["id", "bytes", "provenance"]) ||
    typeof value.id !== "string" || !cleanText(value.id, 160) || !safeBytes(value.bytes)) throw new TypeError("Invalid cell");
  return { id: value.id, bytes: value.bytes, provenance: parseProvenance(value.provenance) };
}
function sumBytes(cells: readonly SnapshotCell[]): number {
  let total = 0;
  for (const cell of cells) {
    total += cell.bytes;
    if (!Number.isSafeInteger(total)) throw new RangeError("Unsafe byte total");
  }
  return total;
}
export function assertSnapshot(value: unknown): SnapshotDocument {
  if (!record(value) || !hasKeys(value, ["schema", "regionId", "label", "takenOn", "cells"]) ||
    value.schema !== "offline-region-snapshot-v1" || typeof value.regionId !== "string" || !cleanText(value.regionId, 160) ||
    typeof value.label !== "string" || !cleanText(value.label, 160) ||
    typeof value.takenOn !== "string" || !snapshotDate(value.takenOn) ||
    !Array.isArray(value.cells) || value.cells.length > MAX_SNAPSHOT_CELLS) throw new TypeError("Invalid snapshot");
  const cells = value.cells.map(parseCell);
  const ids = new Set<string>();
  for (const cell of cells) {
    if (ids.has(cell.id)) throw new TypeError("Duplicate cell");
    ids.add(cell.id);
    if (cell.provenance.date > value.takenOn) throw new TypeError("Source date exceeds snapshot date");
  }
  sumBytes(cells);
  return { schema: "offline-region-snapshot-v1", regionId: value.regionId, label: value.label, takenOn: value.takenOn, cells };
}
export function parseSnapshot(json: string): SnapshotDocument {
  if (new TextEncoder().encode(json).byteLength > MAX_SNAPSHOT_BYTES) throw new RangeError("Snapshot exceeds byte limit");
  let value: unknown;
  try { value = JSON.parse(json) as unknown; } catch { throw new TypeError("Invalid JSON"); }
  return assertSnapshot(value);
}
export function fromRegionManifest(manifest: RegionManifest, date: string, label = "Local region listing"): SnapshotDocument {
  return assertSnapshot({ schema: "offline-region-snapshot-v1", regionId: manifest.regionId, label, takenOn: date,
    cells: manifest.cells.map((cell) => ({ id: cell.id, bytes: cell.bytes, provenance: { ...cell.provenance } })) });
}
export function encodeSnapshot(snapshot: SnapshotDocument): string { return `${JSON.stringify(assertSnapshot(snapshot), null, 2)}\n`; }
function compareCells(slot: SnapshotSlot, before: SnapshotCell | null, after: SnapshotCell | null, absent: boolean): SnapshotAssessment {
  const sourceChanged = before !== null && after !== null && before.provenance.source !== after.provenance.source;
  const licenceChanged = before !== null && after !== null && before.provenance.licence !== after.provenance.licence;
  const dateChanged = before !== null && after !== null && before.provenance.date !== after.provenance.date;
  const bytesChanged = before !== null && after !== null && before.bytes !== after.bytes;
  const kind: SnapshotChange = absent ? "missing-snapshot" : before === null ? "added" : after === null ? "removed" :
    sourceChanged || licenceChanged || dateChanged ? "metadata" : bytesChanged ? "bytes" : "same";
  const question = kind === "missing-snapshot" ? "What does this comparison option contain?" :
    kind === "removed" ? "Is a replacement listing available for this cell?" :
    kind === "added" ? "What source and licence describe the added cell?" :
    kind === "metadata" ? "Why did the source information change?" :
    kind === "bytes" ? "Why did the declared data size change?" : "No declared change; physical conditions remain UNKNOWN.";
  return { slot, kind, before, after, sourceChanged, licenceChanged, dateChanged, bytesChanged, question };
}
function currentLocalState(cell: SnapshotCell | null, inventory: RegionInventory | null, regionId: string): { state: SnapshotLocalState; reason: string } {
  if (cell === null || inventory === null || inventory.regionId !== regionId) return { state: "UNKNOWN", reason: "inventory-unavailable" };
  const observed = inventory.cells.filter((entry) => entry.id === cell.id);
  if (observed.length !== 1) return { state: "UNKNOWN", reason: "cell-unavailable" };
  const found = observed[0];
  if (found === undefined || found.state !== "saved" || found.cause !== "present" || found.expectedBytes !== cell.bytes ||
    found.provenance.source !== cell.provenance.source || found.provenance.licence !== cell.provenance.licence ||
    found.provenance.date !== cell.provenance.date) return { state: "UNKNOWN", reason: "source-or-copy-mismatch" };
  return { state: "saved", reason: "local-metadata-match" };
}
export function compareSnapshots(
  baseline: SnapshotDocument,
  optionA: SnapshotDocument | null,
  optionB: SnapshotDocument | null,
  inventory: RegionInventory | null = null,
): SnapshotMatrix {
  const base = assertSnapshot(baseline);
  const a = optionA === null ? null : assertSnapshot(optionA);
  const b = optionB === null ? null : assertSnapshot(optionB);
  if ((a !== null && a.regionId !== base.regionId) || (b !== null && b.regionId !== base.regionId)) throw new TypeError("Region mismatch");
  const bm = new Map(base.cells.map((cell) => [cell.id, cell]));
  const am = new Map((a?.cells ?? []).map((cell) => [cell.id, cell]));
  const cm = new Map((b?.cells ?? []).map((cell) => [cell.id, cell]));
  const ids = new Set([...bm.keys(), ...am.keys(), ...cm.keys()]);
  if (ids.size > MAX_SNAPSHOT_CELLS * 3) throw new RangeError("Too many comparison rows");
  const rows: SnapshotMatrixRow[] = [...ids].map((cellId) => {
    const before = bm.get(cellId) ?? null;
    const first = compareCells("option-a", before, am.get(cellId) ?? null, a === null);
    const second = compareCells("option-b", before, cm.get(cellId) ?? null, b === null);
    const local = currentLocalState(before, inventory, base.regionId);
    return { cellId, baseline: before, optionA: first, optionB: second, localState: local.state,
      localReason: local.reason, physicalAccess: "UNKNOWN" as const,
      attention: first.kind === "same" && second.kind === "same" && local.state === "saved" ? "no-change" as const : "review" as const };
  });
  return { regionId: base.regionId, status: a === null && b === null ? "UNKNOWN" : "ready", physicalAccess: "UNKNOWN", rows,
    optionsPresent: Number(a !== null) + Number(b !== null),
    optionAChanged: a === null ? 0 : rows.filter((row) => row.optionA.kind !== "same").length,
    optionBChanged: b === null ? 0 : rows.filter((row) => row.optionB.kind !== "same").length,
    localSaved: rows.filter((row) => row.localState === "saved").length,
    localUnknown: rows.filter((row) => row.localState === "UNKNOWN").length,
    reviewCount: rows.filter((row) => row.attention === "review").length,
    baselineBytes: sumBytes(base.cells), optionABytes: a === null ? null : sumBytes(a.cells), optionBBytes: b === null ? null : sumBytes(b.cells) };
}
export function pageSnapshotMatrix(matrix: SnapshotMatrix, settings: SnapshotPageSettings): SnapshotPage {
  if (!Number.isSafeInteger(settings.offset) || settings.offset < 0 || !Number.isSafeInteger(settings.limit) || settings.limit < 1 || settings.limit > 100 ||
    settings.search.length > 160 || !filters.includes(settings.filter) || !orders.includes(settings.order)) throw new RangeError("Invalid page");
  const query = settings.search.toLocaleLowerCase("en-CA");
  const rows = matrix.rows.filter((row) => {
    if (!row.cellId.toLocaleLowerCase("en-CA").includes(query)) return false;
    switch (settings.filter) {
      case "all": return true;
      case "changed": return row.optionA.kind !== "same" || row.optionB.kind !== "same";
      case "saved": return row.localState === "saved";
      case "UNKNOWN": return row.localState === "UNKNOWN";
      default: return row.optionA.kind === settings.filter || row.optionB.kind === settings.filter;
    }
  });
  if (settings.order === "cell") rows.sort((x, y) => x.cellId.localeCompare(y.cellId));
  if (settings.order === "uncertainty") rows.sort((x, y) => Number(y.localState === "UNKNOWN") - Number(x.localState === "UNKNOWN") || x.cellId.localeCompare(y.cellId));
  if (settings.order === "largest-change") rows.sort((x, y) => {
    const delta = (row: SnapshotMatrixRow) => Math.max(Math.abs((row.optionA.after?.bytes ?? 0) - (row.baseline?.bytes ?? 0)),
      Math.abs((row.optionB.after?.bytes ?? 0) - (row.baseline?.bytes ?? 0)));
    return delta(y) - delta(x) || x.cellId.localeCompare(y.cellId);
  });
  return { rows: rows.slice(settings.offset, settings.offset + settings.limit), total: rows.length,
    next: settings.offset + settings.limit < rows.length, previous: settings.offset > 0 };
}
export function snapshotSlotValues(): readonly SnapshotSlot[] { return slots; }
