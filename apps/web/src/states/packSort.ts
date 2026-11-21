/**
 * The order of the places list. Eight orders, each one a plain rule on a field the pack states:
 * name, kind, street, wheelchair tag, or the date the record was retrieved. None of them is a
 * ranking. A place whose pack record does not state the field is always last, in either direction,
 * and is never given a guessed value. Ties are broken by name and then id, so the order never
 * changes between renders and never depends on the order the pack was written in.
 *
 * Everything here is pure.
 */
import { normalizeText } from "./filters";
import { kindKey, UNKNOWN_KIND } from "./packCategories";
import { distanceMetres, type Point } from "./packGeo";
import { type PackPlaceRecord, WHEELCHAIR_TAGS } from "./packPlaces";
import { tagValue } from "./placeSheet";
import { formatDate } from "./provenance";
import type { Locale } from "./stateCopy";
import { parseAddress } from "./streetAddress";

export const PACK_SORTS = ["default", "name", "name-desc", "kind", "street", "tag", "oldest", "newest"] as const;
export type PackSort = (typeof PACK_SORTS)[number];
export const DEFAULT_PACK_SORT: PackSort = "default";

export const isPackSort = (value: unknown): value is PackSort => typeof value === "string" && (PACK_SORTS as readonly string[]).includes(value);

/** The orders that can be used as a second order: every one except the default. */
export const THEN_SORTS: readonly PackSort[] = PACK_SORTS.filter((s) => s !== "default");

/** A second order only means something when it is a real order and not the same as the first. Otherwise null. */
export function cleanThen(sort: PackSort, then: unknown): PackSort | null {
  return isPackSort(then) && then !== "default" && then !== sort ? then : null;
}

/** The order in which tags are listed. It groups places by tag; it is not a ranking of them. */
export const TAG_SORT_ORDER = [...WHEELCHAIR_TAGS, "unknown"] as const;

const text = (s: string | null): string => normalizeText(s ?? "");
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Name order, an unnamed place last, id as the last tie-break. */
export function compareByName(a: PackPlaceRecord, b: PackPlaceRecord): number {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  const n = text(a.name).localeCompare(text(b.name));
  return n !== 0 ? n : compareText(a.id, b.id);
}

/** Compare two optional keys: a missing key is last whatever the direction, and equal keys fall through to null. */
function byKey<K>(ka: K | null, kb: K | null, cmp: (a: K, b: K) => number, descending = false): number | null {
  if (ka === null || kb === null) {
    if (ka === kb) return null;
    return ka === null ? 1 : -1;
  }
  const c = cmp(ka, kb);
  return c === 0 ? null : descending ? -c : c;
}

const kindOf = (p: PackPlaceRecord): string | null => {
  const k = kindKey(p.category);
  return k === UNKNOWN_KIND ? null : k;
};
const streetOf = (p: PackPlaceRecord): string | null => parseAddress(p.address).key;
const numberOf = (p: PackPlaceRecord): number | null => parseAddress(p.address).numberValue;
const dateOf = (p: PackPlaceRecord): string | null => p.provenance?.retrievedOn ?? null;
/** Where a tag falls in the list: Yes, Limited, No, Designated, then UNKNOWN. An unrecognised tag is not in the list, so it has no rank and is last. */
const tagRank = (p: PackPlaceRecord): number | null => {
  const i = (TAG_SORT_ORDER as readonly string[]).indexOf(p.tag);
  return i < 0 ? null : i;
};
const num = (a: number, b: number): number => a - b;

/**
 * How one order compares two places: negative, positive, or null when the order's field is equal
 * (or missing in both), so that a second order, and then name and id, decide.
 */
