import type { RecoveryLocale, RecoverySource } from "./index";
import type { LocalPackRecord } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";
import { hasControlCharacter } from "./controlCharacters";

/** A calculation only. The host never executes downloads from these results. */
export type DryRunDisposition =
  | "already-present" | "candidate" | "deferred" | "unknown"
  | "source-review" | "insufficient-space";
export type DryRunReason =
  | "present" | "not-selected" | "unknown-state" | "unknown-bytes"
  | "unknown-source" | "closed-licence" | "invalid-source-date"
  | "future-source-date" | "invalid-pack-id" | "duplicate-pack"
  | "capacity" | "candidate";
export type ManualPriority = "high" | "normal" | "low";
/** Supplied evidence tier; no automatic inference from pack state. */
export type DryRunTier = "UNKNOWN" | "source-document" | "user-note";

export interface DryRunInput {
  readonly records: readonly LocalPackRecord[];
  readonly availableBytes: number | null;
  readonly reserveBytes: number;
  readonly inspectionDate: string;
  readonly selectedIds: readonly string[];
  readonly priorities?: Readonly<Record<string, ManualPriority>>;
  readonly tiers?: Readonly<Record<string, DryRunTier>>;
}
export interface DryRunEntry {
  readonly id: string;
  readonly state: LocalPackRecord["state"];
  readonly disposition: DryRunDisposition;
  readonly reason: DryRunReason;
  readonly expectedBytes: number | null;
  readonly source: RecoverySource | null;
  readonly priority: ManualPriority;
  readonly tier: DryRunTier;
}
export interface DryRunResult {
  readonly status: "calculated" | "unknown";
  readonly availableBytes: number | null;
  readonly reserveBytes: number;
  readonly budgetBytes: number | null;
  readonly allocatedBytes: number;
  readonly remainingBytes: number | null;
  readonly entries: readonly DryRunEntry[];
  readonly inspectionDate: string | null;
}

const MAX_PACKS = 500;
const MAX_BYTES = 1024 * 1024 * 1024 * 1024;
const MAX_ID = 128;
const PRI: Record<ManualPriority, number> = { high: 0, normal: 1, low: 2 };

function safeId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= MAX_ID &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) && id !== "." && id !== "..";
}

function safeBytes(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0 && value <= MAX_BYTES;
}

function knownSource(source: RecoverySource | undefined, inspectionDate: number | null):
  "ok" | "unknown-source" | "closed-licence" | "invalid-source-date" | "future-source-date" {
  if (source === undefined || !source.name.trim() || source.name.length > 256 || hasControlCharacter(source.name, { strict: true, c1: true })) return "unknown-source";
  if (!isOpenLicence(source.licence)) return "closed-licence";
  const date = parseCalendarDate(source.date);
  if (date === null) return "invalid-source-date";
  if (inspectionDate !== null && date > inspectionDate) return "future-source-date";
  return "ok";
}

function makeEntry(record: LocalPackRecord, priority: ManualPriority, disposition: DryRunDisposition, reason: DryRunReason, tier: DryRunTier): DryRunEntry {
  return {
    id: record.id,
    state: record.state,
    priority,
    tier,
    disposition,
    reason,
    expectedBytes: safeBytes(record.byteLength ?? null) ? record.byteLength! : null,
    source: record.source ?? null,
  };
}

function tierFor(id: string, tiers: DryRunInput["tiers"]): DryRunTier {
  const value = tiers?.[id];
  return value === "source-document" || value === "user-note" ? value : "UNKNOWN";
}

function priorityFor(id: string, priorities: DryRunInput["priorities"]): ManualPriority {
  const value = priorities?.[id];
  return value === "high" || value === "low" ? value : "normal";
}

/**
 * Compute a bounded local what-if budget. An existing cached state does not
 * establish a pack's physical accessibility or imply a fresh byte check.
 * Missing evidence stays UNKNOWN; it is never assigned a guessed size.
 */
