/**
 * View model for the pack places list: search by words, filter by the reported
 * wheelchair tag, optional sort by distance from a typed point. A place whose tag
 * is UNKNOWN is never silently dropped by a tag filter: the list says how many
 * are not shown and how to see them.
 */
import type { Locale } from "./stateCopy";
import { MIN_TOUCH_TARGET_PX } from "./stateCopy";
import { normalizeText } from "./filters";
import { filterBySearch } from "./packSearchMatch";
import { parsePackSearch } from "./packSearchParse";
import { message, type MessageId } from "./messages";
import { type PackPlaceRecord, type WheelchairTag, WHEELCHAIR_TAGS, countByTag } from "./packPlaces";
import { type Point, type PointInput, distanceMetres, formatPackDistance } from "./packGeo";
import { tierLine } from "./recordTier";
import { filterByKind } from "./packCategories";
import { type BandKey, filterByBand } from "./packBands";
import { type FacetGroup, type FacetSelection, EMPTY_FACETS, applyFacets, facetGroups, facetSummary } from "./packFacets";
import { attributionLine, ageLabel, isStale } from "./provenance";
import { type RouteStateView, getRouteEmpty } from "./routeStates";

export type TagFilter = WheelchairTag | "any";
export const TAG_FILTERS: readonly TagFilter[] = ["any", ...WHEELCHAIR_TAGS, "unknown"];

export interface PackQuery {
  readonly text: string;
  readonly tag: TagFilter;
  readonly near: PointInput;
  /** Source, licence, tier and age filters. Left out means no facet filter. */
  readonly facets?: FacetSelection;
  /** A kind key from packCategories (see kindKey). Left out or null means every kind. */
  readonly kind?: string | null;
  /** A distance band from packBands. Used only when a starting point is typed; left out or null means every distance. */
  readonly band?: BandKey | null;
}

export const EMPTY_PACK_QUERY: PackQuery = { text: "", tag: "any", near: { status: "none" } };

export interface PackContext {
  readonly locale: Locale;
  /** ISO date (YYYY-MM-DD), supplied by the caller so the view stays pure. */
  readonly today: string;
}

export interface PackPlaceCard {
  readonly id: string;
  readonly name: string;
  readonly nameKnown: boolean;
  readonly tag: WheelchairTag;
  readonly tagLine: string;
  readonly category: string;
  readonly address: string;
  readonly note: string | null;
  readonly sourceLine: string | null;
  readonly sourceUrl: string | null;
  readonly sourceLinkLabel: string | null;
  readonly tierText: string;
  readonly ageText: string | null;
  readonly staleNotice: string | null;
  readonly noSourceNotice: string | null;
  readonly distanceText: string | null;
}

export interface TagOption {
  readonly value: TagFilter;
  readonly label: string;
}

export interface PackListView {
  readonly kind: "list";
  readonly cards: readonly PackPlaceCard[];
  readonly count: number;
  readonly announcement: string;
  readonly unknownHiddenNotice: string | null;
  readonly droppedNotice: string | null;
  readonly nearError: string | null;
  readonly tagOptions: readonly TagOption[];
  readonly facetGroups: readonly FacetGroup[];
  readonly facetSummary: string | null;
  /** Places that pass the text, tag, facet and distance filters, before the kind filter. The kinds table counts these. */
  readonly beforeKind: readonly PackPlaceRecord[];
  /** Places that pass the text, tag, facet and kind filters, before the distance filter. The distance table counts these. */
  readonly beforeBand: readonly PackPlaceRecord[];
  /** The places in the list, in list order: every filter applied. The closest-place table reads these. */
  readonly shownPlaces: readonly PackPlaceRecord[];
  readonly minTargetPx: number;
}

export interface PackEmptyView extends Omit<PackListView, "kind" | "cards"> {
  readonly kind: "empty";
  readonly view: RouteStateView;
}

export type PackView = PackListView | PackEmptyView;

function tagWord(tag: TagFilter, locale: Locale): string {
  return message(`pack.tag.${tag}` as MessageId, locale);
}

export function tagOptions(places: readonly PackPlaceRecord[], locale: Locale): TagOption[] {
  const counts = countByTag(places);
  return TAG_FILTERS.map((value) => ({
    value,
    label: message("pack.tagOption", locale, {
      label: tagWord(value, locale),
      n: value === "any" ? places.length : counts[value],
    }),
  }));
}

