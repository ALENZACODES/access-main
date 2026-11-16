import { type RegionInventory, type InventoryCell } from "./regionInventory";
import { type RegionManifest, type Provenance } from "./regionDownload";

/** Storage cleanup is deliberately limited to cells in the active manifest. */
export type CleanupReason = "saved" | "stale" | "unreadable" | "missing";
export type CleanupFilter = "all" | "saved" | "stale" | "unreadable" | "unknown";
export type CleanupOrder = "manifest" | "largest" | "smallest" | "source";
export type CleanupIssue =
  | "region-mismatch" | "duplicate-manifest" | "duplicate-inventory"
  | "unlisted-cell" | "manifest-mismatch" | "invalid-size" | "invalid-provenance";
export interface CleanupFinding { readonly code: CleanupIssue; readonly cellId: string | null; }
export interface CleanupCandidate {
  readonly id: string;
  readonly reason: CleanupReason;
  readonly expectedBytes: number;
  readonly provenance: Provenance;
  readonly position: number;
  readonly removable: boolean;
}
export interface CleanupPreview {
  readonly regionId: string;
  readonly candidates: readonly CleanupCandidate[];
  readonly findings: readonly CleanupFinding[];
  readonly ready: boolean;
  readonly requestedCount: number;
  readonly removableCount: number;
  readonly possibleBytes: number;
  readonly bytesKnown: boolean;
  readonly unknownCount: number;
  readonly savedCount: number;
}
export interface CleanupPage {
  readonly cells: readonly CleanupCandidate[];
  readonly page: number;
  readonly pages: number;
  readonly matched: number;
  readonly total: number;
  readonly first: number;
  readonly last: number;
}

function sameSource(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}
function goodSize(bytes: number): boolean {
  return Number.isSafeInteger(bytes) && bytes >= 0;
}
function validSource(p: Provenance): boolean {
  return p.source.trim().length > 0 && p.licence.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.date);
}
function reason(cell: InventoryCell): CleanupReason {
  return cell.state === "saved" ? "saved" : cell.cause === "stale" ? "stale" :
    cell.cause === "unreadable" ? "unreadable" : "missing";
}

/**
 * Compare manifest and inventory without trusting an inventory supplied by a
 * stale tab. A changed source, licence, date or byte count blocks deletion.
 * Unknown data never becomes available data in the preview.
 */
export function planCellCleanup(
  manifest: RegionManifest,
  inventory: RegionInventory,
  requested: readonly string[],
): CleanupPreview {
  const findings: CleanupFinding[] = [];
  const add = (code: CleanupIssue, cellId: string | null): void => {
    findings.push({ code, cellId });
  };
  if (manifest.regionId !== inventory.regionId) add("region-mismatch", null);
  const declared = new Map<string, RegionManifest["cells"][number]>();
  for (const cell of manifest.cells) {
    if (declared.has(cell.id)) add("duplicate-manifest", cell.id);
    declared.set(cell.id, cell);
    if (!goodSize(cell.bytes)) add("invalid-size", cell.id);
    if (!validSource(cell.provenance)) add("invalid-provenance", cell.id);
  }
  const inspected = new Map<string, InventoryCell>();
  for (const cell of inventory.cells) {
    if (inspected.has(cell.id)) add("duplicate-inventory", cell.id);
    inspected.set(cell.id, cell);
    const expected = declared.get(cell.id);
    if (!expected) { add("unlisted-cell", cell.id); continue; }
    if (cell.expectedBytes !== expected.bytes ||
      !sameSource(cell.provenance, expected.provenance)) {
      add("manifest-mismatch", cell.id);
    }
  }
  for (const cell of manifest.cells) {
    if (!inspected.has(cell.id)) add("manifest-mismatch", cell.id);
  }
  const selected = new Set(requested);
  const candidates: CleanupCandidate[] = [];
  for (const [position, cell] of manifest.cells.entries()) {
    if (!selected.has(cell.id)) continue;
    const current = inspected.get(cell.id);
    if (!current) continue;
    const disposition = reason(current);
    candidates.push({
      id: cell.id,
      reason: disposition,
      expectedBytes: cell.bytes,
      provenance: cell.provenance,
      position,
      removable: disposition !== "missing",
    });
  }
  const removable = candidates.filter((cell) => cell.removable);
  let possibleBytes = 0;
  let bytesKnown = findings.length === 0;
  for (const candidate of removable) {
    if (!goodSize(candidate.expectedBytes) ||
      !Number.isSafeInteger(possibleBytes + candidate.expectedBytes)) {
      bytesKnown = false;
    } else {
      possibleBytes += candidate.expectedBytes;
    }
  }
  return {
    regionId: manifest.regionId, candidates, findings,
    ready: findings.length === 0,
    requestedCount: requested.length,
    removableCount: removable.length,
    possibleBytes: bytesKnown ? possibleBytes : 0,
    bytesKnown,
    unknownCount: candidates.filter((cell) => cell.reason !== "saved").length,
    savedCount: candidates.filter((cell) => cell.reason === "saved").length,
  };
}

