/**
 * Round 2: apply the state components to routes.
 * Each route declares which empty state (if any) and which error kinds it can show.
 * Builds on stateCopy.ts; adds no new user strings except route names.
 */
import {
  type EmptyKind,
  type ErrorKind,
  type Locale,
  type StateView,
  getEmptyState,
  getErrorState,
} from "./stateCopy.ts";

export interface RouteStateConfig {
  readonly label: Record<Locale, string>;
  readonly empty: EmptyKind | null;
  readonly errors: readonly ErrorKind[];
}

export interface RouteStateView extends StateView {
  readonly routeId: string | null;
  /** Accessible name for the state region, e.g. "Search – No places match". */
  readonly ariaLabel: string;
}

export interface RouteStates<R extends string> {
  readonly routes: Readonly<Record<R, RouteStateConfig>>;
  isRouteId(value: string): value is R;
  /** Error view for a route. An error kind the route does not list falls back to "unknown". */
  getRouteError(route: string, kind: ErrorKind, locale: Locale): RouteStateView;
  /** Empty view for a route, or null when the route has no empty state. */
  getRouteEmpty(route: string, locale: Locale): RouteStateView | null;
}

/**
 * Build the route helpers for the app's own route ids, so the router decides the names.
 * Pass the id and label your router uses for each route.
 */
export function createRouteStates<R extends string>(
  routes: Readonly<Record<R, RouteStateConfig>>,
): RouteStates<R> {
  const isRouteId = (value: string): value is R =>
    Object.prototype.hasOwnProperty.call(routes, value);

  const withRoute = (view: StateView, routeId: R | null, locale: Locale): RouteStateView => {
    const name = routeId ? routes[routeId].label[locale] : null;
    return { ...view, routeId, ariaLabel: name ? `${name} – ${view.title}` : view.title };
  };

  return {
    routes,
    isRouteId,
    getRouteError(route, kind, locale) {
      if (!isRouteId(route)) return withRoute(getErrorState("offline-no-pack", locale), null, locale);
      // ErrorKind has no "unknown"; use the route's first listed kind instead.
      const allowed = routes[route].errors.includes(kind) ? kind : (routes[route].errors[0] ?? "offline-no-pack");
      return withRoute(getErrorState(allowed, locale), route, locale);
    },
    getRouteEmpty(route, locale) {
      if (!isRouteId(route)) return null;
      const kind = routes[route].empty;
      return kind ? withRoute(getEmptyState(kind, locale), route, locale) : null;
    },
  };
}

export type RouteId = "search" | "place" | "journey" | "finders" | "map";

/** Default route set; replace the ids with the app's real route ids via createRouteStates. */
export const ROUTE_STATES: Readonly<Record<RouteId, RouteStateConfig>> = {
  search: {
    label: { en: "Search", fr: "Recherche" },
    empty: "search-no-results",
    errors: ["offline-no-pack", "pack-download-failed"],
  },
  place: {
    label: { en: "Place details", fr: "Fiche du lieu" },
    // Missing accessibility data is shown as UNKNOWN, never inferred.
    empty: "accessibility-unknown",
    errors: ["offline-no-pack", "pack-download-failed", "not-found", "load-failed", "offline"],
  },
  journey: {
    label: { en: "Journey", fr: "Itinéraire" },
    empty: "journey-no-route",
    errors: ["offline-no-pack", "pack-download-failed"],
  },
  finders: {
    label: { en: "Finders", fr: "Repérages" },
    empty: "finder-no-results",
    errors: ["offline-no-pack", "pack-download-failed"],
  },
  map: {
    label: { en: "Map", fr: "Carte" },
    empty: "map-no-places",
    errors: ["offline-no-pack"],
  },
};

export const ROUTE_IDS = Object.keys(ROUTE_STATES) as RouteId[];

const defaults = createRouteStates(ROUTE_STATES);
export const isRouteId = defaults.isRouteId;
export const getRouteError = defaults.getRouteError;
export const getRouteEmpty = defaults.getRouteEmpty;
