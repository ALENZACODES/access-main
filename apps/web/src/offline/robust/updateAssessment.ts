import { type RegionManifest, type RegionCell, type Provenance } from "./regionDownload";
import { type RegionInventory, type InventoryCell } from "./regionInventory";

/**
 * A device-local comparison of a published cell list with an observed inventory.
 * It does not inspect or infer any physical accessibility characteristic.
 * UNKNOWN means a record cannot be established by the local observation.
 */
export type ChangeKind =
  | "saved"
  | "not-downloaded"
  | "out-of-date"
  | "unreadable"
  | "unlisted"
  | "metadata-changed";

export type ChangeSeverity = "information" | "attention" | "unknown";

export interface CellAssessment {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly severity: ChangeSeverity;
  readonly offlineStatus: "saved" | "UNKNOWN";
  readonly expectedBytes: number | null;
  readonly expected: Provenance | null;
  readonly observed: Provenance | null;
  readonly advice: "none" | "download" | "inspect" | "review-source";
}

export interface AssessmentCounts {
  readonly saved: number;
  readonly unknown: number;
  readonly missing: number;
  readonly stale: number;
  readonly unreadable: number;
  readonly unlisted: number;
}

export interface RegionAssessment {
  readonly regionId: string;
  readonly status: "complete" | "partial" | "UNKNOWN";
  readonly rows: readonly CellAssessment[];
  readonly counts: AssessmentCounts;
  readonly listedBytes: number | null;
  readonly savedBytes: number | null;
  readonly remainingBytes: number | null;
  readonly sources: readonly Provenance[];
  readonly notes: readonly string[];
}

