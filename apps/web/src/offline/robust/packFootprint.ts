import type { RegionStatus } from "../../../../../packages/data-client/src/types";
import type { FootprintIndex } from "./packFootprintIndex";
import { DEFAULT_RESERVE_BYTES, summariseStorage } from "./quotaPlanning";
import type { StorageEstimate } from "./regionDownload";

export type FootprintStatus = Pick<RegionStatus, "id" | "builtAt" | "cells" | "missingCells">;

/** regions() reports a missing cell whenever any one of its parts is missing. */
export interface FootprintEvidence {
  readonly present: ReadonlySet<string>;
  readonly missingGroups: readonly (readonly string[])[];
  readonly inconsistent: boolean;
}

function sameMembers(left: readonly string[], right: ReadonlySet<string>): boolean {
  return left.length === right.size && new Set(left).size === right.size &&
    left.every((value) => right.has(value));
}

/**
 * A complete current cell establishes presence for each of its digests, even
 * if it belongs to an unselected region. A missing cell establishes only an
 * existential constraint. Region ownership and record quality are separate.
 */
export function readFootprintEvidence(
  index: FootprintIndex,
  statuses: readonly FootprintStatus[],
): FootprintEvidence {
  const present = new Set<string>();
  const missingCells = new Set<string>();
  const observations = new Map<string, boolean>();
  const conflict: FootprintEvidence = { present: new Set(), missingGroups: [], inconsistent: true };
  for (const row of statuses) {
    const region = index.regions.get(row.id);
    if (!region?.complete || !index.builtAt || row.builtAt !== index.builtAt) continue;
    const ids = new Set(region.cellIds);
    if (!sameMembers(row.cells, ids) || !row.missingCells.every((id) => ids.has(id))) continue;
    const missing = new Set(row.missingCells);
    for (const id of ids) {
      const cell = index.cells.get(id);
      if (!cell?.complete) continue;
      const isMissing = missing.has(id);
      if (observations.has(id) && observations.get(id) !== isMissing) return conflict;
      observations.set(id, isMissing);
      if (isMissing) missingCells.add(id);
      else for (const hash of cell.hashes) present.add(hash);
    }
  }
  const missingGroups: string[][] = [];
  for (const id of missingCells) {
    const candidates = index.cells.get(id)!.hashes.filter((hash) => !present.has(hash));
    if (candidates.length === 0) return conflict;
    missingGroups.push(candidates);
  }
  return { present, missingGroups, inconsistent: false };
}

export interface FootprintStep {
  readonly regionId: string;
  readonly partCount: number;
  readonly commonPartCount: number;
  /** Bytes in this region with a digest not already counted in an earlier step. */
  readonly additionalBytes: number | null;
  readonly regionBytes: number | null;
}

export interface FootprintRange {
  readonly minimumBytes: number;
  readonly maximumBytes: number | null;
}

export interface FootprintSelection {
  readonly steps: readonly FootprintStep[];
  readonly hashes: ReadonlySet<string>;
  readonly sharedHashes: ReadonlySet<string>;
  readonly declaredBytes: number | null;
  readonly countedOnceBytes: number | null;
  readonly presentBytes: number | null;
  readonly transfer: FootprintRange;
  readonly unlistedRegions: readonly string[];
}

function addSize(total: number | null, size: number | null): number | null {
  if (total === null || size === null) return null;
  const next = total + size;
  return Number.isSafeInteger(next) ? next : null;
}

function sumSizes(index: FootprintIndex, hashes: Iterable<string>): number | null {
  let total: number | null = 0;
  for (const hash of hashes) total = addSize(total, index.parts.get(hash)?.bytes ?? null);
  return total;
}

/**
 * Each missing cell guarantees at least its cheapest outstanding part. Bounds
 * from disjoint candidate sets can be added. Intersecting sets can describe
 * the very same absent part. Greedy packing gives a safe, possibly loose,
 * lower bound without an exponential minimum hitting-set calculation.
 */
