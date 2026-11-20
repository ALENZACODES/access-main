/**
 * When a search of several parts finds no place, says which parts are the cause: how many places each part
 * finds alone, and how many the search would find with it taken out. It counts places; it does not say
 * which part is "wrong".
 */
import { filterBySearch } from "./packSearchMatch";
import type { ParsedSearch } from "./packSearchParse";
import type { PackPlaceRecord } from "./packPlaces";

export interface ClauseCount {
  /** Position of the clause in the search, from 0. */
  readonly index: number;
  readonly typed: string;
  /** Places this part finds on its own. */
  readonly alone: number;
  /** Places the search finds with this part taken out. */
  readonly without: number;
  /** The search text with this part taken out. */
  readonly withoutText: string;
}

export interface WhyNoPlaces {
  readonly counts: readonly ClauseCount[];
  /** The part whose removal finds the most places, the first in the search on a tie; null when no single part does. */
  readonly best: ClauseCount | null;
}

/** Null unless the search has two or more parts and finds nothing. */
export function whyNoPlaces(places: readonly PackPlaceRecord[], parsed: ParsedSearch): WhyNoPlaces | null {
  if (parsed.clauses.length < 2) return null;
  if (filterBySearch(places, parsed).length > 0) return null;
  const counts = parsed.clauses.map((clause, index): ClauseCount => {
    const others = parsed.clauses.filter((_, i) => i !== index);
    return {
      index,
      typed: clause.typed,
      alone: filterBySearch(places, { ...parsed, clauses: [clause] }).length,
      without: filterBySearch(places, { ...parsed, clauses: others }).length,
      withoutText: others.map((c) => c.typed).join(" "),
    };
  });
  let best: ClauseCount | null = null;
  for (const c of counts) if (c.without > 0 && (best === null || c.without > best.without)) best = c;
  return { counts, best };
}
