import { type CapacityPlan } from "./quotaPlanning";
import { type RegionInventory } from "./regionInventory";
import { selectableIds } from "./cellTriage";

/** Storage estimates are advisory; a successful plan is not a successful write. */
export type SelectionCapacity = "unknown" | "estimated-fit" | "estimated-short" | "empty";

export interface SelectionCapacityPlan {
  readonly state: SelectionCapacity;
  readonly bytes: number;
  readonly selectedCount: number;
  readonly estimatedFreeAfterReserve: number | null;
  readonly estimatedRemaining: number | null;
  readonly shortfall: number | null;
}

/**
 * Estimate whether a user-chosen subset might fit on this device.
 * This never replaces per-cell quota checks or grants permission to download.
 * An unknown device estimate stays UNKNOWN even for a zero-byte cell.
 */
export function planTriageSelection(
  inventory: RegionInventory,
  plan: CapacityPlan | null,
  requested: readonly string[],
): SelectionCapacityPlan {
  const ids = selectableIds(inventory, requested);
  const selected = new Set(ids);
  let bytes = 0;
  for (const cell of inventory.cells) {
    if (!selected.has(cell.id)) continue;
    if (!Number.isSafeInteger(cell.expectedBytes) || cell.expectedBytes < 0) {
      throw new RangeError("Invalid selected byte count");
    }
    bytes += cell.expectedBytes;
    if (!Number.isSafeInteger(bytes)) throw new RangeError("Selected bytes overflow");
  }
  const selectedCount = ids.length;
  const empty: SelectionCapacityPlan = {
    state: "empty", bytes, selectedCount: 0,
    estimatedFreeAfterReserve: null, estimatedRemaining: null, shortfall: null,
  };
  if (selectedCount === 0) return empty;
  const free = plan?.freeBytes;
  const reserve = plan?.reserveBytes;
  if (free === null || free === undefined || reserve === undefined ||
    !Number.isSafeInteger(free) || !Number.isSafeInteger(reserve) ||
    free < 0 || reserve < 0) {
    return {
      state: "unknown", bytes, selectedCount,
      estimatedFreeAfterReserve: null, estimatedRemaining: null, shortfall: null,
    };
  }
  const available = Math.max(0, free - reserve);
  const remaining = available - bytes;
  return {
    state: remaining >= 0 ? "estimated-fit" : "estimated-short",
    bytes,
    selectedCount,
    estimatedFreeAfterReserve: available,
    estimatedRemaining: Math.max(0, remaining),
    shortfall: remaining < 0 ? -remaining : 0,
  };
}

/**
 * Produce a deterministic smallest-first list of currently missing cells
 * that could fit an estimated byte budget. This is advisory only and requires
 * a separate user click; it does not start or authorise any request.
 */
export function suggestTriageFit(
  inventory: RegionInventory,
  plan: CapacityPlan | null,
  maxCells = 500,
): readonly string[] {
  if (!Number.isSafeInteger(maxCells) || maxCells < 0 || maxCells > 500) {
    throw new RangeError("Invalid selection limit");
  }
  if (plan?.freeBytes === null || plan?.freeBytes === undefined ||
    !Number.isSafeInteger(plan.freeBytes) || plan.freeBytes < 0 ||
    !Number.isSafeInteger(plan.reserveBytes) || plan.reserveBytes < 0) return [];
  let available = Math.max(0, plan.freeBytes - plan.reserveBytes);
  const candidates = inventory.cells
    .filter((cell) => cell.state === "unknown" &&
      Number.isSafeInteger(cell.expectedBytes) && cell.expectedBytes >= 0)
    .slice()
    .sort((a, b) => a.expectedBytes - b.expectedBytes || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selected: string[] = [];
  for (const cell of candidates) {
    if (selected.length >= maxCells) break;
    if (cell.expectedBytes > available) continue;
    selected.push(cell.id);
    available -= cell.expectedBytes;
  }
  return selected;
}

export function estimatedCapacityLabel(
  capacity: SelectionCapacityPlan,
  language: "en" | "fr",
): string {
  if (capacity.state === "empty") {
    return language === "fr" ? "Aucune cellule sélectionnée." : "No cells selected.";
  }
  if (capacity.state === "unknown") {
    return language === "fr" ? "Capacité estimée INCONNUE." : "Estimated capacity UNKNOWN.";
  }
  if (capacity.state === "estimated-short") {
    return language === "fr"
      ? "La sélection pourrait dépasser l’espace disponible."
      : "Selection may exceed available space.";
  }
  return language === "fr"
    ? "L’espace estimé pourrait suffire. L’enregistrement peut échouer."
    : "Estimated space may be sufficient. Saving can still fail.";
}
