import type { Provenance, RegionManifest, StorageEstimate } from "./regionDownload.ts";
import type { RegionInventory, InventoryCell } from "./regionInventory.ts";
import { OPEN_LICENCES } from "./manifestAudit.ts";

/** Planning only: estimated device capacity is not an allocation or a stored copy. */
export type ScenarioStatus = "possible" | "insufficient" | "UNKNOWN";
export type CellDisposition = "saved" | "candidate" | "blocked" | "UNKNOWN";
export type CandidateReason =
  | "saved" | "missing" | "stale" | "unreadable" | "not-inspected"
  | "metadata-conflict" | "duplicate" | "invalid-listing" | "unlisted";
export type BlockReason =
  | "manifest-invalid" | "inventory-unavailable" | "inventory-region-mismatch"
  | "duplicate-inventory" | "unlisted-inventory" | "inventory-inconsistent";

export interface ScenarioInput {
  readonly manifest: RegionManifest;
  readonly inventory: RegionInventory | null;
  readonly estimate: StorageEstimate;
  readonly reserveBytes: number;
  /** Additional estimated bytes per downloaded cell, not a quota prediction. */
  readonly overheadBytes: number;
  /** Maximum number of items shown in any one proposed batch. */
  readonly maxBatchCells: number;
}

export interface ScenarioCell {
  readonly id: string;
  readonly listedBytes: number | null;
  readonly source: Provenance | null;
  readonly disposition: CellDisposition;
  readonly reason: CandidateReason;
  readonly plannedBytes: number | null;
  readonly selected: boolean;
}

export interface ScenarioBatch {
  readonly ordinal: number;
  readonly ids: readonly string[];
  readonly bytes: number;
  readonly source: Provenance;
  readonly status: ScenarioStatus;
  /** Capacity remaining after this proposed batch, or UNKNOWN. */
  readonly remainingBytes: number | null;
}

export interface ScenarioTotals {
  readonly listedCells: number;
  readonly savedCells: number;
  readonly candidateCells: number;
  readonly unknownCells: number;
  readonly blockedCells: number;
  readonly listedBytes: number | null;
  readonly savedBytes: number | null;
  readonly candidateBytes: number | null;
  readonly totalPlannedBytes: number | null;
  readonly freeBytes: number | null;
  readonly reserveBytes: number;
  readonly overheadBytes: number;
}

export interface ScenarioPlan {
  readonly regionId: string;
  readonly status: ScenarioStatus;
  readonly reason: string;
  readonly cells: readonly ScenarioCell[];
  readonly batches: readonly ScenarioBatch[];
  readonly blocks: readonly BlockReason[];
  readonly totals: ScenarioTotals;
  readonly suggestedIds: readonly string[];
}

export const DEFAULT_SCENARIO_OPTIONS = {
  reserveBytes: 1024 * 1024,
  overheadBytes: 4096,
  maxBatchCells: 25,
} as const;

const MAX_CELLS = 50_000;
const MAX_BATCHES = 50_000;
const MAX_SOURCE_LENGTH = 500;

function exactDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validProvenance(value: Provenance): boolean {
  return value.source.trim().length > 0 && value.source.length <= MAX_SOURCE_LENGTH &&
    OPEN_LICENCES.some((licence) => licence === value.licence) && exactDate(value.date);
}

function sameSource(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function sumSafe(values: readonly number[]): number | null {
  let total = 0;
  for (const n of values) {
    if (!Number.isSafeInteger(n) || n < 0 || total > Number.MAX_SAFE_INTEGER - n) {
      return null;
    }
    total += n;
  }
  return total;
}

function capacity(estimate: StorageEstimate): number | null {
  const { quota, usage } = estimate;
  if (quota === undefined || usage === undefined ||
    !Number.isSafeInteger(quota) || !Number.isSafeInteger(usage) ||
    quota < 0 || usage < 0 || usage > quota) return null;
  return quota - usage;
}

function validOptions(input: ScenarioInput): boolean {
  return Number.isSafeInteger(input.reserveBytes) && input.reserveBytes >= 0 &&
    Number.isSafeInteger(input.overheadBytes) && input.overheadBytes >= 0 &&
    Number.isSafeInteger(input.maxBatchCells) && input.maxBatchCells >= 1 &&
    input.maxBatchCells <= 500;
}

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 160 &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) && !value.includes("..");
}

