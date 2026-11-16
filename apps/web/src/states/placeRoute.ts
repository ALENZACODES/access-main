/**
 * The "place" route view. Chooses between content, an error, or the UNKNOWN empty
 * state, and adds the offline banner when relevant. This is the single entry point a
 * route component should call.
 */
import { type Locale, errorKindFromStatus } from "./stateCopy";
import { type ConnectivityState, type OfflineBanner, offlineBanner } from "./offline";
import { type PlaceReport, type PlaceSummary, summarizePlace } from "./placeSummary";
import { type RouteStateView, getRouteEmpty, getRouteError } from "./routeStates";

export type PlaceLoad =
  | { readonly status: "ok"; readonly place: PlaceReport; readonly fromSavedCopy: boolean }
  | { readonly status: "not-found" }
  | { readonly status: "error"; readonly httpStatus?: number };

export interface PlaceRouteContext {
  readonly locale: Locale;
  readonly connectivity: ConnectivityState;
  /** ISO date, YYYY-MM-DD. */
  readonly today: string;
}

export type PlaceRouteView =
  | { readonly kind: "content"; readonly summary: PlaceSummary; readonly banner: OfflineBanner | null; readonly savedCopyNotice: string | null }
  | { readonly kind: "empty"; readonly view: RouteStateView; readonly banner: OfflineBanner | null }
  | { readonly kind: "error"; readonly view: RouteStateView };

export function placeRouteView(load: PlaceLoad, ctx: PlaceRouteContext): PlaceRouteView {
  const { locale, connectivity, today } = ctx;
  const online = connectivity.status === "online";

  if (load.status === "not-found") {
    return { kind: "error", view: getRouteError("place", "not-found", locale) };
  }
  if (load.status === "error") {
    return { kind: "error", view: getRouteError("place", errorKindFromStatus(load.httpStatus, online), locale) };
  }

  const summary = summarizePlace(load.place, locale, today);
  const banner = offlineBanner(connectivity, locale);
  if (summary.knownCount === 0) {
    const view = getRouteEmpty("place", locale);
    if (view) return { kind: "empty", view, banner };
  }
  const savedCopyNotice = load.fromSavedCopy
    ? locale === "fr"
      ? "Ces renseignements proviennent d’une copie enregistrée sur cet appareil."
      : "These details come from a copy saved on this device."
    : null;
  return { kind: "content", summary, banner, savedCopyNotice };
}
