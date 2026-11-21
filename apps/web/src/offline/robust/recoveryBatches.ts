import type { Provenance, RegionManifest, StorageEstimate } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** Planning only. No call in this module fetches, saves, removes or schedules data. */
export type RecoveryReason = "missing" | "stale" | "unreadable" | "metadata-conflict" |
  "invalid-listing" | "inventory-unavailable" | "not-inspected" | "duplicate" |
  "unlisted" | "saved";
export type RecoveryState = "ready" | "UNKNOWN" | "no-action";
export type BudgetState = "fits" | "insufficient" | "UNKNOWN";
export type SourceTier = "UNKNOWN";

export interface RecoveryCell {
  readonly id: string;
  readonly bytes: number | null;
  readonly source: Provenance | null;
  readonly tier: SourceTier;
  readonly reason: RecoveryReason;
  readonly action: "download" | "inspect" | "none";
  readonly offlineStatus: "saved" | "UNKNOWN";
}

export interface RecoveryBatch {
  readonly id: string;
  readonly ids: readonly string[];
  readonly bytes: number;
  readonly source: Provenance;
  readonly tier: SourceTier;
  readonly status: BudgetState;
  readonly reason: "missing" | "stale" | "mixed";
}

export interface RecoveryLimits {
  readonly maxCellsPerBatch: number;
  readonly maxBytesPerBatch: number;
  readonly maxTotalBytes: number;
  readonly reserveBytes: number;
}

export interface RecoveryPlan {
  readonly regionId: string;
  readonly state: RecoveryState;
  readonly budget: BudgetState;
  readonly rows: readonly RecoveryCell[];
  readonly batches: readonly RecoveryBatch[];
  readonly eligibleIds: readonly string[];
  readonly blockedIds: readonly string[];
  readonly totalBytes: number | null;
  readonly suggestedBytes: number | null;
  readonly freeBytes: number | null;
  readonly reserveBytes: number;
  readonly notes: readonly string[];
  readonly fingerprint: string;
}

export const DEFAULT_RECOVERY_LIMITS: RecoveryLimits = {
  maxCellsPerBatch: 100,
  maxBytesPerBatch: 32 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  reserveBytes: 1024 * 1024,
};

const MAX_CELLS = 50_000;
const MAX_ID = 160;
const MAX_SOURCE = 500;

function calendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function safeRecoveryId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_ID &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) && !value.includes("..");
}

export function safeRecoverySource(value: Provenance): boolean {
  return value.source.trim().length > 0 && value.source.length <= MAX_SOURCE &&
    OPEN_LICENCES.some((licence) => licence === value.licence) &&
    calendarDay(value.date) &&
    !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value.source);
}

