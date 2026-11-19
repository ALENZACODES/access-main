import type { Provenance, RegionManifest, StorageEstimate } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** These findings concern offline copies; they do not describe a location. */
export type DiagnosticReason =
  | "saved"
  | "missing"
  | "stale"
  | "unreadable"
  | "not-inspected"
  | "metadata-conflict"
  | "unlisted"
  | "duplicate"
  | "invalid-listing"
  | "inventory-unavailable";

export type DiagnosticStatus = "saved" | "UNKNOWN";
export type DiagnosticAction = "none" | "download" | "inspect" | "review-source";

export interface DiagnosticCell {
  readonly id: string;
  readonly status: DiagnosticStatus;
  readonly reason: DiagnosticReason;
  readonly action: DiagnosticAction;
  readonly expectedBytes: number | null;
  readonly source: Provenance | null;
  readonly observedSource: Provenance | null;
  /** A documentation tier must come from a separately supplied record. */
  readonly tier: "UNKNOWN";
}

export interface DiagnosticSummary {
  readonly regionId: string;
  readonly status: "complete" | "partial" | "UNKNOWN";
  readonly cells: readonly DiagnosticCell[];
  readonly listed: number;
  readonly saved: number;
  readonly unknown: number;
  readonly missing: number;
  readonly stale: number;
  readonly unreadable: number;
  readonly conflicts: number;
  readonly unlisted: number;
  readonly listedBytes: number | null;
  readonly savedBytes: number | null;
  readonly freeBytes: number | null;
  readonly diagnostics: readonly string[];
}

function canonicalDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function safeSource(value: Provenance): boolean {
  return Boolean(value.source.trim()) && value.source.length <= 500 &&
    OPEN_LICENCES.some((licence) => licence === value.licence) &&
    canonicalDay(value.date);
}

function safeId(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 160 &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) &&
    !value.includes("..");
}

