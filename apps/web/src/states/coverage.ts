/**
 * Coverage page: how much is reported and how much is UNKNOWN, per feature. It exists
 * so the App states the limits of its own data instead of hiding them.
 */
import { type Locale, errorKindFromStatus } from "./stateCopy";
import { FEATURE_IDS, type FeatureId, evaluateAll, featureLabel } from "./dataStatus";
import { message } from "./messages";
import { type ConnectivityState, type OfflineBanner, offlineBanner } from "./offline";
import { type PlaceRecord, resolveLocation } from "./placeRecord";
import { formatDate, isStale } from "./provenance";
import { EXTRA_ROUTES } from "./routeStatesExtra";
import type { RouteStateView } from "./routeStates";
import { collectSources } from "./sourcesPage";
import { NBSP } from "./typography";

export interface FeatureCoverage {
  readonly feature: FeatureId;
  readonly yes: number;
  readonly no: number;
  readonly partial: number;
  readonly unknown: number;
  /** Whole percent of places with a reported value (yes, no or partial). */
  readonly reportedPercent: number;
}

export interface Coverage {
  readonly placeCount: number;
  readonly features: readonly FeatureCoverage[];
  readonly located: number;
  readonly unlocated: number;
  readonly placesWithStaleDetails: number;
  readonly sourceCount: number;
  readonly latestRetrieval: string | null;
}

export function computeCoverage(places: readonly PlaceRecord[], today: string): Coverage {
  const counts = new Map<FeatureId, { yes: number; no: number; partial: number; unknown: number }>(
    FEATURE_IDS.map((f) => [f, { yes: 0, no: 0, partial: 0, unknown: 0 }] as const),
  );
  let located = 0;
  let stalePlaces = 0;
  for (const p of places) {
    let stale = false;
    for (const s of evaluateAll(p.features)) {
      counts.get(s.feature)![s.status]++;
      if (s.provenance && isStale(s.provenance.retrievedOn, today)) stale = true;
    }
    if (stale) stalePlaces++;
    if (resolveLocation(p.location).status === "known") located++;
  }
  const sources = collectSources(places);
  const n = places.length;
  return {
    placeCount: n,
    features: FEATURE_IDS.map((feature) => {
      const c = counts.get(feature)!;
      const reported = c.yes + c.no + c.partial;
      return { feature, ...c, reportedPercent: n === 0 ? 0 : Math.round((100 * reported) / n) };
    }),
    located,
    unlocated: n - located,
    placesWithStaleDetails: stalePlaces,
    sourceCount: sources.length,
    latestRetrieval: sources.reduce<string | null>((max, s) => (max === null || s.latest > max ? s.latest : max), null),
  };
}

export function formatPercent(n: number, locale: Locale): string {
  return locale === "fr" ? `${n}${NBSP}%` : `${n}%`;
}

export type CoverageLoad =
  | { readonly status: "ok"; readonly places: readonly PlaceRecord[]; readonly dropped?: number }
  | { readonly status: "error"; readonly httpStatus?: number };

export interface CoverageContext {
  readonly locale: Locale;
  readonly connectivity: ConnectivityState;
  readonly today: string;
}

export interface CoverageRow {
  readonly feature: FeatureId;
  readonly label: string;
  readonly yes: number;
  readonly no: number;
  readonly partial: number;
  readonly unknown: number;
  readonly shareText: string;
}

export type CoverageView =
  | {
      readonly kind: "table";
      readonly heading: string;
      readonly intro: string;
      readonly caption: string;
      readonly headers: Readonly<Record<"feature" | "yes" | "no" | "partial" | "unknown" | "share", string>>;
      readonly rows: readonly CoverageRow[];
      readonly lines: readonly string[];
      readonly banner: OfflineBanner | null;
    }
  | { readonly kind: "empty"; readonly heading: string; readonly intro: string; readonly text: string; readonly lines: readonly string[]; readonly banner: OfflineBanner | null }
  | { readonly kind: "error"; readonly view: RouteStateView };

export function coverageRouteView(load: CoverageLoad, ctx: CoverageContext): CoverageView {
  const { locale, connectivity, today } = ctx;
  if (load.status === "error") {
    const kind = errorKindFromStatus(load.httpStatus, connectivity.status === "online");
    return { kind: "error", view: EXTRA_ROUTES.getRouteError("coverage", kind, locale) };
  }
  const banner = offlineBanner(connectivity, locale);
  const heading = message("coverage.heading", locale);
  const intro = message("coverage.intro", locale);
  const c = computeCoverage(load.places, today);
  const dropped = load.dropped ?? 0;
  const droppedLine = dropped > 0 ? [message("coverage.dropped", locale, { n: dropped })] : [];

  if (c.placeCount === 0) {
    return { kind: "empty", heading, intro, text: message("coverage.empty", locale), lines: droppedLine, banner };
  }
  const lines = [
    message("coverage.places", locale, { n: c.placeCount }),
    message("coverage.located", locale, { n: c.located, m: c.unlocated }),
    ...(c.placesWithStaleDetails > 0 ? [message("coverage.stale", locale, { n: c.placesWithStaleDetails })] : []),
    ...(c.sourceCount > 0 && c.latestRetrieval
      ? [message("coverage.sources", locale, { n: c.sourceCount, date: formatDate(c.latestRetrieval, locale) })]
      : []),
    ...droppedLine,
  ];
  return {
    kind: "table",
    heading,
    intro,
    caption: message("coverage.caption", locale),
    headers: {
      feature: message("coverage.colFeature", locale),
      yes: message("coverage.colYes", locale),
      no: message("coverage.colNo", locale),
      partial: message("coverage.colPartial", locale),
      unknown: message("coverage.colUnknown", locale),
      share: message("coverage.colShare", locale),
    },
    rows: c.features.map((f) => ({
      feature: f.feature,
      label: featureLabel(f.feature, locale),
      yes: f.yes, no: f.no, partial: f.partial, unknown: f.unknown,
      shareText: formatPercent(f.reportedPercent, locale),
    })),
    lines,
    banner,
  };
}
