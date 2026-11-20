import type { Provenance, RegionManifest, StorageEstimate } from "./regionDownload";
import type { RegionInventory, InventoryCell } from "./regionInventory";
import { OPEN_LICENCES } from "./manifestAudit";

/** This is a simulation of local copies, not a description of a location. */
export type DrillCause =
  | "present" | "missing" | "stale" | "unreadable" | "unlisted"
  | "inventory-unavailable" | "inventory-conflict" | "invalid-manifest"
  | "simulated-eviction" | "simulated-source-change" | "simulated-capacity";
export type DrillStatus = "saved" | "UNKNOWN";
export type DrillScenario = "baseline" | "evict-largest" | "evict-oldest" | "source-change" | "quota-reduction";
export type DrillSort = "listed" | "id" | "bytes-desc" | "status" | "source";
export type DrillFilter = "all" | "saved" | "UNKNOWN" | "affected" | "unaffected";
export interface DrillSettings {
  readonly scenario: DrillScenario;
  readonly affectedCount: number;
  readonly reductionBytes: number;
  readonly preserveReserveBytes: number;
}
export interface DrillCell {
  readonly id: string;
  readonly index: number;
  readonly expectedBytes: number | null;
  readonly provenance: Provenance | null;
  readonly before: DrillStatus;
  readonly after: DrillStatus;
  readonly cause: DrillCause;
  readonly affected: boolean;
  readonly reason: DrillCause;
}
export interface DrillTotals {
  readonly listed: number;
  readonly beforeSaved: number;
  readonly afterSaved: number;
  readonly beforeUnknown: number;
  readonly afterUnknown: number;
  readonly affected: number;
  readonly listedBytes: number | null;
  readonly afterSavedBytes: number | null;
  readonly hypotheticalLossBytes: number | null;
}
export interface DrillResult {
  readonly schema: "offline-continuity-drill-v1";
  readonly regionId: string;
  readonly scenario: DrillScenario;
  readonly status: "complete" | "partial" | "UNKNOWN";
  readonly confidence: "known-local-records" | "UNKNOWN";
  readonly settings: DrillSettings;
  readonly findings: readonly string[];
  readonly totals: DrillTotals;
  readonly cells: readonly DrillCell[];
  readonly quota: { readonly freeBytes: number | null; readonly projectedFreeBytes: number | null };
}
export interface DrillPage {
  readonly rows: readonly DrillCell[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly next: boolean;
  readonly previous: boolean;
}
export const DEFAULT_DRILL_SETTINGS: DrillSettings = {
  scenario: "baseline", affectedCount: 1, reductionBytes: 0, preserveReserveBytes: 1024 * 1024,
};
export const MAX_DRILL_CELLS = 25_000;
export const MAX_DRILL_AFFECTED = 1_000;
export const MAX_DRILL_PAGE = 100;
const TYPES: readonly DrillScenario[] = [
  "baseline", "evict-largest", "evict-oldest", "source-change", "quota-reduction",
];

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validProvenance(value: Provenance): boolean {
  return value.source.trim().length > 0 && value.source.length <= 500 &&
    OPEN_LICENCES.some((licence) => licence === value.licence) && validDate(value.date);
}
function sameSource(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}
function nonnegative(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
function sum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!nonnegative(value) || !Number.isSafeInteger(total + value)) return null;
    total += value;
  }
  return total;
}
function normalizedSettings(input: DrillSettings): DrillSettings {
  if (!TYPES.includes(input.scenario)) throw new RangeError("Invalid drill scenario");
  if (!nonnegative(input.affectedCount) || input.affectedCount > MAX_DRILL_AFFECTED) {
    throw new RangeError("Invalid affected cell count");
  }
  if (!nonnegative(input.reductionBytes) || !nonnegative(input.preserveReserveBytes)) {
    throw new RangeError("Invalid capacity settings");
  }
  return { ...input };
}
function inventoryIndex(inventory: RegionInventory | null): {
  readonly entries: ReadonlyMap<string, InventoryCell>;
  readonly findings: string[];
} {
  const entries = new Map<string, InventoryCell>();
  const findings: string[] = [];
  if (inventory === null) {
    findings.push("inventory-unavailable");
    return { entries, findings };
  }
  for (const cell of inventory.cells) {
    if (entries.has(cell.id)) findings.push("duplicate-inventory");
    entries.set(cell.id, cell);
  }
  if (inventory.cells.length !== inventory.savedCount + inventory.unknownCount) {
    findings.push("inventory-count-mismatch");
  }
  if (inventory.cells.length > MAX_DRILL_CELLS) findings.push("too-many-inventory-cells");
  return { entries, findings };
}
function estimateFree(estimate: StorageEstimate): number | null {
  if (estimate.quota === undefined || estimate.usage === undefined ||
    !Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage) ||
    estimate.quota < 0 || estimate.usage < 0 || estimate.usage > estimate.quota) return null;
  const free = Math.floor(estimate.quota - estimate.usage);
  return nonnegative(free) ? free : null;
}
function emptyResult(
  manifest: RegionManifest, settings: DrillSettings, findings: string[],
  estimate: StorageEstimate,
): DrillResult {
  return {
    schema: "offline-continuity-drill-v1", regionId: manifest.regionId,
    scenario: settings.scenario, status: "UNKNOWN", confidence: "UNKNOWN",
    settings, findings,
    totals: { listed: manifest.cells.length, beforeSaved: 0, afterSaved: 0,
      beforeUnknown: manifest.cells.length, afterUnknown: manifest.cells.length,
      affected: 0, listedBytes: null, afterSavedBytes: null, hypotheticalLossBytes: null },
    cells: manifest.cells.slice(0, MAX_DRILL_CELLS).map((cell, index) => ({
      id: cell.id, index, expectedBytes: nonnegative(cell.bytes) ? cell.bytes : null,
      provenance: validProvenance(cell.provenance) ? cell.provenance : null,
      before: "UNKNOWN", after: "UNKNOWN", cause: "invalid-manifest",
      reason: "invalid-manifest", affected: false,
    })),
    quota: { freeBytes: estimateFree(estimate), projectedFreeBytes: null },
  };
}
/** Pure planning: it never reads a device, fetches data, or writes to storage. */
export function runContinuityDrill(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  settingsInput: DrillSettings = DEFAULT_DRILL_SETTINGS,
  estimate: StorageEstimate = {},
): DrillResult {
  const settings = normalizedSettings(settingsInput);
  const findings: string[] = [];
  if (!manifest.regionId.trim()) findings.push("invalid-region-id");
  if (manifest.cells.length > MAX_DRILL_CELLS) findings.push("too-many-manifest-cells");
  const ids = new Set<string>();
  for (const cell of manifest.cells) {
    if (!cell.id.trim() || cell.id.length > 160) findings.push("invalid-cell-id");
    if (ids.has(cell.id)) findings.push("duplicate-manifest-id");
    ids.add(cell.id);
    if (!nonnegative(cell.bytes)) findings.push("invalid-cell-size");
    if (!validProvenance(cell.provenance)) findings.push("invalid-source");
  }
  const scan = inventoryIndex(inventory);
  findings.push(...scan.findings);
  if (inventory !== null && inventory.regionId !== manifest.regionId) findings.push("region-mismatch");
  if (inventory !== null) {
    for (const cell of inventory.cells) if (!ids.has(cell.id)) findings.push("unlisted-cell");
  }
  if (findings.length) return emptyResult(manifest, settings, [...new Set(findings)], estimate);
  const freeBytes = estimateFree(estimate);
  const rows: DrillCell[] = manifest.cells.map((cell, index) => {
    const observed = scan.entries.get(cell.id);
    let cause: DrillCause = "unreadable";
    let before: DrillStatus = "UNKNOWN";
    if (!observed) cause = "unreadable";
    else if (observed.cause === "missing") cause = "missing";
    else if (observed.cause === "stale") cause = "stale";
    else if (observed.cause === "unreadable") cause = "unreadable";
    else if (observed.expectedBytes !== cell.bytes || !sameSource(observed.provenance, cell.provenance)) {
      cause = "inventory-conflict";
    } else if (observed.state === "saved" && observed.cause === "present") {
      cause = "present";
      before = "saved";
    } else cause = "unreadable";
    return {
      id: cell.id, index, expectedBytes: cell.bytes, provenance: cell.provenance,
      before, after: before, cause, reason: cause, affected: false,
    };
  });
  const saved = rows.filter((row) => row.before === "saved");
  let eligible: DrillCell[] = [];
  if (settings.scenario === "evict-largest") {
    eligible = [...saved].sort((a, b) => (b.expectedBytes ?? 0) - (a.expectedBytes ?? 0) || a.index - b.index);
  } else if (settings.scenario === "evict-oldest") {
    eligible = [...saved].sort((a, b) =>
      (a.provenance?.date ?? "").localeCompare(b.provenance?.date ?? "") || a.index - b.index);
  } else if (settings.scenario === "source-change") {
    eligible = [...saved].sort((a, b) => a.index - b.index);
  } else if (settings.scenario === "quota-reduction") {
    eligible = [...saved].sort((a, b) => (b.expectedBytes ?? 0) - (a.expectedBytes ?? 0) || a.index - b.index);
  }
  const selected = new Set<string>();
  if (settings.scenario === "quota-reduction") {
    if (freeBytes !== null) {
      let consumed = 0;
      const shortfall = Math.max(0, settings.reductionBytes + settings.preserveReserveBytes - freeBytes);
      for (const cell of eligible) {
        if (consumed >= shortfall) break;
        selected.add(cell.id);
        consumed += cell.expectedBytes ?? 0;
      }
    }
  } else {
    for (const cell of eligible.slice(0, settings.affectedCount)) selected.add(cell.id);
  }
  const simulated: DrillCell[] = rows.map((row) => {
    if (!selected.has(row.id)) return row;
    const reason: DrillCause = settings.scenario === "source-change" ? "simulated-source-change" :
      settings.scenario === "quota-reduction" ? "simulated-capacity" : "simulated-eviction";
    return { ...row, after: "UNKNOWN", reason, affected: true };
  });
  const beforeSaved = saved.length;
  const afterSaved = simulated.filter((row) => row.after === "saved").length;
  const listedBytes = sum(manifest.cells.map((cell) => cell.bytes));
  const afterSavedBytes = sum(simulated.filter((row) => row.after === "saved")
    .map((row) => row.expectedBytes ?? -1));
  const hypotheticalLossBytes = sum(simulated.filter((row) => row.affected)
    .map((row) => row.expectedBytes ?? -1));
  const hasUncertainInputs = simulated.some((row) => row.cause === "unreadable" || row.cause === "inventory-conflict") ||
    (settings.scenario === "quota-reduction" && freeBytes === null);
  if (settings.scenario === "quota-reduction" && freeBytes === null) findings.push("quota-unknown");
  const projectedFreeBytes = freeBytes === null ? null : Math.max(0,
    freeBytes - settings.reductionBytes + (hypotheticalLossBytes ?? 0));
  return {
    schema: "offline-continuity-drill-v1", regionId: manifest.regionId,
    scenario: settings.scenario,
    status: hasUncertainInputs ? "UNKNOWN" : afterSaved === manifest.cells.length ? "complete" : "partial",
    confidence: hasUncertainInputs ? "UNKNOWN" : "known-local-records",
    settings, findings,
    totals: {
      listed: manifest.cells.length, beforeSaved, afterSaved,
      beforeUnknown: manifest.cells.length - beforeSaved,
      afterUnknown: manifest.cells.length - afterSaved,
      affected: simulated.filter((row) => row.affected).length,
      listedBytes, afterSavedBytes, hypotheticalLossBytes,
    },
    cells: simulated,
    quota: { freeBytes, projectedFreeBytes },
  };
}
/** Local search and paging does not change the underlying assessment. */
export function pageContinuityDrill(
  result: DrillResult,
  options: { readonly search: string; readonly filter: DrillFilter; readonly sort: DrillSort;
    readonly offset: number; readonly limit: number },
): DrillPage {
  const search = options.search.slice(0, 160).trim().normalize("NFKC").toLocaleLowerCase();
  const filtered = result.cells.filter((cell) => {
    if (options.filter === "saved" && cell.after !== "saved") return false;
    if (options.filter === "UNKNOWN" && cell.after !== "UNKNOWN") return false;
    if (options.filter === "affected" && !cell.affected) return false;
    if (options.filter === "unaffected" && cell.affected) return false;
    return !search || [cell.id, cell.reason, cell.provenance?.source,
      cell.provenance?.licence, cell.provenance?.date]
      .filter((item): item is string => typeof item === "string")
      .join("\n").normalize("NFKC").toLocaleLowerCase().includes(search);
  });
  if (options.sort !== "listed") filtered.sort((a, b) => {
    if (options.sort === "id") return a.id.localeCompare(b.id) || a.index - b.index;
    if (options.sort === "bytes-desc") return (b.expectedBytes ?? -1) - (a.expectedBytes ?? -1) || a.index - b.index;
    if (options.sort === "status") return a.after.localeCompare(b.after) || a.index - b.index;
    return (a.provenance?.source ?? "").localeCompare(b.provenance?.source ?? "") || a.index - b.index;
  });
  const limit = Number.isSafeInteger(options.limit) ? Math.max(1, Math.min(MAX_DRILL_PAGE, options.limit)) : 12;
  const offset = Number.isSafeInteger(options.offset) && options.offset > 0 ? options.offset : 0;
  return { rows: filtered.slice(offset, offset + limit), total: filtered.length,
    offset, limit, next: offset + limit < filtered.length, previous: offset > 0 };
}
/** A manifest's provenance is not evidence of a place's accessibility. */
export function drillSourceSummary(result: DrillResult): readonly {
  readonly source: Provenance;
  readonly count: number;
  readonly afterSaved: number;
  readonly affected: number;
}[] {
  const groups = new Map<string, { source: Provenance; count: number; afterSaved: number; affected: number }>();
  for (const cell of result.cells) {
    if (cell.provenance === null) continue;
    const key = JSON.stringify([cell.provenance.source, cell.provenance.licence, cell.provenance.date]);
    const group = groups.get(key) ?? { source: cell.provenance, count: 0, afterSaved: 0, affected: 0 };
    group.count += 1;
    if (cell.after === "saved") group.afterSaved += 1;
    if (cell.affected) group.affected += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.source.source.localeCompare(b.source.source));
}