function sameSource(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function safeBytes(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function safeLimits(value: RecoveryLimits): boolean {
  return Number.isSafeInteger(value.maxCellsPerBatch) &&
    value.maxCellsPerBatch > 0 && value.maxCellsPerBatch <= MAX_CELLS &&
    Number.isSafeInteger(value.maxBytesPerBatch) && value.maxBytesPerBatch > 0 &&
    Number.isSafeInteger(value.maxTotalBytes) && value.maxTotalBytes > 0 &&
    Number.isSafeInteger(value.reserveBytes) && value.reserveBytes >= 0;
}

export function recoveryEstimate(
  estimate: StorageEstimate,
): number | null {
  const quota = estimate.quota;
  const usage = estimate.usage;
  if (quota === undefined || usage === undefined || !Number.isSafeInteger(quota) ||
    !Number.isSafeInteger(usage) || quota < 0 || usage < 0 || usage > quota) return null;
  return quota - usage;
}

/** Stable, metadata-only comparison key; never includes device identifiers. */
export function recoveryFingerprint(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
): string {
  const expected = manifest.cells.map((cell) => [
    cell.id, cell.bytes, cell.provenance.source,
    cell.provenance.licence, cell.provenance.date,
  ]);
  const observed = inventory?.cells.map((cell) => [
    cell.id, cell.expectedBytes, cell.cause, cell.state,
    cell.provenance.source, cell.provenance.licence, cell.provenance.date,
  ]) ?? null;
  return JSON.stringify([manifest.regionId, expected, inventory?.regionId ?? null, observed]);
}

function unknownCell(id: string, reason: RecoveryReason): RecoveryCell {
  return { id, bytes: null, source: null, tier: "UNKNOWN", reason,
    action: "inspect", offlineStatus: "UNKNOWN" };
}

function assessmentOf(
  expected: RegionManifest["cells"][number],
  observed: InventoryCell | undefined,
): RecoveryCell {
  const shared = { id: expected.id, bytes: expected.bytes,
    source: expected.provenance, tier: "UNKNOWN" as const };
  if (!observed) return { ...shared, reason: "not-inspected", action: "inspect", offlineStatus: "UNKNOWN" };
  if (observed.id !== expected.id || observed.expectedBytes !== expected.bytes ||
    !sameSource(observed.provenance, expected.provenance)) {
    return { ...shared, reason: "metadata-conflict", action: "inspect", offlineStatus: "UNKNOWN" };
  }
  if (observed.cause === "present" && observed.state === "saved") {
    return { ...shared, reason: "saved", action: "none", offlineStatus: "saved" };
  }
  if (observed.cause === "missing") {
    return { ...shared, reason: "missing", action: "download", offlineStatus: "UNKNOWN" };
  }
  if (observed.cause === "stale") {
    return { ...shared, reason: "stale", action: "download", offlineStatus: "UNKNOWN" };
  }
  return { ...shared, reason: "unreadable", action: "inspect", offlineStatus: "UNKNOWN" };
}

function sourceKey(source: Provenance): string {
  return JSON.stringify([source.source, source.licence, source.date]);
}

function makeBatch(
  index: number,
  cells: readonly RecoveryCell[],
  status: BudgetState,
): RecoveryBatch {
  const source = cells[0]?.source;
  if (!source) throw new Error("A recovery batch needs an explicit source");
  const reasons = new Set(cells.map((cell) => cell.reason));
  return {
    id: `batch-${index + 1}`,
    ids: cells.map((cell) => cell.id),
    bytes: cells.reduce((sum, cell) => sum + (cell.bytes ?? 0), 0),
    source,
    tier: "UNKNOWN",
    status,
    reason: reasons.size === 1 && reasons.has("missing") ? "missing" :
      reasons.size === 1 && reasons.has("stale") ? "stale" : "mixed",
  };
}

/**
 * Fail-closed: if a manifest or inventory contains contradictory entries, no
 * automatic recovery batch is offered. A person can inspect the UNKNOWN rows.
 * Even a good storage estimate is not evidence that a later write will succeed.
 */
export function planRecoveryBatches(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  estimate: StorageEstimate,
  limits: RecoveryLimits = DEFAULT_RECOVERY_LIMITS,
): RecoveryPlan {
  if (!safeLimits(limits)) throw new RangeError("Invalid recovery limits");
  const notes: string[] = [];
  const expectedIds = new Set<string>();
  const observed = new Map<string, InventoryCell>();
  if (!safeRecoveryId(manifest.regionId)) notes.push("region-id");
  if (manifest.cells.length > MAX_CELLS) notes.push("too-many-cells");
  for (const cell of manifest.cells) {
    if (!safeRecoveryId(cell.id)) notes.push("cell-id");
    if (expectedIds.has(cell.id)) notes.push("duplicate-manifest");
    expectedIds.add(cell.id);
    if (!safeBytes(cell.bytes) || cell.bytes > limits.maxTotalBytes) notes.push("invalid-size");
    if (!safeRecoverySource(cell.provenance)) notes.push("invalid-source");
  }
  if (!inventory) notes.push("inventory-unavailable");
  else if (inventory.regionId !== manifest.regionId) notes.push("region-mismatch");
  else {
    for (const cell of inventory.cells) {
      if (observed.has(cell.id)) notes.push("duplicate-inventory");
      if (!expectedIds.has(cell.id)) notes.push("unlisted-cell");
      observed.set(cell.id, cell);
    }
    if (observed.size !== expectedIds.size) notes.push("incomplete-inventory");
  }
  const safeInventory = notes.length === 0;
  const rows: RecoveryCell[] = manifest.cells.map((cell) => safeInventory ?
    assessmentOf(cell, observed.get(cell.id)) : unknownCell(cell.id, "invalid-listing"));
  if (inventory !== null && inventory.regionId === manifest.regionId) {
    for (const cell of inventory.cells) {
      if (!expectedIds.has(cell.id)) rows.push(unknownCell(cell.id, "unlisted"));
    }
  }
  const blockedIds = rows.filter((row) => row.action === "inspect").map((row) => row.id);
  const candidates = rows.filter((row) => row.action === "download" && row.source !== null);
  const eligibleIds = candidates.map((row) => row.id);
  const freeBytes = recoveryEstimate(estimate);
  const available = freeBytes === null ? null : Math.max(0, freeBytes - limits.reserveBytes);
  let remaining = available;
  let total = 0;
  let estimated = 0;
  let overflow = false;
  const groups = new Map<string, RecoveryCell[]>();
  for (const candidate of candidates) {
    const bytes = candidate.bytes;
    const source = candidate.source;
    if (bytes === null || source === null) continue;
    total += bytes;
    if (!Number.isSafeInteger(total) || total > limits.maxTotalBytes) overflow = true;
    const key = sourceKey(source);
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  if (overflow) notes.push("selection-limit");
  const batches: RecoveryBatch[] = [];
  if (!overflow && safeInventory) {
    for (const group of groups.values()) {
      let draft: RecoveryCell[] = [];
      let size = 0;
      const flush = (): void => {
        if (!draft.length) return;
        const fits = remaining === null ? "UNKNOWN" : size <= remaining ? "fits" : "insufficient";
        batches.push(makeBatch(batches.length, draft, fits));
        if (fits === "fits" && remaining !== null) {
          remaining -= size;
          estimated += size;
        }
        draft = [];
        size = 0;
      };
      for (const candidate of group) {
        const bytes = candidate.bytes ?? 0;
        if (bytes > limits.maxBytesPerBatch) {
          flush();
          batches.push(makeBatch(batches.length, [candidate], "insufficient"));
          continue;
        }
        if (draft.length >= limits.maxCellsPerBatch || size + bytes > limits.maxBytesPerBatch) flush();
        draft.push(candidate);
        size += bytes;
      }
      flush();
    }
  }
  const budget: BudgetState = overflow || !safeInventory || available === null ? "UNKNOWN" :
    batches.some((batch) => batch.status !== "fits") ? "insufficient" : "fits";
  const state: RecoveryState = !safeInventory || overflow ? "UNKNOWN" :
    candidates.length === 0 ? "no-action" : "ready";
  return {
    regionId: manifest.regionId, state, budget, rows, batches,
    eligibleIds: state === "ready" ? eligibleIds : [], blockedIds,
    totalBytes: safeInventory && !overflow ? total : null,
    suggestedBytes: budget === "UNKNOWN" ? null : estimated,
    freeBytes, reserveBytes: limits.reserveBytes, notes,
    fingerprint: recoveryFingerprint(manifest, inventory),
  };
}

export type RecoveryFilter = "all" | "needs-download" | "inspect" | "saved";
export type RecoveryOrder = "manifest" | "id" | "bytes-desc" | "bytes-asc" | "reason";

export interface RecoveryPage {
  readonly rows: readonly RecoveryCell[];
  readonly total: number;
  readonly start: number;
  readonly limit: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

/** Bounded search of IDs and declared provenance only; no payload inspection. */
export function browseRecovery(
  plan: RecoveryPlan,
  query: { readonly search: string; readonly filter: RecoveryFilter;
    readonly order: RecoveryOrder; readonly start: number; readonly limit: number },
): RecoveryPage {
  const search = query.search.slice(0, 160).normalize("NFKC").trim().toLocaleLowerCase();
  const limit = Number.isSafeInteger(query.limit) ? Math.max(1, Math.min(100, query.limit)) : 12;
  const start = Number.isSafeInteger(query.start) && query.start > 0 ? query.start : 0;
  const matches = plan.rows.filter((cell) => {
    if (query.filter === "needs-download" && cell.action !== "download") return false;
    if (query.filter === "inspect" && cell.action !== "inspect") return false;
    if (query.filter === "saved" && cell.offlineStatus !== "saved") return false;
    if (!search) return true;
    return [cell.id, cell.reason, cell.source?.source, cell.source?.licence, cell.source?.date]
      .some((value) => value?.normalize("NFKC").toLocaleLowerCase().includes(search));
  });
  if (query.order !== "manifest") matches.sort((a, b) => {
    if (query.order === "id") return a.id.localeCompare(b.id);
    if (query.order === "reason") return a.reason.localeCompare(b.reason) || a.id.localeCompare(b.id);
    if (query.order === "bytes-asc") return (a.bytes ?? Number.MAX_SAFE_INTEGER) -
      (b.bytes ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id);
    return (b.bytes ?? -1) - (a.bytes ?? -1) || a.id.localeCompare(b.id);
  });
  return { rows: matches.slice(start, start + limit), total: matches.length,
    start, limit, hasPrevious: start > 0, hasNext: start + limit < matches.length };
}

/** Reject a batch when the underlying snapshot is no longer the one reviewed. */
export function selectedRecoveryBatch(
  plan: RecoveryPlan,
  batchId: string,
  currentFingerprint: string,
): readonly string[] {
  if (plan.state !== "ready" || plan.fingerprint !== currentFingerprint) return [];
  const batch = plan.batches.find((item) => item.id === batchId);
  if (!batch || batch.status !== "fits") return [];
  const eligible = new Set(plan.eligibleIds);
  if (!batch.ids.length || !batch.ids.every((id) => eligible.has(id))) return [];
  return [...batch.ids];
}

export interface RecoverySummary {
  readonly saved: number;
  readonly missing: number;
  readonly stale: number;
  readonly unreadable: number;
  readonly conflicts: number;
  readonly unknown: number;
  readonly downloadable: number;
  readonly plannedBatches: number;
}

export function summarizeRecovery(plan: RecoveryPlan): RecoverySummary {
  const count = (reason: RecoveryReason): number => plan.rows.filter((row) => row.reason === reason).length;
  return {
    saved: count("saved"), missing: count("missing"), stale: count("stale"),
    unreadable: count("unreadable") + count("not-inspected"),
    conflicts: count("metadata-conflict") + count("duplicate") + count("invalid-listing"),
    unknown: plan.rows.filter((row) => row.offlineStatus === "UNKNOWN").length,
    downloadable: plan.eligibleIds.length, plannedBatches: plan.batches.length,
  };
}
