import type { Provenance, RegionManifest } from "./regionDownload";
import type { RegionInventory, InventoryCell } from "./regionInventory";

/** Metadata-only observation; no payload, coordinates, user details, or tokens. */
export interface CopyObservation {
  readonly cellId: string;
  readonly expectedBytes: number;
  readonly source: Provenance;
  readonly state: "saved" | "UNKNOWN";
  readonly reason: InventoryCell["cause"] | "unlisted" | "unreadable";
}

export interface OfflineSnapshot {
  readonly regionId: string;
  readonly capturedAt: string;
  readonly state: "complete" | "partial" | "UNKNOWN";
  readonly observations: readonly CopyObservation[];
  readonly notes: readonly SnapshotIssue[];
}

export type SnapshotIssue =
  | "inventory-unavailable"
  | "region-mismatch"
  | "invalid-manifest"
  | "duplicate-inventory"
  | "unlisted-inventory"
  | "missing-observation";

export type ChangeType =
  | "newly-saved"
  | "no-longer-saved"
  | "unchanged-saved"
  | "unchanged-unknown"
  | "different-reason"
  | "changed-listing"
  | "observation-unavailable";

export interface SnapshotDelta {
  readonly cellId: string;
  readonly change: ChangeType;
  readonly before: CopyObservation | null;
  readonly after: CopyObservation | null;
}

