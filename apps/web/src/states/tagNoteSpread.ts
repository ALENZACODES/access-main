/**
 * Where the tag-and-note differences sit, by kind of place. For each kind: how many places had a yes or no tag
 * and a note to compare, how many of those point different ways, and how many of those are clear cases. A
 * kind with a high share may only mean that kind is described in more words; nothing here says a kind is worse.
 */
import { kindKey, kindLabel } from "./packCategories";
import type { PackPlaceRecord } from "./packPlaces";
import { checkPlace } from "./tagNoteCheck";

export interface SpreadRow {
  readonly key: string;
  readonly label: string;
  readonly checked: number;
  readonly flagged: number;
  readonly clear: number;
  /** Whole percent of checked places that are flagged; 0 when none were checked. */
  readonly percent: number;
}

export type SpreadOrder = "flagged" | "share" | "name";
export const SPREAD_ORDERS: readonly SpreadOrder[] = ["flagged", "share", "name"];
export const DEFAULT_SPREAD_ORDER: SpreadOrder = "flagged";
export const isSpreadOrder = (v: unknown): v is SpreadOrder => typeof v === "string" && (SPREAD_ORDERS as readonly string[]).includes(v);

const comparable = (p: PackPlaceRecord): boolean => p.note !== null && p.note.trim() !== "" && (p.tag === "yes" || p.tag === "designated" || p.tag === "no");

/** Percentage of `part` in `whole`, rounded to a whole number. Never NaN. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

interface Acc {
  key: string;
  spellings: Map<string, number>;
  checked: number;
  flagged: number;
  clear: number;
}

/** Group the compared places by kind. Places that were not compared (no note, limited or unknown tag) are not counted. */
export function spreadByKind(places: readonly PackPlaceRecord[]): SpreadRow[] {
  const groups = new Map<string, Acc>();
  for (const p of places) {
    if (!comparable(p)) continue;
    const key = kindKey(p.category);
    let g = groups.get(key);
    if (g === undefined) {
      g = { key, spellings: new Map(), checked: 0, flagged: 0, clear: 0 };
      groups.set(key, g);
    }
    if (typeof p.category === "string" && p.category.trim() !== "") g.spellings.set(p.category, (g.spellings.get(p.category) ?? 0) + 1);
    g.checked += 1;
    const d = checkPlace(p);
    if (d !== null) {
      g.flagged += 1;
      if (d.weight === "one-sided") g.clear += 1;
    }
  }
  return [...groups.values()].map((g) => {
    let spelling: string | null = null;
    let best = 0;
    for (const [s, n] of g.spellings) {
      if (n > best) {
        spelling = s;
        best = n;
      }
    }
    return { key: g.key, label: kindLabel({ key: g.key, spelling }), checked: g.checked, flagged: g.flagged, clear: g.clear, percent: percentOf(g.flagged, g.checked) };
  });
}

/** Kinds with at least one difference. */
export const withDifferences = (rows: readonly SpreadRow[]): SpreadRow[] => rows.filter((r) => r.flagged > 0);

export function orderSpread(rows: readonly SpreadRow[], order: SpreadOrder): SpreadRow[] {
  const byName = (a: SpreadRow, b: SpreadRow) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }) || a.key.localeCompare(b.key);
  const out = [...rows];
  if (order === "name") return out.sort(byName);
  if (order === "share") return out.sort((a, b) => b.percent - a.percent || b.flagged - a.flagged || byName(a, b));
  return out.sort((a, b) => b.flagged - a.flagged || b.percent - a.percent || byName(a, b));
}

export interface SpreadTotals {
  readonly kinds: number;
  readonly kindsWithDifferences: number;
  readonly checked: number;
  readonly flagged: number;
}

export function spreadTotals(rows: readonly SpreadRow[]): SpreadTotals {
  let checked = 0;
  let flagged = 0;
  let kinds = 0;
  let kindsWithDifferences = 0;
  for (const r of rows) {
    kinds += 1;
    checked += r.checked;
    flagged += r.flagged;
    if (r.flagged > 0) kindsWithDifferences += 1;
  }
  return { kinds, kindsWithDifferences, checked, flagged };
}
