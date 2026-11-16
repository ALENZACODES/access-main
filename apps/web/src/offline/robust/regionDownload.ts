/** Quota-aware downloads. Availability of bytes never proves accessibility. */
export type Language = "en" | "fr";

export interface Provenance {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
}

export interface RegionCell {
  readonly id: string;
  readonly bytes: number;
  readonly provenance: Provenance;
}

export interface RegionManifest {
  readonly regionId: string;
  readonly cells: readonly RegionCell[];
}

export interface StoredCell {
  readonly data: Uint8Array;
  readonly provenance: Provenance;
}

export interface CellStore {
  get(regionId: string, cellId: string): Promise<StoredCell | undefined>;
  /** Commit one complete cell atomically; reject if it cannot be persisted. */
  put(regionId: string, cellId: string, cell: StoredCell): Promise<void>;
}

export interface StorageEstimate {
  readonly quota?: number;
  readonly usage?: number;
}

export interface DownloadDependencies {
  readonly store: CellStore;
  readonly fetchCell: (
    regionId: string,
    cell: RegionCell,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>;
  readonly estimateStorage: () => Promise<StorageEstimate>;
}

export type StopReason = "complete" | "quota" | "interrupted" | "download-error";

export interface DownloadResult {
  readonly regionId: string;
  readonly available: readonly string[];
  readonly missing: readonly string[];
  readonly completed: boolean;
  readonly reason: StopReason;
}

export type CellLookup =
  | { readonly status: "unknown" }
  | {
      readonly status: "available";
      readonly data: Uint8Array;
      readonly provenance: Provenance;
    };

export const OFFLINE_STRINGS = {
  en: {
    available: "Available offline",
    unknown: "UNKNOWN",
    partial: "Only part of this region is available offline.",
    complete: "Region download complete.",
    quota: "Not enough storage space. Saved cells remain available.",
    interrupted: "Download paused. Resume when ready.",
    error: "Download stopped. Saved cells remain available.",
    resume: "Resume download",
  },
  fr: {
    available: "Disponible hors ligne",
    unknown: "INCONNU",
    partial: "Seule une partie de cette région est disponible hors ligne.",
    complete: "Téléchargement de la région terminé.",
    quota: "Espace de stockage insuffisant. Les cellules enregistrées restent disponibles.",
    interrupted: "Téléchargement interrompu. Reprenez quand vous voulez.",
    error: "Téléchargement arrêté. Les cellules enregistrées restent disponibles.",
    resume: "Reprendre le téléchargement",
  },
} as const;

const MIN_FREE_BYTES = 1024 * 1024;

function validProvenance(value: Provenance): boolean {
  if (!value.source.trim() || !value.licence.trim()) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
  const date = new Date(`${value.date}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.date;
}

function validateManifest(manifest: RegionManifest): void {
  if (!manifest.regionId.trim()) throw new Error("Invalid region identifier");
  const seen = new Set<string>();
  for (const cell of manifest.cells) {
    if (
      !cell.id.trim() ||
      seen.has(cell.id) ||
      !Number.isSafeInteger(cell.bytes) ||
      cell.bytes < 0 ||
      !validProvenance(cell.provenance)
    ) {
      throw new Error("Invalid region cell manifest");
    }
    seen.add(cell.id);
  }
}

function matches(stored: StoredCell | undefined, expected: RegionCell): stored is StoredCell {
  return (
    stored !== undefined &&
    stored.data.byteLength === expected.bytes &&
    stored.provenance.source === expected.provenance.source &&
    stored.provenance.licence === expected.provenance.licence &&
    stored.provenance.date === expected.provenance.date
  );
}

/** Unlisted, absent, unreadable or stale cells remain UNKNOWN. */
export async function lookupOfflineCell(
  manifest: RegionManifest,
  store: CellStore,
  cellId: string,
): Promise<CellLookup> {
  validateManifest(manifest);
  const expected = manifest.cells.find((cell) => cell.id === cellId);
  if (!expected) return { status: "unknown" };
  try {
    const stored = await store.get(manifest.regionId, cellId);
    if (!matches(stored, expected)) return { status: "unknown" };
    return { status: "available", data: stored.data, provenance: stored.provenance };
  } catch {
    return { status: "unknown" };
  }
}

async function enoughSpace(
  estimateStorage: DownloadDependencies["estimateStorage"],
  bytes: number,
): Promise<boolean> {
  try {
    const { quota, usage } = await estimateStorage();
    if (
      quota === undefined || usage === undefined ||
      !Number.isFinite(quota) || !Number.isFinite(usage) ||
      quota < 0 || usage < 0 || usage > quota
    ) return false;
    return quota - usage >= bytes + MIN_FREE_BYTES;
  } catch {
    return false;
  }
}

/**
 * Resume by skipping already committed cells. The host supplies first-party
 * fetching and an atomic store, and serializes downloads of each region.
 */
export async function downloadRegion(
  manifest: RegionManifest,
  dependencies: DownloadDependencies,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  validateManifest(manifest);
  const available = new Set<string>();
  let reason: StopReason = "complete";

  // Scan first so the result identifies already stored cells, including those
  // after a failed cell in manifest order.
  try {
    for (const cell of manifest.cells) {
      if (matches(await dependencies.store.get(manifest.regionId, cell.id), cell)) {
        available.add(cell.id);
      }
    }
  } catch {
    reason = "download-error";
  }

  if (reason === "complete") {
    for (const cell of manifest.cells) {
      if (available.has(cell.id)) continue;
      if (signal?.aborted) {
        reason = "interrupted";
        break;
      }
      if (!(await enoughSpace(dependencies.estimateStorage, cell.bytes))) {
        reason = "quota";
        break;
      }
      try {
        const data = await dependencies.fetchCell(manifest.regionId, cell, signal);
        if (signal?.aborted) {
          reason = "interrupted";
          break;
        }
        if (data.byteLength !== cell.bytes) {
          reason = "download-error";
          break;
        }
        await dependencies.store.put(manifest.regionId, cell.id, {
          data,
          provenance: cell.provenance,
        });
        available.add(cell.id);
      } catch {
        reason = signal?.aborted ? "interrupted" : "download-error";
        break;
      }
    }
  }

  const present = manifest.cells.filter((cell) => available.has(cell.id)).map((cell) => cell.id);
  const missing = manifest.cells.filter((cell) => !available.has(cell.id)).map((cell) => cell.id);
  return {
    regionId: manifest.regionId,
    available: present,
    missing,
    completed: reason === "complete" && missing.length === 0,
    reason,
  };
}
