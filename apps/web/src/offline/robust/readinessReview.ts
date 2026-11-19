import type { RegionManifest, Provenance, StorageEstimate } from "./regionDownload";
import type { RegionInventory, InventoryCell } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** A device reading is not a statement about a physical location. */
export type ReadinessState = "saved" | "UNKNOWN";
export type ReadinessReason = "present" | "not-downloaded" | "out-of-date" |
  "unreadable" | "mismatched-metadata" | "unlisted" | "invalid-listing";
export type SuggestedStep = "none" | "download" | "inspect" | "review-source";
export type ReviewStatus = "complete" | "partial" | "UNKNOWN";

export interface ReadinessRow {
  readonly id: string;
  readonly state: ReadinessState;
  readonly reason: ReadinessReason;
  readonly expectedBytes: number | null;
  readonly source: Provenance | null;
  readonly observedSource: Provenance | null;
  readonly tier: "UNKNOWN";
  readonly nextStep: SuggestedStep;
}

export interface ReadinessTotals {
  readonly listed: number;
  readonly saved: number;
  readonly unknown: number;
  readonly missing: number;
  readonly stale: number;
  readonly unreadable: number;
  readonly conflicting: number;
  readonly extra: number;
  readonly listedBytes: number | null;
  readonly savedBytes: number | null;
  readonly remainingBytes: number | null;
}

export interface ReadinessReview {
  readonly schema: "offline-readiness-v1";
  readonly regionId: string;
  readonly status: ReviewStatus;
  readonly rows: readonly ReadinessRow[];
  readonly totals: ReadinessTotals;
  readonly findings: readonly string[];
  readonly estimate: ReadinessSpace;
}

export interface ReadinessSpace {
  readonly state: "sufficient" | "low" | "UNKNOWN";
  readonly freeBytes: number | null;
  readonly neededBytes: number | null;
  readonly reserveBytes: number;
}

export interface ReadinessOptions {
  readonly reserveBytes?: number;
  readonly maxCells?: number;
  readonly maxBytes?: number;
}

const DEFAULT_MAX_CELLS = 50_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_RESERVE = 1024 * 1024;

function same(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function dateOk(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value;
}

function safeId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value) && !value.includes("..");
}

function soundSource(value: Provenance): boolean {
  return value.source.trim().length > 0 && value.source.length <= 500 &&
    OPEN_LICENCES.some((licence) => licence === value.licence) && dateOk(value.date) &&
    !/[\p{Cc}\p{Cf}]/u.test(value.source);
}

function safeAdd(total: number | null, next: number): number | null {
  if (total === null || !Number.isSafeInteger(next) || next < 0) return null;
  const sum = total + next;
  return Number.isSafeInteger(sum) ? sum : null;
}

function rowFor(cell: RegionManifest["cells"][number], observed: InventoryCell | undefined): ReadinessRow {
  const common = {
    id: cell.id, expectedBytes: cell.bytes, source: cell.provenance,
    observedSource: observed?.provenance ?? null, tier: "UNKNOWN" as const,
  };
  if (!observed) {
    return { ...common, state: "UNKNOWN", reason: "unreadable", nextStep: "inspect" };
  }
  if (observed.id !== cell.id || observed.expectedBytes !== cell.bytes ||
      !same(observed.provenance, cell.provenance)) {
    return { ...common, state: "UNKNOWN", reason: "mismatched-metadata", nextStep: "review-source" };
  }
  switch (observed.cause) {
    case "present":
      if (observed.state === "saved") return {
        ...common, state: "saved", reason: "present", nextStep: "none",
      };
      return { ...common, state: "UNKNOWN", reason: "unreadable", nextStep: "inspect" };
    case "missing": return {
      ...common, state: "UNKNOWN", reason: "not-downloaded", nextStep: "download",
    };
    case "stale": return {
      ...common, state: "UNKNOWN", reason: "out-of-date", nextStep: "download",
    };
    case "unreadable": return {
      ...common, state: "UNKNOWN", reason: "unreadable", nextStep: "inspect",
    };
  }
}