export function toCard(p: PackPlaceRecord, ctx: PackContext, from: Point | null): PackPlaceCard {
  const { locale, today } = ctx;
  const known = p.tag !== "unknown";
  return {
    id: p.id,
    name: p.name ?? message("pack.nameUnknown", locale),
    nameKnown: p.name !== null,
    tag: p.tag,
    tagLine: known ? message("pack.tagLine", locale, { value: tagWord(p.tag, locale) }) : message("pack.tagLineUnknown", locale),
    category: p.category ? message("pack.category", locale, { value: p.category }) : message("pack.categoryUnknown", locale),
    address: p.address ? message("pack.address", locale, { value: p.address }) : message("pack.addressUnknown", locale),
    note: p.note ? message("pack.note", locale, { text: p.note }) : null,
    sourceLine: p.provenance ? attributionLine(p.provenance, locale) : null,
    sourceUrl: p.provenance?.url ?? null,
    sourceLinkLabel: p.provenance?.url ? message("pack.openSource", locale, { name: p.name ?? message("pack.nameUnknown", locale) }) : null,
    tierText: tierLine(p.tier, locale),
    ageText: p.provenance ? ageLabel(p.provenance.retrievedOn, today, locale) : null,
    staleNotice: p.provenance && isStale(p.provenance.retrievedOn, today) ? message("pack.stale", locale) : null,
    noSourceNotice: p.tagUnknownReason === "missing-provenance" ? message("pack.noSource", locale) : null,
    distanceText: from && p.location ? message("pack.distance", locale, { d: formatPackDistance(distanceMetres(from, p.location), locale) }) : null,
  };
}

/** Name order, UNKNOWN names last, id as the tie-break so the order never changes between renders. */
function byName(a: PackPlaceRecord, b: PackPlaceRecord): number {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  const n = normalizeText(a.name ?? "").localeCompare(normalizeText(b.name ?? ""));
  return n !== 0 ? n : a.id.localeCompare(b.id);
}

export function packPlacesView(places: readonly PackPlaceRecord[], dropped: number, query: PackQuery, ctx: PackContext): PackView {
  const { locale } = ctx;
  const from = query.near.status === "ok" ? query.near.point : null;

  const facets = query.facets ?? EMPTY_FACETS;
  const byText = filterBySearch(places, parsePackSearch(query.text));
  const byTag = byText.filter((p) => query.tag === "any" || p.tag === query.tag);
  const afterFacets = applyFacets(byTag, facets, ctx.today);
  const beforeKind = filterByBand(afterFacets, from, query.band ?? null);
  const beforeBand = filterByKind(afterFacets, query.kind ?? null);
  const shown = filterByBand(beforeBand, from, query.band ?? null);
  const hiddenUnknown = query.tag !== "any" && query.tag !== "unknown" ? byText.filter((p) => p.tag === "unknown").length : 0;

  const ordered = [...shown].sort((a, b) => {
    if (from) {
      const da = a.location ? distanceMetres(from, a.location) : Number.POSITIVE_INFINITY;
      const db = b.location ? distanceMetres(from, b.location) : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
    }
    return byName(a, b);
  });

  const shared = {
    count: ordered.length,
    announcement: message("pack.count", locale, { n: ordered.length }),
    unknownHiddenNotice: hiddenUnknown > 0 ? message("pack.unknownHidden", locale, { n: hiddenUnknown }) : null,
    droppedNotice: dropped > 0 ? message("pack.dropped", locale, { n: dropped }) : null,
    nearError: query.near.status === "invalid" ? message("pack.nearError", locale) : null,
    tagOptions: tagOptions(places, locale),
    facetGroups: facetGroups(byTag, facets, locale, ctx.today),
    facetSummary: facetSummary(facets, locale),
    beforeKind,
    beforeBand,
    shownPlaces: ordered,
    minTargetPx: MIN_TOUCH_TARGET_PX,
  };

  if (ordered.length === 0) {
    const view = getRouteEmpty("search", locale);
    if (view) return { kind: "empty", view, ...shared };
  }
  return { kind: "list", cards: ordered.map((p) => toCard(p, ctx, from)), ...shared };
}