function sameSource(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function safeNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function sumBytes(values: readonly number[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (!safeNumber(value)) return null;
    sum += value;
    if (!Number.isSafeInteger(sum)) return null;
  }
  return sum;
}

function unknownCell(
  id: string,
  reason: DiagnosticReason,
  expectedBytes: number | null,
  source: Provenance | null,
  observedSource: Provenance | null = null,
): DiagnosticCell {
  const action: DiagnosticAction = reason === "missing" || reason === "stale"
    ? "download" : reason === "metadata-conflict" || reason === "invalid-listing"
      ? "review-source" : "inspect";
  return { id, status: "UNKNOWN", reason, action, expectedBytes,
    source, observedSource, tier: "UNKNOWN" };
}

function inspectCell(
  expected: RegionManifest["cells"][number],
  actual: InventoryCell | undefined,
): DiagnosticCell {
  if (actual === undefined) {
    return unknownCell(expected.id, "not-inspected", expected.bytes, expected.provenance);
  }
  if (actual.expectedBytes !== expected.bytes ||
    !sameSource(actual.provenance, expected.provenance)) {
    return unknownCell(expected.id, "metadata-conflict", expected.bytes,
      expected.provenance, actual.provenance);
  }
  if (actual.cause === "missing") {
    return unknownCell(expected.id, "missing", expected.bytes, expected.provenance);
  }
  if (actual.cause === "stale") {
    return unknownCell(expected.id, "stale", expected.bytes, expected.provenance,
      actual.provenance);
  }
  if (actual.cause === "unreadable" || actual.state !== "saved" ||
    actual.cause !== "present") {
    return unknownCell(expected.id, "unreadable", expected.bytes,
      expected.provenance, actual.provenance);
  }
  return { id: expected.id, status: "saved", reason: "saved", action: "none",
    expectedBytes: expected.bytes, source: expected.provenance,
    observedSource: actual.provenance, tier: "UNKNOWN" };
}

/**
 * Pure fail-closed comparison. An inconsistent region never claims completion.
 * No network, persistence, or downloads are initiated by this function.
 */
export function inspectOfflineDiagnostics(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  estimate: StorageEstimate = {},
): DiagnosticSummary {
  const diagnostics: string[] = [];
  const expectedIds = new Set<string>();
  const invalidIds = new Set<string>();
  for (const cell of manifest.cells) {
    if (!safeId(cell.id) || !safeNumber(cell.bytes) || !safeSource(cell.provenance)) {
      invalidIds.add(cell.id);
      diagnostics.push(`invalid-listing:${cell.id}`);
    }
    if (expectedIds.has(cell.id)) {
      invalidIds.add(cell.id);
      diagnostics.push(`duplicate-listing:${cell.id}`);
    }
    expectedIds.add(cell.id);
  }
  if (!safeId(manifest.regionId)) diagnostics.push("invalid-region");
  if (inventory === null) diagnostics.push("inventory-unavailable");
  else if (inventory.regionId !== manifest.regionId) diagnostics.push("region-mismatch");

  const actualById = new Map<string, InventoryCell>();
  const duplicateActual = new Set<string>();
  if (inventory !== null && inventory.regionId === manifest.regionId) {
    for (const cell of inventory.cells) {
      if (actualById.has(cell.id)) {
        duplicateActual.add(cell.id);
        diagnostics.push(`duplicate-observation:${cell.id}`);
      }
      actualById.set(cell.id, cell);
    }
  }

  const fatal = diagnostics.some((reason) => reason === "invalid-region" ||
    reason === "inventory-unavailable" || reason === "region-mismatch");
  const cells: DiagnosticCell[] = manifest.cells.map((cell) => {
    if (invalidIds.has(cell.id)) return unknownCell(cell.id, "invalid-listing", null, null);
    if (fatal) return unknownCell(cell.id, "inventory-unavailable", cell.bytes,
      cell.provenance);
    if (duplicateActual.has(cell.id)) return unknownCell(cell.id, "duplicate", cell.bytes,
      cell.provenance);
    return inspectCell(cell, actualById.get(cell.id));
  });
  if (!fatal) {
    for (const [id, actual] of actualById) {
      if (!expectedIds.has(id)) {
        diagnostics.push(`unlisted:${id}`);
        cells.push(unknownCell(id, "unlisted", null, null, actual.provenance));
      }
    }
  }

  const listedBytes = invalidIds.size === 0 ?
    sumBytes(manifest.cells.map((cell) => cell.bytes)) : null;
  const savedBytes = !fatal && invalidIds.size === 0 && duplicateActual.size === 0 ?
    sumBytes(cells.filter((cell) => cell.status === "saved")
      .map((cell) => cell.expectedBytes ?? -1)) : null;
  const saved = cells.filter((cell) => cell.status === "saved").length;
  const unknown = cells.length - saved;
  const quota = estimate.quota;
  const usage = estimate.usage;
  const freeBytes = quota === undefined || usage === undefined ||
    !Number.isFinite(quota) || !Number.isFinite(usage) ||
    quota < 0 || usage < 0 || usage > quota ? null : Math.floor(quota - usage);
  const uncertain = diagnostics.length > 0 || cells.some((cell) =>
    cell.reason === "unreadable" || cell.reason === "not-inspected" ||
    cell.reason === "metadata-conflict" || cell.reason === "duplicate" ||
    cell.reason === "invalid-listing" || cell.reason === "inventory-unavailable");
  const status: DiagnosticSummary["status"] = uncertain ? "UNKNOWN" :
    unknown === 0 ? "complete" : "partial";
  return {
    regionId: manifest.regionId,
    status, cells, listed: manifest.cells.length,
    saved, unknown,
    missing: cells.filter((cell) => cell.reason === "missing").length,
    stale: cells.filter((cell) => cell.reason === "stale").length,
    unreadable: cells.filter((cell) => cell.reason === "unreadable" ||
      cell.reason === "not-inspected" || cell.reason === "inventory-unavailable").length,
    conflicts: cells.filter((cell) => cell.reason === "metadata-conflict" ||
      cell.reason === "duplicate" || cell.reason === "invalid-listing").length,
    unlisted: cells.filter((cell) => cell.reason === "unlisted").length,
    listedBytes, savedBytes, freeBytes, diagnostics,
  };
}

export type DiagnosticFilter = "all" | "saved" | "unknown" | "download" | "inspect";
export type DiagnosticOrder = "listed" | "id" | "bytes-desc" | "bytes-asc" | "reason";

export interface DiagnosticQuery {
  readonly filter: DiagnosticFilter;
  readonly order: DiagnosticOrder;
  readonly search: string;
  readonly offset: number;
  readonly limit: number;
}

export interface DiagnosticPage {
  readonly cells: readonly DiagnosticCell[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly next: boolean;
  readonly previous: boolean;
}

/** Display-only search. Pagination prevents excessively large document trees. */
export function queryOfflineDiagnostics(
  report: DiagnosticSummary,
  query: DiagnosticQuery,
): DiagnosticPage {
  const search = query.search.trim().slice(0, 160).normalize("NFKC").toLocaleLowerCase();
  const limit = Number.isSafeInteger(query.limit) ? Math.min(50, Math.max(1, query.limit)) : 12;
  const offset = Number.isSafeInteger(query.offset) && query.offset > 0 ? query.offset : 0;
  const cells = report.cells.filter((cell) => {
    if (query.filter === "saved" && cell.status !== "saved") return false;
    if (query.filter === "unknown" && cell.status !== "UNKNOWN") return false;
    if (query.filter === "download" && cell.action !== "download") return false;
    if (query.filter === "inspect" && cell.action !== "inspect" &&
      cell.action !== "review-source") return false;
    return [cell.id, cell.reason, cell.source?.source, cell.source?.licence,
      cell.source?.date, cell.observedSource?.source].filter((value): value is string =>
      value !== undefined).join("\n").normalize("NFKC")
      .toLocaleLowerCase().includes(search);
  });
  if (query.order !== "listed") {
    cells.sort((a, b) => {
      if (query.order === "id") return a.id.localeCompare(b.id);
      if (query.order === "reason") return a.reason.localeCompare(b.reason) ||
        a.id.localeCompare(b.id);
      if (query.order === "bytes-asc") return (a.expectedBytes ?? Number.MAX_SAFE_INTEGER) -
        (b.expectedBytes ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id);
      return (b.expectedBytes ?? -1) - (a.expectedBytes ?? -1) ||
        a.id.localeCompare(b.id);
    });
  }
  return { cells: cells.slice(offset, offset + limit), total: cells.length,
    limit, offset, previous: offset > 0, next: offset + limit < cells.length };
}

export interface DiagnosticExport {
  readonly schema: "offline-diagnostics-v1";
  readonly region: string;
  readonly recordedOn: string;
  readonly status: DiagnosticSummary["status"];
  readonly counts: Readonly<Pick<DiagnosticSummary,
    "listed" | "saved" | "unknown" | "missing" | "stale" | "unreadable" | "conflicts">>;
  readonly cells: readonly DiagnosticCell[];
}

/** Exports metadata only. A caller initiates saving the result. */
export function createDiagnosticExport(
  summary: DiagnosticSummary,
  recordedOn: string,
): DiagnosticExport {
  if (!canonicalDay(recordedOn)) throw new RangeError("Invalid report date");
  return { schema: "offline-diagnostics-v1", region: summary.regionId,
    recordedOn, status: summary.status,
    counts: { listed: summary.listed, saved: summary.saved, unknown: summary.unknown,
      missing: summary.missing, stale: summary.stale, unreadable: summary.unreadable,
      conflicts: summary.conflicts },
    cells: summary.cells,
  };
}

export function diagnosticFilename(region: string, date: string): string {
  const name = region.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `offline-diagnostics-${name}-${canonicalDay(date) ? date : "unknown"}.json`;
}

export function encodeDiagnosticExport(report: DiagnosticExport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
