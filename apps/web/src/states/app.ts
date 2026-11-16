/**
 * Application entry point: one function that turns a request into a complete,
 * audited-by-test HTML response. A server, service worker or static builder calls
 * handleRequest(); everything else in this package feeds it.
 */
import { type Locale, getErrorState, errorKindFromStatus } from "./stateCopy";
import { buildSubmission, validateCorrection, type CorrectionValues } from "./correction";
import { compareRouteView } from "./compare";
import { decodeFilter } from "./urlState";
import { nearFromQuery } from "./geo";
import { message } from "./messages";
import { mapRouteView } from "./mapRoute";
import { type ConnectivityState } from "./offline";
import { coverageRouteView } from "./coverage";
import { CSV_FILENAMES, placeToText, placesToCsv } from "./exportData";
import { REGISTER_SCRIPT, DEFAULT_SW_CONFIG, buildServiceWorker, type SwConfig } from "./serviceWorker";
import { buildManifest } from "./manifest";
import { type PlacesLoad, type Timers, safeLoad } from "./resilience";
import { type ResponseKind, securityHeaders } from "./securityHeaders";
import { placeRouteView } from "./placeRoute";
import { renderPage, themeFor } from "./pageShell";
import { type Preferences, preferencesFromForm } from "./preferences";
import {
  renderCompareRoute, renderConfirmation, renderCorrectionForm, renderCoverageRoute, renderMapRoute, renderOfflinePage, renderSettingsForm, renderSourcesRoute,
} from "./renderPages";
import { type RenderOptions, escapeHtml, renderPlaceRoute, renderSavedRoute, renderSearchRoute, renderStateView, renderLink } from "./renderHtml";
import { type Resolved, alternateHref, hrefFor, parseAcceptLanguage, resolveRoute } from "./router";
import { EXTRA_ROUTES } from "./routeStatesExtra";
import { savedRouteView } from "./savedRoute";
import { searchRouteView } from "./searchRoute";
import { sourcesRouteView } from "./sourcesPage";
import { type SubmissionQueue } from "./submissionQueue";

export interface AppDeps {
  loadPlaces(): Promise<PlacesLoad>;
  readonly connectivity: ConnectivityState;
  /** ISO date, YYYY-MM-DD. */
  readonly today: string;
  readonly savedIds: readonly string[];
  readonly preferences: Preferences;
  readonly queue: SubmissionQueue;
  newId(): string;
  savePreferences?(p: Preferences): void;
  /** Milliseconds to wait for loadPlaces before showing the timeout error. Default 8000. */
  readonly loadTimeoutMs?: number;
  readonly timers?: Timers;
  /** Service worker overrides, e.g. a new cache version on deploy. */
  readonly serviceWorker?: Partial<SwConfig>;
}

export interface AppRequest {
  readonly url: string;
  readonly method?: "GET" | "POST";
  readonly form?: Readonly<Record<string, string | undefined>>;
  readonly acceptLanguage?: string;
}

export interface AppResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly html: string;
}