function invalidRow(cell: RegionManifest["cells"][number]): ReadinessRow {
  return {
    id: cell.id, state: "UNKNOWN", reason: "invalid-listing",
    expectedBytes: Number.isSafeInteger(cell.bytes) && cell.bytes >= 0 ? cell.bytes : null,
    source: null, observedSource: null, tier: "UNKNOWN", nextStep: "inspect",
  };
}

/** Check an exact manifest and the complete latest inventory. No implicit network access. */
export function createReadinessReview(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  estimate: StorageEstimate = {},
  options: ReadinessOptions = {},
): ReadinessReview {
  const reserve = options.reserveBytes ?? DEFAULT_RESERVE;
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(reserve) || reserve < 0 ||
      !Number.isSafeInteger(maxCells) || maxCells < 1 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("Invalid readiness limits");
  }
  const findings: string[] = [];
  const ids = new Set<string>();
  let listedBytes: number | null = 0;
  if (!safeId(manifest.regionId)) findings.push("region-id");
  if (manifest.cells.length > maxCells) findings.push("too-many-cells");
  for (const cell of manifest.cells) {
    if (!safeId(cell.id)) findings.push(`cell-id:${cell.id}`);
    if (ids.has(cell.id)) findings.push(`duplicate-cell:${cell.id}`);
    ids.add(cell.id);
    if (!Number.isSafeInteger(cell.bytes) || cell.bytes < 0) findings.push(`size:${cell.id}`);
    if (!soundSource(cell.provenance)) findings.push(`source:${cell.id}`);
    listedBytes = safeAdd(listedBytes, cell.bytes);
  }
  if (listedBytes === null || listedBytes > maxBytes) findings.push("region-size");
  if (inventory === null) findings.push("inventory-unavailable");
  else if (inventory.regionId !== manifest.regionId) findings.push("region-mismatch");
  const observations = new Map<string, InventoryCell>();
  if (inventory !== null && inventory.regionId === manifest.regionId) {
    for (const row of inventory.cells) {
      if (observations.has(row.id)) findings.push(`duplicate-inventory:${row.id}`);
      observations.set(row.id, row);
    }
    // An incomplete inventory must not be treated as a complete scan.
    if (inventory.cells.length !== manifest.cells.length) findings.push("inventory-count");
  }
  const trustworthy = findings.length === 0;
  const rows: ReadinessRow[] = manifest.cells.map((cell) =>
    trustworthy ? rowFor(cell, observations.get(cell.id)) : invalidRow(cell));
  if (trustworthy) {
    for (const observed of observations.values()) {
      if (ids.has(observed.id)) continue;
      rows.push({
        id: observed.id, state: "UNKNOWN", reason: "unlisted", expectedBytes: null,
        source: null, observedSource: observed.provenance, tier: "UNKNOWN", nextStep: "inspect",
      });
    }
  }
  const saved = rows.filter((row) => row.state === "saved");
  const unknown = rows.filter((row) => row.state === "UNKNOWN");
  let savedBytes: number | null = trustworthy ? 0 : null;
  for (const row of saved) savedBytes = safeAdd(savedBytes, row.expectedBytes ?? -1);
  const remainingBytes = listedBytes === null || savedBytes === null ? null : listedBytes - savedBytes;
  const counts: ReadinessTotals = {
    listed: manifest.cells.length,
    saved: saved.length,
    unknown: unknown.length,
    missing: rows.filter((row) => row.reason === "not-downloaded").length,
    stale: rows.filter((row) => row.reason === "out-of-date").length,
    unreadable: rows.filter((row) => row.reason === "unreadable" || row.reason === "invalid-listing").length,
    conflicting: rows.filter((row) => row.reason === "mismatched-metadata").length,
    extra: rows.filter((row) => row.reason === "unlisted").length,
    listedBytes,
    savedBytes,
    remainingBytes,
  };
  const space = assessReadinessSpace(remainingBytes, estimate, reserve);
  const state: ReviewStatus = !trustworthy || rows.some((row) =>
    row.reason === "unreadable" || row.reason === "mismatched-metadata" || row.reason === "unlisted") ?
    "UNKNOWN" : unknown.length === 0 ? "complete" : "partial";
  return {
    schema: "offline-readiness-v1", regionId: manifest.regionId,
    status: state, rows, totals: counts, findings, estimate: space,
  };
}

