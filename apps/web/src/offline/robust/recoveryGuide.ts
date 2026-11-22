import type { Provenance, RegionManifest, StorageEstimate } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** Advice is about saving offline cells, never about a physical location. */
export type GuideIssue =
  | "missing" | "stale" | "unreadable" | "metadata-conflict"
  | "invalid-listing" | "inventory-unavailable" | "duplicate"
  | "unlisted" | "storage-unknown" | "storage-low";
export type GuideAction = "retry" | "inspect" | "review-source" | "free-space" | "none";
export type GuideCellState = "saved" | "UNKNOWN";
export type GuidePriority = "attention" | "review" | "information";
export type GuideGate = "ready" | "blocked" | "UNKNOWN";
export type GuideFilter = "all" | "saved" | "unknown" | "retry" | "inspect" | "source";
export type GuideOrder = "listed" | "id" | "bytes-large" | "bytes-small" | "action";

export interface GuideCell {
  readonly id: string;
  readonly state: GuideCellState;
  readonly issue: GuideIssue | null;
  readonly action: GuideAction;
  readonly priority: GuidePriority;
  readonly bytes: number | null;
  readonly provenance: Provenance | null;
  readonly observed: Provenance | null;
  readonly retryAllowed: boolean;
  readonly position: number;
}

export interface GuideTotals {
  readonly listed: number;
  readonly saved: number;
  readonly unknown: number;
  readonly retry: number;
  readonly inspect: number;
  readonly source: number;
  readonly invalid: number;
  readonly listedBytes: number | null;
  readonly retryBytes: number | null;
}

export interface GuidePlan {
  readonly regionId: string;
  readonly gate: GuideGate;
  readonly issues: readonly GuideIssue[];
  readonly cells: readonly GuideCell[];
  readonly totals: GuideTotals;
  readonly freeBytes: number | null;
  readonly reserveBytes: number;
  readonly retryEstimate: "yes" | "no" | "UNKNOWN";
}

export interface GuidePage {
  readonly cells: readonly GuideCell[];
  readonly total: number;
  readonly start: number;
  readonly limit: number;
  readonly previous: boolean;
  readonly next: boolean;
}

export interface GuideQuery {
  readonly text: string;
  readonly filter: GuideFilter;
  readonly order: GuideOrder;
  readonly start: number;
  readonly limit: number;
}

export interface GuideRequest {
  readonly regionId: string;
  readonly ids: readonly string[];
  readonly eligibleBytes: number;
  readonly gate: GuideGate;
  readonly reasons: readonly string[];
}

export const GUIDE_DEFAULT_RESERVE_BYTES = 1024 * 1024;
export const GUIDE_MAX_RECOVERY_CELLS = 50_000;
export const GUIDE_MAX_REQUEST_CELLS = 200;
export const GUIDE_MAX_CELL_BYTES = 256 * 1024 * 1024;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validProvenance(value: Provenance): boolean {
  return value.source.trim().length > 0 && value.source.length <= 500 &&
    OPEN_LICENCES.some((licence) => licence === value.licence) && validDate(value.date) &&
    !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value.source);
}

function sameProvenance(first: Provenance, second: Provenance): boolean {
  return first.source === second.source && first.licence === second.licence &&
    first.date === second.date;
}

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 160 &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) && !value.includes("..");
}

function validBytes(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= GUIDE_MAX_CELL_BYTES;
}

function amount(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!validBytes(value)) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function noEvidence(cell: RegionManifest["cells"][number], position: number,
  issue: GuideIssue, observed: Provenance | null = null): GuideCell {
  return {
    id: cell.id, position, state: "UNKNOWN", issue,
    action: issue === "invalid-listing" || issue === "metadata-conflict" ? "review-source" : "inspect",
    priority: "review", bytes: validBytes(cell.bytes) ? cell.bytes : null,
    provenance: validProvenance(cell.provenance) ? cell.provenance : null,
    observed, retryAllowed: false,
  };
}

function classify(cell: RegionManifest["cells"][number], position: number,
  observed: InventoryCell | undefined): GuideCell {
  if (!observed) return noEvidence(cell, position, "unreadable");
  if (observed.id !== cell.id || observed.expectedBytes !== cell.bytes ||
      !sameProvenance(observed.provenance, cell.provenance)) {
    return noEvidence(cell, position, "metadata-conflict", observed.provenance);
  }
  const common = {
    id: cell.id, position, bytes: cell.bytes, provenance: cell.provenance,
    observed: observed.provenance,
  };
  if (observed.cause === "present" && observed.state === "saved") {
    return { ...common, state: "saved", issue: null, action: "none",
      priority: "information", retryAllowed: false };
  }
  if (observed.cause === "missing" && observed.state === "unknown") {
    return { ...common, state: "UNKNOWN", issue: "missing", action: "retry",
      priority: "attention", retryAllowed: true };
  }
  if (observed.cause === "stale" && observed.state === "unknown") {
    return { ...common, state: "UNKNOWN", issue: "stale", action: "retry",
      priority: "attention", retryAllowed: true };
  }
  return noEvidence(cell, position, "unreadable", observed.provenance);
}

