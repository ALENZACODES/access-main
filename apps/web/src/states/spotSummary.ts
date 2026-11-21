/**
 * What a set of filled-in rows says, as counts. A row is "looked at" when the person answered the
 * last question (does what you saw match the tag?). The counts are not turned into a rate or a
 * score, because a few places chosen to spread the looking say nothing about the whole pack.
 */
import type { ResultRow } from "./spotResults";

export type SpotMatchKind = "same" | "different" | "could-not-tell" | "not-answered";

export const SPOT_MATCH_KINDS: readonly SpotMatchKind[] = ["same", "different", "could-not-tell", "not-answered"];

export function matchOf(row: ResultRow): SpotMatchKind {
  const a = row.answers.match;
  return a === "same" || a === "different" || a === "could-not-tell" ? a : "not-answered";
}

export interface TagTally {
  readonly tag: string;
  readonly total: number;
  readonly byMatch: Readonly<Record<SpotMatchKind, number>>;
}

export interface SpotSummary {
  readonly total: number;
  readonly byMatch: Readonly<Record<SpotMatchKind, number>>;
  /** Tags in the order they first appear on the sheet, so the order follows the sheet. */
  readonly byTag: readonly TagTally[];
  /** Rows where the person saw something different from the tag. */
  readonly differences: readonly ResultRow[];
  /** Rows with any cell that could not be read. */
  readonly withProblems: number;
}

const zero = (): Record<SpotMatchKind, number> => ({ same: 0, different: 0, "could-not-tell": 0, "not-answered": 0 });

export function summariseResults(rows: readonly ResultRow[]): SpotSummary {
  const byMatch = zero();
  const tags = new Map<string, { total: number; byMatch: Record<SpotMatchKind, number> }>();
  for (const row of rows) {
    const m = matchOf(row);
    byMatch[m] += 1;
    const t = tags.get(row.tag) ?? { total: 0, byMatch: zero() };
    t.total += 1;
    t.byMatch[m] += 1;
    tags.set(row.tag, t);
  }
  return {
    total: rows.length,
    byMatch,
    byTag: [...tags].map(([tag, t]) => ({ tag, total: t.total, byMatch: t.byMatch })),
    differences: rows.filter((r) => matchOf(r) === "different"),
    withProblems: rows.filter((r) => r.problems.length > 0).length,
  };
}

/** True when nothing was answered at all, so there is nothing to summarise. */
export function nothingAnswered(rows: readonly ResultRow[]): boolean {
  return rows.every((r) => Object.keys(r.answers).length === 0 && r.notes === "");
}