/** Quota is advisory and never changes any cell state. */
export function assessReadinessSpace(
  neededBytes: number | null,
  estimate: StorageEstimate,
  reserveBytes = DEFAULT_RESERVE,
): ReadinessSpace {
  if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 0) throw new RangeError("Invalid reserve");
  const { quota, usage } = estimate;
  const valid = quota !== undefined && usage !== undefined &&
    Number.isFinite(quota) && Number.isFinite(usage) &&
    Number.isSafeInteger(quota) && Number.isSafeInteger(usage) &&
    quota >= 0 && usage >= 0 && usage <= quota;
  const free = valid && quota !== undefined && usage !== undefined ? quota - usage : null;
  if (neededBytes === null || !Number.isSafeInteger(neededBytes) || neededBytes < 0 || free === null) {
    return { state: "UNKNOWN", freeBytes: free, neededBytes, reserveBytes };
  }
  return {
    state: free >= neededBytes + reserveBytes ? "sufficient" : "low",
    freeBytes: free, neededBytes, reserveBytes,
  };
}

export type ReadinessFilter = "all" | "saved" | "unknown" | "download" | "inspect" | "source";
export type ReadinessOrder = "listed" | "id" | "size-asc" | "size-desc";
export interface ReadinessQuery {
  readonly search?: string;
  readonly filter?: ReadinessFilter;
  readonly order?: ReadinessOrder;
  readonly offset?: number;
  readonly limit?: number;
}
export interface ReadinessPage {
  readonly rows: readonly ReadinessRow[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

/** Deterministic browser-facing query, capped to protect screen-reader navigation. */
export function browseReadiness(review: ReadinessReview, query: ReadinessQuery = {}): ReadinessPage {
  const search = (query.search ?? "").trim().slice(0, 160).normalize("NFKC").toLocaleLowerCase();
  const filter = query.filter ?? "all";
  const order = query.order ?? "listed";
  const offset = Number.isSafeInteger(query.offset) && (query.offset ?? 0) >= 0 ? query.offset ?? 0 : 0;
  const limit = Number.isSafeInteger(query.limit) ? Math.max(1, Math.min(query.limit ?? 12, 50)) : 12;
  const rows = review.rows.filter((row) => {
    if (filter === "saved" && row.state !== "saved") return false;
    if (filter === "unknown" && row.state !== "UNKNOWN") return false;
    if (filter === "download" && row.nextStep !== "download") return false;
    if (filter === "inspect" && row.nextStep !== "inspect") return false;
    if (filter === "source" && row.nextStep !== "review-source") return false;
    return !search || [row.id, row.reason, row.source?.source, row.source?.licence,
      row.source?.date, row.observedSource?.source, row.observedSource?.date]
      .filter((part): part is string => typeof part === "string")
      .join(" ").normalize("NFKC").toLocaleLowerCase().includes(search);
  });
  if (order !== "listed") rows.sort((a, b) => {
    if (order === "id") return a.id.localeCompare(b.id);
    const aSize = a.expectedBytes ?? -1;
    const bSize = b.expectedBytes ?? -1;
    return (order === "size-asc" ? aSize - bSize : bSize - aSize) || a.id.localeCompare(b.id);
  });
  return { rows: rows.slice(offset, offset + limit), total: rows.length, offset, limit,
    hasPrevious: offset > 0, hasNext: offset + limit < rows.length };
}

/** A local metadata-only document. Never contains stored data bytes. */
export function serializeReadiness(review: ReadinessReview): string {
  return `${JSON.stringify(review, null, 2)}\n`;
}
