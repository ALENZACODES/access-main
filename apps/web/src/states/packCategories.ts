/**
 * Kinds of place in the offline pack, as the pack tags them.
 *
 * The pack carries one free-text `category` per place (an OpenStreetMap value such as
 * "fast_food"). It is a tag, not a ruling: this module only counts and groups what the pack
 * says. It does not translate, merge or rename kinds, and a place with no kind is counted under
 * UNKNOWN, never dropped and never put under a kind that was not stated.
 *
 * Grouping ignores case, accents and underscores, so "Fast_Food" and "fast food" count together.
 * Everything here is pure: the caller supplies today's date.
 */
import { normalizeText } from "./filters";
import { type PackPlaceRecord, type WheelchairTag, WHEELCHAIR_TAGS } from "./packPlaces";
import { isStale } from "./provenance";
import type { Locale } from "./stateCopy";
import { NNBSP, t } from "./typography";

/** The key of the group for places whose pack record states no kind. */
export const UNKNOWN_KIND = "unknown" as const;
export const KIND_TAG_ORDER: readonly WheelchairTag[] = [...WHEELCHAIR_TAGS, "unknown"];

export interface KindRow {
  /** Grouping key: lower case, no accents, single spaces. UNKNOWN_KIND for places with no kind. */
  readonly key: string;
  /** The kind as most records spell it (the most common spelling, then the first in id order). null for UNKNOWN. */
  readonly spelling: string | null;
  readonly total: number;
  readonly byTag: Readonly<Record<WheelchairTag, number>>;
  /** Places whose wheelchair tag is reported with a source. */
  readonly reported: number;
  readonly withLocation: number;
  readonly withName: number;
  /** Places whose source was retrieved more than a year before today. */
  readonly stale: number;
}

/** The grouping key for a raw category. Blank, "UNKNOWN" and non-text all group as UNKNOWN_KIND. */
export function kindKey(raw: string | null | undefined): string {
  if (typeof raw !== "string") return UNKNOWN_KIND;
  const key = normalizeText(raw.replace(/[_\s]+/g, " ")).replace(/\s+/g, " ").trim();
  return key === "" || key === "unknown" ? UNKNOWN_KIND : key;
}