function transferRange(
  index: FootprintIndex,
  hashes: ReadonlySet<string>,
  evidence: FootprintEvidence,
  complete: boolean,
): FootprintRange {
  const unpaid = [...hashes].filter((hash) => !evidence.present.has(hash));
  const maximumBytes = complete ? sumSizes(index, unpaid) : null;
  const constraints: { group: readonly string[]; cheapest: number }[] = [];
  for (const group of evidence.missingGroups) {
    if (group.length === 0 || !group.every((hash) => hashes.has(hash))) continue;
    let cheapest = Infinity;
    for (const hash of group) cheapest = Math.min(cheapest, index.parts.get(hash)?.bytes ?? 0);
    if (cheapest > 0) constraints.push({ group, cheapest });
  }
  constraints.sort((a, b) => b.cheapest - a.cheapest || a.group.length - b.group.length);
  let minimumBytes = 0;
  const used = new Set<string>();
  for (const { group, cheapest } of constraints) {
    if (group.some((hash) => used.has(hash))) continue;
    // Saturation remains a lower bound if a manifest exceeds exact JS arithmetic.
    minimumBytes = Math.min(Number.MAX_SAFE_INTEGER, minimumBytes + cheapest);
    for (const hash of group) used.add(hash);
  }
  return { minimumBytes, maximumBytes };
}

export function measureFootprint(
  index: FootprintIndex,
  evidence: FootprintEvidence,
  regionIds: readonly string[],
): FootprintSelection {
  const steps: FootprintStep[] = [];
  const hashes = new Set<string>();
  const sharedHashes = new Set<string>();
  const unlistedRegions: string[] = [];
  let complete = true;
  let countedOnceBytes: number | null = 0;
  for (const regionId of new Set(regionIds)) {
    const region = index.regions.get(regionId);
    if (!region) {
      unlistedRegions.push(regionId);
      complete = false;
      continue;
    }
    const local = new Set<string>();
    let localComplete = region.complete;
    for (const id of region.cellIds) {
      const cell = index.cells.get(id);
      if (!cell?.complete) localComplete = false;
      for (const hash of cell?.hashes ?? []) local.add(hash);
    }
    const added: string[] = [];
    let commonPartCount = 0;
    for (const hash of local) {
      if (hashes.has(hash)) {
        commonPartCount++;
        sharedHashes.add(hash);
        countedOnceBytes = addSize(countedOnceBytes, index.parts.get(hash)?.bytes ?? null);
      } else {
        hashes.add(hash);
        added.push(hash);
      }
    }
    steps.push({
      regionId,
      partCount: local.size,
      commonPartCount,
      regionBytes: localComplete ? sumSizes(index, local) : null,
      additionalBytes: complete && localComplete ? sumSizes(index, added) : null,
    });
    complete &&= localComplete;
  }
  return {
    steps,
    hashes,
    sharedHashes,
    unlistedRegions,
    declaredBytes: complete ? sumSizes(index, hashes) : null,
    countedOnceBytes: complete ? countedOnceBytes : null,
    presentBytes: sumSizes(index, [...hashes].filter((hash) => evidence.present.has(hash))),
    transfer: transferRange(index, hashes, evidence, complete),
  };
}

export interface FootprintCapacity {
  readonly usableBytes: number | null;
  readonly status: "no-transfer" | "within" | "over" | "uncertain" | "unknown";
}

/** Compare compressed transfer size with a point-in-time estimate, after reserve. */
export function compareFootprintCapacity(
  range: FootprintRange,
  estimate: StorageEstimate,
  reserve = DEFAULT_RESERVE_BYTES,
): FootprintCapacity {
  if (!Number.isSafeInteger(reserve) || reserve < 0) throw new RangeError("Invalid storage reserve");
  const { freeBytes, usedBytes, quotaBytes } = summariseStorage(estimate);
  const usableBytes = freeBytes === null || usedBytes === null || quotaBytes === null || usedBytes > quotaBytes
    ? null : Math.max(0, freeBytes - reserve);
  if (range.maximumBytes === 0) return { usableBytes, status: "no-transfer" };
  if (usableBytes === null) return { usableBytes, status: "unknown" };
  if (range.minimumBytes > usableBytes) return { usableBytes, status: "over" };
  if (range.maximumBytes !== null && range.maximumBytes <= usableBytes) return { usableBytes, status: "within" };
  return { usableBytes, status: "uncertain" };
}
