import type { FootprintEvidence, FootprintSelection } from "./packFootprint";
import type { FootprintIndex } from "./packFootprintIndex";

export interface RegionOmission {
  readonly regionId: string;
  readonly exclusivePartCount: number;
  /** Declared compressed bytes no other selected region needs. */
  readonly exclusiveBytes: number | null;
  /** Reduction in the upper transfer estimate, including only possibly unpaid parts. */
  readonly maximumTransferReduction: number | null;
}

/**
 * Count ownership across the entire selection, including regions that come
 * later in the user's order. Omitting the first region cannot remove a part
 * which a later one still needs. Visiting one cell twice within the same
 * region does not give its parts two owners.
 */
export function measureRegionOmissions(
  index: FootprintIndex,
  evidence: FootprintEvidence,
  selection: FootprintSelection,
): readonly RegionOmission[] {
  const owners = new Map<string, string | null>();
  const totals = new Map<string, {
    regionId: string;
    exclusivePartCount: number;
    exclusiveBytes: number | null;
    maximumTransferReduction: number | null;
  }>();
  for (const { regionId } of selection.steps) {
    const region = index.regions.get(regionId);
    if (!region) continue;
    totals.set(regionId, {
      regionId,
      exclusivePartCount: 0,
      exclusiveBytes: selection.declaredBytes === null ? null : 0,
      maximumTransferReduction: selection.transfer.maximumBytes === null ? null : 0,
    });
    for (const id of region.cellIds) {
      for (const hash of index.cells.get(id)?.hashes ?? []) {
        const previous = owners.get(hash);
        if (previous === undefined) owners.set(hash, regionId);
        else if (previous !== regionId) owners.set(hash, null);
      }
    }
  }
  for (const [hash, owner] of owners) {
    if (owner === null) continue;
    const total = totals.get(owner)!;
    total.exclusivePartCount++;
    const size = index.parts.get(hash)?.bytes;
    // A known selection total bounds every subset sum; the selector has
    // already checked for overflow and conflicting size declarations.
    if (size === undefined || size === null) {
      total.exclusiveBytes = null;
      if (!evidence.present.has(hash)) total.maximumTransferReduction = null;
      continue;
    }
    if (total.exclusiveBytes !== null) total.exclusiveBytes += size;
    if (total.maximumTransferReduction !== null && !evidence.present.has(hash)) {
      total.maximumTransferReduction += size;
    }
  }
  return [...totals.values()];
}
