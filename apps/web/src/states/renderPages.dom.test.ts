/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, TEXT_SCALES, type Preferences } from "./preferences";
import { renderConfirmation, renderCorrectionForm, renderCoverageRoute, renderOfflinePage, renderSettingsForm, renderSourcesRoute, renderCompareRoute } from "./renderPages";
import { validateCorrection, type CorrectionValues } from "./correction";
import { coverageRouteView } from "./coverage";
import { compareRouteView } from "./compare";
import { sourcesRouteView } from "./sourcesPage";
import { initialConnectivity } from "./offline";
import { FEATURE_IDS } from "./dataStatus";
import { PROV, TODAY, mkRecord } from "./testHelpers";
import type { Locale } from "./stateCopy";
import type { RenderOptions } from "./renderHtml";
import type { Theme } from "./contrast";

const LOCALES: Locale[] = ["en", "fr"];
const THEMES: Theme[] = ["light", "dark"];
const o = (locale: Locale, theme: Theme = "light", idPrefix?: string): RenderOptions => ({ locale, theme, ...(idPrefix ? { idPrefix } : {}) });
const dom = (html: string): Document => new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");

const values = (over: Partial<CorrectionValues> = {}): CorrectionValues => ({ placeId: "place-a", feature: "", suggested: "", note: "", contact: "", consent: false, ...over });

function checkForm(d: Document): void {
  const ids = [...d.querySelectorAll("[id]")].map((e) => e.id);
  expect(new Set(ids).size, "ids are unique").toBe(ids.length);
  for (const el of d.querySelectorAll("input:not([type=hidden]), select, textarea")) {
    expect(d.querySelector(`label[for="${el.id}"]`), `label for ${el.id}`).not.toBeNull();
  }
  for (const el of d.querySelectorAll("[aria-describedby]")) {
    for (const ref of el.getAttribute("aria-describedby")!.split(" ")) expect(d.getElementById(ref), `describedby ${ref}`).not.toBeNull();
  }
  for (const a of d.querySelectorAll("a[href^='#']")) expect(d.getElementById(a.getAttribute("href")!.slice(1)), a.getAttribute("href")!).not.toBeNull();
  for (const b of d.querySelectorAll("button")) expect(b.getAttribute("type")).toBe("submit");
}

