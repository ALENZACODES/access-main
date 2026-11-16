import { describe, expect, it } from "vitest";
import {
  EMPTY_KINDS,
  ERROR_KINDS,
  FEATURE_IDS,
  ROUTE_IDS,
  ROUTE_STATES,
  type Locale,
  type PlaceReport,
  featureLabel,
  getEmptyState,
  getErrorState,
  initialConnectivity,
  lintCopy,
  offlineBanner,
  placeRouteView,
  statusText,
  summarizePlace,
} from "./index";

const locales: Locale[] = ["en", "fr"];
const prov = { source: "Venue self-report form", licence: "CC-BY-4.0", retrievedOn: "2024-06-01" };
const sample: PlaceReport = {
  name: "Hall",
  features: FEATURE_IDS.map((feature) => ({ feature, value: "partial", provenance: prov })),
};

/** Every user-facing string the package can produce, per locale. */
function allCopy(locale: Locale): string[] {
  const out: string[] = [];
  const view = (v: { title: string; description: string; actions: readonly { label: string }[] }): void => {
    out.push(v.title, v.description, ...v.actions.map((a) => a.label));
  };
  for (const k of ERROR_KINDS) view(getErrorState(k, locale));
  for (const k of EMPTY_KINDS) view(getEmptyState(k, locale));
  for (const r of ROUTE_IDS) out.push(ROUTE_STATES[r].label[locale]);
  for (const id of FEATURE_IDS) out.push(featureLabel(id, locale));
  for (const s of ["yes", "no", "partial", "unknown"] as const) out.push(statusText(s, locale));
  const banner = offlineBanner({ ...initialConnectivity(false), lastSavedOn: "2026-11-01" }, locale)!;
  view(banner);
  out.push(offlineBanner(initialConnectivity(false), locale)!.description);
  const s = summarizePlace(sample, locale, "2026-11-15");
  out.push(s.countsText, ...(s.staleNotice ? [s.staleNotice] : []), ...s.sources);
  for (const r of s.rows) out.push(r.ariaLabel, r.ageText ?? "");
  const content = placeRouteView({ status: "ok", place: sample, fromSavedCopy: true }, {
    locale,
    connectivity: initialConnectivity(false),
    today: "2026-11-15",
  });
  if (content.kind === "content" && content.savedCopyNotice) out.push(content.savedCopyNotice);
  return out.filter((x) => x !== "");
}

describe("lintCopy", () => {
  it.each([
    ["Verified by staff", "overclaim-verified"],
    ["Live updates in real-time", "overclaim-realtime"],
    ["In partnership with a city", "overclaim-partnership"],
    ["AAA conformant", "overclaim-certified"],
    ["We guarantee access", "overclaim-guarantee"],
    ["Powered by AI", "mentions-ai"],
  ])("flags %s", (text, issue) => {
    expect(lintCopy(text, "en")).toContain(issue);
  });
  it("flags French overclaims and typography", () => {
    expect(lintCopy("Renseignements vérifiés", "fr")).toContain("overclaim-verified");
    expect(lintCopy("En temps réel", "fr")).toContain("overclaim-realtime");
    expect(lintCopy("l'App", "fr")).toContain("straight-apostrophe");
  });
  it("accepts ordinary copy", () => {
    expect(lintCopy("Yes (reported)", "en")).toEqual([]);
  });
});

describe("all package copy passes the linter", () => {
  for (const locale of locales) {
    it(`${locale}: no overclaims, prohibited wording or typography problems`, () => {
      const copy = allCopy(locale);
      expect(copy.length).toBeGreaterThan(60);
      for (const s of copy) expect(lintCopy(s, locale), s).toEqual([]);
    });
  }
});
