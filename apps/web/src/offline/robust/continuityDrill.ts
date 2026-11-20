import type { RegionManifest, StorageEstimate } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

export type DrillScenario = "baseline" | "evict-largest" | "evict-oldest" | "source-change" | "quota-reduction";
export type DrillStatus = "saved" | "UNKNOWN";
export type DrillFilter = "all" | "saved" | "UNKNOWN" | "affected";
export type DrillSort = "listed" | "bytes-desc" | "id";
export interface DrillSettings { readonly scenario: DrillScenario; readonly affectedCount: number; readonly reductionBytes: number; readonly preserveReserveBytes: number }
export interface DrillCell { readonly id: string; readonly bytes: number; readonly before: DrillStatus; readonly after: DrillStatus; readonly reason: string; readonly affected: boolean; readonly source: string; readonly licence: string; readonly date: string }
export interface DrillResult { readonly regionId: string; readonly scenario: DrillScenario; readonly status: "complete" | "UNKNOWN"; readonly cells: readonly DrillCell[]; readonly beforeSaved: number; readonly afterSaved: number; readonly affected: number; readonly quota: number | null }
export const DEFAULT_DRILL_SETTINGS: DrillSettings = { scenario: "baseline", affectedCount: 1, reductionBytes: 0, preserveReserveBytes: 0 };
const scenarios: readonly DrillScenario[] = ["baseline", "evict-largest", "evict-oldest", "source-change", "quota-reduction"];
function validNumber(n: number): boolean { return Number.isSafeInteger(n) && n >= 0; }
/** Runs a local hypothetical scenario; does not touch saved bytes. */
export function runContinuityDrill(manifest: RegionManifest, inventory: RegionInventory | null, settings: DrillSettings, estimate: StorageEstimate = {}): DrillResult {
  if (!manifest.regionId.trim() || !scenarios.includes(settings.scenario) ||
    !validNumber(settings.affectedCount) || !validNumber(settings.reductionBytes) ||
    !validNumber(settings.preserveReserveBytes)) throw new TypeError("Invalid drill settings");
  if (manifest.cells.length > 2048) throw new RangeError("Too many cells");
  const seen = new Set<string>();
  for (const cell of manifest.cells) {
    if (!cell.id.trim() || seen.has(cell.id) || !validNumber(cell.bytes) ||
      !cell.provenance.source.trim() || !cell.provenance.licence.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(cell.provenance.date)) throw new TypeError("Invalid cell metadata");
    seen.add(cell.id);
  }
  const aligned = inventory !== null && inventory.regionId === manifest.regionId &&
    inventory.cells.length === manifest.cells.length && new Set(inventory.cells.map((c) => c.id)).size === manifest.cells.length;
  const observations = aligned ? new Map(inventory.cells.map((c) => [c.id, c])) : new Map();
  const cells: DrillCell[] = manifest.cells.map((cell) => {
    const found = observations.get(cell.id);
    const same = found !== undefined && found.expectedBytes === cell.bytes &&
      found.provenance.source === cell.provenance.source && found.provenance.licence === cell.provenance.licence &&
      found.provenance.date === cell.provenance.date;
    const before: DrillStatus = same && found.state === "saved" && found.cause === "present" ? "saved" : "UNKNOWN";
    return { id: cell.id, bytes: cell.bytes, before, after: before, affected: false,
      reason: same ? found.cause : "UNKNOWN", source: cell.provenance.source,
      licence: cell.provenance.licence, date: cell.provenance.date };
  });
  const eligible = cells.map((c, index) => ({ c, index })).filter(({ c }) => c.before === "saved");
  if (settings.scenario === "evict-largest") eligible.sort((a, b) => b.c.bytes - a.c.bytes || a.index - b.index);
  if (settings.scenario === "evict-oldest") eligible.sort((a, b) => a.c.date.localeCompare(b.c.date) || a.index - b.index);
  const quota = typeof estimate.quota === "number" && typeof estimate.usage === "number" &&
    Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) && estimate.quota >= estimate.usage && estimate.usage >= 0
    ? estimate.quota - estimate.usage : null;
  let selected = new Set<number>();
  if (settings.scenario === "evict-largest" || settings.scenario === "evict-oldest" || settings.scenario === "source-change") {
    selected = new Set(eligible.slice(0, Math.min(settings.affectedCount, eligible.length)).map((c) => c.index));
  }
  if (settings.scenario === "quota-reduction" && quota !== null) {
    let deficit = Math.max(0, settings.reductionBytes + settings.preserveReserveBytes - quota);
    eligible.sort((a, b) => b.c.bytes - a.c.bytes || a.index - b.index);
    for (const item of eligible) { if (deficit <= 0) break; selected.add(item.index); deficit -= item.c.bytes; }
  }
  const projected = cells.map((c, index): DrillCell => {
    if (!selected.has(index)) return c;
    return { ...c, after: "UNKNOWN", affected: true, reason: settings.scenario === "source-change" ? "simulated-source-change" : "simulated-loss" };
  });
  const uncertainQuota = settings.scenario === "quota-reduction" && quota === null;
  return { regionId: manifest.regionId, scenario: settings.scenario,
    status: !aligned || uncertainQuota || projected.some((c) => c.reason === "UNKNOWN") ? "UNKNOWN" : "complete",
    cells: uncertainQuota ? projected.map((c) => ({ ...c, after: "UNKNOWN" as const, reason: "UNKNOWN" })) : projected,
    beforeSaved: cells.filter((c) => c.before === "saved").length,
    afterSaved: uncertainQuota ? 0 : projected.filter((c) => c.after === "saved").length,
    affected: selected.size, quota };
}
export function pageContinuityDrill(result: DrillResult, options: { filter: DrillFilter; sort: DrillSort; search: string; offset: number; limit: number }): { rows: readonly DrillCell[]; total: number; next: boolean; previous: boolean } {
  if (!validNumber(options.offset) || !validNumber(options.limit) || options.limit < 1 || options.limit > 100) throw new RangeError("Invalid page");
  const rows = result.cells.filter((c) => c.id.toLowerCase().includes(options.search.toLowerCase()) &&
    (options.filter === "all" || (options.filter === "affected" ? c.affected : c.after === options.filter)));
  if (options.sort === "bytes-desc") rows.sort((a, b) => b.bytes - a.bytes);
  if (options.sort === "id") rows.sort((a, b) => a.id.localeCompare(b.id));
  return { rows: rows.slice(options.offset, options.offset + options.limit), total: rows.length, previous: options.offset > 0, next: options.offset + options.limit < rows.length };
}
