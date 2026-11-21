import { expect, test } from "@playwright/test";
import { copyFindings, overclaimFindings, type CopyAudit } from "./p20d-copy";
import {
  buttonFindings,
  canonicalUrl,
  counterpartIssues,
  evidenceConfidence,
  evidenceFindings,
  externalTileFindings,
  formFindings,
  frenchTypographyFindings,
  imageFindings,
  isCalendarDate,
  languageOf,
  liveMessageFindings,
  localeParity,
  logicalRoute,
  motionFindings,
  parseRgb,
  ratio,
  report,
  tabFindings,
  type ButtonInfo,
  type EvidenceRow,
  type FormField,
  type LocaleRoute,
} from "./p20d-contracts";
import {
  evaluateLinks,
  linkFindings,
  responseFindings,
  routeDuplicates,
  startingPoints,
} from "./p20d-navigation";
import { offlineFindings, offlineKnowledgeFindings, type OfflineSnapshot } from "./p20d-offline";

const ORIGIN = "https://example.test";
const EN = `${ORIGIN}/en/places`;
const FR = `${ORIGIN}/fr/places`;
const goodEvidence: EvidenceRow = {
  source: "synthetic-test-source",
  licence: "CC0-1.0",
  date: "2026-11-15",
  status: "PASS",
  label: "fixture-entry",
};

const goodField: FormField = {
  id: "query",
  kind: "input",
  required: true,
  disabled: false,
  name: "query",
  label: "Search",
  describedBy: [],
  invalid: false,
  hasError: false,
  visible: true,
};

const goodButton: ButtonInfo = {
  label: "Search",
  width: 44,
  height: 44,
  enabled: true,
  visible: true,
  role: "button",
};

function offlineSnapshot(overrides: Partial<OfflineSnapshot> = {}): OfflineSnapshot {
  return {
    location: EN,
    language: "en",
    title: "Offline",
    visibleText: "Information is unavailable without a connection.",
    mainCount: 1,
    hasControls: true,
    controlled: true,
    online: false,
    ...overrides,
  };
}

