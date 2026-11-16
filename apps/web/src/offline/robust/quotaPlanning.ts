import { type RegionInventory } from "./regionInventory.ts";
import { type StorageEstimate } from "./regionDownload.ts";

export type CapacityStatus = "sufficient" | "low" | "unknown";

export interface CapacityPlan {
  readonly status: CapacityStatus;
  readonly requiredBytes: number;
  readonly remainingBytes: number;
  readonly freeBytes: number | null;
  readonly reserveBytes: number;
  readonly percentage: number | null;
  readonly missingCount: number;
}

export interface StorageSummary {
  readonly quotaBytes: number | null;
  readonly usedBytes: number | null;
  readonly freeBytes: number | null;
}

export const DEFAULT_RESERVE_BYTES = 1024 * 1024;

function safeSize(value: number | undefined): number | null {
  if (
    value === undefined || !Number.isSafeInteger(value) ||
    value < 0 || !Number.isFinite(value)
  ) return null;
  return value;
}

/** Device estimates are advisory and never a promise that a write will succeed. */
export function summariseStorage(estimate: StorageEstimate): StorageSummary {
  const quotaBytes = safeSize(estimate.quota);
  const usedBytes = safeSize(estimate.usage);
  return {
    quotaBytes,
    usedBytes,
    freeBytes: quotaBytes === null || usedBytes === null
      ? null : Math.max(0, quotaBytes - usedBytes),
  };
}

/**
 * The projection counts only manifest cells that are not saved, including
 * stale/unreadable cells. It never relies on untrusted download headers.
 */
export function planCapacity(
  inventory: RegionInventory,
  estimate: StorageEstimate,
  reserveBytes: number = DEFAULT_RESERVE_BYTES,
): CapacityPlan {
  if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 0) {
    throw new RangeError("Invalid storage reserve");
  }
  const remainingBytes = inventory.cells.reduce(
    (sum, cell) => cell.state === "unknown" ? sum + cell.expectedBytes : sum,
    0,
  );
  if (!Number.isSafeInteger(remainingBytes)) throw new RangeError("Region too large");
  const storage = summariseStorage(estimate);
  const freeBytes = storage.freeBytes;
  const requiredBytes = remainingBytes + reserveBytes;
  if (!Number.isSafeInteger(requiredBytes)) throw new RangeError("Region too large");
  const percentage = inventory.cells.length === 0
    ? 100 : Math.round((inventory.savedCount / inventory.cells.length) * 100);
  return {
    status: remainingBytes === 0 ? "sufficient" : freeBytes === null
      ? "unknown" : freeBytes >= requiredBytes ? "sufficient" : "low",
    remainingBytes,
    requiredBytes,
    freeBytes,
    reserveBytes,
    percentage,
    missingCount: inventory.unknownCount,
  };
}

export function formatBinaryBytes(bytes: number, language: "en" | "fr"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return language === "fr" ? "INCONNU" : "UNKNOWN";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value < 10 && unitIndex > 0 ? Math.ceil(value * 10) / 10 : Math.ceil(value);
  return `${rounded.toLocaleString(language === "fr" ? "fr-CA" : "en-CA")} ${units[unitIndex]}`;
}

export function capacityAction(plan: CapacityPlan): "download" | "review" | "complete" {
  if (plan.missingCount === 0) return "complete";
  return plan.status === "sufficient" ? "download" : "review";
}