async function dispatch(req: AppRequest, deps: AppDeps): Promise<AppResponse> {
  const pref = deps.preferences.locale;
  const preferred: Locale = pref === "auto" ? parseAcceptLanguage(req.acceptLanguage) : pref;
  const resolved = resolveRoute(req.url, preferred);

  if (resolved.kind === "redirect") return { status: 302, headers: { ...securityHeaders("redirect"), location: resolved.to }, html: "" };

  const locale = resolved.locale;
  const theme = themeFor(deps.preferences);
  const base: RenderOptions = { locale, theme, placeHref: (id) => hrefFor(locale, "place", { id }) };
  const page = (current: Parameters<typeof renderPage>[0]["current"], heading: string, body: string, status: number, r: Resolved): AppResponse => ({
    status,
    headers: securityHeaders("html"),
    html: renderPage({
      locale, current, heading, body, preferences: deps.preferences,
      alternateHref: r.kind === "route" ? alternateHref(r) : null,
    }),
  });

  if (resolved.kind === "not-found") {
    const view = getErrorState("not-found", locale);
    return page(null, view.title, renderStateView(view, { ...base, idPrefix: "nf" }), 404, resolved);
  }

  const { route, id, query } = resolved;
  const ctx = { locale, connectivity: deps.connectivity };
  const needsData = route !== "settings" && route !== "offline";
  const load: PlacesLoad = needsData
    ? await safeLoad(deps.loadPlaces, deps.loadTimeoutMs ?? 8000, deps.timers)
    : { status: "ok", places: [], fromSavedCopy: false };
  const failed = load.status === "error";
  const errorView = (kind: ReturnType<typeof errorKindFromStatus>, name: Parameters<typeof EXTRA_ROUTES.getRouteError>[0] | null): AppResponse => {
    const v = name ? EXTRA_ROUTES.getRouteError(name, kind, locale) : getErrorState(kind, locale);
    return page(route, v.title, renderStateView(v, { ...base, idPrefix: "err" }), 503, resolved);
  };
  const failKind = load.status === "error" ? errorKindFromStatus(load.httpStatus, deps.connectivity.status === "online") : "unknown";

  switch (route) {
    case "search": {
      const v = searchRouteView(load, { ...ctx, today: deps.today, filter: decodeFilter(query.toString()) });
      return page(route, message("search.heading", locale), renderSearchRoute(v, base), v.kind === "error" ? 503 : 200, resolved);
    }
    case "map": {
      const nq = nearFromQuery(query);
      const v = mapRouteView(load, { ...ctx, near: nq.near, nearInput: nq.input, nearError: nq.error });
      return page(route, message("map.heading", locale), renderMapRoute(v, base), v.kind === "error" ? 503 : 200, resolved);
    }
    case "saved": {
      const saved = new Set(deps.savedIds);
      const mine = load.status === "ok" ? load.places.filter((p) => saved.has(p.id)) : [];
      if (load.status === "ok" && query.get("format") === "csv") {
        return {
          status: 200,
          headers: { ...securityHeaders("csv"), "content-disposition": `attachment; filename="${CSV_FILENAMES[locale]}"` },
          html: placesToCsv(mine, { bom: true }),
        };
      }
      const v = savedRouteView(load.status === "ok" ? { status: "ok", places: mine } : load, { ...ctx, today: deps.today });
      const csv = load.status === "ok" && mine.length > 0
        ? `<p>${renderLink(hrefFor(locale, "saved", { query: "format=csv" }), message("export.csv", locale), theme)}</p>`
        : "";
      return page(route, message("saved.heading", locale), renderSavedRoute(v, base) + csv, v.kind === "error" ? 503 : 200, resolved);
    }
    case "compare": {
      const ids = (query.get("ids") ?? "").split(",").filter((x) => x !== "");
      const v = compareRouteView(load, ids, ctx);
      return page(route, message("compare.heading", locale), renderCompareRoute(v, base), v.kind === "error" ? 503 : 200, resolved);
    }
    case "sources": {
      const v = sourcesRouteView(load, ctx);
      return page(route, message("sources.heading", locale), renderSourcesRoute(v, base), v.kind === "error" ? 503 : 200, resolved);
    }
    case "coverage": {
      const v = coverageRouteView(load, { ...ctx, today: deps.today });
      return page(route, message("coverage.heading", locale), renderCoverageRoute(v, base), v.kind === "error" ? 503 : 200, resolved);
    }
    case "offline": {
      const links = [
        { href: hrefFor(locale, "saved"), label: message("nav.saved", locale) },
        { href: hrefFor(locale, "search"), label: message("nav.search", locale) },
      ];
      return page(route, getErrorState("offline", locale).title, renderOfflinePage({ ...base, idPrefix: "offline" }, links), 200, resolved);
    }
    case "settings": {
      if (req.method === "POST") {
        const parsed = preferencesFromForm(req.form ?? {});
        deps.savePreferences?.(parsed.prefs);
        const shown: Locale = parsed.prefs.locale === "auto" ? locale : parsed.prefs.locale;
        const notice = message(parsed.repaired ? "settings.err" : "settings.saved", shown);
        const out = renderPage({
          locale: shown, current: "settings", heading: message("settings.heading", shown), preferences: parsed.prefs,
          alternateHref: hrefFor(shown === "en" ? "fr" : "en", "settings"),
          body: renderSettingsForm(parsed.prefs, { ...base, locale: shown, theme: themeFor(parsed.prefs) }, notice),
        });
        return { status: parsed.repaired ? 422 : 200, headers: securityHeaders("html"), html: out };
      }
      return page(route, message("settings.heading", locale), renderSettingsForm(deps.preferences, base), 200, resolved);
    }
    case "place": {
      if (failed) return errorView(failKind, null);
      const place = load.places.find((p) => p.id === id);
      if (!place) {
        const v = getErrorState("not-found", locale);
        return page(route, v.title, renderStateView(v, { ...base, idPrefix: "nf" }), 404, resolved);
      }
      if (query.get("format") === "text") {
        return { status: 200, headers: securityHeaders("text"), html: placeToText(place, locale, deps.today) };
      }
      const view = placeRouteView({ status: "ok", place, fromSavedCopy: load.fromSavedCopy }, { ...ctx, today: deps.today });
      const suggest =
        `<p>${renderLink(hrefFor(locale, "report", { id: place.id }), message("report.heading", locale), theme)}</p>` +
        `<p>${renderLink(hrefFor(locale, "place", { id: place.id, query: "format=text" }), message("export.text", locale), theme)}</p>`;
      return page(route, place.name, renderPlaceRoute(view, base) + suggest, 200, resolved);
    }
    case "report": {
      if (failed) return errorView(failKind, "report");
      const place = load.places.find((p) => p.id === id);
      if (!place) {
        const v = getErrorState("not-found", locale);
        return page(route, v.title, renderStateView(v, { ...base, idPrefix: "nf" }), 404, resolved);
      }
      const blank: CorrectionValues = { placeId: place.id, feature: "", suggested: "", note: "", contact: "", consent: false };
      const form = (values: CorrectionValues, errors: Parameters<typeof renderCorrectionForm>[0]["errors"]): string =>
        renderCorrectionForm({ placeName: place.name, values, errors }, base);
      const heading = message("report.heading", locale);
      if (req.method !== "POST") return page(route, heading, form(blank, {}), 200, resolved);

      const result = validateCorrection({ ...(req.form ?? {}), placeId: place.id }, new Set(load.places.map((p) => p.id)));
      if (!result.ok) return page(route, heading, form(result.values, result.errors), 422, resolved);
      const outcome = deps.queue.enqueue(buildSubmission(result.value, { id: deps.newId(), createdOn: deps.today }));
      if (outcome === "queue-full") {
        return page(route, heading, form(result.value, {}) + `<p role="alert">${escapeHtml(message("report.queueFull", locale))}</p>`, 429, resolved);
      }
      const back = hrefFor(locale, "place", { id: place.id });
      return page(route, heading, renderConfirmation(message("report.saved", locale), back, place.name, base), 200, resolved);
    }
  }
}