export function calculateRecoveryDryRun(input: DryRunInput): DryRunResult {
  const day = parseCalendarDate(input.inspectionDate);
  const capacityKnown = safeBytes(input.availableBytes) && safeBytes(input.reserveBytes) &&
    input.reserveBytes <= input.availableBytes;
  const budget = capacityKnown ? input.availableBytes! - input.reserveBytes : null;
  const invalidScope = input.records.length > MAX_PACKS || input.selectedIds.length > MAX_PACKS;
  const selected = new Set(input.selectedIds.filter(safeId));
  const counts = new Map<string, number>();
  for (const record of input.records) counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
  const entries: DryRunEntry[] = [];
  const candidates: LocalPackRecord[] = [];

  for (const record of input.records) {
    const priority = priorityFor(record.id, input.priorities);
    const tier = tierFor(record.id, input.tiers);
    if (!safeId(record.id)) {
      entries.push(makeEntry(record, priority, "unknown", "invalid-pack-id", tier));
    } else if ((counts.get(record.id) ?? 0) > 1) {
      entries.push(makeEntry(record, priority, "unknown", "duplicate-pack", tier));
    } else if (record.state === "ready") {
      entries.push(makeEntry(record, priority, "already-present", "present", tier));
    } else if (record.state === "unknown") {
      entries.push(makeEntry(record, priority, "unknown", "unknown-state", tier));
    } else if (!selected.has(record.id)) {
      entries.push(makeEntry(record, priority, "deferred", "not-selected", tier));
    } else if (!safeBytes(record.byteLength ?? null) || record.byteLength === 0) {
      entries.push(makeEntry(record, priority, "unknown", "unknown-bytes", tier));
    } else {
      const provenance = knownSource(record.source, day);
      if (provenance !== "ok") {
        entries.push(makeEntry(record, priority, "source-review", provenance, tier));
      } else {
        candidates.push(record);
      }
    }
  }

  // User priority is a planning hint, never an automatic operation queue.
  candidates.sort((a, b) => PRI[priorityFor(a.id, input.priorities)] - PRI[priorityFor(b.id, input.priorities)] || a.id.localeCompare(b.id, "en"));
  let allocated = 0;
  for (const record of candidates) {
    const priority = priorityFor(record.id, input.priorities);
    const tier = tierFor(record.id, input.tiers);
    const bytes = record.byteLength!;
    if (invalidScope || day === null || budget === null) {
      entries.push(makeEntry(record, priority, "unknown", "capacity", tier));
    } else if (bytes > budget - allocated) {
      entries.push(makeEntry(record, priority, "insufficient-space", "capacity", tier));
    } else {
      allocated += bytes;
      entries.push(makeEntry(record, priority, "candidate", "candidate", tier));
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id, "en") || PRI[a.priority] - PRI[b.priority]);
  return {
    status: invalidScope || day === null || budget === null ? "unknown" : "calculated",
    availableBytes: safeBytes(input.availableBytes) ? input.availableBytes : null,
    reserveBytes: safeBytes(input.reserveBytes) ? input.reserveBytes : 0,
    budgetBytes: budget,
    allocatedBytes: allocated,
    remainingBytes: budget === null ? null : budget - allocated,
    entries,
    inspectionDate: day === null ? null : input.inspectionDate,
  };
}

export interface DryRunEnvelope {
  readonly format: "recovery-dry-run-v1";
  readonly locale: RecoveryLocale;
  readonly createdAt: string;
  readonly plan: DryRunResult;
}

/** Bounded export; it intentionally contains no addresses or device identifiers. */
export function exportRecoveryDryRun(result: DryRunResult, locale: RecoveryLocale, createdAt: string): string | null {
  if (parseCalendarDate(createdAt.slice(0, 10)) === null || !/^\d{4}-\d{2}-\d{2}T/.test(createdAt) ||
    !Number.isFinite(Date.parse(createdAt)) || result.entries.length > MAX_PACKS) return null;
  for (const entry of result.entries) {
    if (!safeId(entry.id) || !["UNKNOWN", "source-document", "user-note"].includes(entry.tier) ||
      (entry.source !== null && knownSource(entry.source, null) !== "ok")) return null;
  }
  const document: DryRunEnvelope = { format: "recovery-dry-run-v1", locale, createdAt, plan: result };
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  return new TextEncoder().encode(serialized).byteLength <= 512 * 1024 ? serialized : null;
}

export const DRY_RUN_LIMITS = { maxPacks: MAX_PACKS, maxBytes: MAX_BYTES } as const;
