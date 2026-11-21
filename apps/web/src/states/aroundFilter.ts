/**
 * Narrowing and ordering the places listed around a centre. These only change which of the
 * already-measured places are shown; they never change a distance, a direction or a tag.
 */
import type { CompassPoint } from "./aroundBearing";
import type { AroundMember } from "./aroundSearch";
import { compareAround } from "./aroundSearch";
import { normalizeText } from "./filters";
import type { WheelchairTag } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const AROUND_ORDERS = ["distance", "name", "tag"] as const;
export type AroundOrder = (typeof AROUND_ORDERS)[number];
export const DEFAULT_AROUND_ORDER: AroundOrder = "distance";

export function isAroundOrder(v: unknown): v is AroundOrder {
  return typeof v === "string" && (AROUND_ORDERS as readonly string[]).includes(v);
}

export function aroundOrderLabel(order: AroundOrder, locale: Locale): string {
  switch (order) {
    case "distance":
      return t(locale, "Nearest first", "Du plus proche au plus éloigné");
    case "name":
      return t(locale, "By name", "Par nom");
    case "tag":
      return t(locale, "By wheelchair tag", "Par indication pour fauteuil roulant");
  }
}

export interface AroundFilter {
  readonly query: string;
  /** Tags to keep. Empty means every tag. */
  readonly tags: readonly WheelchairTag[];
  /** A direction to keep, or null for every direction. */
  readonly direction: CompassPoint | null;
}

export const NO_AROUND_FILTER: AroundFilter = { query: "", tags: [], direction: null };

export function isFiltered(f: AroundFilter): boolean {
  return f.query.trim() !== "" || f.tags.length > 0 || f.direction !== null;
}

/** Word-prefix match over name, address and kind, ignoring case and accents. A single letter must be a whole word. */
function matches(m: AroundMember, query: string): boolean {
  const words = normalizeText(query).split(/[^a-z0-9]+/).filter((w) => w !== "");
  if (words.length === 0) return true;
  const hay = normalizeText(`${m.name ?? ""} ${m.address ?? ""} ${(m.category ?? "").replace(/_/g, " ")}`).split(/[^a-z0-9]+/).filter((w) => w !== "");
  return words.every((w) => hay.some((h) => (w.length === 1 ? h === w : h.startsWith(w))));
}

export function filterAround(members: readonly AroundMember[], f: AroundFilter): readonly AroundMember[] {
  return members.filter((m) => (f.tags.length === 0 || f.tags.includes(m.tag)) && (f.direction === null || m.direction === f.direction) && matches(m, f.query));
}

/** The order the tags are listed in everywhere on the page. It is a listing order, not a ranking. */
const TAG_RANK: Readonly<Record<WheelchairTag, number>> = { yes: 0, limited: 1, no: 2, designated: 3, unknown: 4 };

export function orderAround(members: readonly AroundMember[], order: AroundOrder): readonly AroundMember[] {
  const copy = members.slice();
  switch (order) {
    case "distance":
      return copy.sort(compareAround);
    case "name":
      return copy.sort((a, b) => {
        if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
        const byName = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
        return byName !== 0 ? byName : compareAround(a, b);
      });
    case "tag":
      return copy.sort((a, b) => TAG_RANK[a.tag] - TAG_RANK[b.tag] || compareAround(a, b));
  }
}

export function toggleTag(tags: readonly WheelchairTag[], tag: WheelchairTag): readonly WheelchairTag[] {
  return tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag];
}
