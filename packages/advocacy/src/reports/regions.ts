/**
 * Region roll-up. A region with a small or unknown population is never a row of its own: the
 * larger region that contains it is reported as one row covering every region inside it. That
 * part depends only on the region table, never on the reports, so the shape of a table says
 * nothing about whether a small community sent a report.
 */
import { ALL_REGIONS, UNKNOWN, type Region } from "./types.ts";

export interface RegionIndex {
  /** Parent code, or ALL_REGIONS at the top. */
  parentOf(code: string): string;
  /** Codes that must always be reported as one row, because a region inside is small or of unknown size. */
  staticRollUps: ReadonlySet<string>;
  has(code: string): boolean;
}

export type RegionTableIssue = "duplicate_code" | "unknown_parent" | "parent_loop";

/** Build the index, or report why the table cannot be used. */
export function indexRegions(regions: readonly Region[]): { ok: true; index: RegionIndex } | { ok: false; issue: RegionTableIssue; codes: string[] } {
  const byCode = new Map<string, Region>();
  const duplicates: string[] = [];
  for (const region of regions) {
    if (byCode.has(region.code)) duplicates.push(region.code);
    byCode.set(region.code, region);
  }
  if (duplicates.length > 0) return { ok: false, issue: "duplicate_code", codes: [...new Set(duplicates)].sort() };

  const orphans = regions.filter((r) => r.parent !== null && !byCode.has(r.parent)).map((r) => r.code);
  if (orphans.length > 0) return { ok: false, issue: "unknown_parent", codes: orphans.sort() };

  const looped: string[] = [];
  for (const region of regions) {
    const seen = new Set<string>();
    for (let at: Region | undefined = region; at; at = at.parent === null ? undefined : byCode.get(at.parent)) {
      if (seen.has(at.code)) {
        looped.push(region.code);
        break;
      }
      seen.add(at.code);
    }
  }
  if (looped.length > 0) return { ok: false, issue: "parent_loop", codes: looped.sort() };

  const staticRollUps = new Set<string>();
  for (const region of regions) {
    if (region.population_band === "small" || region.population_band === "unknown") {
      staticRollUps.add(region.parent ?? ALL_REGIONS);
    }
  }
  return {
    ok: true,
    index: {
      parentOf: (code) => (code === UNKNOWN ? ALL_REGIONS : (byCode.get(code)?.parent ?? ALL_REGIONS)),
      staticRollUps,
      has: (code) => byCode.has(code),
    },
  };
}

/** The row a region is reported under: the highest rolled-up region above it, or itself. */
export function rowFor(code: string, index: RegionIndex, rollUps: ReadonlySet<string>): string {
  if (rollUps.has(ALL_REGIONS)) return ALL_REGIONS;
  let row = code;
  for (let at = index.parentOf(code); at !== ALL_REGIONS; at = index.parentOf(at)) {
    if (rollUps.has(at)) row = at;
  }
  return row;
}