function sameProvenance(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function dateValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function cellValid(cell: RegionCell): boolean {
  return Boolean(cell.id.trim()) && Number.isSafeInteger(cell.bytes) && cell.bytes >= 0 &&
    Boolean(cell.provenance.source.trim()) && Boolean(cell.provenance.licence.trim()) &&
    dateValid(cell.provenance.date);
}

/** An invalid manifest is not a source of facts, even when device entries exist. */
export function assessManifestSafety(manifest: RegionManifest): readonly string[] {
  const failures: string[] = [];
  if (!manifest.regionId.trim()) failures.push("region-id");
  const seen = new Set<string>();
  for (const cell of manifest.cells) {
    if (!cellValid(cell)) failures.push(`invalid-cell:${cell.id}`);
    if (seen.has(cell.id)) failures.push(`duplicate-cell:${cell.id}`);
    seen.add(cell.id);
  }
  return failures;
}

function assessmentOf(
  cell: RegionCell,
  observed: InventoryCell | undefined,
): CellAssessment {
  const shared = {
    id: cell.id,
    expectedBytes: cell.bytes,
    expected: cell.provenance,
    observed: observed?.provenance ?? null,
  };
  if (observed === undefined) {
    return {
      ...shared, kind: "unreadable", severity: "unknown", offlineStatus: "UNKNOWN",
      advice: "inspect",
    };
  }
  if (observed.id !== cell.id || observed.expectedBytes !== cell.bytes ||
    !sameProvenance(observed.provenance, cell.provenance)) {
    return {
      ...shared, kind: "metadata-changed", severity: "unknown", offlineStatus: "UNKNOWN",
      advice: "review-source",
    };
  }
  if (observed.cause === "unreadable") {
    return {
      ...shared, kind: "unreadable", severity: "unknown", offlineStatus: "UNKNOWN",
      advice: "inspect",
    };
  }
  if (observed.cause === "stale") {
    return {
      ...shared, kind: "out-of-date", severity: "attention", offlineStatus: "UNKNOWN",
      advice: "download",
    };
  }
  if (observed.cause === "missing") {
    return {
      ...shared, kind: "not-downloaded", severity: "attention", offlineStatus: "UNKNOWN",
      advice: "download",
    };
  }
  if (observed.cause === "present" && observed.state === "saved") {
    return {
      ...shared, kind: "saved", severity: "information", offlineStatus: "saved",
      advice: "none",
    };
  }
  return {
    ...shared, kind: "unreadable", severity: "unknown", offlineStatus: "UNKNOWN",
    advice: "inspect",
  };
}

function safeSum(values: readonly number[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    sum += value;
    if (!Number.isSafeInteger(sum)) return null;
  }
  return sum;
}

/**
 * Fail closed when the latest inventory is absent, partially collected, for a
 * different region or internally inconsistent. A count alone is not evidence.
 */
export function assessOfflineRegion(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
): RegionAssessment {
  const failures = assessManifestSafety(manifest);
  const expectedIds = new Set(manifest.cells.map((cell) => cell.id));
  const observed = new Map<string, InventoryCell>();
  const notes = [...failures];
  if (inventory === null) notes.push("inventory-unavailable");
  else if (inventory.regionId !== manifest.regionId) notes.push("region-mismatch");
  else {
    for (const cell of inventory.cells) {
      if (observed.has(cell.id)) notes.push(`duplicate-inventory:${cell.id}`);
      observed.set(cell.id, cell);
    }
  }
  const trustworthy = notes.length === 0;
  const rows: CellAssessment[] = manifest.cells.map((cell) =>
    trustworthy ? assessmentOf(cell, observed.get(cell.id)) : {
      id: cell.id,
      kind: "unreadable",
      severity: "unknown",
      offlineStatus: "UNKNOWN",
      expectedBytes: cellValid(cell) ? cell.bytes : null,
      expected: cellValid(cell) ? cell.provenance : null,
      observed: null,
      advice: "inspect",
    });
  if (trustworthy) {
    for (const observedCell of observed.values()) {
      if (expectedIds.has(observedCell.id)) continue;
      rows.push({
        id: observedCell.id,
        kind: "unlisted",
        severity: "unknown",
        offlineStatus: "UNKNOWN",
        expectedBytes: null,
        expected: null,
        observed: observedCell.provenance,
        advice: "inspect",
      });
    }
  }
  const counts: AssessmentCounts = {
    saved: rows.filter((row) => row.kind === "saved").length,
    unknown: rows.filter((row) => row.offlineStatus === "UNKNOWN").length,
    missing: rows.filter((row) => row.kind === "not-downloaded").length,
    stale: rows.filter((row) => row.kind === "out-of-date").length,
    unreadable: rows.filter((row) => row.kind === "unreadable" || row.kind === "metadata-changed").length,
    unlisted: rows.filter((row) => row.kind === "unlisted").length,
  };
  const listedBytes = safeSum(manifest.cells.map((cell) => cell.bytes));
  const savedBytes = trustworthy ? safeSum(rows.filter((row) => row.kind === "saved")
    .map((row) => row.expectedBytes ?? -1)) : null;
  const remainingBytes = listedBytes === null || savedBytes === null ? null : listedBytes - savedBytes;
  const sources = new Map<string, Provenance>();
  for (const cell of manifest.cells) {
    if (!cellValid(cell)) continue;
    const key = JSON.stringify([cell.provenance.source, cell.provenance.licence, cell.provenance.date]);
    sources.set(key, cell.provenance);
  }
  const status = !trustworthy || rows.some((row) => row.kind === "unreadable" ||
    row.kind === "metadata-changed" || row.kind === "unlisted") ? "UNKNOWN" :
    counts.unknown === 0 ? "complete" : "partial";
  return {
    regionId: manifest.regionId,
    status,
    rows,
    counts,
    listedBytes,
    savedBytes,
    remainingBytes,
    sources: [...sources.values()],
    notes,
  };
}

export type ReviewFilter = "all" | "saved" | "needs-download" | "unknown" | "source";
export type ReviewOrder = "manifest" | "id" | "size-desc" | "size-asc" | "status";

export interface ReviewQuery {
  readonly search: string;
  readonly filter: ReviewFilter;
  readonly order: ReviewOrder;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewPage {
  readonly rows: readonly CellAssessment[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

function matchesFilter(row: CellAssessment, filter: ReviewFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "saved": return row.kind === "saved";
    case "needs-download": return row.advice === "download";
    case "unknown": return row.offlineStatus === "UNKNOWN";
    case "source": return row.advice === "review-source";
  }
}

function matchText(row: CellAssessment, query: string): boolean {
  if (!query) return true;
  const haystack = [
    row.id, row.kind, row.offlineStatus, row.expected?.source,
    row.expected?.licence, row.expected?.date,
    row.observed?.source, row.observed?.licence, row.observed?.date,
  ].filter((item): item is string => typeof item === "string")
    .join("\n").normalize("NFKC").toLocaleLowerCase();
  return haystack.includes(query);
}

/** Search only stored metadata, with capped pagination and stable manifest order. */
export function reviewAssessment(
  assessment: RegionAssessment,
  query: ReviewQuery,
): ReviewPage {
  const limit = Number.isSafeInteger(query.limit) ? Math.max(1, Math.min(100, query.limit)) : 12;
  const offset = Number.isSafeInteger(query.offset) && query.offset > 0 ? query.offset : 0;
  const search = query.search.slice(0, 160).trim().normalize("NFKC").toLocaleLowerCase();
  const rows = assessment.rows.filter((row) => matchesFilter(row, query.filter) && matchText(row, search));
  if (query.order !== "manifest") {
    rows.sort((a, b) => {
      if (query.order === "id") return a.id.localeCompare(b.id);
      if (query.order === "status") return a.offlineStatus.localeCompare(b.offlineStatus) || a.id.localeCompare(b.id);
      if (query.order === "size-asc") return (a.expectedBytes ?? Number.MAX_SAFE_INTEGER) -
        (b.expectedBytes ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id);
      return (b.expectedBytes ?? -1) - (a.expectedBytes ?? -1) || a.id.localeCompare(b.id);
    });
  }
  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    offset,
    limit,
    hasNext: offset + limit < rows.length,
    hasPrevious: offset > 0,
  };
}

export interface SourceSummary {
  readonly source: Provenance;
  readonly count: number;
  readonly saved: number;
  readonly unknown: number;
  readonly expectedBytes: number | null;
}

/** An aggregate per exact source/licence/date triple; never combine dates. */
export function assessSources(assessment: RegionAssessment): readonly SourceSummary[] {
  const groups = new Map<string, { source: Provenance; rows: CellAssessment[] }>();
  for (const row of assessment.rows) {
    if (row.expected === null) continue;
    const key = JSON.stringify([row.expected.source, row.expected.licence, row.expected.date]);
    const group = groups.get(key) ?? { source: row.expected, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    source: group.source,
    count: group.rows.length,
    saved: group.rows.filter((row) => row.offlineStatus === "saved").length,
    unknown: group.rows.filter((row) => row.offlineStatus === "UNKNOWN").length,
    expectedBytes: safeSum(group.rows.map((row) => row.expectedBytes ?? -1)),
  }));
}

export interface RecoveryQueueItem {
  readonly id: string;
  readonly bytes: number;
  readonly source: Provenance;
  readonly cause: "missing" | "stale";
}

/** The queue is a suggestion only: the host performs quota checks at download. */
export function suggestRecoveryQueue(assessment: RegionAssessment): readonly RecoveryQueueItem[] {
  if (assessment.status === "UNKNOWN") return [];
  return assessment.rows.flatMap((row): RecoveryQueueItem[] => {
    if (row.advice !== "download" || row.expected === null || row.expectedBytes === null) return [];
    if (row.kind !== "out-of-date" && row.kind !== "not-downloaded") return [];
    return [{
      id: row.id,
      bytes: row.expectedBytes,
      source: row.expected,
      cause: row.kind === "out-of-date" ? "stale" : "missing",
    }];
  });
}

export interface RecoveryBudget {
  readonly estimatedFreeBytes: number | null;
  readonly reserveBytes: number;
  readonly queueBytes: number | null;
  readonly fitsEstimate: "yes" | "no" | "UNKNOWN";
  readonly reason: "enough" | "insufficient" | "unknown-estimate" | "invalid-queue";
}

/** Browser quota is an estimate; never assert that a future write will succeed. */
export function assessRecoveryBudget(
  queue: readonly RecoveryQueueItem[],
  estimate: { readonly quota?: number; readonly usage?: number },
  reserveBytes = 1024 * 1024,
): RecoveryBudget {
  const queueBytes = safeSum(queue.map((item) => item.bytes));
  const quota = estimate.quota;
  const usage = estimate.usage;
  const hasEstimate = quota !== undefined && usage !== undefined &&
    Number.isFinite(quota) && Number.isFinite(usage) &&
    quota >= 0 && usage >= 0 && usage <= quota;
  const free = hasEstimate && quota !== undefined && usage !== undefined ? Math.floor(quota - usage) : null;
  if (queueBytes === null || !Number.isSafeInteger(reserveBytes) || reserveBytes < 0) {
    return { estimatedFreeBytes: free, reserveBytes, queueBytes, fitsEstimate: "UNKNOWN", reason: "invalid-queue" };
  }
  if (free === null) {
    return { estimatedFreeBytes: null, reserveBytes, queueBytes, fitsEstimate: "UNKNOWN", reason: "unknown-estimate" };
  }
  const fits = queueBytes <= free - reserveBytes;
  return {
    estimatedFreeBytes: free, reserveBytes, queueBytes,
    fitsEstimate: fits ? "yes" : "no",
    reason: fits ? "enough" : "insufficient",
  };
}
