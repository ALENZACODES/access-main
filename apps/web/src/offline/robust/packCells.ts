/**
 * Connects the live region pack (packages/data-client) to the robust download
 * rules in regionDownload.ts. The pack store keeps the records; this ledger
 * keeps, per cell, the bytes and the source, licence and build date that were
 * committed, so an older copy is shown as stale rather than current or UNKNOWN.
 */
import Dexie, { type Table } from "dexie";
import type { PackManifest, PackPart } from "../../../../../packages/data-client/src/index.ts";
import type { CellStore, RegionManifest, StoredCell } from "./regionDownload.ts";

interface LedgerRow extends StoredCell {
  readonly key: string;
}

export interface CellLedger {
  get(key: string): Promise<StoredCell | undefined>;
  put(key: string, cell: StoredCell): Promise<void>;
  deleteRegion(regionId: string): Promise<void>;
}

class LedgerDatabase extends Dexie {
  cells!: Table<LedgerRow, string>;
  constructor() {
    super("access-region-cells-v1");
    this.version(1).stores({ cells: "key" });
  }
}

const keyFor = (regionId: string, cellId: string) => `${regionId}/${cellId}`;

export function createIndexedDbLedger(): CellLedger {
  const db = new LedgerDatabase();
  return {
    async get(key) {
      const row = await db.cells.get(key);
      return row ? { bytes: row.bytes, provenance: row.provenance } : undefined;
    },
    async put(key, cell) {
      await db.cells.put({ key, bytes: cell.bytes, provenance: cell.provenance });
    },
    async deleteRegion(regionId) {
      await db.cells.where("key").startsWith(`${regionId}/`).delete();
    },
  };
}

export function createMemoryLedger(): CellLedger {
  const rows = new Map<string, StoredCell>();
  return {
    async get(key) { return rows.get(key); },
    async put(key, cell) { rows.set(key, cell); },
    async deleteRegion(regionId) {
      for (const key of [...rows.keys()]) if (key.startsWith(`${regionId}/`)) rows.delete(key);
    },
  };
}

function partsForCell(pack: PackManifest, cell: string): PackPart[] {
  const parts = new Map<string, PackPart>();
  const search = pack.search[cell];
  if (search) parts.set(search.sha256, search);
  for (const tranche of Object.values(pack.tranches)) {
    for (const part of tranche?.cells[cell]?.parts ?? []) {
      if (pack.sources.some((source) => source.sourceId === part.sourceId && source.inWebPack)) parts.set(part.sha256, part);
    }
  }
  return [...parts.values()];
}

/**
 * One robust manifest cell per pack cell. The date is the pack build date, so
 * a copy from an earlier build no longer matches. A cell without its own
 * source parts (a search index only) carries the pack's web sources.
 */
export function regionManifestFor(pack: PackManifest, regionId: string): RegionManifest {
  const region = pack.regions.find((item) => item.id === regionId);
  if (!region) throw new Error("Invalid region identifier");
  const webSources = pack.sources.filter((source) => source.inWebPack);
  const date = pack.builtAt.slice(0, 10);
  return {
    regionId,
    cells: region.cells.map((cell) => {
      const parts = partsForCell(pack, cell);
      const ids = new Set(parts.map((part) => part.sourceId).filter(Boolean));
      const named = webSources.filter((source) => ids.has(source.sourceId));
      const sources = named.length ? named : webSources;
      return {
        id: cell,
        bytes: parts.reduce((sum, part) => sum + part.bytes, 0),
        provenance: {
          source: [...new Set(sources.map((source) => source.name))].sort().join(", "),
          licence: [...new Set(sources.map((source) => source.licence))].sort().join(", "),
          date,
        },
      };
    }),
  };
}

/**
 * CellStore over the ledger and the pack store's current view.
 * - Current parts present: the cell matches this build.
 * - Current parts absent and a ledger row from another build: that row is returned,
 *   so the cell reads as stale with its own date.
 * - Current parts absent and no older row: nothing is stored (missing).
 */
export function createPackCellStore(options: {
  readonly manifest: RegionManifest;
  readonly ledger: CellLedger;
  readonly missingCells: ReadonlySet<string>;
}): CellStore {
  const { manifest, ledger, missingCells } = options;
  return {
    async get(regionId, cellId) {
      const expected = manifest.cells.find((cell) => cell.id === cellId);
      if (regionId !== manifest.regionId || !expected) return undefined;
      if (!missingCells.has(cellId)) return { bytes: expected.bytes, provenance: expected.provenance };
      const row = await ledger.get(keyFor(regionId, cellId));
      if (!row) return undefined;
      const sameBuild = row.bytes === expected.bytes &&
        row.provenance.date === expected.provenance.date &&
        row.provenance.source === expected.provenance.source &&
        row.provenance.licence === expected.provenance.licence;
      return sameBuild ? undefined : row;
    },
    async put(regionId, cellId, cell) {
      await ledger.put(keyFor(regionId, cellId), cell);
    },
  };
}
