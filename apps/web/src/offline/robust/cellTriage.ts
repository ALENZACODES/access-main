import { type InventoryCell, type RegionInventory } from "./regionInventory";
import { type RegionManifest } from "./regionDownload";

/** A status of UNKNOWN is retained regardless of why bytes are absent. */
export type TriageFilter = "all" | "unknown" | "saved" | "missing" | "stale" | "unreadable";
export type TriageOrder = "manifest" | "id" | "largest" | "smallest" | "source" | "date";
export interface TriageQuery {
  readonly text: string;
  readonly filter: TriageFilter;
  readonly order: TriageOrder;
  readonly page: number;
  readonly pageSize: number;
}
export interface TriagePage {
  readonly cells: readonly InventoryCell[];
  readonly matched: number;
  readonly total: number;
  readonly pages: number;
  readonly page: number;
  readonly matchedUnknown: number;
  readonly matchedBytes: number;
  readonly matchedUnknownBytes: number;
  readonly start: number;
  readonly end: number;
}
export interface TriageCounts {
  readonly total: number;
  readonly saved: number;
  readonly unknown: number;
  readonly missing: number;
  readonly stale: number;
  readonly unreadable: number;
}

const FILTERS: readonly TriageFilter[] = ["all", "unknown", "saved", "missing", "stale", "unreadable"];
const ORDERS: readonly TriageOrder[] = ["manifest", "id", "largest", "smallest", "source", "date"];
export const TRIAGE_PAGE_SIZE = 15;
export const TRIAGE_MAX_QUERY = 160;

export function isTriageFilter(value: string): value is TriageFilter {
  return FILTERS.some((option) => option === value);
}
export function isTriageOrder(value: string): value is TriageOrder {
  return ORDERS.some((option) => option === value);
}

/** Normalise user-entered search terms without guessing geographic meaning. */
export function normaliseTriageQuery(text: string): string {
  return text.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, TRIAGE_MAX_QUERY).toLocaleLowerCase();
}

function haystack(cell: InventoryCell): string {
  return [
    cell.id,
    cell.provenance.source,
    cell.provenance.licence,
    cell.provenance.date,
  ].join(" ").normalize("NFKC").toLocaleLowerCase();
}

function filterCell(cell: InventoryCell, filter: TriageFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "unknown": return cell.state === "unknown";
    case "saved": return cell.state === "saved";
    case "missing": return cell.cause === "missing";
    case "stale": return cell.cause === "stale";
    case "unreadable": return cell.cause === "unreadable";
  }
}

function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareCells(a: InventoryCell, b: InventoryCell, order: TriageOrder): number {
  switch (order) {
    case "id": return cmpText(a.id, b.id);
    case "largest": return b.expectedBytes - a.expectedBytes || cmpText(a.id, b.id);
    case "smallest": return a.expectedBytes - b.expectedBytes || cmpText(a.id, b.id);
    case "source": return cmpText(a.provenance.source, b.provenance.source) || cmpText(a.id, b.id);
    case "date": return cmpText(b.provenance.date, a.provenance.date) || cmpText(a.id, b.id);
    case "manifest": return 0;
  }
}

export function triageCounts(inventory: RegionInventory): TriageCounts {
  const counts = { total: inventory.cells.length, saved: 0, unknown: 0, missing: 0, stale: 0, unreadable: 0 };
  for (const cell of inventory.cells) {
    if (cell.state === "saved") counts.saved++;
    else counts.unknown++;
    if (cell.cause === "missing") counts.missing++;
    if (cell.cause === "stale") counts.stale++;
    if (cell.cause === "unreadable") counts.unreadable++;
  }
  return counts;
}

