/** The "saved" route view: places kept on this device, usable offline. */
import { type Locale, MIN_TOUCH_TARGET_PX, errorKindFromStatus } from "./stateCopy";
import { message } from "./messages";
import { type ConnectivityState, type OfflineBanner, offlineBanner } from "./offline";
import { type PlaceReport, type PlaceSummary, summarizePlace } from "./placeSummary";
import { type RouteStateView, getRouteEmpty, getRouteError } from "./routeStates";
import { normalizeText } from "./filters";

export type SavedLoad =
  | { readonly status: "ok"; readonly places: readonly PlaceReport[] }
  | { readonly status: "error"; readonly httpStatus?: number };

export interface SavedContext {
  readonly locale: Locale;
  readonly connectivity: ConnectivityState;
  readonly today: string;
}

export interface SavedItem {
  readonly summary: PlaceSummary;
  readonly removeLabel: string;
  readonly removeTargetPx: number;
}

export type SavedRouteView =
  | { readonly kind: "content"; readonly heading: string; readonly countText: string; readonly items: readonly SavedItem[]; readonly banner: OfflineBanner | null }
  | { readonly kind: "empty"; readonly view: RouteStateView; readonly banner: OfflineBanner | null }
  | { readonly kind: "error"; readonly view: RouteStateView };

export function savedRouteView(load: SavedLoad, ctx: SavedContext): SavedRouteView {
  const { locale, connectivity, today } = ctx;
  if (load.status === "error") {
    const kind = errorKindFromStatus(load.httpStatus, connectivity.status === "online");
    return { kind: "error", view: getRouteError("saved", kind, locale) };
  }
  const banner = offlineBanner(connectivity, locale);
  if (load.places.length === 0) {
    const view = getRouteEmpty("saved", locale);
    if (view) return { kind: "empty", view, banner };
  }
  const items: SavedItem[] = [...load.places]
    .sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))
    .map((p) => ({
      summary: summarizePlace(p, locale, today),
      removeLabel: message("saved.remove", locale, { name: p.name }),
      removeTargetPx: MIN_TOUCH_TARGET_PX,
    }));
  return {
    kind: "content",
    heading: message("saved.heading", locale),
    countText: message("saved.count", locale, { n: items.length }),
    items,
    banner,
  };
}
