/**
 * Places that share a name: several branches of one shop, the same library at different
 * addresses. Grouping is by the name alone, with case, accents, punctuation, a "#12" branch number
 * and a bracketed note ignored. Two places with one name are not claimed to be one business or to
 * match each other in any way; this only puts them side by side.
 */
import { compareNames } from "./streetIndex";
import { foldAddressText } from "./streetAddress";
import { type Point, distanceMetres, isPoint } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";

export type SameNameTag = PackPlaceRecord["tag"];

/** Shortest and longest name that is grouped; a one-letter or very long name is left alone. */
export const SAME_NAME_MIN_CHARS = 2;
export const SAME_NAME_MAX_CHARS = 120;

/**
 * The text two names are compared by, or null when the name cannot be compared (missing, UNKNOWN,
 * too short or too long, or nothing left after the branch parts are taken out).
 */
export function nameKey(name: string | null): string | null {
  if (name === null) return null;
  const raw = name.trim();
  if (raw.length === 0 || raw.length > SAME_NAME_MAX_CHARS || raw === "UNKNOWN") return null;
  const key = foldAddressText(raw.replace(/\([^)]*\)/g, " ").replace(/#\s*\d+(?:[a-z](?![\p{L}\p{N}]))?/giu, " "))
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key.length >= SAME_NAME_MIN_CHARS ? key : null;
}

/** The name as written, less a "#12" branch number and a bracketed note; the name as written when nothing is left. */
export function displayName(name: string): string {
  const cut = name.replace(/\([^)]*\)/g, " ").replace(/#\s*\d+(?:[A-Za-z](?![\p{L}\p{N}]))?/gu, " ").replace(/\s+/g, " ").trim();
  return cut === "" ? name.trim() : cut;
}

export const SAME_NAME_ORDERS = ["count", "name", "nearest"] as const;
export type SameNameOrder = (typeof SAME_NAME_ORDERS)[number];
export const DEFAULT_SAME_NAME_ORDER: SameNameOrder = "count";
export const isSameNameOrder = (v: unknown): v is SameNameOrder => (SAME_NAME_ORDERS as readonly unknown[]).includes(v);

/** The smallest group listed. */
export const SAME_NAME_SIZES = [2, 3, 5] as const;
export type SameNameSize = (typeof SAME_NAME_SIZES)[number];
export const DEFAULT_SAME_NAME_SIZE: SameNameSize = 2;
export const isSameNameSize = (v: unknown): v is SameNameSize => (SAME_NAME_SIZES as readonly unknown[]).includes(v);

export const SAME_NAME_FILTERS = ["all", "differ"] as const;
export type SameNameFilter = (typeof SAME_NAME_FILTERS)[number];
export const DEFAULT_SAME_NAME_FILTER: SameNameFilter = "all";
export const isSameNameFilter = (v: unknown): v is SameNameFilter => (SAME_NAME_FILTERS as readonly unknown[]).includes(v);

export interface SameNameMember {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly tag: SameNameTag;
  /** Whole metres from the point typed, or null with no point or no map point. Never put in a file. */
  readonly metres: number | null;
}

export interface SameNameGroup {
  readonly key: string;
  /** The spelling used most often in the group; ties go to the first in name order. */
  readonly label: string;
  /** Closest first when there is a point, otherwise by address then id. */
  readonly members: readonly SameNameMember[];
  /** True when the members do not all carry the same wheelchair tag. */
  readonly tagsDiffer: boolean;
  /** The closest member's metres, or null when none could be measured. */
  readonly nearestMetres: number | null;
}

export interface SameNameResult {
  /** Every group of two or more, before any size or filter is applied, in key order. */
  readonly groups: readonly SameNameGroup[];
  /** Places whose name is unique among the places given. */
  readonly alone: number;
  /** Places with no name that can be compared. */
  readonly unnamed: number;
}

const memberOf = (p: PackPlaceRecord, name: string, from: Point | null): SameNameMember => ({
  id: p.id,
  name,
  address: p.address,
  tag: p.tag,
  metres: from !== null && p.location !== null && isPoint(p.location) ? Math.round(distanceMetres(from, p.location)) : null,
});

/** The spelling shown for a group: the one written most often; a tie goes to one with both capitals and small letters, then to name order. */
export function pickLabel(names: readonly string[], locale: Locale): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const mixed = (s: string): number => (s !== s.toUpperCase() && s !== s.toLowerCase() ? 0 : 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || mixed(x[0]) - mixed(y[0]) || compareNames(x[0], y[0], locale) || (x[0] < y[0] ? -1 : 1))[0]![0];
}