test.describe("P20D: safety policy contracts", () => {
  test("language codes accept regional variants but reject unknown strings", () => {
    expect(languageOf("en-CA")).toBe("en");
    expect(languageOf("FR-ca")).toBe("fr");
    expect(languageOf("  fr  ")).toBe("fr");
    expect(languageOf("es")).toBeNull();
    expect(languageOf("")).toBeNull();
    expect(languageOf(null)).toBeNull();
  });

  test("calendar dates reject malformed and impossible dates", () => {
    for (const date of ["", "tomorrow", "2026-02-29", "2026-04-31", "2026-00-01", "2026-13-10", "0000-01-01"]) {
      expect(isCalendarDate(date), date).toBe(false);
    }
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-11-15")).toBe(true);
  });

  test("missing provenance makes a positive status UNKNOWN", () => {
    expect(evidenceConfidence({ ...goodEvidence, source: null })).toBe("UNKNOWN");
    expect(evidenceConfidence({ ...goodEvidence, licence: null })).toBe("UNKNOWN");
    expect(evidenceConfidence({ ...goodEvidence, date: null })).toBe("UNKNOWN");
    expect(evidenceConfidence({ ...goodEvidence, date: "2026-02-30" })).toBe("UNKNOWN");
    expect(evidenceConfidence({ ...goodEvidence, licence: "private" })).toBe("UNKNOWN");
  });

  test("explicit unknown stays unknown even when source metadata exists", () => {
    expect(evidenceConfidence({ ...goodEvidence, status: "UNKNOWN" })).toBe("UNKNOWN");
    expect(evidenceConfidence({ ...goodEvidence, status: null })).toBe("UNKNOWN");
    expect(evidenceConfidence(goodEvidence)).toBe("PASS");
    expect(evidenceConfidence({ ...goodEvidence, status: "BLOCKED" })).toBe("BLOCKED");
  });

  test("unsupported positive evidence produces a failing finding", () => {
    expect(evidenceFindings([{ ...goodEvidence, licence: null }], EN)
      .map((item) => item.rule)).toContain("unsupported-positive-evidence");
    expect(evidenceFindings([goodEvidence], EN)).toEqual([]);
  });

  test("unsupported documented barrier produces a failing finding", () => {
    const problems = evidenceFindings([{
      ...goodEvidence,
      status: "BLOCKED",
      source: null,
    }], EN);
    expect(problems.map((item) => item.rule)).toContain("unsupported-barrier-evidence");
  });

  test("unknown or noncanonical evidence state does not become PASS", () => {
    const invalid = { ...goodEvidence, status: "yes" };
    expect(evidenceConfidence(invalid)).toBe("UNKNOWN");
    expect(evidenceFindings([invalid], EN)[0]?.rule).toBe("noncanonical-evidence-state");
  });

  test("only allows local document URLs into a route queue", () => {
    expect(canonicalUrl("/fr/places", EN, ORIGIN)).toBe(FR);
    expect(canonicalUrl("https://other.test/fr", EN, ORIGIN)).toBeNull();
    expect(canonicalUrl("javascript:alert(1)", EN, ORIGIN)).toBeNull();
    expect(canonicalUrl("/file.geojson", EN, ORIGIN)).toBeNull();
    expect(canonicalUrl("/delete/123", EN, ORIGIN)).toBeNull();
  });

  test("removes trackers and fragments but keeps meaningful filters", () => {
    expect(canonicalUrl("/en/places?utm_source=x&kind=ramp#top", EN, ORIGIN))
      .toBe(`${EN}?kind=ramp`);
    expect(canonicalUrl("/en/places?sort=recent&kind=ramp", EN, ORIGIN))
      .toBe(`${EN}?kind=ramp&sort=recent`);
  });

  test("matches language-specific route identities", () => {
    expect(logicalRoute(EN)).toBe("/places");
    expect(logicalRoute(FR)).toBe("/places");
    expect(logicalRoute(`${ORIGIN}/?lang=fr`)).toBe("/");
    expect(logicalRoute(`${ORIGIN}/en/places?q=a&lang=en`)).toBe("/places?q=a");
  });

  test("raises parity gaps rather than inventing a translated page", () => {
    const routes: LocaleRoute[] = [{ url: EN, language: "en", key: "/places" }];
    expect(localeParity(routes).map((issue) => issue.rule)).toEqual(["locale-route-missing"]);
    expect(localeParity([...routes, { url: FR, language: "fr", key: "/places" }])).toEqual([]);
  });

  test("alternate links must point to the same logical page", () => {
    const source: LocaleRoute = { url: EN, language: "en", key: "/places" };
    expect(counterpartIssues(source, [{ href: FR, hreflang: "fr", label: "Français", rel: "alternate" }], ORIGIN))
      .toEqual([]);
    expect(counterpartIssues(source, [], ORIGIN)[0]?.rule).toBe("missing-language-alternate");
    expect(counterpartIssues(source, [{ href: `${ORIGIN}/fr/about`, hreflang: "fr", label: "Français", rel: "" }], ORIGIN)[0]?.rule)
      .toBe("language-alternate-route");
  });

  test("controls need accessible names and 44 by 44 hit boxes", () => {
    expect(buttonFindings([goodButton], EN)).toEqual([]);
    expect(buttonFindings([{ ...goodButton, width: 43 }], EN)[0]?.rule).toBe("touch-44");
    expect(buttonFindings([{ ...goodButton, height: 43 }], EN)[0]?.rule).toBe("touch-44");
    expect(buttonFindings([{ ...goodButton, label: "" }], EN)[0]?.rule).toBe("unnamed-control");
    expect(buttonFindings([{ ...goodButton, enabled: false }], EN)).toEqual([]);
  });

  test("required input has a name and visibly invalid input has an error", () => {
    expect(formFindings([goodField], EN)).toEqual([]);
    expect(formFindings([{ ...goodField, label: "" }], EN)[0]?.rule).toBe("field-label");
    expect(formFindings([{ ...goodField, name: "" }], EN)[0]?.rule).toBe("required-field-name");
    expect(formFindings([{ ...goodField, invalid: true }], EN)[0]?.rule).toBe("invalid-field-description");
    expect(formFindings([{ ...goodField, invalid: true, hasError: true }], EN)).toEqual([]);
  });

  test("meaningful images have alternatives while decorative images can be empty", () => {
    expect(imageFindings([{ source: "/map.png", decorative: false, alternative: null, hidden: false }], EN)[0]?.rule)
      .toBe("image-alternative");
    expect(imageFindings([{ source: "/shape.svg", decorative: true, alternative: "", hidden: false }], EN))
      .toEqual([]);
  });

  test("announcements cannot silently disable an alert", () => {
    expect(liveMessageFindings([{ role: "alert", text: "Error", polite: "off", relevant: null }], EN)[0]?.rule)
      .toBe("silent-alert");
    expect(liveMessageFindings([{ role: "status", text: "Ready", polite: "polite", relevant: null }], EN))
      .toEqual([]);
  });

  test("reduced motion flags ongoing animation and transitions", () => {
    const base = { label: "menu", animationSeconds: 0, transitionSeconds: 0, visible: true };
    expect(motionFindings([base], EN)).toEqual([]);
    expect(motionFindings([{ ...base, transitionSeconds: 0.5 }], EN)[0]?.rule)
      .toBe("reduced-motion-not-respected");
    expect(motionFindings([{ ...base, animationSeconds: 5, visible: false }], EN))
      .toEqual([]);
  });

  test("blocks known external map tile hosts while keeping same-origin content", () => {
    const attempts = [
      { url: "https://tile.openstreetmap.org/12/1/2.png", method: "GET", type: "image" },
      { url: `${ORIGIN}/tiles/12/1/2.png`, method: "GET", type: "image" },
    ];
    expect(externalTileFindings(attempts, ORIGIN).map((x) => x.rule))
      .toEqual(["external-tile-request"]);
  });

  test("rejects invisible or disabled elements in a keyboard tab sequence", () => {
    const step = { key: "a#next", visible: true, outline: "present", inViewport: true, disabled: false };
    expect(tabFindings([step], EN)).toEqual([]);
    expect(tabFindings([{ ...step, visible: false }], EN)[0]?.rule).toBe("tab-hidden");
    expect(tabFindings([{ ...step, outline: "none" }], EN)[0]?.rule).toBe("tab-indicator-missing");
    expect(tabFindings([step, step], EN).some((issue) => issue.rule === "tab-cycle")).toBe(true);
  });

  test("French punctuation rules detect plain spaces", () => {
    expect(frenchTypographyFindings("Nom : exemple", FR).some((x) => x.rule === "fr-colon-spacing")).toBe(true);
    expect(frenchTypographyFindings("Oui !", FR).some((x) => x.rule === "fr-punctuation-spacing")).toBe(true);
    expect(frenchTypographyFindings("«bonjour»", FR).some((x) => x.rule === "fr-guillemet-spacing")).toBe(true);
    expect(frenchTypographyFindings("Nom\u00a0: «\u202fbonjour\u202f»\u202f!", FR)).toEqual([]);
  });

  test("RGB parser and contrast maths retain the black/white baseline", () => {
    expect(parseRgb("rgb(0, 0, 0)")).toEqual([0, 0, 0]);
    expect(parseRgb("rgba(255, 255, 255, 1)")).toEqual([255, 255, 255]);
    expect(parseRgb("not-a-colour")).toBeNull();
    expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 3);
    expect(ratio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 3);
  });

  test("link parser rejects script links and malformed URL schemes", () => {
    const checks = evaluateLinks(EN, ["/fr/places", "javascript:alert(1)", "mailto:hello@example.test"], ORIGIN);
    expect(checks[0]?.target).toBe(FR);
    expect(linkFindings(checks).map((i) => i.rule)).toEqual(["invalid-link"]);
  });

  test("response audit distinguishes optional 404 from server errors", () => {
    expect(responseFindings({ status: 404, finalURL: EN, isDocument: false }, EN)).toEqual([]);
    expect(responseFindings({ status: 503, finalURL: EN, isDocument: true }, EN)[0]?.rule)
      .toBe("navigation-server-error");
    expect(responseFindings({ status: 200, finalURL: EN, isDocument: false }, EN)[0]?.rule)
      .toBe("navigation-not-html");
  });

  test("duplicate routes are exposed for review", () => {
    const duplicates: LocaleRoute[] = [
      { url: EN, language: "en", key: "/places" },
      { url: `${ORIGIN}/?lang=en`, language: "en", key: "/places" },
    ];
    expect(routeDuplicates(duplicates)[0]?.rule).toBe("duplicate-locale-route");
  });

  test("crawl seeds include explicit EN and FR entrypoints", () => {
    const seeds = startingPoints({
      baseURL: ORIGIN,
      enURL: EN,
      frURL: FR,
      limit: 20,
      timeoutMs: 1000,
    });
    expect(seeds).toContain(EN);
    expect(seeds).toContain(FR);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  test("offline audit fails if no document or service-worker control exists", () => {
    const before = offlineSnapshot({ controlled: false, online: true });
    const issues = offlineFindings({ before, after: null, error: "disconnected" });
    expect(issues.map((i) => i.rule)).toContain("offline-service-worker-not-controlling");
    expect(issues.map((i) => i.rule)).toContain("offline-no-document");
  });

  test("offline audit fails on wrong language, no main and empty content", () => {
    const issues = offlineFindings({
      before: offlineSnapshot({ online: true }),
      after: offlineSnapshot({ language: "fr", mainCount: 0, visibleText: "", hasControls: false }),
      error: null,
    });
    const codes = issues.map((issue) => issue.rule);
    expect(codes).toContain("offline-language-changed");
    expect(codes).toContain("offline-main");
    expect(codes).toContain("offline-empty-content");
    expect(codes).toContain("offline-no-recovery-controls");
  });

  test("offline evidence rejects a positive claim without metadata", () => {
    expect(offlineKnowledgeFindings([{
      state: "PASS", source: null, licence: null, observed: null,
    }], EN)[0]?.rule).toBe("offline-knowledge-without-evidence");
    expect(offlineKnowledgeFindings([{
      state: "UNKNOWN", source: null, licence: null, observed: null,
    }], EN)).toEqual([]);
  });

  test("visible copy audit detects unsupported assurance claims", () => {
    expect(overclaimFindings("A verified route", EN)[0]?.rule)
      .toBe("copy-unsubstantiated-assurance");
    expect(overclaimFindings("Guaranteed access", EN)[0]?.rule)
      .toBe("copy-outcome-overclaim");
    expect(overclaimFindings("Conditions unknown", EN)).toEqual([]);
  });

  test("French state words are not silently left in English", () => {
    const sample: CopyAudit = {
      url: FR,
      language: "fr",
      totalCharacters: 7,
      runs: [{ text: "Unknown", parent: "span", locale: "fr", exposed: true }],
    };
    expect(copyFindings(sample).map((item) => item.rule)).toContain("fr-untranslated-state");
    expect(copyFindings({ ...sample, runs: [{ ...sample.runs[0]!, text: "Inconnu" }] })).toEqual([]);
  });

  test("empty main copy produces an actionable failure", () => {
    expect(copyFindings({ url: EN, language: "en", totalCharacters: 0, runs: [] })[0]?.rule)
      .toBe("empty-main-copy");
  });

  test("reports are deterministic and bounded", () => {
    const items = [
      { rule: "a", url: EN, detail: "one", severity: "error" as const },
      { rule: "a", url: EN, detail: "one", severity: "error" as const },
      { rule: "b", url: EN, detail: "two", severity: "error" as const },
    ];
    expect(report(items, 1)).toContain("1 more findings");
    expect(report(items, 4).split("\n")).toHaveLength(2);
  });
});
