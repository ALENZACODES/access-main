import { describe, expect, it } from "vitest";
import {
  EMPTY_KINDS,
  ERROR_KINDS,
  EMPTY_FILTER,
  FEATURE_IDS,
  ROUTE_IDS,
  getEmptyState,
  getErrorState,
  getRouteEmpty,
  getRouteError,
  initialConnectivity,
  placeRouteView,
  renderBanner,
  renderPlaceRoute,
  renderSavedRoute,
  renderSearchRoute,
  renderStateView,
  savedRouteView,
  searchRouteView,
  offlineBanner,
  assertAccessibleHtml,
  type Locale,
  type RenderOptions,
  type Theme,
} from "./index";
import { TODAY, mkPlace } from "./testHelpers";

const locales: Locale[] = ["en", "fr"];
const themes: Theme[] = ["light", "dark"];
const conns = [initialConnectivity(true), { status: "offline", lastSavedOn: "2026-11-01" } as const];

const places = [
  mkPlace("Alpha <b>&", { elevator: "yes", "step-free-entrance": "yes" }),
  mkPlace("Beta", { elevator: "unknown" }),
  mkPlace("Old", { elevator: "yes" }, { source: "Old survey", licence: "ODbL-1.0", retrievedOn: "2024-01-01" }),
  mkPlace("Gamma", { elevator: "no" }),
];

describe("every rendered view passes the HTML audit", () => {
  for (const locale of locales) {
    for (const theme of themes) {
      const opts: RenderOptions = { locale, theme };
      const label = `${locale}/${theme}`;

      it(`${label}: error and empty state views`, () => {
        for (const k of ERROR_KINDS) assertAccessibleHtml(renderStateView(getErrorState(k, locale), { ...opts, idPrefix: "e" }), locale);
        for (const k of EMPTY_KINDS) assertAccessibleHtml(renderStateView(getEmptyState(k, locale), { ...opts, idPrefix: "m" }), locale);
      });

      it(`${label}: offline banner`, () => {
        for (const c of conns) assertAccessibleHtml(renderBanner(offlineBanner(c, locale), opts), locale);
      });

      it(`${label}: place route (content, empty, errors, not found)`, () => {
        for (const connectivity of conns) {
          const ctx = { locale, connectivity, today: TODAY };
          const loads = [
            { status: "ok", place: places[0]!, fromSavedCopy: true },
            { status: "ok", place: places[2]!, fromSavedCopy: false },
            { status: "ok", place: mkPlace("Blank", {}), fromSavedCopy: false },
            { status: "not-found" },
            { status: "error", httpStatus: 500 },
            { status: "error" },
          ] as const;
          for (const load of loads) assertAccessibleHtml(renderPlaceRoute(placeRouteView(load, ctx), opts), locale);
        }
      });

      it(`${label}: search route (results, hidden and shown UNKNOWN, empty, error)`, () => {
        for (const connectivity of conns) {
          for (const includeUnknown of [false, true]) {
            const ctx = { locale, connectivity, today: TODAY, filter: { ...EMPTY_FILTER, required: ["elevator" as const], includeUnknown } };
            for (const list of [places, [places[1]!, places[3]!], [places[3]!], []]) {
              assertAccessibleHtml(renderSearchRoute(searchRouteView({ status: "ok", places: list }, ctx), opts), locale);
            }
            assertAccessibleHtml(renderSearchRoute(searchRouteView({ status: "error", httpStatus: 503 }, ctx), opts), locale);
          }
        }
      });

      it(`${label}: saved route`, () => {
        for (const connectivity of conns) {
          const ctx = { locale, connectivity, today: TODAY };
          for (const list of [places, []]) assertAccessibleHtml(renderSavedRoute(savedRouteView({ status: "ok", places: list }, ctx), opts), locale);
          assertAccessibleHtml(renderSavedRoute(savedRouteView({ status: "error" }, ctx), opts), locale);
        }
      });
    }
  }
});

describe("rendering behaviour", () => {
  const opts: RenderOptions = { locale: "en" };
  const view = placeRouteView({ status: "ok", place: places[0]!, fromSavedCopy: false }, { locale: "en", connectivity: initialConnectivity(true), today: TODAY });

  it("escapes place names", () => {
    const html = renderPlaceRoute(view, opts);
    expect(html).toContain("Alpha &lt;b&gt;&amp;");
    expect(html).not.toContain("<b>");
  });
  it("writes UNKNOWN out in words for every undetermined feature", () => {
    const html = renderPlaceRoute(view, opts);
    expect(html.match(/>UNKNOWN</g)).toHaveLength(FEATURE_IDS.length - 2);
  });
  it("offers a source disclosure only for known details", () => {
    const html = renderPlaceRoute(view, opts);
    expect(html.match(/<details>/g)).toHaveLength(2);
    expect(html).toContain("Licence: CC BY 4.0");
  });
  it("sets the French language attribute and typography", () => {
    const fr = renderPlaceRoute(
      placeRouteView({ status: "not-found" }, { locale: "fr", connectivity: initialConnectivity(true), today: TODAY }),
      { locale: "fr" },
    );
    expect(fr).toContain('lang="fr"');
    expect(fr).toContain("Ce lieu n’a pas été trouvé");
  });
  it("uses the route's alert and status roles", () => {
    expect(renderStateView(getErrorState("load-failed", "en"), opts)).toContain('role="alert"');
    expect(renderStateView(getEmptyState("search-no-results", "en"), opts)).toContain('role="status"');
  });
  it("covers every route id with a renderer-compatible view", () => {
    expect(ROUTE_IDS).toEqual(["search", "place", "journey", "finders", "map", "saved", "help", "navigator", "games", "offline", "page"]);
    for (const id of ROUTE_IDS) {
      for (const locale of locales) {
        const empty = getRouteEmpty(id, locale);
        if (empty) assertAccessibleHtml(renderStateView(empty, { locale, theme: "light" }), locale);
        assertAccessibleHtml(renderStateView(getRouteError(id, "load-failed", locale), { locale, theme: "light" }), locale);
      }
    }
  });
  it("renders nothing for a null banner", () => {
    expect(renderBanner(null, opts)).toBe("");
  });
  it("marks the UNKNOWN toggle with its next value", () => {
    const html = renderSearchRoute(
      searchRouteView({ status: "ok", places }, { locale: "en", connectivity: initialConnectivity(true), today: TODAY, filter: { ...EMPTY_FILTER, required: ["elevator"] } }),
      opts,
    );
    expect(html).toContain('data-action="toggle-unknown" data-include-unknown="1"');
  });
});
