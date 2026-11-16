import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES, assertAccessibleHtml, auditHtml, compareRouteView, initialConnectivity, mapRouteView, renderCompareRoute,
  renderConfirmation, renderCorrectionForm, renderMapRoute, renderSettingsForm, renderSourcesRoute, sourcesRouteView, validateCorrection,
  type Locale, type RenderOptions, type Theme,
} from "./index";
import { LOC_PROV, mkRecord } from "./testHelpers";

const places = [
  mkRecord("a", "Alpha <x>", { elevator: "yes", "automatic-door": "no" }, { lat: 43.88, lon: -79.44, provenance: LOC_PROV }),
  mkRecord("b", "Beta", { elevator: "partial" }),
  mkRecord("c", "Gamma", {}),
];
const combos: [Locale, Theme][] = [["en", "light"], ["en", "dark"], ["fr", "light"], ["fr", "dark"]];
const conns = [initialConnectivity(true), { status: "offline", lastSavedOn: "2026-11-01" } as const];
const opts = (locale: Locale, theme: Theme): RenderOptions => ({ locale, theme, placeHref: (id) => `/${locale}/place/${id}` });

describe("map, compare and sources renderers pass the HTML audit", () => {
  for (const [locale, theme] of combos) {
    it(`${locale}/${theme}`, () => {
      const o = opts(locale, theme);
      for (const connectivity of conns) {
        const ctx = { locale, connectivity };
        for (const list of [places, []]) {
          assertAccessibleHtml(renderMapRoute(mapRouteView({ status: "ok", places: list }, { ...ctx, near: { lat: 43.8, lon: -79.4 } }), o), locale);
          assertAccessibleHtml(renderSourcesRoute(sourcesRouteView({ status: "ok", places: list }, ctx), o), locale);
        }
        assertAccessibleHtml(renderMapRoute(mapRouteView({ status: "error" }, { ...ctx, near: null }), o), locale);
        for (const ids of [["a", "b"], ["a", "b", "c", "a"], ["a"], ["a", "zzz"]]) {
          assertAccessibleHtml(renderCompareRoute(compareRouteView({ status: "ok", places }, ids, ctx), o), locale);
        }
        assertAccessibleHtml(renderCompareRoute(compareRouteView({ status: "error", httpStatus: 500 }, [], ctx), o), locale);
        assertAccessibleHtml(renderSourcesRoute(sourcesRouteView({ status: "error", httpStatus: 500 }, ctx), o), locale);
      }
    });
  }
});

describe("renderMapRoute", () => {
  it("shows UNKNOWN in words and a geo link only where a location is known", () => {
    const html = renderMapRoute(mapRouteView({ status: "ok", places }, { locale: "en", connectivity: initialConnectivity(true), near: null }), opts("en", "light"));
    expect(html.match(/>Location UNKNOWN</g)).toHaveLength(2);
    expect(html.match(/href="geo:/g)).toHaveLength(1);
    expect(html).not.toContain("<x>");
    expect(html).not.toMatch(/https?:\/\/[^"]*tile/i);
  });
});

describe("renderCompareRoute", () => {
  it("renders a real table with scoped headers and UNKNOWN written out", () => {
    const html = renderCompareRoute(compareRouteView({ status: "ok", places }, ["a", "c"], { locale: "en", connectivity: initialConnectivity(true) }), opts("en", "light"));
    expect(html).toContain("<caption>Reported details for Alpha &lt;x&gt; and Gamma</caption>");
    expect(html.match(/<th scope="row">/g)).toHaveLength(6);
    expect(html.match(/<th scope="col">/g)).toHaveLength(3);
    expect(html).toContain(">UNKNOWN<");
  });
});

describe("renderCorrectionForm", () => {
  const blank = { placeId: "a", feature: "", suggested: "", note: "", contact: "", consent: false };
  const render = (locale: Locale, theme: Theme, values = blank, errors = {}) =>
    renderCorrectionForm({ placeName: "Alpha", values, errors }, opts(locale, theme));

  it("passes the audit blank and with every error, in both languages and themes", () => {
    const failed = validateCorrection({ placeId: "zzz", feature: "x", suggested: "x", note: "x".repeat(501), contact: "bad" }, new Set(["a"]));
    if (failed.ok) throw new Error("should fail");
    for (const [locale, theme] of combos) {
      assertAccessibleHtml(render(locale, theme), locale);
      assertAccessibleHtml(render(locale, theme, failed.values, failed.errors), locale);
      assertAccessibleHtml(renderConfirmation("Done", "/x", "Back", opts(locale, theme)), locale);
    }
  });
  it("links each error in the summary to its field and marks fields invalid", () => {
    const failed = validateCorrection({ placeId: "a", feature: "", suggested: "" }, new Set(["a"]));
    if (failed.ok) throw new Error("should fail");
    const html = render("en", "light", failed.values, failed.errors);
    expect(html).toContain('role="alert"');
    expect(html).toContain("There are 2 problems with the form.");
    expect(html).toContain('href="#report-feature"');
    expect(html).toContain('id="report-feature"');
    expect(html).toContain('aria-invalid="true" aria-describedby="report-feature-err"');
  });
  it("redisplays entered values escaped, and keeps the consent state", () => {
    const html = render("en", "light", { ...blank, note: '<b>"hi"</b>', contact: "a@b.co", consent: true, feature: "elevator" });
    expect(html).toContain("&lt;b&gt;&quot;hi&quot;&lt;/b&gt;");
    expect(html).toContain("checked");
    expect(html).toContain('<option value="elevator" selected>Elevator</option>');
  });
  it("says the suggestion does not change what is shown", () => {
    expect(render("en", "light")).toContain("It does not change the details shown.");
    expect(render("fr", "light")).toContain("Elle ne modifie pas les détails affichés.");
  });
});

describe("renderSettingsForm", () => {
  it("passes the audit in every combination and marks the current choices", () => {
    for (const [locale, theme] of combos) {
      assertAccessibleHtml(renderSettingsForm({ ...DEFAULT_PREFERENCES, textScale: 150, reduceMotion: true }, opts(locale, theme), "Saved."), locale);
    }
    const html = renderSettingsForm({ ...DEFAULT_PREFERENCES, theme: "dark", textScale: 200 }, opts("en", "light"));
    expect(html).toMatch(/id="settings-theme-dark"[^>]* checked/);
    expect(html).toMatch(/id="settings-textScale-200"[^>]* checked/);
    expect(html.match(/<fieldset>/g)).toHaveLength(3);
    expect(html).toContain("<legend>Text size</legend>");
  });
  it("catches a missing label if one is removed", () => {
    const html = renderSettingsForm(DEFAULT_PREFERENCES, opts("en", "light")).replace(/<label for="settings-motion"[^>]*>[^<]*<\/label>/, "");
    expect(auditHtml(html, "en").map((v) => v.code)).toContain("form-label");
  });
});