/** Selection is limited to identifiers in the supplied inventory. */
export function triagePage(inventory: RegionInventory, query: TriageQuery): TriagePage {
  if (!isTriageFilter(query.filter) || !isTriageOrder(query.order)) throw new TypeError("Invalid triage option");
  if (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) {
    throw new RangeError("Invalid triage page size");
  }
  if (!Number.isSafeInteger(query.page) || query.page < 0) throw new RangeError("Invalid triage page");
  const needle = normaliseTriageQuery(query.text);
  const filtered = inventory.cells.filter((cell) => filterCell(cell, query.filter) && haystack(cell).includes(needle));
  if (query.order !== "manifest") filtered.sort((a, b) => compareCells(a, b, query.order));
  const pages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, pages - 1);
  const start = page * query.pageSize;
  let matchedBytes = 0;
  let matchedUnknownBytes = 0;
  let matchedUnknown = 0;
  for (const cell of filtered) {
    matchedBytes += cell.expectedBytes;
    if (cell.state === "unknown") {
      matchedUnknown++;
      matchedUnknownBytes += cell.expectedBytes;
    }
  }
  return {
    cells: filtered.slice(start, start + query.pageSize),
    matched: filtered.length,
    total: inventory.cells.length,
    pages,
    page,
    matchedUnknown,
    matchedBytes,
    matchedUnknownBytes,
    start: filtered.length ? start + 1 : 0,
    end: Math.min(start + query.pageSize, filtered.length),
  };
}

/** A selection cannot turn a saved cell into a missing one or request unlisted data. */
export function selectableIds(inventory: RegionInventory, ids: readonly string[]): readonly string[] {
  const allowed = new Set(inventory.cells.filter((cell) => cell.state === "unknown").map((cell) => cell.id));
  const found = new Set<string>();
  for (const id of ids) if (allowed.has(id)) found.add(id);
  return inventory.cells.filter((cell) => found.has(cell.id)).map((cell) => cell.id);
}

export interface SelectedDownloadPlan {
  readonly manifest: RegionManifest;
  readonly ids: readonly string[];
  readonly totalBytes: number;
  readonly skipped: readonly string[];
}

/** Explicit subset for an on-demand download. No automatic requests are made. */
export function selectedDownloadPlan(
  manifest: RegionManifest,
  inventory: RegionInventory,
  requested: readonly string[],
): SelectedDownloadPlan {
  if (manifest.regionId !== inventory.regionId) throw new Error("Region mismatch");
  const ids = selectableIds(inventory, requested);
  const idSet = new Set(ids);
  const cells = manifest.cells.filter((cell) => idSet.has(cell.id));
  const skipped = [...new Set(requested.filter((id) => !idSet.has(id)))];
  let totalBytes = 0;
  for (const cell of cells) {
    if (!Number.isSafeInteger(cell.bytes) || cell.bytes < 0 ||
      !Number.isSafeInteger(totalBytes + cell.bytes)) throw new RangeError("Invalid download size");
    totalBytes += cell.bytes;
  }
  return { manifest: { regionId: manifest.regionId, cells }, ids, totalBytes, skipped };
}

/** Keep a visible selection consistent with an updated inventory. */
export function reconcileTriageSelection(
  inventory: RegionInventory,
  selected: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(selectableIds(inventory, [...selected]));
}

export interface CauseGroup {
  readonly cause: InventoryCell["cause"];
  readonly count: number;
  readonly bytes: number;
  readonly ids: readonly string[];
}

export function triageCauseGroups(inventory: RegionInventory): readonly CauseGroup[] {
  const names: readonly InventoryCell["cause"][] = ["missing", "stale", "unreadable", "present"];
  return names.map((cause) => {
    const cells = inventory.cells.filter((cell) => cell.cause === cause);
    return {
      cause,
      count: cells.length,
      bytes: cells.reduce((sum, cell) => sum + cell.expectedBytes, 0),
      ids: cells.map((cell) => cell.id),
    };
  });
}

/** Client-side detail search never turns a substring match into a place claim. */
export function matchingCellIds(inventory: RegionInventory, text: string): readonly string[] {
  const needle = normaliseTriageQuery(text);
  return inventory.cells.filter((cell) => haystack(cell).includes(needle)).map((cell) => cell.id);
}