export interface SnapshotComparison {
  readonly regionId: string;
  readonly status: "complete" | "partial" | "UNKNOWN";
  readonly before: OfflineSnapshot;
  readonly after: OfflineSnapshot;
  readonly changes: readonly SnapshotDelta[];
  readonly newlySaved: number;
  readonly noLongerSaved: number;
  readonly unchangedSaved: number;
  readonly unknown: number;
  readonly cannotCompare: number;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validSource(source: Provenance): boolean {
  return source.source.trim().length > 0 &&
    source.licence.trim().length > 0 && validDate(source.date);
}

function matching(a: CopyObservation, b: CopyObservation): boolean {
  return a.cellId === b.cellId && a.expectedBytes === b.expectedBytes &&
    a.source.source === b.source.source &&
    a.source.licence === b.source.licence && a.source.date === b.source.date;
}

/** The canonical manifest is the only authority for what should be present. */
export function captureOfflineSnapshot(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  capturedAt: string,
): OfflineSnapshot {
  const issues: SnapshotIssue[] = [];
  const ids = new Set<string>();
  if (!manifest.regionId.trim()) issues.push("invalid-manifest");
  for (const cell of manifest.cells) {
    if (!cell.id.trim() || ids.has(cell.id) ||
      !Number.isSafeInteger(cell.bytes) || cell.bytes < 0 ||
      !validSource(cell.provenance)) {
      issues.push("invalid-manifest");
    }
    ids.add(cell.id);
  }
  const records = new Map<string, InventoryCell>();
  if (inventory === null) {
    issues.push("inventory-unavailable");
  } else if (inventory.regionId !== manifest.regionId) {
    issues.push("region-mismatch");
  } else {
    for (const record of inventory.cells) {
      if (records.has(record.id)) issues.push("duplicate-inventory");
      if (!ids.has(record.id)) issues.push("unlisted-inventory");
      records.set(record.id, record);
    }
  }
  const trustworthy = issues.length === 0;
  const observations = manifest.cells.map((cell): CopyObservation => {
    const record = trustworthy ? records.get(cell.id) : undefined;
    if (!record) {
      if (trustworthy) issues.push("missing-observation");
      return {
        cellId: cell.id, expectedBytes: cell.bytes, source: cell.provenance,
        state: "UNKNOWN", reason: "unreadable",
      };
    }
    const sourceMatches = cell.bytes === record.expectedBytes &&
      cell.provenance.source === record.provenance.source &&
      cell.provenance.licence === record.provenance.licence &&
      cell.provenance.date === record.provenance.date;
    const saved = sourceMatches && record.state === "saved" && record.cause === "present";
    return {
      cellId: cell.id, expectedBytes: cell.bytes, source: cell.provenance,
      state: saved ? "saved" : "UNKNOWN",
      reason: sourceMatches ? record.cause : "unreadable",
    };
  });
  const state = issues.length > 0 ? "UNKNOWN" :
    observations.every((item) => item.state === "saved") ? "complete" : "partial";
  return {
    regionId: manifest.regionId,
    capturedAt,
    state,
    observations,
    notes: [...new Set(issues)],
  };
}

/** A change from UNKNOWN to saved is stated only when both readings are sound. */
export function compareOfflineSnapshots(
  before: OfflineSnapshot,
  after: OfflineSnapshot,
): SnapshotComparison {
  const compatible = before.regionId === after.regionId &&
    before.state !== "UNKNOWN" && after.state !== "UNKNOWN" &&
    before.notes.length === 0 && after.notes.length === 0;
  const previous = new Map(before.observations.map((item) => [item.cellId, item]));
  const next = new Map(after.observations.map((item) => [item.cellId, item]));
  const ids = [...new Set([...previous.keys(), ...next.keys()])];
  const changes: SnapshotDelta[] = ids.map((id): SnapshotDelta => {
    const a = previous.get(id) ?? null;
    const b = next.get(id) ?? null;
    if (!compatible || a === null || b === null) {
      return { cellId: id, change: "observation-unavailable", before: a, after: b };
    }
    if (!matching(a, b)) {
      return { cellId: id, change: "changed-listing", before: a, after: b };
    }
    if (a.state === "UNKNOWN" && b.state === "saved") {
      return { cellId: id, change: "newly-saved", before: a, after: b };
    }
    if (a.state === "saved" && b.state === "UNKNOWN") {
      return { cellId: id, change: "no-longer-saved", before: a, after: b };
    }
    if (a.state === "saved" && b.state === "saved") {
      return { cellId: id, change: "unchanged-saved", before: a, after: b };
    }
    return {
      cellId: id,
      change: a.reason === b.reason ? "unchanged-unknown" : "different-reason",
      before: a, after: b,
    };
  });
  const count = (change: ChangeType): number => changes.filter((row) => row.change === change).length;
  const cannotCompare = count("observation-unavailable") + count("changed-listing");
  const unknown = changes.filter((row) => row.after?.state !== "saved").length;
  return {
    regionId: after.regionId,
    status: !compatible || cannotCompare > 0 ? "UNKNOWN" : after.state,
    before,
    after,
    changes,
    newlySaved: count("newly-saved"),
    noLongerSaved: count("no-longer-saved"),
    unchangedSaved: count("unchanged-saved"),
    unknown,
    cannotCompare,
  };
}

export interface ComparisonQuery {
  readonly filter: "all" | "changed" | "unknown" | "saved";
  readonly search: string;
  readonly offset: number;
  readonly limit: number;
}

export interface ComparisonPage {
  readonly rows: readonly SnapshotDelta[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

/** Pure, bounded pagination; search does not change state or export data. */
export function pageSnapshotComparison(
  comparison: SnapshotComparison,
  query: ComparisonQuery,
): ComparisonPage {
  const needle = query.search.slice(0, 160).normalize("NFKC").trim().toLocaleLowerCase();
  const offset = Number.isSafeInteger(query.offset) ? Math.max(0, query.offset) : 0;
  const limit = Number.isSafeInteger(query.limit) ? Math.max(1, Math.min(100, query.limit)) : 12;
  const rows = comparison.changes.filter((row) => {
    if (query.filter === "changed" &&
      !["newly-saved", "no-longer-saved", "different-reason", "changed-listing"]
        .includes(row.change)) return false;
    if (query.filter === "unknown" && row.after?.state === "saved") return false;
    if (query.filter === "saved" && row.after?.state !== "saved") return false;
    return row.cellId.normalize("NFKC").toLocaleLowerCase().includes(needle) ||
      [row.after?.source.source, row.after?.source.licence, row.after?.source.date]
        .some((value) => value?.normalize("NFKC").toLocaleLowerCase().includes(needle));
  });
  return {
    rows: rows.slice(offset, offset + limit), total: rows.length, offset, limit,
    hasPrevious: offset > 0, hasNext: offset + limit < rows.length,
  };
}
