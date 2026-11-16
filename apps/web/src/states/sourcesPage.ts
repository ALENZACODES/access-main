/**
 * Sources and licences page: every source behind any detail or location shown by the
 * App, with its open licence, how many details it supports and its latest retrieval.
 */
import { type Locale, errorKindFromStatus } from "./stateCopy";
import { evaluateAll } from "./dataStatus";
import { message } from "./messages";
import { type ConnectivityState, type OfflineBanner, offlineBanner } from "./offline";
import { type PlaceRecord, resolveLocation } from "./placeRecord";
import { OPEN_LICENCES, type OpenLicenceId, type Provenance, formatDate } from "./provenance";
import { EXTRA_ROUTES } from "./routeStatesExtra";
import type { RouteStateView } from "./routeStates";

export interface SourceEntry {
  readonly source: string;
  readonly licence: OpenLicenceId;
  readonly licenceName: string;
  readonly details: number;
  readonly earliest: string;
  readonly latest: string;
  readonly url: string | null;
}

export function collectSources(places: readonly PlaceRecord[]): SourceEntry[] {
  const map = new Map<string, { p: Provenance; details: number; earliest: string; latest: string }>();
  const add = (p: Provenance): void => {
    const key = `${p.source}\u0000${p.licence}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { p, details: 1, earliest: p.retrievedOn, latest: p.retrievedOn });
      return;
    }
    cur.details++;
    if (p.retrievedOn < cur.earliest) cur.earliest = p.retrievedOn;
    if (p.retrievedOn > cur.latest) cur.latest = p.retrievedOn;
    if (!cur.p.url && p.url) cur.p = p;
  };
  for (const place of places) {
    for (const s of evaluateAll(place.features)) if (s.provenance) add(s.provenance);
    const loc = resolveLocation(place.location);
    if (loc.status === "known") add(loc.provenance);
  }
  return [...map.values()]
    .map((v) => ({
      source: v.p.source,
      licence: v.p.licence,
      licenceName: OPEN_LICENCES[v.p.licence],
      details: v.details,
      earliest: v.earliest,
      latest: v.latest,
      url: v.p.url ?? null,
    }))
    .sort((a, b) => a.source.localeCompare(b.source) || a.licence.localeCompare(b.licence));
}

export type SourcesLoad =
  | { readonly status: "ok"; readonly places: readonly PlaceRecord[] }
  | { readonly status: "error"; readonly httpStatus?: number };

export interface SourcesContext {
  readonly locale: Locale;
  readonly connectivity: ConnectivityState;
}

export interface SourcesRow extends SourceEntry {
  readonly latestText: string;
}

export type SourcesView =
  | {
      readonly kind: "table";
      readonly heading: string;
      readonly intro: string;
      readonly caption: string;
      readonly headers: { readonly source: string; readonly licence: string; readonly details: string; readonly latest: string };
      readonly rows: readonly SourcesRow[];
      readonly banner: OfflineBanner | null;
    }
  | { readonly kind: "empty"; readonly heading: string; readonly text: string; readonly intro: string; readonly banner: OfflineBanner | null }
  | { readonly kind: "error"; readonly view: RouteStateView };

export function sourcesRouteView(load: SourcesLoad, ctx: SourcesContext): SourcesView {
  const { locale, connectivity } = ctx;
  if (load.status === "error") {
    const kind = errorKindFromStatus(load.httpStatus, connectivity.status === "online");
    return { kind: "error", view: EXTRA_ROUTES.getRouteError("sources", kind, locale) };
  }
  const banner = offlineBanner(connectivity, locale);
  const heading = message("sources.heading", locale);
  const intro = message("sources.intro", locale);
  const entries = collectSources(load.places);
  if (entries.length === 0) {
    return { kind: "empty", heading, intro, text: message("sources.empty", locale), banner };
  }
  return {
    kind: "table",
    heading,
    intro,
    caption: message("sources.caption", locale),
    headers: {
      source: message("sources.colSource", locale),
      licence: message("sources.colLicence", locale),
      details: message("sources.colDetails", locale),
      latest: message("sources.colLatest", locale),
    },
    rows: entries.map((e) => ({ ...e, latestText: formatDate(e.latest, locale) })),
    banner,
  };
}
