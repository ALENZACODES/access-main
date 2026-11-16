import type { RegionStatus } from "../../../../packages/data-client/src/index.ts";
import type { CellReport } from "../offline/robust/index.ts";

export type RegionRecheckResult =
  | { readonly status: "corrupt"; readonly reason: "inconsistent-storage" }
  | { readonly status: "unknown"; readonly reason: "no-byte-digest" | "not-complete" | "unavailable" };

/**
 * Compare the current region inventory to the cell ledger. A contradiction is
 * a concrete storage failure. Agreement is not SHA-256 evidence: cached parsed
 * records do not include the original compressed bytes, so the result remains
 * UNKNOWN until a byte-level API can check those bytes against the manifest.
 */
export function assessStoredRegion(
  region: RegionStatus | undefined,
  cells: readonly CellReport[] | undefined,
): RegionRecheckResult {
  if (region === undefined || cells === undefined) {
    return { status: "unknown", reason: "unavailable" };
  }
  if (region.downloaded && (
    region.missingCells.length > 0 ||
    cells.some((cell) => cell.lookup.status === "missing" || cell.lookup.status === "stale")
  )) {
    return { status: "corrupt", reason: "inconsistent-storage" };
  }
  if (region.downloaded && cells.some((cell) => cell.lookup.status === "unknown")) {
    return { status: "unknown", reason: "unavailable" };
  }
  if (!region.downloaded) {
    return { status: "unknown", reason: "not-complete" };
  }
  return { status: "unknown", reason: "no-byte-digest" };
}