/** How a kind is shown: the pack's own words with underscores read as spaces. UNKNOWN stays the token UNKNOWN. */
export function kindLabel(row: Pick<KindRow, "key" | "spelling">): string {
  if (row.key === UNKNOWN_KIND || row.spelling === null) return "UNKNOWN";
  return row.spelling.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

function emptyCounts(): Record<WheelchairTag, number> {
  return { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };
}

interface Accumulator {
  key: string;
  spellings: Map<string, number>;
  firstSeen: string;
  total: number;
  byTag: Record<WheelchairTag, number>;
  reported: number;
  withLocation: number;
  withName: number;
  stale: number;
}

function commonest(spellings: ReadonlyMap<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [spelling, count] of spellings) {
    // Most records first; the earlier-seen spelling wins a tie because Map keeps insertion order.
    if (count > bestCount) {
      best = spelling;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One row per kind. Order: most places first, then the kind's name, UNKNOWN always last so it is
 * never mistaken for the largest group.
 */
export function buildKindRows(places: readonly PackPlaceRecord[], today: string): KindRow[] {
  const groups = new Map<string, Accumulator>();
  const ordered = [...places].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of ordered) {
    const key = kindKey(p.category);
    let g = groups.get(key);
    if (!g) {
      g = { key, spellings: new Map(), firstSeen: p.id, total: 0, byTag: emptyCounts(), reported: 0, withLocation: 0, withName: 0, stale: 0 };
      groups.set(key, g);
    }
    g.total += 1;
    g.byTag[p.tag] += 1;
    if (p.tag !== "unknown") g.reported += 1;
    if (p.location !== null) g.withLocation += 1;
    if (p.name !== null) g.withName += 1;
    if (p.provenance && isStale(p.provenance.retrievedOn, today)) g.stale += 1;
    if (key !== UNKNOWN_KIND && p.category !== null) g.spellings.set(p.category, (g.spellings.get(p.category) ?? 0) + 1);
  }
  const rows: KindRow[] = [...groups.values()].map((g) => ({
    key: g.key,
    spelling: g.key === UNKNOWN_KIND ? null : commonest(g.spellings),
    total: g.total,
    byTag: g.byTag,
    reported: g.reported,
    withLocation: g.withLocation,
    withName: g.withName,
    stale: g.stale,
  }));
  return rows.sort((a, b) => {
    if ((a.key === UNKNOWN_KIND) !== (b.key === UNKNOWN_KIND)) return a.key === UNKNOWN_KIND ? 1 : -1;
    if (a.total !== b.total) return b.total - a.total;
    return a.key.localeCompare(b.key);
  });
}

/** True when a place belongs to the kind. A null key means no kind filter. */
export function matchesKind(p: PackPlaceRecord, key: string | null): boolean {
  return key === null || kindKey(p.category) === key;
}

export function filterByKind(places: readonly PackPlaceRecord[], key: string | null): PackPlaceRecord[] {
  return key === null ? [...places] : places.filter((p) => matchesKind(p, key));
}

/** A whole-number percentage, rounded down so a group is never shown as fuller than it is. 0 places gives null. */
export function kindPercent(part: number, whole: number): number | null {
  if (whole <= 0 || part < 0) return null;
  return Math.min(100, Math.floor((part / whole) * 100));
}

export function formatKindShare(value: number | null, locale: Locale): string {
  if (value === null) return "UNKNOWN";
  return locale === "fr" ? `${value}${NNBSP}%` : `${value}%`;
}

/** Share of a kind's places whose wheelchair tag is reported with a source. */
export function reportedShare(row: KindRow): number | null {
  return kindPercent(row.reported, row.total);
}

export interface KindSummary {
  /** Kinds that have a stated spelling (UNKNOWN is not a kind). */
  readonly kinds: number;
  readonly unknownPlaces: number;
  readonly places: number;
  readonly largest: KindRow | null;
}

export function summariseKinds(rows: readonly KindRow[]): KindSummary {
  const named = rows.filter((r) => r.key !== UNKNOWN_KIND);
  const unknown = rows.find((r) => r.key === UNKNOWN_KIND);
  return {
    kinds: named.length,
    unknownPlaces: unknown?.total ?? 0,
    places: rows.reduce((sum, r) => sum + r.total, 0),
    largest: named[0] ?? null,
  };
}

function plural(n: number, locale: Locale, en: [string, string], fr: [string, string]): string {
  const forms = locale === "fr" ? fr : en;
  // French uses the singular for 0 and 1, English only for 1.
  const one = locale === "fr" ? n === 0 || n === 1 : n === 1;
  return one ? forms[0] : forms[1];
}

/** "1 place", "3 places"; French "0 lieu", "1 lieu", "2 lieux". */
export function placeCount(n: number, locale: Locale): string {
  return plural(n, locale, ["{n} place", "{n} places"], ["{n} lieu", "{n} lieux"]).replace("{n}", String(n));
}

export function kindsLine(summary: KindSummary, locale: Locale): string {
  if (summary.places === 0) return t(locale, "No places to group.", "Aucun lieu à regrouper.");
  const kinds = plural(summary.kinds, locale, ["{n} kind as tagged", "{n} kinds as tagged"], ["{n} type indiqué", "{n} types indiqués"]).replace("{n}", String(summary.kinds));
  const places = placeCount(summary.places, locale);
  const base = t(locale, `${places}: ${kinds}.`, `${places}\u00a0: ${kinds}.`);
  if (summary.unknownPlaces === 0) return base;
  const unknown = plural(
    summary.unknownPlaces,
    locale,
    ["{n} place has no kind (UNKNOWN).", "{n} places have no kind (UNKNOWN)."],
    ["{n} lieu n’a pas de type (UNKNOWN).", "{n} lieux n’ont pas de type (UNKNOWN)."],
  ).replace("{n}", String(summary.unknownPlaces));
  return `${base} ${unknown}`;
}

export type KindOrder = "count" | "name" | "reported";
export const KIND_ORDERS: readonly KindOrder[] = ["count", "name", "reported"];

export function isKindOrder(value: string): value is KindOrder {
  return (KIND_ORDERS as readonly string[]).includes(value);
}

/**
 * Re-order rows. "count" is the order buildKindRows gives; "name" is A to Z; "reported" puts the
 * kinds with the highest share of reported tags first. A share that cannot be worked out sorts as
 * lowest. Ties fall back to the count and then the name, and UNKNOWN is always last.
 */
export function sortKindRows(rows: readonly KindRow[], order: KindOrder): KindRow[] {
  const byName = (a: KindRow, b: KindRow) => a.key.localeCompare(b.key);
  const byCount = (a: KindRow, b: KindRow) => b.total - a.total || byName(a, b);
  const compare = (a: KindRow, b: KindRow): number => {
    if ((a.key === UNKNOWN_KIND) !== (b.key === UNKNOWN_KIND)) return a.key === UNKNOWN_KIND ? 1 : -1;
    if (order === "name") return byName(a, b);
    if (order === "reported") return (reportedShare(b) ?? -1) - (reportedShare(a) ?? -1) || byCount(a, b);
    return byCount(a, b);
  };
  return [...rows].sort(compare);
}

export interface LimitedKinds {
  readonly shown: readonly KindRow[];
  /** Named kinds left out because they have fewer places than the minimum. */
  readonly hiddenKinds: number;
  readonly hiddenPlaces: number;
}

/**
 * Leave out kinds with fewer than `min` places. The UNKNOWN group and the kind being shown in the
 * list are never left out, and what was left out is counted so the table can say so.
 */
export function limitKinds(rows: readonly KindRow[], min: number, keep: string | null = null): LimitedKinds {
  const floor = Number.isFinite(min) ? Math.max(1, Math.floor(min)) : 1;
  const shown: KindRow[] = [];
  let hiddenKinds = 0;
  let hiddenPlaces = 0;
  for (const row of rows) {
    if (row.total >= floor || row.key === UNKNOWN_KIND || row.key === keep) shown.push(row);
    else {
      hiddenKinds += 1;
      hiddenPlaces += row.total;
    }
  }
  return { shown, hiddenKinds, hiddenPlaces };
}

export function hiddenKindsLine(limited: LimitedKinds, min: number, locale: Locale): string | null {
  if (limited.hiddenKinds === 0) return null;
  const kinds = plural(limited.hiddenKinds, locale, ["{n} kind", "{n} kinds"], ["{n} type", "{n} types"]).replace("{n}", String(limited.hiddenKinds));
  const places = placeCount(limited.hiddenPlaces, locale);
  return t(locale, `${kinds} with fewer than ${min} places ${limited.hiddenKinds === 1 ? "is" : "are"} not shown (${places}).`, `${kinds} de moins de ${min} lieux ${limited.hiddenKinds === 1 ? "n’est pas affiché" : "ne sont pas affichés"} (${places}).`);
}