const byMetres = (a: SameNameMember, b: SameNameMember): number => {
  if (a.metres !== b.metres) {
    if (a.metres === null) return 1;
    if (b.metres === null) return -1;
    return a.metres - b.metres;
  }
  const addr = (a.address ?? "").localeCompare(b.address ?? "", "en", { sensitivity: "base", numeric: true });
  return addr || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};

/** Groups the places by name. The result does not depend on the order the places came in. */
export function buildSameName(places: readonly PackPlaceRecord[], from: Point | null = null, locale: Locale = "en"): SameNameResult {
  const buckets = new Map<string, PackPlaceRecord[]>();
  let unnamed = 0;
  for (const p of places) {
    const key = nameKey(p.name);
    if (key === null) {
      unnamed += 1;
      continue;
    }
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }
  const groups: SameNameGroup[] = [];
  let alone = 0;
  for (const key of [...buckets.keys()].sort()) {
    const list = buckets.get(key)!;
    if (list.length < 2) {
      alone += 1;
      continue;
    }
    const members = list.map((p) => memberOf(p, p.name!.trim(), from)).sort(byMetres);
    const measured = members.map((m) => m.metres).filter((m): m is number => m !== null);
    groups.push({
      key,
      label: pickLabel(members.map((m) => displayName(m.name)), locale),
      members,
      tagsDiffer: new Set(members.map((m) => m.tag)).size > 1,
      nearestMetres: measured.length === 0 ? null : Math.min(...measured),
    });
  }
  return { groups, alone, unnamed };
}

/** What is listed: groups of at least `size` places, optionally only those whose tags differ, in the order chosen. */
export function listSameName(result: SameNameResult, order: SameNameOrder, size: SameNameSize, filter: SameNameFilter, locale: Locale): readonly SameNameGroup[] {
  const kept = result.groups.filter((g) => g.members.length >= size && (filter === "all" || g.tagsDiffer));
  const byName = (a: SameNameGroup, b: SameNameGroup): number => compareNames(a.label, b.label, locale) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const sorted = [...kept];
  if (order === "name") sorted.sort(byName);
  else if (order === "count") sorted.sort((a, b) => b.members.length - a.members.length || byName(a, b));
  else
    sorted.sort((a, b) => {
      if (a.nearestMetres !== b.nearestMetres) {
        if (a.nearestMetres === null) return 1;
        if (b.nearestMetres === null) return -1;
        return a.nearestMetres - b.nearestMetres;
      }
      return byName(a, b);
    });
  return sorted;
}

/** The first `limit` groups and how many are left out. */
export function sameNamePage(groups: readonly SameNameGroup[], limit: number): { readonly groups: readonly SameNameGroup[]; readonly more: number } {
  const n = Math.max(0, Math.floor(limit));
  return { groups: groups.slice(0, n), more: Math.max(0, groups.length - n) };
}

export const SAME_NAME_LIMITS = [5, 10, 25] as const;
export type SameNameLimit = (typeof SAME_NAME_LIMITS)[number];
export const DEFAULT_SAME_NAME_LIMIT: SameNameLimit = 10;
export const isSameNameLimit = (v: unknown): v is SameNameLimit => (SAME_NAME_LIMITS as readonly unknown[]).includes(v);