function unknownPlan(manifest: RegionManifest, reasons: readonly GuideIssue[],
  reserveBytes: number, estimate: StorageEstimate): GuidePlan {
  const cells = manifest.cells.map((cell, position) => noEvidence(
    cell, position, reasons.includes("invalid-listing") ? "invalid-listing" : "inventory-unavailable",
  ));
  return {
    regionId: manifest.regionId, gate: "UNKNOWN", issues: reasons,
    cells, totals: {
      listed: cells.length, saved: 0, unknown: cells.length, retry: 0,
      inspect: cells.length, source: 0, invalid: reasons.length,
      listedBytes: null, retryBytes: null,
    }, freeBytes: storageFree(estimate), reserveBytes, retryEstimate: "UNKNOWN",
  };
}

/** Estimates are advisory. Invalid readings must not be used as available space. */
export function storageFree(estimate: StorageEstimate): number | null {
  const { quota, usage } = estimate;
  if (quota === undefined || usage === undefined || !Number.isSafeInteger(quota) ||
      !Number.isSafeInteger(usage) || usage < 0 || quota < 0 || usage > quota) return null;
  return quota - usage;
}

/**
 * Pure offline inventory review. No network or filesystem calls.
 * An invalid manifest or inconsistent inventory produces no retry advice.
 */
export function buildRecoveryPlan(
  manifest: RegionManifest, inventory: RegionInventory | null,
  estimate: StorageEstimate, reserveBytes = GUIDE_DEFAULT_RESERVE_BYTES,
): GuidePlan {
  if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 0) {
    throw new RangeError("Invalid storage reserve");
  }
  const reasons: GuideIssue[] = [];
  const identifiers = new Set<string>();
  if (!validId(manifest.regionId) || manifest.cells.length > GUIDE_MAX_RECOVERY_CELLS) {
    reasons.push("invalid-listing");
  }
  for (const cell of manifest.cells) {
    if (!validId(cell.id) || !validBytes(cell.bytes) || !validProvenance(cell.provenance)) {
      reasons.push("invalid-listing");
    }
    if (identifiers.has(cell.id)) reasons.push("duplicate");
    identifiers.add(cell.id);
  }
  if (inventory === null || inventory.regionId !== manifest.regionId) {
    reasons.push("inventory-unavailable");
  }
  const observed = new Map<string, InventoryCell>();
  if (inventory !== null && inventory.regionId === manifest.regionId) {
    for (const cell of inventory.cells) {
      if (observed.has(cell.id)) reasons.push("duplicate");
      if (!identifiers.has(cell.id)) reasons.push("unlisted");
      observed.set(cell.id, cell);
    }
  }
  if (reasons.length > 0) {
    return unknownPlan(manifest, [...new Set(reasons)], reserveBytes, estimate);
  }
  const cells = manifest.cells.map((cell, position) => classify(cell, position, observed.get(cell.id)));
  const saved = cells.filter((cell) => cell.state === "saved");
  const retry = cells.filter((cell) => cell.retryAllowed);
  const inspect = cells.filter((cell) => cell.action === "inspect");
  const source = cells.filter((cell) => cell.action === "review-source");
  const bad = cells.some((cell) => cell.issue === "metadata-conflict" || cell.issue === "unreadable");
  const listedBytes = amount(manifest.cells.map((cell) => cell.bytes));
  const retryBytes = amount(retry.map((cell) => cell.bytes ?? -1));
  const freeBytes = storageFree(estimate);
  const estimateStatus = freeBytes === null || retryBytes === null ? "UNKNOWN" :
    freeBytes - reserveBytes >= retryBytes ? "yes" : "no";
  const issues = [...new Set(cells.map((cell) => cell.issue).filter(
    (issue): issue is GuideIssue => issue !== null,
  ))];
  if (freeBytes === null) issues.push("storage-unknown");
  else if (estimateStatus === "no") issues.push("storage-low");
  const gate: GuideGate = bad ? "UNKNOWN" :
    estimateStatus === "no" ? "blocked" : estimateStatus === "UNKNOWN" ? "UNKNOWN" : "ready";
  return {
    regionId: manifest.regionId, gate, issues, cells, reserveBytes, freeBytes,
    retryEstimate: estimateStatus,
    totals: {
      listed: cells.length, saved: saved.length, unknown: cells.length - saved.length,
      retry: retry.length, inspect: inspect.length, source: source.length,
      invalid: 0, listedBytes, retryBytes,
    },
  };
}

