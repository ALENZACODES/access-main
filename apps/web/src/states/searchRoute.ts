/**
 * The "search" route view. Applies the filter, keeps UNKNOWN places in their own
 * group, and chooses between results, the empty state, and an error.
 */
import { type Locale, MIN_TOUCH_TARGET_PX, errorKindFromStatus } from "./stateCopy";
import { featureLabel } from "./dataStatus";
import { type PlaceFilter, type PlaceMatch, searchPlaces } from "./filters";
import { listJoin, message } from "./messages";
import { type ConnectivityState, type OfflineBanner, offlineBanner } from "./offline";
import { type PlaceReport, type PlaceSummary, summarizePlace } from "./placeSummary";
import { type RouteStateView, getRouteEmpty, getRouteError } from "./routeStates";

export type SearchLoad =
  | { readonly status: "ok"; readonly places: readonly PlaceReport[] }
  | { readonly status: "error"; readonly httpStatus?: number };

export interface SearchContext {
  readonly locale: Locale;
  readonly connectivity: ConnectivityState;
  readonly today: string;
  readonly filter: PlaceFilter;
}

export interface PlaceCard {
  readonly id: string | null;
  readonly name: string;
  readonly countsText: string;
  readonly matchedText: string | null;
  readonly unknownText: string | null;
  readonly summary: PlaceSummary;
}

export interface UnknownToggle {
  readonly label: string;
  readonly minTargetPx: number;
  /** The value of `includeUnknown` after the toggle is used. */
  readonly nextIncludeUnknown: boolean;
}

interface Shared {
  readonly banner: OfflineBanner | null;
  readonly unknownNotice: string | null;
  readonly unknownToggle: UnknownToggle | null;
}

export type SearchRouteView =
  | (Shared & { readonly kind: "results"; readonly cards: readonly PlaceCard[]; readonly heading: string; readonly announcement: string })
  | (Shared & { readonly kind: "empty"; readonly view: RouteStateView })
  | { readonly kind: "error"; readonly view: RouteStateView };

function toCard(m: PlaceMatch, ctx: SearchContext): PlaceCard {
  const { locale, today } = ctx;
  const summary = summarizePlace(m.place, locale, today);
  const labels = (ids: readonly PlaceMatch["matched"][number][]): string =>
    listJoin(locale, ids.map((id) => featureLabel(id, locale)));
  const rawId = (m.place as { readonly id?: unknown }).id;
  return {
    id: typeof rawId === "string" ? rawId : null,
    name: m.place.name,
    countsText: summary.countsText,
    matchedText: m.matched.length > 0 ? message("place.matchedFor", locale, { features: labels(m.matched) }) : null,
    unknownText: m.unknown.length > 0 ? message("place.unknownFor", locale, { features: labels(m.unknown) }) : null,
    summary,
  };
}

export function searchRouteView(load: SearchLoad, ctx: SearchContext): SearchRouteView {
  const { locale, connectivity, filter } = ctx;
  if (load.status === "error") {
    const kind = errorKindFromStatus(load.httpStatus, connectivity.status === "online");
    return { kind: "error", view: getRouteError("search", kind, locale) };
  }

  const outcome = searchPlaces(load.places, filter);
  const unknownCount = outcome.unknownPlaces.length;
  const banner = offlineBanner(connectivity, locale);

  // Only meaningful when a requirement exists; otherwise nothing can be UNKNOWN for it.
  const canToggle = filter.required.length > 0 && unknownCount > 0;
  const unknownToggle: UnknownToggle | null = canToggle
    ? {
        label: message(filter.includeUnknown ? "search.hideUnknown" : "search.showUnknown", locale),
        minTargetPx: MIN_TOUCH_TARGET_PX,
        nextIncludeUnknown: !filter.includeUnknown,
      }
    : null;
  const unknownNotice = canToggle
    ? message(filter.includeUnknown ? "search.unknownShown" : "search.unknownHidden", locale, { n: unknownCount })
    : null;

  const shown = filter.includeUnknown ? [...outcome.matches, ...outcome.unknownPlaces] : [...outcome.matches];
  if (shown.length === 0) {
    const view = getRouteEmpty("search", locale);
    if (view) return { kind: "empty", view, banner, unknownNotice, unknownToggle };
  }

  const count = message("search.matches", locale, { n: outcome.matches.length });
  return {
    kind: "results",
    heading: message("search.heading", locale),
    cards: shown.map((m) => toCard(m, ctx)),
    announcement: unknownNotice ? `${count} ${unknownNotice}` : count,
    banner,
    unknownNotice,
    unknownToggle,
  };
}
