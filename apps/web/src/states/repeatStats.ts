/** A short tally of a repeats report: how big the groups are, which reasons carried them, and how many groups disagree on the tag. */
import { DUPLICATE_REASONS, type DuplicateReason } from "./duplicateScore";
import type { DuplicateReport } from "./duplicateGroups";

export interface RepeatStats {
  readonly groups: number;
  readonly places: number;
  /** Groups of exactly two, and groups of three or more. */
  readonly pairsOnly: number;
  readonly larger: number;
  /** The most members in one group; 0 when there are none. */
  readonly largest: number;
  /** For each reason, the number of groups with at least one pair that has it. */
  readonly byReason: Readonly<Record<DuplicateReason, number>>;
  /** Groups whose members report different wheelchair tags. */
  readonly tagDisagreements: number;
  /** Mean of the groups' best scores, to two places; null when there are none. */
  readonly meanTopScore: number | null;
}

export function repeatStats(report: DuplicateReport): RepeatStats {
  const byReason = Object.fromEntries(DUPLICATE_REASONS.map((r) => [r, 0])) as Record<DuplicateReason, number>;
  let pairsOnly = 0;
  let larger = 0;
  let largest = 0;
  let disagree = 0;
  let sum = 0;
  for (const g of report.groups) {
    if (g.ids.length === 2) pairsOnly += 1;
    else larger += 1;
    largest = Math.max(largest, g.ids.length);
    if (g.tagsDiffer) disagree += 1;
    sum += g.top;
    const seen = new Set<DuplicateReason>();
    for (const p of g.pairs) for (const r of p.pair.reasons) seen.add(r);
    for (const r of seen) byReason[r] += 1;
  }
  const n = report.groups.length;
  return { groups: n, places: report.placesInGroups, pairsOnly, larger, largest, byReason, tagDisagreements: disagree, meanTopScore: n === 0 ? null : Math.round((sum / n) * 100) / 100 };
}