describe("renderCorrectionForm", () => {
  for (const locale of LOCALES) for (const theme of THEMES) {
    it(`gives a fresh form that is labelled and linked, in ${locale}/${theme}`, () => {
      const d = dom(renderCorrectionForm({ placeName: "Alpha", values: values(), errors: {} }, o(locale, theme)));
      checkForm(d);
      expect(d.querySelector("section")!.getAttribute("lang")).toBe(locale);
      expect(d.querySelector("[role=alert]")).toBeNull();
      expect(d.querySelectorAll("[aria-invalid]")).toHaveLength(0);
      expect(d.querySelector("form")!.getAttribute("method")).toBe("post");
    });
  }
  it("offers every feature and the four values, plus an empty first choice", () => {
    const d = dom(renderCorrectionForm({ placeName: "A", values: values(), errors: {} }, o("en")));
    const feature = d.querySelector<HTMLSelectElement>("select[name=feature]")!;
    expect([...feature.options].map((x) => x.value)).toEqual(["", ...FEATURE_IDS]);
    expect([...d.querySelector<HTMLSelectElement>("select[name=suggested]")!.options].map((x) => x.value)).toEqual(["", "yes", "no", "partial", "unknown"]);
  });
  it("keeps what the person typed and selected, and escapes it", () => {
    const d = dom(renderCorrectionForm({ placeName: "A", values: values({ feature: "elevator", suggested: "partial", note: "<b>\"x\"</b> & more", contact: "a@b.co", consent: true }), errors: {} }, o("en")));
    expect(d.querySelector<HTMLSelectElement>("select[name=feature]")!.value).toBe("elevator");
    expect(d.querySelector<HTMLSelectElement>("select[name=suggested]")!.value).toBe("partial");
    expect(d.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("<b>\"x\"</b> & more");
    expect(d.querySelector("textarea b")).toBeNull();
    expect(d.querySelector<HTMLInputElement>("input[name=contact]")!.value).toBe("a@b.co");
    expect(d.querySelector<HTMLInputElement>("input[name=consent]")!.checked).toBe(true);
  });
  it("carries the place id in a hidden field, escaped", () => {
    const d = dom(renderCorrectionForm({ placeName: "A", values: values({ placeId: 'a"><script>' }), errors: {} }, o("en")));
    expect(d.querySelector("script")).toBeNull();
    expect(d.querySelector<HTMLInputElement>("input[type=hidden]")!.value).toBe('a"><script>');
  });
  it("shows a place name with markup as text", () => {
    const d = dom(renderCorrectionForm({ placeName: "<img src=x onerror=alert(1)>", values: values(), errors: {} }, o("fr")));
    expect(d.querySelector("img")).toBeNull();
    expect(d.body.textContent).toContain("<img src=x onerror=alert(1)>");
  });
  it("shows a summary of the errors, in the form's order, each linking to its field", () => {
    const r = validateCorrection({ placeId: "place-a", feature: "x", suggested: "y", note: "n".repeat(600), contact: "bad", consent: "" }, new Set(["place-a"]));
    if (r.ok) throw new Error("not ok");
    const d = dom(renderCorrectionForm({ placeName: "A", values: r.values, errors: r.errors }, o("en")));
    checkForm(d);
    const summary = d.getElementById("report-errors")!;
    expect(summary.getAttribute("role")).toBe("alert");
    expect(summary.getAttribute("tabindex")).toBe("-1");
    expect([...summary.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["#report-feature", "#report-suggested", "#report-note", "#report-contact"]);
    expect(summary.querySelector("p")!.textContent).toContain("4");
  });
  it("marks exactly the failed fields as invalid and points each at its own message", () => {
    const r = validateCorrection({ placeId: "place-a", feature: "elevator", suggested: "no", note: "", contact: "a@b.co", consent: "" }, new Set(["place-a"]));
    if (r.ok) throw new Error("not ok");
    const d = dom(renderCorrectionForm({ placeName: "A", values: r.values, errors: r.errors }, o("en")));
    const bad = [...d.querySelectorAll("[aria-invalid=true]")].map((e) => e.id);
    expect(bad).toEqual(["report-consent"]);
    expect(d.getElementById("report-consent")!.getAttribute("aria-describedby")).toBe("report-consent-err");
  });
  it("uses its own id prefix when given one, so two forms can share a page", () => {
    const a = renderCorrectionForm({ placeName: "A", values: values(), errors: {} }, o("en", "light", "one"));
    const b = renderCorrectionForm({ placeName: "B", values: values(), errors: {} }, o("en", "light", "two"));
    const d = dom(a + b);
    const ids = [...d.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("gives every control at least the touch size in its style", () => {
    const d = dom(renderCorrectionForm({ placeName: "A", values: values(), errors: {} }, o("en")));
    for (const el of d.querySelectorAll("select, textarea, input:not([type=hidden]), button")) expect(el.getAttribute("style"), el.tagName).toMatch(/min-height:44px/);
  });
  it("limits the note and the email in the page as the validator does", () => {
    const d = dom(renderCorrectionForm({ placeName: "A", values: values(), errors: {} }, o("en")));
    expect(d.querySelector("textarea")!.getAttribute("maxlength")).toBe("500");
    expect(d.querySelector("input[name=contact]")!.getAttribute("maxlength")).toBe("254");
    expect(d.querySelector("input[name=contact]")!.getAttribute("type")).toBe("email");
  });
});

describe("renderSettingsForm", () => {
  const checked = (d: Document, name: string): string[] => [...d.querySelectorAll<HTMLInputElement>(`input[name=${name}]`)].filter((i) => i.checked).map((i) => i.value);
  for (const locale of LOCALES) it(`is labelled and has one checked choice per group, in ${locale}`, () => {
    const d = dom(renderSettingsForm(DEFAULT_PREFERENCES, o(locale)));
    checkForm(d);
    expect(checked(d, "locale")).toEqual(["auto"]);
    expect(checked(d, "theme")).toEqual(["system"]);
    expect(checked(d, "textScale")).toEqual(["100"]);
    expect(d.querySelector<HTMLInputElement>("input[name=reduceMotion]")!.checked).toBe(false);
    expect(d.querySelectorAll("fieldset")).toHaveLength(3);
    for (const f of d.querySelectorAll("fieldset")) expect(f.querySelector("legend")).not.toBeNull();
  });
  it("checks the saved choices", () => {
    const prefs: Preferences = { locale: "fr", theme: "dark", textScale: 150, reduceMotion: true };
    const d = dom(renderSettingsForm(prefs, o("en")));
    expect(checked(d, "locale")).toEqual(["fr"]);
    expect(checked(d, "theme")).toEqual(["dark"]);
    expect(checked(d, "textScale")).toEqual(["150"]);
    expect(d.querySelector<HTMLInputElement>("input[name=reduceMotion]")!.checked).toBe(true);
  });
  it("offers every text size, and each language by its own name", () => {
    const d = dom(renderSettingsForm(DEFAULT_PREFERENCES, o("en")));
    expect([...d.querySelectorAll<HTMLInputElement>("input[name=textScale]")].map((i) => Number(i.value))).toEqual([...TEXT_SCALES]);
    expect([...d.querySelectorAll("label")].map((l) => l.textContent)).toEqual(expect.arrayContaining(["English", "Français"]));
  });
  it("round trips through the form: what it checks is what preferencesFromForm would read", () => {
    for (const locale of ["auto", "en", "fr"] as const) for (const theme of ["system", "light", "dark"] as const) for (const textScale of TEXT_SCALES) {
      const d = dom(renderSettingsForm({ locale, theme, textScale, reduceMotion: false }, o("en")));
      expect([checked(d, "locale")[0], checked(d, "theme")[0], Number(checked(d, "textScale")[0])]).toEqual([locale, theme, textScale]);
    }
  });
  it("shows a notice as text and none by default", () => {
    expect(dom(renderSettingsForm(DEFAULT_PREFERENCES, o("en"))).querySelector("[role=note]")).toBeNull();
    const d = dom(renderSettingsForm(DEFAULT_PREFERENCES, o("en"), "<i>Saved</i>"));
    expect(d.querySelector("[role=note]")!.textContent).toBe("<i>Saved</i>");
    expect(d.querySelector("i")).toBeNull();
  });
});

describe("renderConfirmation and renderOfflinePage", () => {
  it("shows the text as a heading with a link back, as a status", () => {
    const d = dom(renderConfirmation("Thank <you>", "/en/search", "Back", o("en")));
    expect(d.querySelector("section")!.getAttribute("role")).toBe("status");
    expect(d.querySelector("h2")!.textContent).toBe("Thank <you>");
    expect(d.querySelector("a")!.getAttribute("href")).toBe("/en/search");
    expect(d.querySelector("section")!.getAttribute("aria-labelledby")).toBe(d.querySelector("h2")!.id);
  });
  it("lists the links it is given and escapes their labels", () => {
    const d = dom(renderOfflinePage(o("fr"), [{ href: "/fr/search", label: "Recherche" }, { href: "/fr/help", label: "<Aide>" }]));
    expect([...d.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/fr/search", "/fr/help"]);
    expect(d.querySelectorAll("a")[1]!.textContent).toBe("<Aide>");
    expect(d.querySelector("section")!.getAttribute("lang")).toBe("fr");
  });
  it("renders with no links as an empty list, not an error", () => expect(dom(renderOfflinePage(o("en"), [])).querySelectorAll("li")).toHaveLength(0));
});

describe("table renderers", () => {
  const A = mkRecord("pa", "Alpha <x>", { elevator: "yes", "automatic-door": "no" });
  const B = mkRecord("pb", "Beta", { elevator: "yes" });
  const ctx = (locale: Locale) => ({ locale, connectivity: initialConnectivity(true) });
  const headers = (d: Document): string[] => [...d.querySelectorAll("thead th")].map((h) => h.textContent!);
  for (const locale of LOCALES) {
    it(`gives the compare table a caption, column headers and a row header per row, in ${locale}`, () => {
      const d = dom(renderCompareRoute(compareRouteView({ status: "ok", places: [A, B] }, ["pa", "pb"], ctx(locale)), o(locale)));
      expect(d.querySelector("caption")).not.toBeNull();
      expect(headers(d)).toHaveLength(3);
      expect(headers(d)).toContain("Alpha <x>");
      expect(d.querySelector("table th[scope=col]")).not.toBeNull();
      expect(d.querySelectorAll("tbody tr")).toHaveLength(FEATURE_IDS.length);
      for (const tr of d.querySelectorAll("tbody tr")) {
        expect(tr.querySelector("th[scope=row]")).not.toBeNull();
        expect(tr.querySelectorAll("td")).toHaveLength(2);
      }
      expect(d.querySelector("a[href]")).toBeNull();
      expect(d.querySelectorAll("script, img")).toHaveLength(0);
    });
  }
  it("writes UNKNOWN in words in every unknown compare cell", () => {
    const d = dom(renderCompareRoute(compareRouteView({ status: "ok", places: [A, B] }, ["pa", "pb"], ctx("en")), o("en")));
    const cells = [...d.querySelectorAll("tbody td")].filter((c) => /unknown/i.test(c.textContent!));
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(c.querySelector("strong")).not.toBeNull();
  });
  it("shows the too-few message as a status, with the notices after it", () => {
    const d = dom(renderCompareRoute(compareRouteView({ status: "ok", places: [A] }, ["pa", "gone"], ctx("en")), o("en")));
    expect(d.querySelector("table")).toBeNull();
    expect(d.querySelector("[role=status]")).not.toBeNull();
    expect(d.querySelector("[role=note]")).not.toBeNull();
  });
  it("makes the source name a link only when the source has an address", () => {
    const withUrl = { id: "q", name: "Q", features: [{ feature: "elevator", value: "yes", provenance: { ...PROV, source: "Other source", url: "https://src.example/a" } }] } as never;
    const d = dom(renderSourcesRoute(sourcesRouteView({ status: "ok", places: [withUrl, A] }, ctx("en")), o("en")));
    const rows = [...d.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.querySelector("th a")).length).toBe(1);
    expect(d.querySelector("th a")!.getAttribute("href")).toBe("https://src.example/a");
  });
  it("gives the sources table four columns and the number of details as text", () => {
    const d = dom(renderSourcesRoute(sourcesRouteView({ status: "ok", places: [A, B] }, ctx("fr")), o("fr")));
    expect(headers(d)).toHaveLength(4);
    expect(d.querySelector("tbody tr td:nth-child(3)")!.textContent).toBe("3");
    expect(d.querySelector("tbody tr td:nth-child(4)")!.textContent).toBe("1er octobre 2026");
  });
  it("gives the coverage table one row per feature and the share in the language's style", () => {
    const view = (l: Locale) => coverageRouteView({ status: "ok", places: [A, B], dropped: 2 }, { ...ctx(l), today: TODAY });
    const en = dom(renderCoverageRoute(view("en"), o("en")));
    const fr = dom(renderCoverageRoute(view("fr"), o("fr")));
    expect(en.querySelectorAll("tbody tr")).toHaveLength(FEATURE_IDS.length);
    expect(headers(en)).toHaveLength(6);
    expect(en.querySelector("tbody tr td:last-child")!.textContent).toMatch(/^\d+%$/);
    expect(fr.querySelector("tbody tr td:last-child")!.textContent).toMatch(/^\d+\u00a0%$/);
    expect(en.querySelectorAll("section > ul li").length).toBeGreaterThan(2);
  });
  it("writes the UNKNOWN count in bold in every coverage row", () => {
    const d = dom(renderCoverageRoute(coverageRouteView({ status: "ok", places: [A, B] }, { ...ctx("en"), today: TODAY }), o("en")));
    for (const tr of d.querySelectorAll("tbody tr")) expect(tr.querySelector("td strong")).not.toBeNull();
  });
  it("shows a coverage empty state as a status line, with the dropped count in the list", () => {
    const d = dom(renderCoverageRoute(coverageRouteView({ status: "ok", places: [], dropped: 4 }, { ...ctx("en"), today: TODAY }), o("en")));
    expect(d.querySelector("table")).toBeNull();
    expect(d.querySelector("p[role=status]")).not.toBeNull();
    expect(d.querySelectorAll("li")).toHaveLength(1);
  });
  it("shows an offline banner above the table only when offline", () => {
    const off = { locale: "en", connectivity: { status: "offline", lastSavedOn: "2026-11-01" } } as const;
    const a = renderSourcesRoute(sourcesRouteView({ status: "ok", places: [A] }, ctx("en")), o("en"));
    const b = renderSourcesRoute(sourcesRouteView({ status: "ok", places: [A] }, off), o("en"));
    expect(b.length).toBeGreaterThan(a.length);
    expect(dom(a).querySelectorAll("section")).toHaveLength(1);
    expect(dom(b).querySelectorAll("[role=status], [role=alert], [role=note]").length).toBeGreaterThan(dom(a).querySelectorAll("[role=status], [role=alert], [role=note]").length);
  });
  it("renders each error view as an alert, not a table", () => {
    for (const html of [
      renderSourcesRoute(sourcesRouteView({ status: "error" }, ctx("en")), o("en")),
      renderCompareRoute(compareRouteView({ status: "error" }, [], ctx("en")), o("en")),
      renderCoverageRoute(coverageRouteView({ status: "error", httpStatus: 404 }, { ...ctx("en"), today: TODAY }), o("en")),
    ]) {
      const d = dom(html);
      expect(d.querySelector("table")).toBeNull();
      expect(d.querySelector("[role=alert]")).not.toBeNull();
    }
  });
  it("uses a given id prefix in every id", () => {
    const d = dom(renderSourcesRoute(sourcesRouteView({ status: "ok", places: [A] }, ctx("en")), o("en", "light", "src2")));
    for (const e of d.querySelectorAll("[id]")) expect(e.id.startsWith("src2")).toBe(true);
    expect(d.querySelector("section")!.getAttribute("aria-labelledby")).toBe("src2-h");
  });
});
