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

/**
 * Ledger entry for one committed cell. The cell's records live in the host's
 * pack store; the ledger records how many bytes were committed and from which
 * source, licence and date, so an older copy can be told apart from a current one.
 */
export interface StoredCell {
  readonly bytes: number;
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
  /** Fetch, check and commit one cell's data. Resolve with the bytes received. */
  readonly fetchCell: (
    regionId: string,
    cell: RegionCell,
    signal?: AbortSignal,
  ) => Promise<number>;
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

/**
 * available: the stored copy matches the current manifest.
 * stale: a copy is stored, but from an older or different build. It is shown
 *   with its own date and is never presented as current.
 * missing: nothing is stored for this cell.
 * unknown: the cell is not in the manifest, or the store could not be read.
 */
export type CellLookup =
  | { readonly status: "unknown" }
  | { readonly status: "missing" }
  | { readonly status: "stale"; readonly stored: Provenance; readonly expected: Provenance }
  | { readonly status: "available"; readonly provenance: Provenance };

export type CellStatus = CellLookup["status"];

export const OFFLINE_STRINGS = {
  en: {
    available: "Available offline",
    stale: "Out of date",
    missing: "Not downloaded",
    unknown: "UNKNOWN",
    partial: "Only part of this region is available offline.",
    complete: "Region download complete.",
    quota: "Not enough storage space. Saved cells remain available.",
    interrupted: "Download paused. Resume when ready.",
    error: "Download stopped. Saved cells remain available.",
    resume: "Resume download",
    pause: "Pause download",
    update: "Download the current data",
    staleRegion: "Some cells are out of date. Their saved copies are not used offline until the current data is downloaded.",
  },
  fr: {
    available: "Disponible hors ligne",
    stale: "Périmée",
    missing: "Non téléchargée",
    unknown: "INCONNU",
    partial: "Seule une partie de cette région est disponible hors ligne.",
    complete: "Téléchargement de la région terminé.",
    quota: "Espace de stockage insuffisant. Les cellules enregistrées restent disponibles.",
    interrupted: "Téléchargement interrompu. Reprenez quand vous voulez.",
    error: "Téléchargement arrêté. Les cellules enregistrées restent disponibles.",
    resume: "Reprendre le téléchargement",
    pause: "Interrompre le téléchargement",
    update: "Télécharger les données actuelles",
    staleRegion: "Certaines cellules sont périmées. Leurs copies enregistrées ne servent pas hors ligne tant que les données actuelles ne sont pas téléchargées.",
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

function matches(stored: StoredCell | undefined, expected: RegionCell): boolean {
  return (
    stored !== undefined &&
    stored.bytes === expected.bytes &&
    stored.provenance.source === expected.provenance.source &&
    stored.provenance.licence === expected.provenance.licence &&
    stored.provenance.date === expected.provenance.date
  );
}

/**
 * Only a copy that matches the current manifest is available. An older copy is
 * stale, an absent one is missing, and an unlisted or unreadable cell is UNKNOWN.
 */
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
    if (stored === undefined) return { status: "missing" };
    if (!matches(stored, expected)) {
      return { status: "stale", stored: stored.provenance, expected: expected.provenance };
    }
    return { status: "available", provenance: stored.provenance };
  } catch {
    return { status: "unknown" };
  }
}

export interface CellReport {
  readonly id: string;
  readonly lookup: CellLookup;
}

/** One lookup per manifest cell, in manifest order. */
export async function regionCellReport(
  manifest: RegionManifest,
  store: CellStore,
): Promise<readonly CellReport[]> {
  validateManifest(manifest);
  const reports: CellReport[] = [];
  for (const cell of manifest.cells) {
    reports.push({ id: cell.id, lookup: await lookupOfflineCell(manifest, store, cell.id) });
  }
  return reports;
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
        const received = await dependencies.fetchCell(manifest.regionId, cell, signal);
        if (signal?.aborted) {
          reason = "interrupted";
          break;
        }
        if (received !== cell.bytes) {
          reason = "download-error";
          break;
        }
        await dependencies.store.put(manifest.regionId, cell.id, {
          bytes: received,
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

/** French singular for 0 and 1. */
const plural = (count: number, one: string, many: string) => (count <= 1 ? one : many);

/** Plain-language status for one cell. Stale copies keep their own date. */
export function cellStatusText(language: Language, lookup: CellLookup): string {
  const s = OFFLINE_STRINGS[language];
  switch (lookup.status) {
    case "available":
      return language === "fr"
        ? `${s.available}. Données du ${lookup.provenance.date}.`
        : `${s.available}. Data from ${lookup.provenance.date}.`;
    case "stale":
      return language === "fr"
        ? `${s.stale}. Copie enregistrée le ${lookup.stored.date}, données actuelles du ${lookup.expected.date}. Téléchargez-la de nouveau pour l’utiliser hors ligne.`
        : `${s.stale}. Saved copy from ${lookup.stored.date}; current data is from ${lookup.expected.date}. Download it again to use it offline.`;
    case "missing":
      return language === "fr"
        ? `${s.missing}. Pas disponible hors ligne.`
        : `${s.missing}. Not available offline.`;
    default:
      return language === "fr"
        ? `${s.unknown}. L’appareil n’a pas pu lire cette cellule.`
        : `${s.unknown}. This device could not read this cell.`;
  }
}

/** Counts per status, for a short summary of a region. */
export function cellSummaryText(language: Language, statuses: readonly CellStatus[]): string {
  const count = (status: CellStatus) => statuses.filter((value) => value === status).length;
  const s = OFFLINE_STRINGS[language];
  return language === "fr"
    ? `${statuses.length} ${plural(statuses.length, "cellule", "cellules")}. ${s.available}\u00a0: ${count("available")}. ${s.stale}s\u00a0: ${count("stale")}. ${s.missing}s\u00a0: ${count("missing")}. ${s.unknown}\u00a0: ${count("unknown")}.`
    : `${statuses.length} cells. ${s.available}: ${count("available")}. ${s.stale}: ${count("stale")}. ${s.missing}: ${count("missing")}. ${s.unknown}: ${count("unknown")}.`;
}

/** Outcome of a download run, naming what is and is not available offline. */
export function downloadResultText(language: Language, result: DownloadResult): string {
  const s = OFFLINE_STRINGS[language];
  if (result.completed) return s.complete;
  const reason = result.reason === "quota" ? s.quota : result.reason === "interrupted" ? s.interrupted : s.error;
  const total = result.available.length + result.missing.length;
  const counts = language === "fr"
    ? `${result.available.length} ${plural(result.available.length, "cellule", "cellules")} sur ${total} ${plural(result.available.length, "disponible", "disponibles")} hors ligne, ${result.missing.length} non ${plural(result.missing.length, "téléchargée", "téléchargées")}.`
    : `${result.available.length} of ${total} cells available offline, ${result.missing.length} not downloaded.`;
  return `${s.partial} ${counts} ${reason}`;
}