function staticAsset(req: AppRequest, deps: AppDeps): AppResponse | null {
  const path = new URL(req.url, "https://app.invalid").pathname;
  const pref = deps.preferences.locale;
  const locale: Locale = pref === "auto" ? parseAcceptLanguage(req.acceptLanguage) : pref;
  const ok = (kind: ResponseKind, body: string): AppResponse => ({ status: 200, headers: securityHeaders(kind), html: body });
  switch (path) {
    case "/sw.js":
      return ok("script", buildServiceWorker({ ...DEFAULT_SW_CONFIG, ...deps.serviceWorker }));
    case "/register-sw.js":
      return ok("script", REGISTER_SCRIPT);
    case "/manifest.webmanifest":
      return ok("manifest", JSON.stringify(buildManifest(locale)));
    default:
      return null;
  }
}

/**
 * Handle one request. Never throws: an unexpected failure becomes a generic error page
 * that reveals nothing about the cause. Every response carries the security headers.
 */
export async function handleRequest(req: AppRequest, deps: AppDeps): Promise<AppResponse> {
  if (req.method !== undefined && req.method !== "GET" && req.method !== "POST") {
    return { status: 405, headers: { ...securityHeaders("text"), allow: "GET, POST" }, html: "" };
  }
  try {
    return staticAsset(req, deps) ?? (await dispatch(req, deps));
  } catch {
    const pref = deps.preferences.locale;
    const locale: Locale = pref === "auto" ? parseAcceptLanguage(req.acceptLanguage) : pref;
    const view = getErrorState("unknown", locale);
    const html = renderPage({
      locale, current: null, heading: view.title, preferences: deps.preferences, alternateHref: null,
      body: renderStateView(view, { locale, theme: themeFor(deps.preferences), idPrefix: "fatal" }),
    });
    return { status: 500, headers: securityHeaders("html"), html };
  }
}