/** Search on public metadata only. Never search downloaded contents. */
export function pageRecoveryPlan(plan: GuidePlan, query: GuideQuery): GuidePage {
  const text = query.text.trim().slice(0, 160).normalize("NFKC").toLocaleLowerCase();
  const limit = Number.isSafeInteger(query.limit) ? Math.max(1, Math.min(100, query.limit)) : 12;
  const start = Number.isSafeInteger(query.start) ? Math.max(0, query.start) : 0;
  const filtered = plan.cells.filter((cell) => {
    const filter = query.filter;
    if (filter === "saved" && cell.state !== "saved") return false;
    if (filter === "unknown" && cell.state !== "UNKNOWN") return false;
    if (filter === "retry" && !cell.retryAllowed) return false;
    if (filter === "inspect" && cell.action !== "inspect") return false;
    if (filter === "source" && cell.action !== "review-source") return false;
    const searchable = [cell.id, cell.issue ?? "", cell.provenance?.source ?? "",
      cell.provenance?.licence ?? "", cell.provenance?.date ?? ""].join(" ")
      .normalize("NFKC").toLocaleLowerCase();
    return searchable.includes(text);
  });
  if (query.order !== "listed") filtered.sort((a, b) => {
    switch (query.order) {
      case "id": return a.id.localeCompare(b.id);
      case "bytes-large": return (b.bytes ?? -1) - (a.bytes ?? -1) || a.position - b.position;
      case "bytes-small": return (a.bytes ?? Number.MAX_SAFE_INTEGER) -
        (b.bytes ?? Number.MAX_SAFE_INTEGER) || a.position - b.position;
      case "action": return a.action.localeCompare(b.action) || a.position - b.position;
      default: return a.position - b.position;
    }
  });
  return {
    cells: filtered.slice(start, start + limit), total: filtered.length, start, limit,
    previous: start > 0, next: start + limit < filtered.length,
  };
}

/** No user action is executed here; the UI may offer its own explicit button. */
export function proposeRecoveryRequest(
  plan: GuidePlan, selectedIds: readonly string[],
): GuideRequest {
  const reasons: string[] = [];
  if (plan.gate !== "ready") reasons.push("gate-not-ready");
  if (selectedIds.length > GUIDE_MAX_REQUEST_CELLS) reasons.push("selection-limit");
  const requested = new Set<string>();
  const ids: string[] = [];
  let eligibleBytes = 0;
  for (const id of selectedIds) {
    if (requested.has(id)) { reasons.push("duplicate-selection"); continue; }
    requested.add(id);
    const cell = plan.cells.find((row) => row.id === id);
    if (!cell || !cell.retryAllowed || cell.bytes === null) {
      reasons.push("not-eligible");
      continue;
    }
    eligibleBytes += cell.bytes;
    if (!Number.isSafeInteger(eligibleBytes)) reasons.push("size-overflow");
    ids.push(id);
  }
  if (ids.length === 0) reasons.push("empty-selection");
  if (plan.freeBytes === null ||
      eligibleBytes > plan.freeBytes - plan.reserveBytes) reasons.push("quota-unknown-or-low");
  return {
    regionId: plan.regionId, ids: reasons.length === 0 ? ids : [],
    eligibleBytes: reasons.length === 0 ? eligibleBytes : 0,
    gate: reasons.length === 0 ? "ready" : "blocked",
    reasons: [...new Set(reasons)],
  };
}

export function recoveryIssueCounts(plan: GuidePlan): Readonly<Record<GuideAction, number>> {
  const output: Record<GuideAction, number> = {
    retry: 0, inspect: 0, "review-source": 0, "free-space": 0, none: 0,
  };
  for (const cell of plan.cells) output[cell.action] += 1;
  return output;
}

export function recoverySourceGroups(plan: GuidePlan): readonly {
  readonly source: Provenance;
  readonly saved: number;
  readonly unknown: number;
  readonly retry: number;
  readonly listedBytes: number | null;
}[] {
  const groups = new Map<string, GuideCell[]>();
  for (const cell of plan.cells) {
    if (!cell.provenance) continue;
    const key = JSON.stringify([cell.provenance.source, cell.provenance.licence, cell.provenance.date]);
    groups.set(key, [...(groups.get(key) ?? []), cell]);
  }
  return [...groups.values()].flatMap((cells) => {
    const first = cells[0];
    if (!first?.provenance) return [];
    return [{
      source: first.provenance,
      saved: cells.filter((cell) => cell.state === "saved").length,
      unknown: cells.filter((cell) => cell.state === "UNKNOWN").length,
      retry: cells.filter((cell) => cell.retryAllowed).length,
      listedBytes: amount(cells.map((cell) => cell.bytes ?? -1)),
    }];
  });
}
