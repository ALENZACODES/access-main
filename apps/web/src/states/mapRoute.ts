/**
 * The "map" route. It is a list on purpose: no map tiles are loaded, so there is no
 * third-party request and it works offline. Each place with a recorded location links
 * to the person's own maps app through a geo: URI. A place without a valid, sourced
 * location says "Location UNKNOWN" and is never given a guessed position.
 */
import { type Locale, MIN_TOUCH_TARGET_PX, errorKindFromStatus } from "./stateCopy";
import { formatDistance, geoUri, haversineMeters } from "./geo";
import { message } from "./messages";
import { type ConnectivityState, type OfflineBanner, offlineBanner } from "./offline";
import { type GeoPoint, type PlaceRecord, resolveLocation } from "./placeRecord";
import { attributionLine } from "./provenance";
import { normalizeText } from "./filters";
import { type RouteStateView, getRouteEmpty, getRouteError } from "./routeStates";

export type MapLoad =
  | { readonly status: "ok"; readonly places: readonly PlaceRecord[] }
  | { readonly status: "error"; readonly httpStatus?: number };

export interface MapContext {
  readonly locale: Locale;
  readonly connectivity: ConnectivityState;
  readonly near: GeoPoint | null;
  /** Text typed into the form, for redisplay. */
  readonly nearInput?: { readonly lat: string; readonly lon: string };
  /** A point was supplied but is not valid. */
  readonly nearError?: boolean;
}

export interface NearForm {
  readonly legend: string;
  readonly latLabel: string;
  readonly lonLabel: string;
  readonly submitLabel: string;
  readonly privacy: string;
  readonly latValue: string;
  readonly lonValue: string;
  readonly error: string | null;
  readonly minTargetPx: number;
}

export interface MapEntry {
  readonly id: string;
  readonly name: string;
  readonly known: boolean;
  readonly locationText: string;
  readonly sourceLine: string | null;
  readonly distanceMeters: number | null;
  readonly distanceText: string | null;
  readonly geoHref: string | null;
  readonly openLabel: string | null;
  readonly minTargetPx: number;
}

export type MapRouteView =
  | { readonly kind: "list"; readonly heading: string; readonly note: string; readonly nearForm: NearForm; readonly unlocatedNotice: string | null; readonly entries: readonly MapEntry[]; readonly banner: OfflineBanner | null }
  | { readonly kind: "empty"; readonly view: RouteStateView; readonly banner: OfflineBanner | null }
  | { readonly kind: "error"; readonly view: RouteStateView };

function toEntry(p: PlaceRecord, ctx: MapContext): MapEntry {
  const loc = resolveLocation(p.location);
  if (loc.status === "unknown") {
    return {
      id: p.id, name: p.name, known: false,
      locationText: message("map.locationUnknown", ctx.locale),
      sourceLine: null, distanceMeters: null, distanceText: null, geoHref: null, openLabel: null,
      minTargetPx: MIN_TOUCH_TARGET_PX,
    };
  }
  const d = ctx.near ? haversineMeters(ctx.near, loc.point) : null;
  return {
    id: p.id, name: p.name, known: true,
    locationText: message("map.coordinates", ctx.locale, { lat: loc.point.lat.toFixed(4), lon: loc.point.lon.toFixed(4) }),
    sourceLine: attributionLine(loc.provenance, ctx.locale),
    distanceMeters: d,
    distanceText: d === null ? null : message("map.distance", ctx.locale, { d: formatDistance(d, ctx.locale) }),
    geoHref: geoUri(loc.point),
    openLabel: message("map.openInMaps", ctx.locale, { name: p.name }),
    minTargetPx: MIN_TOUCH_TARGET_PX,
  };
}

export function mapRouteView(load: MapLoad, ctx: MapContext): MapRouteView {
  const { locale, connectivity } = ctx;
  if (load.status === "error") {
    return { kind: "error", view: getRouteError("map", errorKindFromStatus(load.httpStatus, connectivity.status === "online"), locale) };
  }
  const banner = offlineBanner(connectivity, locale);
  if (load.places.length === 0) {
    const view = getRouteEmpty("map", locale);
    if (view) return { kind: "empty", view, banner };
  }
  const byName = (a: MapEntry, b: MapEntry): number => normalizeText(a.name).localeCompare(normalizeText(b.name));
  const all = load.places.map((p) => toEntry(p, ctx));
  const located = all.filter((e) => e.known).sort((a, b) =>
    ctx.near ? (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0) || byName(a, b) : byName(a, b),
  );
  const unlocated = all.filter((e) => !e.known).sort(byName);
  return {
    kind: "list",
    heading: message("map.heading", locale),
    note: message("map.note", locale),
    nearForm: {
      legend: message("map.near.legend", locale),
      latLabel: message("map.near.lat", locale),
      lonLabel: message("map.near.lon", locale),
      submitLabel: message("map.near.submit", locale),
      privacy: message("map.near.privacy", locale),
      latValue: ctx.nearInput?.lat ?? (ctx.near ? String(ctx.near.lat) : ""),
      lonValue: ctx.nearInput?.lon ?? (ctx.near ? String(ctx.near.lon) : ""),
      error: ctx.nearError ? message("map.near.error", locale) : null,
      minTargetPx: MIN_TOUCH_TARGET_PX,
    },
    unlocatedNotice: unlocated.length > 0 ? message("map.unlocated", locale, { n: unlocated.length }) : null,
    entries: [...located, ...unlocated],
    banner,
  };
}