function compareOn(sort: PackSort, from: Point | null, a: PackPlaceRecord, b: PackPlaceRecord): number | null {
  switch (sort) {
    case "default":
      if (from === null) return null;
      return byKey(a.location ? distanceMetres(from, a.location) : null, b.location ? distanceMetres(from, b.location) : null, num);
    case "name":
      return byKey(a.name === null ? null : text(a.name), b.name === null ? null : text(b.name), (x, y) => x.localeCompare(y));
    case "name-desc":
      return byKey(a.name === null ? null : text(a.name), b.name === null ? null : text(b.name), (x, y) => x.localeCompare(y), true);
    case "kind":
      return byKey(kindOf(a), kindOf(b), compareText);
    case "street":
      return byKey(streetOf(a), streetOf(b), compareText) ?? (streetOf(a) === null ? null : byKey(numberOf(a), numberOf(b), num));
    case "tag":
      return byKey(tagRank(a), tagRank(b), num);
    case "oldest":
      return byKey(dateOf(a), dateOf(b), compareText);
    case "newest":
      return byKey(dateOf(a), dateOf(b), compareText, true);
  }
}

/**
 * The comparison for an order, with an optional second order for places the first cannot tell apart.
 * Always finishes with name and then id, so two different places are never equal.
 * With the default order, a typed point puts the nearest first.
 */
export function comparePlaces(sort: PackSort, from: Point | null = null, then: PackSort | null = null): (a: PackPlaceRecord, b: PackPlaceRecord) => number {
  return (a, b) => compareOn(sort, from, a, b) ?? (then === null ? null : compareOn(then, from, a, b)) ?? compareByName(a, b);
}

/** The places in the chosen order, and the second order if one is given. Never changes its input. */
export function sortPlaces(places: readonly PackPlaceRecord[], sort: PackSort = DEFAULT_PACK_SORT, from: Point | null = null, then: PackSort | null = null): PackPlaceRecord[] {
  return [...places].sort(comparePlaces(sort, from, then));
}

// ------------------------------------------------------------------ the runs a sorted list falls into

export interface SortRun {
  /** The shared value, as it is shown ("Café", "Dundas Street East", "13 November 2026", "UNKNOWN"). */
  readonly label: string;
  readonly count: number;
  readonly ids: readonly string[];
}

const UNKNOWN = "UNKNOWN";

function firstLetter(name: string | null): string {
  if (name === null) return UNKNOWN;
  const c = text(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

/** The value a place is grouped under for an order, or null when the order does not group (the default). */
export function runLabel(sort: PackSort, p: PackPlaceRecord, locale: Locale): string | null {
  switch (sort) {
    case "default":
      return null;
    case "name":
    case "name-desc":
      return firstLetter(p.name);
    case "kind": {
      const k = kindKey(p.category);
      return k === UNKNOWN_KIND ? UNKNOWN : k.replace(/^./, (c) => c.toUpperCase());
    }
    case "street":
      return parseAddress(p.address).street ?? UNKNOWN;
    case "tag":
      return tagValue(p.tag, locale);
    case "oldest":
    case "newest": {
      const d = dateOf(p);
      return d === null ? UNKNOWN : formatDate(d, locale);
    }
  }
}

/** Neighbouring places that share a value, in list order. An order that does not group gives no runs. */
export function sortRuns(ordered: readonly PackPlaceRecord[], sort: PackSort, locale: Locale): SortRun[] {
  if (sort === "default") return [];
  const runs: { label: string; ids: string[] }[] = [];
  for (const p of ordered) {
    const label = runLabel(sort, p, locale) ?? UNKNOWN;
    const last = runs[runs.length - 1];
    if (last && last.label === label) last.ids.push(p.id);
    else runs.push({ label, ids: [p.id] });
  }
  return runs.map((r) => ({ label: r.label, count: r.ids.length, ids: r.ids }));
}

/** True when the ids come out in the order of the runs, with no value split in two. A check for tests and callers. */
export function runsAreContiguous(runs: readonly SortRun[]): boolean {
  const seen = new Set<string>();
  for (const r of runs) {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
  }
  return true;
}
