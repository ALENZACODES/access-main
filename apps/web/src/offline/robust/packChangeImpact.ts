import type { Language, Provenance, RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

/** A comparison of two source listings, never a claim about physical access. */
export type ChangeKind = "added" | "removed" | "bytes" | "source" | "licence" | "date" | "unchanged";
export type ChangeFilter = "all" | "changed" | "UNKNOWN" | "saved" | ChangeKind;
export type ChangeSort = "listed" | "id" | "largest" | "source" | "priority";
export type FollowUpPriority = "review-first" | "review" | "no-change";
export type CopyState = "saved" | "UNKNOWN";
export interface ManifestCellSnapshot {
  readonly id: string;
  readonly bytes: number;
  readonly provenance: Provenance;
}
export interface ChangeRow {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly changes: readonly ChangeKind[];
  readonly before: ManifestCellSnapshot | null;
  readonly after: ManifestCellSnapshot | null;
  readonly localCopy: CopyState;
  readonly localReason: string;
  readonly priority: FollowUpPriority;
  readonly question: string;
}
export interface ChangeImpact {
  readonly regionId: string;
  readonly status: "ready" | "UNKNOWN";
  readonly physicalAccess: "UNKNOWN";
  readonly rows: readonly ChangeRow[];
  readonly added: number;
  readonly removed: number;
  readonly modified: number;
  readonly unchanged: number;
  readonly locallySaved: number;
  readonly localUnknown: number;
  readonly totalBeforeBytes: number;
  readonly totalAfterBytes: number;
  readonly deltaBytes: number;
  readonly followUpCount: number;
}
export interface ChangePageOptions {
  readonly search: string;
  readonly filter: ChangeFilter;
  readonly sort: ChangeSort;
  readonly offset: number;
  readonly limit: number;
}
export interface ChangePage {
  readonly rows: readonly ChangeRow[];
  readonly total: number;
  readonly previous: boolean;
  readonly next: boolean;
}
const MAX_CELLS = 1024;
const MAX_JSON_BYTES = 128 * 1024;
const MAX_ID = 160;
const MAX_SOURCE = 240;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function keysOnly(value: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new TypeError("Unsupported source field");
}
export function validSourceDate(value: string): boolean {
  const hit = DAY.exec(value);
  if (hit === null) return false;
  const [year, month, day] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  if (year < 1970 || year > 9999 || month < 1 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function safeCharacters(value: string): boolean {
  for (const point of value) {
    const n = point.codePointAt(0) ?? 0;
    if (n < 32 || (n >= 127 && n <= 159) || (n >= 0x202a && n <= 0x202e) ||
      (n >= 0x2066 && n <= 0x2069)) return false;
  }
  return true;
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum &&
    safeCharacters(value);
}
function validateProvenance(value: unknown): Provenance {
  if (!object(value)) throw new TypeError("Source metadata is required");
  keysOnly(value, ["source", "licence", "date"]);
  if (!text(value.source, MAX_SOURCE) || !text(value.licence, MAX_SOURCE) ||
      !text(value.date, 10) || !validSourceDate(value.date)) throw new TypeError("Invalid source metadata");
  return { source: value.source, licence: value.licence, date: value.date };
}
function checkCell(value: unknown): ManifestCellSnapshot {
  if (!object(value)) throw new TypeError("Invalid cell");
  keysOnly(value, ["id", "bytes", "provenance"]);
  if (!text(value.id, MAX_ID) || !Number.isSafeInteger(value.bytes) ||
      typeof value.bytes !== "number" || value.bytes < 0) throw new TypeError("Invalid cell ID or byte count");
  return { id: value.id, bytes: value.bytes, provenance: validateProvenance(value.provenance) };
}
/** Validate an external listing strictly; do not trust arbitrary JSON metadata. */
export function validateManifest(value: unknown): RegionManifest {
  if (!object(value)) throw new TypeError("Invalid listing");
  keysOnly(value, ["regionId", "cells"]);
  if (!text(value.regionId, MAX_ID) || !Array.isArray(value.cells) || value.cells.length > MAX_CELLS)
    throw new TypeError("Invalid region or too many cells");
  const seen = new Set<string>();
  const cells = value.cells.map((item: unknown): ManifestCellSnapshot => {
    const cell = checkCell(item);
    if (seen.has(cell.id)) throw new TypeError("Repeated cell ID");
    seen.add(cell.id);
    return cell;
  });
  return { regionId: value.regionId, cells };
}
export function parseManifest(textValue: string): RegionManifest {
  if (typeof textValue !== "string" || new TextEncoder().encode(textValue).length > MAX_JSON_BYTES)
    throw new RangeError("Listing exceeds the maximum size");
  try {
    return validateManifest(JSON.parse(textValue) as unknown);
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new TypeError("The listing could not be read safely");
  }
}
/** Existing inventory may be incomplete: those cells must remain UNKNOWN. */
function localCopyFor(cell: ManifestCellSnapshot | null, inventory: RegionInventory | null,
  region: string): { state: CopyState; reason: string } {
  if (cell === null || inventory === null || inventory.regionId !== region)
    return { state: "UNKNOWN", reason: "inventory-unavailable" };
  const matches = inventory.cells.filter((entry) => entry.id === cell.id);
  if (matches.length !== 1) return { state: "UNKNOWN", reason: "inventory-conflict" };
  const found = matches[0];
  if (found === undefined || found.expectedBytes !== cell.bytes ||
    found.provenance.source !== cell.provenance.source ||
    found.provenance.licence !== cell.provenance.licence ||
    found.provenance.date !== cell.provenance.date)
    return { state: "UNKNOWN", reason: "metadata-mismatch" };
  if (found.state !== "saved" || found.cause !== "present")
    return { state: "UNKNOWN", reason: found.cause };
  return { state: "saved", reason: "present" };
}
function changeList(before: ManifestCellSnapshot | null, after: ManifestCellSnapshot | null): readonly ChangeKind[] {
  if (before === null) return ["added"];
  if (after === null) return ["removed"];
  const changed: ChangeKind[] = [];
  if (before.provenance.source !== after.provenance.source) changed.push("source");
  if (before.provenance.licence !== after.provenance.licence) changed.push("licence");
  if (before.provenance.date !== after.provenance.date) changed.push("date");
  if (before.bytes !== after.bytes) changed.push("bytes");
  return changed.length === 0 ? ["unchanged"] : changed;
}
function priorityFor(changes: readonly ChangeKind[], local: CopyState): FollowUpPriority {
  if (changes.includes("removed") || changes.includes("source") || changes.includes("licence") || local === "UNKNOWN")
    return "review-first";
  if (changes[0] !== "unchanged") return "review";
  return "no-change";
}
function questionFor(changes: readonly ChangeKind[], local: CopyState): string {
  if (changes.includes("removed")) return "Is this information still needed, and where is its replacement source?";
  if (changes.includes("added")) return "Should this newly listed information be saved before departure?";
  if (changes.includes("licence")) return "Has the source licence changed and does the planned use remain permitted?";
  if (changes.includes("source")) return "Which source should be used and what changed?";
  if (changes.includes("date")) return "Does the new source date change the information to review?";
  if (changes.includes("bytes")) return "Has the file size changed enough to affect download planning?";
  if (local === "UNKNOWN") return "Can the local copy be checked before relying on it?";
  return "No manifest change is listed; physical conditions remain UNKNOWN.";
}
/** Pure comparison of source listings and local storage observations. No network, no writes. */
export function comparePackManifests(current: RegionManifest, proposed: RegionManifest,
  inventory: RegionInventory | null): ChangeImpact {
  const before = validateManifest(current);
  const after = validateManifest(proposed);
  const sameRegion = before.regionId === after.regionId;
  const beforeMap = new Map(before.cells.map((cell) => [cell.id, cell]));
  const afterMap = new Map(after.cells.map((cell) => [cell.id, cell]));
  const ids = [...new Set([...before.cells.map((c) => c.id), ...after.cells.map((c) => c.id)])];
  const rows: ChangeRow[] = ids.map((id) => {
    const oldCell = beforeMap.get(id) ?? null;
    const newCell = afterMap.get(id) ?? null;
    const changes = changeList(oldCell, newCell);
    const local = sameRegion ? localCopyFor(oldCell, inventory, before.regionId) :
      { state: "UNKNOWN" as const, reason: "different-region" };
    return { id, before: oldCell, after: newCell, kind: changes[0] ?? "unchanged", changes,
      localCopy: local.state, localReason: local.reason,
      priority: priorityFor(changes, local.state), question: questionFor(changes, local.state) };
  });
  const bytes = (cells: readonly ManifestCellSnapshot[]): number =>
    cells.reduce((sum, cell) => sum + cell.bytes, 0);
  const beforeBytes = bytes(before.cells);
  const afterBytes = bytes(after.cells);
  return { regionId: before.regionId, status: sameRegion ? "ready" : "UNKNOWN", physicalAccess: "UNKNOWN",
    rows, added: rows.filter((row) => row.kind === "added").length,
    removed: rows.filter((row) => row.kind === "removed").length,
    modified: rows.filter((row) => !["added", "removed", "unchanged"].includes(row.kind)).length,
    unchanged: rows.filter((row) => row.kind === "unchanged").length,
    locallySaved: rows.filter((row) => row.localCopy === "saved").length,
    localUnknown: rows.filter((row) => row.localCopy === "UNKNOWN").length,
    totalBeforeBytes: beforeBytes, totalAfterBytes: afterBytes, deltaBytes: afterBytes - beforeBytes,
    followUpCount: rows.filter((row) => row.priority !== "no-change").length };
}
export function pagePackChanges(impact: ChangeImpact, opts: ChangePageOptions): ChangePage {
  if (!Number.isSafeInteger(opts.offset) || opts.offset < 0 || !Number.isSafeInteger(opts.limit) ||
    opts.limit < 1 || opts.limit > 100 || opts.search.length > 160 ||
    !["listed", "id", "largest", "source", "priority"].includes(opts.sort)) throw new RangeError("Invalid page options");
  const phrase = opts.search.toLocaleLowerCase();
  const rows = impact.rows.filter((row) => {
    const matched = row.id.toLocaleLowerCase().includes(phrase) ||
      (row.after?.provenance.source ?? row.before?.provenance.source ?? "").toLocaleLowerCase().includes(phrase);
    const filter = opts.filter === "all" || (opts.filter === "changed" && row.kind !== "unchanged") ||
      (opts.filter === "UNKNOWN" && row.localCopy === "UNKNOWN") ||
      (opts.filter === "saved" && row.localCopy === "saved") || row.changes.includes(opts.filter as ChangeKind);
    return matched && filter;
  });
  if (opts.sort === "id") rows.sort((a, b) => a.id.localeCompare(b.id));
  else if (opts.sort === "largest") rows.sort((a, b) => (b.after?.bytes ?? b.before?.bytes ?? 0) -
    (a.after?.bytes ?? a.before?.bytes ?? 0) || a.id.localeCompare(b.id));
  else if (opts.sort === "source") rows.sort((a, b) =>
    (a.after?.provenance.source ?? "").localeCompare(b.after?.provenance.source ?? "") || a.id.localeCompare(b.id));
  else if (opts.sort === "priority") rows.sort((a, b) =>
    (["review-first", "review", "no-change"].indexOf(a.priority) -
      ["review-first", "review", "no-change"].indexOf(b.priority)) || a.id.localeCompare(b.id));
  return { rows: rows.slice(opts.offset, opts.offset + opts.limit), total: rows.length,
    previous: opts.offset > 0, next: opts.offset + opts.limit < rows.length };
}
export function safeRegionFilename(region: string, suffix: "txt" | "json"): string {
  const normalized = region.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "region";
  return `offline-pack-change-${normalized}.${suffix}`;
}
export function exportImpactJson(impact: ChangeImpact, date: string): string {
  if (!validSourceDate(date)) throw new TypeError("Invalid report date");
  // A report contains source listing metadata only: never pack contents or user location.
  return JSON.stringify({ schema: "offline-pack-change-impact-v1", date,
    regionId: impact.regionId, status: impact.status, physicalAccess: "UNKNOWN", counts: {
      added: impact.added, removed: impact.removed, modified: impact.modified,
      unchanged: impact.unchanged, locallySaved: impact.locallySaved, localUnknown: impact.localUnknown },
    bytes: { before: impact.totalBeforeBytes, after: impact.totalAfterBytes, difference: impact.deltaBytes },
    rows: impact.rows.map((row) => ({ id: row.id, changes: row.changes,
      before: row.before, after: row.after, localCopy: row.localCopy, localReason: row.localReason,
      priority: row.priority, question: row.question, physicalAccess: "UNKNOWN" })) }, null, 2) + "\n";
}
function cleanLine(value: string): string {
  return [...value].map((point) => safeCharacters(point) ? point : " ").join("").replace(/\s+/g, " ").trim();
}
export function exportImpactText(impact: ChangeImpact, language: Language): string {
  const french = language === "fr";
  const label = (en: string, fr: string): string => french ? fr : en;
  const colon = french ? "\u00a0:" : ":";
  const out = [label("Offline pack change impact", "Incidence des changements du pack hors ligne"),
    `${label("Region", "Région")}${colon} ${cleanLine(impact.regionId)}`,
    `${label("Comparison", "Comparaison")}${colon} ${impact.status}`,
    `${label("Physical access", "Accessibilité physique")}${colon} UNKNOWN`,
    `${label("Added", "Ajoutés")}${colon} ${impact.added}`,
    `${label("Removed", "Retirés")}${colon} ${impact.removed}`,
    `${label("Modified", "Modifiés")}${colon} ${impact.modified}`,
    `${label("Local copies UNKNOWN", "Copies locales UNKNOWN")}${colon} ${impact.localUnknown}`,
    label("This is a data-planning comparison, not an accessibility assessment.",
      "Cette comparaison concerne les données, pas l’accessibilité physique."), ""];
  for (const row of impact.rows) {
    out.push(`${cleanLine(row.id)} — ${row.changes.join(", ")} — ${row.localCopy}`);
    out.push(`${label("Source", "Source")}${colon} ${cleanLine(row.after?.provenance.source ?? row.before?.provenance.source ?? "UNKNOWN")}`);
    out.push(`${label("Licence", "Licence")}${colon} ${cleanLine(row.after?.provenance.licence ?? row.before?.provenance.licence ?? "UNKNOWN")}`);
    out.push(`${label("Source date", "Date de la source")}${colon} ${row.after?.provenance.date ?? row.before?.provenance.date ?? "UNKNOWN"}`);
    out.push(`${label("Follow-up question", "Question de suivi")}${colon} ${cleanLine(row.question)}`, "");
  }
  return out.join("\n") + "\n";
}