/** Never select an unlisted cell or a cell that has no stored copy. */
export function allowedCleanupIds(preview: CleanupPreview): readonly string[] {
  if (!preview.ready) return [];
  return preview.candidates.filter((cell) => cell.removable).map((cell) => cell.id);
}

/**
 * Search only display metadata. No geolocation, accessibility classification,
 * or network lookup occurs during filtering.
 */
export function browseCleanup(
  inventory: RegionInventory,
  options: {
    readonly text?: string;
    readonly filter?: CleanupFilter;
    readonly order?: CleanupOrder;
    readonly page?: number;
    readonly pageSize?: number;
  } = {},
): CleanupPage {
  const filter = options.filter ?? "all";
  const order = options.order ?? "manifest";
  const pageSize = options.pageSize ?? 10;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new RangeError("Invalid cleanup page size");
  }
  const search = (options.text ?? "").trim().toLocaleLowerCase();
  const all: CleanupCandidate[] = inventory.cells.map((cell, position) => ({
    id: cell.id, reason: reason(cell), expectedBytes: cell.expectedBytes,
    provenance: cell.provenance, position,
    removable: reason(cell) !== "missing",
  }));
  const matchesFilter = (cell: CleanupCandidate): boolean =>
    filter === "all" || cell.reason === filter ||
    (filter === "unknown" && cell.reason !== "saved");
  const matchesText = (cell: CleanupCandidate): boolean =>
    !search || [cell.id, cell.provenance.source, cell.provenance.licence,
      cell.provenance.date].some((value) => value.toLocaleLowerCase().includes(search));
  const matching = all.filter((cell) => matchesFilter(cell) && matchesText(cell));
  if (order === "largest") matching.sort((a, b) => b.expectedBytes - a.expectedBytes || a.position - b.position);
  if (order === "smallest") matching.sort((a, b) => a.expectedBytes - b.expectedBytes || a.position - b.position);
  if (order === "source") matching.sort((a, b) =>
    a.provenance.source.localeCompare(b.provenance.source) || a.position - b.position);
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const wanted = options.page ?? 0;
  const page = Number.isSafeInteger(wanted) ? Math.max(0, Math.min(wanted, pages - 1)) : 0;
  const first = page * pageSize;
  const cells = matching.slice(first, first + pageSize);
  return {
    cells, page, pages, matched: matching.length, total: all.length,
    first: cells.length ? first + 1 : 0,
    last: first + cells.length,
  };
}

export interface CleanupSourceGroup {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly ids: readonly string[];
  readonly savedCount: number;
  readonly unknownCount: number;
  readonly expectedBytes: number;
}

/** Groups only explicit provenance; no source is silently assigned. */
export function groupCleanupSources(inventory: RegionInventory): readonly CleanupSourceGroup[] {
  const map = new Map<string, {
    source: string; licence: string; date: string; ids: string[];
    savedCount: number; unknownCount: number; expectedBytes: number;
  }>();
  for (const cell of inventory.cells) {
    const p = cell.provenance;
    const key = JSON.stringify([p.source, p.licence, p.date]);
    let group = map.get(key);
    if (!group) {
      group = { ...p, ids: [], savedCount: 0, unknownCount: 0, expectedBytes: 0 };
      map.set(key, group);
    }
    group.ids.push(cell.id);
    if (cell.state === "saved") group.savedCount += 1;
    else group.unknownCount += 1;
    group.expectedBytes += cell.expectedBytes;
  }
  return [...map.values()].sort((a, b) =>
    a.source.localeCompare(b.source) || a.date.localeCompare(b.date));
}

/** An explicit selection is bounded to limit accidental large deletions. */
export const MAX_CLEANUP_SELECTION = 250;
export function boundedCleanupSelection(
  inventory: RegionInventory,
  ids: readonly string[],
  maximum = MAX_CLEANUP_SELECTION,
): readonly string[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_CLEANUP_SELECTION) {
    throw new RangeError("Invalid cleanup selection limit");
  }
  const allowed = new Set(inventory.cells.filter((cell) =>
    cell.cause !== "missing").map((cell) => cell.id));
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id) || !allowed.has(id)) continue;
    seen.add(id);
    if (unique.length === maximum) break;
    unique.push(id);
  }
  return unique;
}

/** Existing selected cells may become absent after an inventory refresh. */
export function reconcileCleanupSelection(
  inventory: RegionInventory,
  ids: readonly string[],
): readonly string[] {
  return boundedCleanupSelection(inventory, ids);
}
