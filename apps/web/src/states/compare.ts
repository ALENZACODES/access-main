/**
 * Side-by-side comparison of up to three places. UNKNOWN is shown as UNKNOWN in its
 * own cell and counts as different from any reported value; nothing is filled in.
 */
import { type Locale, errorKindFromStatus } from "./stateCopy";
import { FEATURE_IDS, type FeatureId, type Status, evaluateAll, featureLabel, statusText } from "./dataStatus";
import { listJoin, message } from "./messages";
import { type ConnectivityState, type OfflineBanner, offlineBanner } from "./offline";
import type { PlaceRecord } from "./placeRecord";
import { attributionLine } from "./provenance";
import { EXTRA_ROUTES } from "./routeStatesExtra";
import type { RouteStateView } from "./routeStates";

export const MAX_COMPARE = 3;

export type CompareLoad =
  | { readonly status: "ok"; readonly places: readonly PlaceRecord[] }
  | { readonly status: "error"; readonly httpStatus?: number };

export interface CompareContext {
  readonly locale: Locale;
  readonly connectivity: ConnectivityState;
}

export interface CompareCell {
  readonly placeId: string;
  readonly status: Status;
  readonly statusText: string;
  readonly sourceLine: string | null;
}

export interface CompareRow {
  readonly feature: FeatureId;
  readonly label: string;
  readonly cells: readonly CompareCell[];
  readonly differs: boolean;
  readonly differsText: string | null;
}

export type CompareView =
  | {
      readonly kind: "table";
      readonly heading: string;
      readonly caption: string;
      readonly detailHeader: string;
      readonly columns: readonly { readonly id: string; readonly name: string }[];
      readonly rows: readonly CompareRow[];
      readonly notices: readonly string[];
      readonly banner: OfflineBanner | null;
    }
  | { readonly kind: "too-few"; readonly heading: string; readonly text: string; readonly notices: readonly string[]; readonly banner: OfflineBanner | null }
  | { readonly kind: "error"; readonly view: RouteStateView };

export function compareRouteView(load: CompareLoad, requestedIds: readonly string[], ctx: CompareContext): CompareView {
  const { locale, connectivity } = ctx;
  if (load.status === "error") {
    const kind = errorKindFromStatus(load.httpStatus, connectivity.status === "online");
    return { kind: "error", view: EXTRA_ROUTES.getRouteError("compare", kind, locale) };
  }
  const banner = offlineBanner(connectivity, locale);
  const notices: string[] = [];

  const unique = [...new Set(requestedIds)];
  const wanted = unique.slice(0, MAX_COMPARE);
  if (unique.length > MAX_COMPARE) notices.push(message("compare.max", locale, { n: MAX_COMPARE }));

  const byId = new Map(load.places.map((p) => [p.id, p] as const));
  const found = wanted.map((id) => byId.get(id)).filter((p): p is PlaceRecord => p !== undefined);
  const missing = wanted.length - found.length;
  if (missing > 0) notices.push(message("compare.missing", locale, { n: missing }));

  const heading = message("compare.heading", locale);
  if (found.length < 2) {
    return { kind: "too-few", heading, text: message("compare.needTwo", locale), notices, banner };
  }

  const statuses = found.map((p) => new Map(evaluateAll(p.features).map((s) => [s.feature, s] as const)));
  const rows: CompareRow[] = FEATURE_IDS.map((feature) => {
    const cells: CompareCell[] = found.map((p, i) => {
      const s = statuses[i]!.get(feature)!;
      return {
        placeId: p.id,
        status: s.status,
        statusText: statusText(s.status, locale),
        sourceLine: s.provenance ? attributionLine(s.provenance, locale) : null,
      };
    });
    const differs = new Set(cells.map((c) => c.status)).size > 1;
    return {
      feature,
      label: featureLabel(feature, locale),
      cells,
      differs,
      differsText: differs ? message("compare.differs", locale) : null,
    };
  });

  return {
    kind: "table",
    heading,
    caption: message("compare.caption", locale, { names: listJoin(locale, found.map((p) => p.name)) }),
    detailHeader: message("compare.detail", locale),
    columns: found.map((p) => ({ id: p.id, name: p.name })),
    rows,
    notices,
    banner,
  };
}
