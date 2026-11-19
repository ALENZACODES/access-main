import type { Provenance, RegionManifest } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** Information about a source, not an assertion about a physical place. */
export type EvidenceTier = "submitted" | "documented" | "reviewed-source" | "UNKNOWN";
export type LedgerState = "saved" | "UNKNOWN";
export type LedgerReason =
  | "present" | "missing" | "stale" | "unreadable"
  | "inventory-unavailable" | "metadata-conflict" | "unlisted"
  | "duplicate" | "invalid-source";

/** Optional evidence supplied by a host. Never inferred from saved bytes. */
export interface SourceTierRecord {
  readonly cellId: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: Exclude<EvidenceTier, "UNKNOWN">;
  /** A non-empty description of the basis for the declared tier. */
  readonly basis: string;
}

export interface SourceLedgerRow {
  readonly id: string;
  readonly expectedBytes: number | null;
  readonly source: Provenance | null;
  readonly observedSource: Provenance | null;
  readonly state: LedgerState;
  readonly reason: LedgerReason;
  readonly tier: EvidenceTier;
  readonly basis: string | null;
}

export interface LedgerSummary {
  readonly regionId: string;
  readonly state: "complete" | "partial" | "UNKNOWN";
  readonly rows: readonly SourceLedgerRow[];
  readonly saved: number;
  readonly unknown: number;
  readonly tierUnknown: number;
  readonly issues: readonly string[];
  readonly listedBytes: number | null;
  readonly savedBytes: number | null;
}

const ACCEPTED_TIERS: ReadonlySet<string> = new Set(["submitted", "documented", "reviewed-source"]);
const MAX_ROWS = 50000;

function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function safeText(value: string): boolean {
  return value.length > 0 && value.length <= 500 && value.trim().length > 0 &&
    !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function validSource(source: Provenance): boolean {
  return safeText(source.source) && safeText(source.licence) &&
    OPEN_LICENCES.some((licence) => licence === source.licence) &&
    calendarDate(source.date);
}

function sameSource(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function countBytes(rows: readonly SourceLedgerRow[], onlySaved: boolean): number | null {
  let sum = 0;
  for (const row of rows) {
    if (onlySaved && row.state !== "saved") continue;
    if (row.expectedBytes === null || !Number.isSafeInteger(row.expectedBytes)) return null;
    sum += row.expectedBytes;
    if (!Number.isSafeInteger(sum)) return null;
  }
  return sum;
}

function matchedTier(
  cellId: string,
  source: Provenance,
  entries: ReadonlyMap<string, SourceTierRecord>,
  invalid: ReadonlySet<string>,
): Pick<SourceLedgerRow, "tier" | "basis"> {
  if (invalid.has(cellId)) return { tier: "UNKNOWN", basis: null };
  const entry = entries.get(cellId);
  if (!entry || !sameSource(entry, source) || !ACCEPTED_TIERS.has(entry.tier) ||
    !safeText(entry.basis)) return { tier: "UNKNOWN", basis: null };
  return { tier: entry.tier, basis: entry.basis };
}

function rowFrom(
  id: string,
  expectedBytes: number,
  source: Provenance,
  observation: InventoryCell | undefined,
  tier: Pick<SourceLedgerRow, "tier" | "basis">,
): SourceLedgerRow {
  const common = {
    id,
    expectedBytes,
    source,
    observedSource: observation?.provenance ?? null,
    ...tier,
  };
  if (!observation) return { ...common, state: "UNKNOWN", reason: "unreadable" };
  if (observation.expectedBytes !== expectedBytes ||
    !sameSource(observation.provenance, source)) {
    return { ...common, state: "UNKNOWN", reason: "metadata-conflict" };
  }
  if (observation.state === "saved" && observation.cause === "present") {
    return { ...common, state: "saved", reason: "present" };
  }
  return {
    ...common,
    state: "UNKNOWN",
    reason: observation.cause === "present" ? "unreadable" : observation.cause,
  };
}

/**
 * Fail-closed per-cell ledger. Inventory and evidence claims are independent:
 * a valid evidence tier never changes whether bytes are available offline.
 */
export function buildSourceLedger(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  tierRecords: readonly SourceTierRecord[] = [],
): LedgerSummary {
  const issues: string[] = [];
  const seen = new Set<string>();
  const invalid = new Set<string>();
  const tiers = new Map<string, SourceTierRecord>();
  if (!manifest.regionId.trim()) issues.push("invalid-region");
  if (manifest.cells.length > MAX_ROWS) issues.push("row-limit");
  for (const record of tierRecords) {
    if (tiers.has(record.cellId)) invalid.add(record.cellId);
    tiers.set(record.cellId, record);
  }
  if (invalid.size) issues.push("duplicate-tier-record");
  const observations = new Map<string, InventoryCell>();
  const unusableInventory = inventory === null || inventory.regionId !== manifest.regionId;
  if (unusableInventory) issues.push(inventory === null ? "inventory-unavailable" : "region-mismatch");
  else {
    for (const cell of inventory.cells) {
      if (observations.has(cell.id)) {
        invalid.add(cell.id);
        issues.push("duplicate-observation");
      }
      observations.set(cell.id, cell);
    }
  }
  const rows: SourceLedgerRow[] = [];
  for (const cell of manifest.cells.slice(0, MAX_ROWS)) {
    if (seen.has(cell.id)) {
      invalid.add(cell.id);
      issues.push("duplicate-cell");
    }
    seen.add(cell.id);
    if (!cell.id.trim() || !Number.isSafeInteger(cell.bytes) || cell.bytes < 0 ||
      !validSource(cell.provenance)) {
      issues.push("invalid-source-record");
      rows.push({
        id: cell.id,
        expectedBytes: null,
        source: null,
        observedSource: null,
        state: "UNKNOWN",
        reason: "invalid-source",
        tier: "UNKNOWN",
        basis: null,
      });
      continue;
    }
    const tier = matchedTier(cell.id, cell.provenance, tiers, invalid);
    const row = rowFrom(
      cell.id,
      cell.bytes,
      cell.provenance,
      unusableInventory ? undefined : observations.get(cell.id),
      tier,
    );
    rows.push(row);
  }
  // Duplicate declarations and observations invalidate every matching row.
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row && invalid.has(row.id)) {
      rows[index] = {
        ...row,
        state: "UNKNOWN",
        reason: "duplicate",
        tier: "UNKNOWN",
        basis: null,
      };
    }
  }
  if (!unusableInventory) {
    for (const observation of observations.values()) {
      if (seen.has(observation.id)) continue;
      issues.push("unlisted-observation");
      rows.push({
        id: observation.id,
        expectedBytes: null,
        source: null,
        observedSource: observation.provenance,
        state: "UNKNOWN",
        reason: "unlisted",
        tier: "UNKNOWN",
        basis: null,
      });
    }
  }
  const saved = rows.filter((row) => row.state === "saved").length;
  const unknown = rows.length - saved;
  const tierUnknown = rows.filter((row) => row.tier === "UNKNOWN").length;
  const risky = rows.some((row) => row.reason === "invalid-source" ||
    row.reason === "duplicate" || row.reason === "metadata-conflict" ||
    row.reason === "unreadable" || row.reason === "unlisted");
  const state = issues.length > 0 || unusableInventory || risky ? "UNKNOWN" :
    unknown === 0 ? "complete" : "partial";
  return {
    regionId: manifest.regionId,
    state,
    rows,
    saved,
    unknown,
    tierUnknown,
    issues: [...new Set(issues)],
    listedBytes: countBytes(rows, false),
    savedBytes: state === "UNKNOWN" ? null : countBytes(rows, true),
  };
}

