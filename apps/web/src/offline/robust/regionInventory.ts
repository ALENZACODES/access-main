import {
  type CellStore,
  type Provenance,
  type RegionManifest,
  type StoredCell,
} from "./regionDownload.ts";

/** An inventory describes stored bytes, not a location's accessibility. */
export type InventoryState = "saved" | "unknown";
export type InventoryCause = "present" | "missing" | "stale" | "unreadable";

export interface InventoryCell {
  readonly id: string;
  readonly expectedBytes: number;
  readonly state: InventoryState;
  readonly cause: InventoryCause;
  readonly provenance: Provenance;
}

export interface RegionInventory {
  readonly regionId: string;
  readonly cells: readonly InventoryCell[];
  readonly savedCount: number;
  readonly unknownCount: number;
  readonly savedBytes: number;
  readonly expectedBytes: number;
  readonly complete: boolean;
}

export interface InventoryProgress {
  readonly inspected: number;
  readonly total: number;
}

export interface InventoryOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: InventoryProgress) => void;
}

function matches(saved: StoredCell, expected: RegionManifest["cells"][number]): boolean {
  return (
    saved.bytes === expected.bytes &&
    saved.provenance.source === expected.provenance.source &&
    saved.provenance.licence === expected.provenance.licence &&
    saved.provenance.date === expected.provenance.date
  );
}

function checkedManifest(manifest: RegionManifest): void {
  if (manifest.regionId.trim().length === 0) throw new Error("Empty region ID");
  const ids = new Set<string>();
  for (const cell of manifest.cells) {
    if (
      cell.id.trim().length === 0 || ids.has(cell.id) ||
      !Number.isSafeInteger(cell.bytes) || cell.bytes < 0 ||
      !cell.provenance.source.trim() || !cell.provenance.licence.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(cell.provenance.date)
    ) throw new Error("Invalid inventory manifest");
    ids.add(cell.id);
  }
}

/**
 * Inspect each declared cell separately. A storage read failure is UNKNOWN;
 * it must not make the entire region look successfully downloaded.
 */
export async function inspectRegion(
  manifest: RegionManifest,
  store: CellStore,
  options: InventoryOptions = {},
): Promise<RegionInventory> {
  checkedManifest(manifest);
  const cells: InventoryCell[] = [];
  let savedBytes = 0;
  let expectedBytes = 0;
  for (const cell of manifest.cells) {
    if (options.signal?.aborted) throw new Error("Inventory interrupted");
    let saved: StoredCell | undefined;
    let cause: InventoryCause = "missing";
    try {
      saved = await store.get(manifest.regionId, cell.id);
      if (saved !== undefined) cause = matches(saved, cell) ? "present" : "stale";
    } catch {
      cause = "unreadable";
    }
    const state: InventoryState = cause === "present" ? "saved" : "unknown";
    if (state === "saved") savedBytes += cell.bytes;
    expectedBytes += cell.bytes;
    cells.push({
      id: cell.id,
      expectedBytes: cell.bytes,
      state,
      cause,
      provenance: cell.provenance,
    });
    options.onProgress?.({ inspected: cells.length, total: manifest.cells.length });
  }
  const savedCount = cells.filter((cell) => cell.state === "saved").length;
  const unknownCount = cells.length - savedCount;
  return {
    regionId: manifest.regionId,
    cells,
    savedCount,
    unknownCount,
    savedBytes,
    expectedBytes,
    complete: unknownCount === 0,
  };
}

/** Stable display ordering without interpreting identifiers as coordinates. */
export function inventoryPage(
  inventory: RegionInventory,
  offset: number,
  limit: number,
): readonly InventoryCell[] {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError("Invalid offset");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Invalid page size");
  }
  return inventory.cells.slice(offset, offset + limit);
}

export function inventoryCounts(inventory: RegionInventory): {
  readonly saved: number;
  readonly unknown: number;
  readonly total: number;
} {
  return {
    saved: inventory.savedCount,
    unknown: inventory.unknownCount,
    total: inventory.cells.length,
  };
}

/** Isolate the provenance displayed for a cell from any presentation copy. */
export function provenanceOf(
  inventory: RegionInventory,
  cellId: string,
): Provenance | null {
  return inventory.cells.find((cell) => cell.id === cellId)?.provenance ?? null;
}