function manifestProblems(manifest: RegionManifest): boolean {
  if (!validId(manifest.regionId) || manifest.cells.length > MAX_CELLS) return true;
  const ids = new Set<string>();
  for (const cell of manifest.cells) {
    if (!validId(cell.id) || ids.has(cell.id) ||
      !Number.isSafeInteger(cell.bytes) || cell.bytes < 0 ||
      !validProvenance(cell.provenance)) return true;
    ids.add(cell.id);
  }
  return false;
}

function observationMatches(cell: InventoryCell, expected: RegionManifest["cells"][number]): boolean {
  return cell.id === expected.id && cell.expectedBytes === expected.bytes &&
    sameSource(cell.provenance, expected.provenance);
}

/**
 * A compromised inventory fails the entire proposal closed. Individual stale
 * and unreadable entries remain explicit, but are not silently counted saved.
 */
function inventoryProblems(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
): BlockReason[] {
  if (inventory === null) return ["inventory-unavailable"];
  const blocks: BlockReason[] = [];
  if (inventory.regionId !== manifest.regionId) blocks.push("inventory-region-mismatch");
  const expected = new Set(manifest.cells.map((cell) => cell.id));
  const ids = new Set<string>();
  for (const cell of inventory.cells) {
    if (ids.has(cell.id)) blocks.push("duplicate-inventory");
    if (!expected.has(cell.id)) blocks.push("unlisted-inventory");
    ids.add(cell.id);
  }
  const saved = inventory.cells.filter((cell) => cell.state === "saved" && cell.cause === "present");
  const listed = sumSafe(inventory.cells.map((cell) => cell.expectedBytes));
  const savedBytes = sumSafe(saved.map((cell) => cell.expectedBytes));
  if (!Number.isSafeInteger(inventory.savedCount) || !Number.isSafeInteger(inventory.unknownCount) ||
    inventory.savedCount !== saved.length ||
    inventory.unknownCount !== inventory.cells.length - saved.length ||
    savedBytes !== inventory.savedBytes || listed !== inventory.expectedBytes ||
    inventory.complete !== (inventory.unknownCount === 0 && inventory.cells.length === manifest.cells.length)) {
    blocks.push("inventory-inconsistent");
  }
  return [...new Set(blocks)];
}

/** Never infer a source tier or location accessibility from the pack. */
function classify(
  item: RegionManifest["cells"][number],
  observation: InventoryCell | undefined,
  overhead: number,
  allowed: boolean,
): ScenarioCell {
  const base = { id: item.id, listedBytes: item.bytes, source: item.provenance };
  if (!allowed) {
    return { ...base, disposition: "UNKNOWN", reason: "invalid-listing", plannedBytes: null, selected: false };
  }
  if (observation === undefined) {
    return { ...base, disposition: "UNKNOWN", reason: "not-inspected", plannedBytes: null, selected: false };
  }
  if (!observationMatches(observation, item)) {
    return { ...base, disposition: "UNKNOWN", reason: "metadata-conflict", plannedBytes: null, selected: false };
  }
  if (observation.state === "saved" && observation.cause === "present") {
    return { ...base, disposition: "saved", reason: "saved", plannedBytes: 0, selected: false };
  }
  if (observation.cause === "unreadable" ||
    observation.state === "saved" || observation.cause === "present") {
    return { ...base, disposition: "UNKNOWN", reason: "unreadable", plannedBytes: null, selected: false };
  }
  if (observation.cause !== "missing" && observation.cause !== "stale") {
    return { ...base, disposition: "UNKNOWN", reason: "unreadable", plannedBytes: null, selected: false };
  }
  const cost = sumSafe([item.bytes, overhead]);
  if (cost === null) {
    return { ...base, disposition: "blocked", reason: "invalid-listing", plannedBytes: null, selected: false };
  }
  return {
    ...base, disposition: "candidate", reason: observation.cause,
    plannedBytes: cost, selected: true,
  };
}