export type LedgerFilter = "all" | "saved" | "unknown" | "tier-unknown" | "source-issue";
export type LedgerOrder = "listed" | "id" | "size" | "date";
export interface LedgerQuery {
  readonly filter: LedgerFilter;
  readonly order: LedgerOrder;
  readonly search: string;
  readonly offset: number;
  readonly limit: number;
}
export interface LedgerPage {
  readonly rows: readonly SourceLedgerRow[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

/** Deterministic, bounded metadata browsing; no disk or network access. */
export function browseSourceLedger(ledger: LedgerSummary, query: LedgerQuery): LedgerPage {
  const search = query.search.trim().slice(0, 160).normalize("NFKC").toLocaleLowerCase();
  const matches = (row: SourceLedgerRow): boolean => {
    if (query.filter === "saved" && row.state !== "saved") return false;
    if (query.filter === "unknown" && row.state !== "UNKNOWN") return false;
    if (query.filter === "tier-unknown" && row.tier !== "UNKNOWN") return false;
    if (query.filter === "source-issue" && ![
      "invalid-source", "metadata-conflict", "duplicate", "unlisted",
    ].includes(row.reason)) return false;
    if (!search) return true;
    return [row.id, row.state, row.reason, row.tier, row.source?.source,
      row.source?.licence, row.source?.date, row.observedSource?.source,
      row.basis].filter((value): value is string => value !== undefined && value !== null)
      .some((value) => value.normalize("NFKC").toLocaleLowerCase().includes(search));
  };
  const rows = ledger.rows.filter(matches);
  if (query.order === "id") rows.sort((a, b) => a.id.localeCompare(b.id));
  if (query.order === "size") rows.sort((a, b) =>
    (b.expectedBytes ?? -1) - (a.expectedBytes ?? -1) || a.id.localeCompare(b.id));
  if (query.order === "date") rows.sort((a, b) =>
    (b.source?.date ?? "").localeCompare(a.source?.date ?? "") || a.id.localeCompare(b.id));
  const limit = Number.isSafeInteger(query.limit) ? Math.max(1, Math.min(query.limit, 100)) : 12;
  const offset = Number.isSafeInteger(query.offset) ? Math.max(0, query.offset) : 0;
  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    offset,
    limit,
    hasNext: offset + limit < rows.length,
    hasPrevious: offset > 0,
  };
}

/** Metadata-only export; never includes downloaded cell bodies. */
export function encodeSourceLedger(ledger: LedgerSummary): string {
  const output = {
    schema: "offline-source-ledger-v1",
    regionId: ledger.regionId,
    state: ledger.state,
    saved: ledger.saved,
    unknown: ledger.unknown,
    tierUnknown: ledger.tierUnknown,
    issues: ledger.issues,
    listedBytes: ledger.listedBytes,
    savedBytes: ledger.savedBytes,
    cells: ledger.rows.map((row) => ({ ...row })),
  };
  return `${JSON.stringify(output, null, 2)}\n`;
}