function groupedBatches(
  candidates: readonly ScenarioCell[],
  limit: number,
  available: number | null,
): ScenarioBatch[] {
  const groups = new Map<string, ScenarioCell[]>();
  for (const candidate of candidates) {
    if (candidate.source === null || candidate.plannedBytes === null) continue;
    const p = candidate.source;
    const key = JSON.stringify([p.source, p.licence, p.date]);
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  const batches: ScenarioBatch[] = [];
  let remaining = available;
  for (const group of groups.values()) {
    for (let offset = 0; offset < group.length; offset += limit) {
      if (batches.length >= MAX_BATCHES) return batches;
      const segment = group.slice(offset, offset + limit);
      const first = segment[0];
      if (!first?.source) continue;
      const bytes = sumSafe(segment.map((cell) => cell.plannedBytes ?? -1));
      if (bytes === null) continue;
      const fits = remaining !== null && bytes <= remaining;
      const status: ScenarioStatus = remaining === null ? "UNKNOWN" : fits ? "possible" : "insufficient";
      if (remaining !== null && fits) remaining -= bytes;
      batches.push({
        ordinal: batches.length + 1,
        ids: segment.map((cell) => cell.id), bytes, source: first.source,
        status, remainingBytes: remaining,
      });
    }
  }
  return batches;
}

/**
 * Pure, conservative scenario: no writes, fetches, timing, or permissions.
 * The reserve is subtracted before grouping. Sufficient estimates remain
 * advisory because actual device writes can fail independently.
 */
export function planStorageScenario(input: ScenarioInput): ScenarioPlan {
  const manifestValid = !manifestProblems(input.manifest);
  const blocks: BlockReason[] = manifestValid ? [] : ["manifest-invalid"];
  if (manifestValid) blocks.push(...inventoryProblems(input.manifest, input.inventory));
  const safe = manifestValid && blocks.length === 0 && validOptions(input);
  if (!validOptions(input) && !blocks.includes("manifest-invalid")) blocks.push("manifest-invalid");
  const observed = new Map(input.inventory?.cells.map((cell) => [cell.id, cell] as const) ?? []);
  const cells = input.manifest.cells.map((cell) =>
    classify(cell, observed.get(cell.id), input.overheadBytes, safe));
  const saved = cells.filter((cell) => cell.disposition === "saved");
  const candidates = cells.filter((cell) => cell.disposition === "candidate" && cell.selected);
  const unknown = cells.filter((cell) => cell.disposition === "UNKNOWN");
  const freeBytes = capacity(input.estimate);
  const usable = freeBytes === null || !validOptions(input) ? null :
    Math.max(0, freeBytes - input.reserveBytes);
  const candidateBytes = sumSafe(candidates.map((cell) => cell.listedBytes ?? -1));
  const totalPlannedBytes = sumSafe(candidates.map((cell) => cell.plannedBytes ?? -1));
  const batches = safe ? groupedBatches(candidates, input.maxBatchCells, usable) : [];
  const status: ScenarioStatus = !safe || unknown.length > 0 ||
    cells.some((cell) => cell.disposition === "blocked") || freeBytes === null ||
    totalPlannedBytes === null ? "UNKNOWN" :
    totalPlannedBytes <= usable! ? "possible" : "insufficient";
  const reason = !safe ? "blocked" : unknown.length > 0 ? "unknown-cells" :
    freeBytes === null ? "unknown-capacity" : status === "possible" ? "estimated-space" : "estimated-shortage";
  return {
    regionId: input.manifest.regionId,
    status, reason, cells, batches, blocks,
    suggestedIds: safe ? candidates.map((cell) => cell.id) : [],
    totals: {
      listedCells: input.manifest.cells.length,
      savedCells: saved.length,
      candidateCells: candidates.length,
      unknownCells: unknown.length,
      blockedCells: cells.filter((cell) => cell.disposition === "blocked").length,
      listedBytes: sumSafe(input.manifest.cells.map((cell) => cell.bytes)),
      savedBytes: safe ? sumSafe(saved.map((cell) => cell.listedBytes ?? -1)) : null,
      candidateBytes, totalPlannedBytes, freeBytes,
      reserveBytes: input.reserveBytes,
      overheadBytes: input.overheadBytes,
    },
  };
}

export type ScenarioFilter = "all" | "candidate" | "saved" | "UNKNOWN" | "blocked";
export type ScenarioSort = "listed" | "id" | "largest" | "smallest" | "reason";
export interface ScenarioQuery {
  readonly filter: ScenarioFilter;
  readonly sort: ScenarioSort;
  readonly search: string;
  readonly offset: number;
  readonly limit: number;
}
export interface ScenarioPage {
  readonly cells: readonly ScenarioCell[];
  readonly total: number;
  readonly offset: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

/** Stable, bounded metadata-only browsing, including source and licence. */
export function browseStorageScenario(plan: ScenarioPlan, query: ScenarioQuery): ScenarioPage {
  const search = query.search.normalize("NFKC").trim().toLocaleLowerCase().slice(0, 160);
  const offset = Number.isSafeInteger(query.offset) ? Math.max(0, query.offset) : 0;
  const limit = Number.isSafeInteger(query.limit) ? Math.min(100, Math.max(1, query.limit)) : 12;
  const cells = plan.cells.filter((cell) => {
    if (query.filter !== "all" && cell.disposition !== query.filter) return false;
    if (!search) return true;
    const phrase = [cell.id, cell.reason, cell.source?.source, cell.source?.licence,
      cell.source?.date].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
    return phrase.includes(search);
  });
  if (query.sort !== "listed") {
    cells.sort((a, b) => {
      if (query.sort === "id") return a.id.localeCompare(b.id);
      if (query.sort === "reason") return a.reason.localeCompare(b.reason) || a.id.localeCompare(b.id);
      if (query.sort === "largest") return (b.listedBytes ?? -1) - (a.listedBytes ?? -1) || a.id.localeCompare(b.id);
      return (a.listedBytes ?? Number.MAX_SAFE_INTEGER) - (b.listedBytes ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id);
    });
  }
  return {
    cells: cells.slice(offset, offset + limit), total: cells.length, offset,
    hasNext: offset + limit < cells.length, hasPrevious: offset > 0,
  };
}

/** Metadata-only source grouping for a concise region comparison. */
export function scenarioSources(plan: ScenarioPlan): readonly {
  source: Provenance; cells: number; saved: number; candidates: number; unknown: number; bytes: number | null;
}[] {
  const group = new Map<string, ScenarioCell[]>();
  for (const cell of plan.cells) {
    if (cell.source === null) continue;
    const { source } = cell;
    const key = JSON.stringify([source.source, source.licence, source.date]);
    const rows = group.get(key) ?? [];
    rows.push(cell);
    group.set(key, rows);
  }
  return [...group.values()].map((rows) => ({
    source: rows[0]!.source!,
    cells: rows.length,
    saved: rows.filter((row) => row.disposition === "saved").length,
    candidates: rows.filter((row) => row.disposition === "candidate").length,
    unknown: rows.filter((row) => row.disposition === "UNKNOWN").length,
    bytes: sumSafe(rows.map((row) => row.listedBytes ?? -1)),
  }));
}
