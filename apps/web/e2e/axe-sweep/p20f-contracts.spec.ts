import { expect, test } from "@playwright/test";
import {
  combineStates, formatIssues, inspectActions, inspectCopy, inspectFields,
  inspectFilters, inspectLanguage, inspectLiveRegions, inspectMap,
  inspectProvenance, inspectSearch, inspectStatus, inspectTransition,
  isUnknownLabel, issue, parseDate, transitionStatus, uniqueIssues,
  type ActionEvidence, type FieldEvidence, type FilterEvidence,
  type LanguageEvidence, type LiveRegionEvidence, type MapEvidence,
  type Provenance, type RouteEvidence, type SearchEvidence,
  type TransitionEvidence,
} from "./p20f-contracts";
import { browserConfig, sameOriginDocument } from "./p20f-browser";

const provenance: Provenance = {
  source: "synthetic-open-fixture",
  licence: "CC0-1.0",
  date: "2026-11-15",
};

const goodAction: ActionEvidence = {
  key: "action",
  role: "button",
  name: "Show details",
  disabled: false,
  focusable: true,
  keyboard: true,
  visible: true,
  width: 44,
  height: 44,
  x: 10,
  y: 10,
  hiddenText: false,
};

const goodField: FieldEvidence = {
  key: "search",
  type: "search",
  required: false,
  disabled: false,
  label: "Search places",
  describedBy: [],
  hasError: false,
  invalid: false,
  message: "",
  visible: true,
};

const language: LanguageEvidence = {
  expected: "en",
  actual: "en-CA",
  title: "Places | the App",
  mainName: "Places",
  selectors: ["en", "fr"],
  fallbackVisible: false,
};

const goodMap: MapEvidence = {
  key: "map",
  kind: "region",
  accessibleName: "Map of places",
  hasTextAlternative: true,
  controls: [goodAction],
  externalTiles: ["http://localhost:3000/tiles/3/4/5.png"],
  attribution: "Open map data — CC-BY-4.0",
  attributionVisible: true,
};

const goodRoute: RouteEvidence = {
  url: "http://localhost:3000/en/places",
  locale: "en",
  title: "Places | the App",
  headings: ["Places"],
  links: [],
  mainCount: 1,
  focusKey: "main-heading",
  scrollX: 0,
  scrollY: 0,
};

const goodTransition: TransitionEvidence = {
  before: goodRoute,
  after: { ...goodRoute, url: "http://localhost:3000/en/details" },
  actionKey: "details",
  changedUrl: true,
  changedContent: true,
  focusAfter: "main-heading",
  announced: false,
};

const search: SearchEvidence = {
  beforeCount: 4,
  afterCount: 2,
  beforeText: "Four places",
  afterText: "Two places",
  query: "library",
  inputName: "Search places",
  stateAnnounced: true,
  changed: true,
  emptyState: false,
};

const filter: FilterEvidence = {
  key: "step-free",
  label: "Step-free access",
  kind: "checkbox",
  selectedBefore: false,
  selectedAfter: true,
  resultChanged: true,
  resultAnnounced: true,
  unknownHidden: false,
};

const region: LiveRegionEvidence = {
  key: "status",
  role: "status",
  live: "polite",
  atomic: true,
  text: "Two places",
};

function codes(problems: readonly { code: string }[]): string[] {
  return problems.map((problem) => problem.code);
}

test.describe("P20F: provenance and uncertainty gates", () => {
  test("accepts known open licence identifiers", () => {
    for (const licence of [
      "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0",
      "PDDL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0", "MIT", "Apache-2.0",
    ]) {
      expect(inspectProvenance({ ...provenance, licence }, licence)).toEqual([]);
    }
  });

  test("fails on missing source", () => {
    expect(codes(inspectProvenance({ ...provenance, source: null }, "item"))).toContain("source");
    expect(codes(inspectProvenance({ ...provenance, source: "  " }, "item"))).toContain("source");
  });

  test("fails on missing and closed licence", () => {
    expect(codes(inspectProvenance({ ...provenance, licence: null }, "item"))).toContain("licence");
    expect(codes(inspectProvenance({ ...provenance, licence: "proprietary" }, "item"))).toContain("licence-unsupported");
    expect(codes(inspectProvenance({ ...provenance, licence: "unknown" }, "item"))).toContain("licence-unsupported");
  });

  test("fails on missing provenance object", () => {
    expect(codes(inspectProvenance(null, "item"))).toEqual(["missing"]);
  });

  test("fails on malformed dates", () => {
    for (const date of [null, "", "today", "2026-2-01", "2026-13-01", "2026-11-31", "2025-02-29", "0000-01-01"]) {
      expect(parseDate(date)).toBeNull();
    }
  });

  test("supports a leap day and chronological ordering", () => {
    expect(parseDate("2024-02-29")).toBe(20240229);
    expect(parseDate("2026-11-15")).toBeGreaterThan(parseDate("2026-11-14")!);
  });

  test("does not require evidence when a status is unknown", () => {
    expect(inspectStatus({ id: "one", state: "UNKNOWN", provenance: null })).toEqual([]);
  });

  test("requires evidence for positive and blocked statuses", () => {
    expect(codes(inspectStatus({ id: "one", state: "PASS", provenance: null }))).toContain("missing");
    expect(codes(inspectStatus({ id: "one", state: "BLOCKED", provenance: null }))).toContain("missing");
  });

  test("rejects unsupported status tokens", () => {
    expect(codes(inspectStatus({ id: "one", state: "OK" as "PASS", provenance }))).toContain("invalid");
  });

  test("combines an empty group as unknown", () => {
    expect(combineStates([])).toBe("UNKNOWN");
  });

  test("never lets a positive status erase uncertainty", () => {
    expect(combineStates(["PASS", "UNKNOWN"])).toBe("UNKNOWN");
    expect(combineStates(["UNKNOWN", "PASS", "PASS"])).toBe("UNKNOWN");
  });

  test("preserves an explicit barrier", () => {
    expect(combineStates(["UNKNOWN", "BLOCKED"])).toBe("BLOCKED");
    expect(combineStates(["PASS", "BLOCKED"])).toBe("BLOCKED");
  });

  test("requires new evidence for positive unknown transition", () => {
    expect(codes(transitionStatus("UNKNOWN", "PASS", null))).toContain("unknown-promoted");
    expect(transitionStatus("UNKNOWN", "PASS", provenance)).toEqual([]);
  });

  test("requires new evidence for blocked unknown transition", () => {
    expect(codes(transitionStatus("UNKNOWN", "BLOCKED", null))).toContain("unknown-barrier");
    expect(transitionStatus("UNKNOWN", "BLOCKED", provenance)).toEqual([]);
  });

  test("checks the new evidence whenever a decision changes", () => {
    expect(codes(transitionStatus("PASS", "BLOCKED", { ...provenance, source: "" }))).toContain("source");
  });

  test("recognizes uncertain labels in both languages", () => {
    for (const word of ["Unknown", "UNKNOWN", "Inconnu", "Inconnue", "Non renseigné", "Indéterminée"]) {
      expect(isUnknownLabel(word)).toBe(true);
    }
    expect(isUnknownLabel("Accessible")).toBe(false);
    expect(isUnknownLabel("Passable")).toBe(false);
  });
});

test.describe("P20F: locale and copy contracts", () => {
  test("accepts complete English evidence", () => {
    expect(inspectLanguage(language)).toEqual([]);
  });

  test("accepts complete French evidence", () => {
    expect(inspectLanguage({
      ...language, expected: "fr", actual: "fr-CA", title: "Lieux | l’App",
      mainName: "Lieux",
    })).toEqual([]);
  });

  test("flags a mismatched locale", () => {
    expect(codes(inspectLanguage({ ...language, actual: "fr" }))).toContain("document-lang");
  });

  test("flags a missing document language", () => {
    expect(codes(inspectLanguage({ ...language, actual: null }))).toContain("document-lang");
  });

  test("flags an empty title", () => {
    expect(codes(inspectLanguage({ ...language, title: "" }))).toContain("title");
  });

  test("flags a missing main heading", () => {
    expect(codes(inspectLanguage({ ...language, mainName: null }))).toContain("main-heading");
  });

  test("flags a missing language choice", () => {
    expect(codes(inspectLanguage({ ...language, selectors: ["en"] }))).toContain("switch");
  });

  test("flags an untranslated key", () => {
    expect(codes(inspectLanguage({ ...language, fallbackVisible: true }))).toContain("fallback");
  });

  test("catches certainty claims in user-facing copy", () => {
    for (const phrase of ["Verified access", "Verify this location", "vérifié", "Real-time access", "Partnership", "Guarantee"]) {
      expect(codes(inspectCopy(phrase, "sample"))).toContain("overclaim");
    }
  });

  test("catches medical advisory phrasing", () => {
    for (const phrase of ["Medical advice", "Treatment plan", "Avis médical"]) {
      expect(codes(inspectCopy(phrase, "sample"))).toContain("medical");
    }
  });

  test("accepts careful neutral copy", () => {
    expect(inspectCopy("Access status: Unknown. Source: public open data.", "sample")).toEqual([]);
    expect(inspectCopy("Statut d’accès : inconnu. Source : données ouvertes.", "sample")).toEqual([]);
  });
});

test.describe("P20F: interactive control gates", () => {
  test("accepts a 44px square accessible target", () => {
    expect(inspectActions([goodAction], "page")).toEqual([]);
  });

  test("rejects narrow targets", () => {
    expect(codes(inspectActions([{ ...goodAction, width: 43 }], "page"))).toContain("target-size");
  });

  test("rejects short targets", () => {
    expect(codes(inspectActions([{ ...goodAction, height: 43 }], "page"))).toContain("target-size");
  });

  test("rejects controls without names", () => {
    expect(codes(inspectActions([{ ...goodAction, name: "" }], "page"))).toContain("name");
  });

  test("rejects keyboard-inaccessible controls", () => {
    expect(codes(inspectActions([{ ...goodAction, keyboard: false }], "page"))).toContain("keyboard");
  });

  test("rejects nonfocusable controls", () => {
    expect(codes(inspectActions([{ ...goodAction, focusable: false }], "page"))).toContain("focus");
  });

  test("does not flag disabled controls for activation", () => {
    expect(inspectActions([{ ...goodAction, disabled: true, focusable: false }], "page")).toEqual([]);
  });

  test("does not flag hidden targets for geometry", () => {
    expect(inspectActions([{ ...goodAction, visible: false, width: 0, height: 0 }], "page")).toEqual([]);
  });

  test("checks icon-only buttons", () => {
    expect(codes(inspectActions([{ ...goodAction, hiddenText: true, name: "" }], "page"))).toContain("icon-name");
  });

  test("accepts a labelled optional form field", () => {
    expect(inspectFields([goodField], "page")).toEqual([]);
  });

  test("rejects an unnamed form field", () => {
    expect(codes(inspectFields([{ ...goodField, label: "" }], "page"))).toContain("field-label");
  });

  test("requires a discoverable hint for required input", () => {
    expect(codes(inspectFields([{ ...goodField, required: true }], "page"))).toContain("required-hint");
  });

  test("accepts required input with a linked hint", () => {
    expect(inspectFields([{ ...goodField, required: true, describedBy: ["hint"] }], "page")).toEqual([]);
  });

  test("requires an associated invalid message", () => {
    expect(codes(inspectFields([{ ...goodField, invalid: true }], "page"))).toContain("invalid-message");
  });

  test("requires readable invalid text", () => {
    expect(codes(inspectFields([{ ...goodField, invalid: true, hasError: true }], "page"))).toContain("invalid-text");
  });

  test("accepts an invalid field with meaningful explanation", () => {
    expect(inspectFields([{ ...goodField, invalid: true, hasError: true, message: "Enter a place", describedBy: ["error"] }], "page")).toEqual([]);
  });
});

test.describe("P20F: dynamic journeys and map controls", () => {
  test("accepts a focus-managed route change", () => {
    expect(inspectTransition(goodTransition)).toEqual([]);
  });

  test("accepts an announced route change", () => {
    expect(inspectTransition({ ...goodTransition, focusAfter: null, announced: true })).toEqual([]);
  });

  test("rejects an unannounced and unfocused route change", () => {
    expect(codes(inspectTransition({ ...goodTransition, focusAfter: null, announced: false }))).toContain("silent-transition");
  });

  test("rejects loss of the main landmark", () => {
    expect(codes(inspectTransition({ ...goodTransition, after: { ...goodRoute, mainCount: 0 } }))).toContain("main-count");
  });

  test("rejects a missing title after navigation", () => {
    expect(codes(inspectTransition({ ...goodTransition, after: { ...goodRoute, title: "" } }))).toContain("title");
  });

  test("does not demand an announcement when nothing changed", () => {
    expect(inspectTransition({ ...goodTransition, changedUrl: false, changedContent: false, focusAfter: null, announced: false })).toEqual([]);
  });

  test("accepts a named map with alternative and local tiles", () => {
    expect(inspectMap(goodMap, "http://localhost:3000")).toEqual([]);
  });

  test("rejects an unnamed map", () => {
    expect(codes(inspectMap({ ...goodMap, accessibleName: "" }, "http://localhost:3000"))).toContain("name");
  });

  test("requires a text alternative", () => {
    expect(codes(inspectMap({ ...goodMap, hasTextAlternative: false }, "http://localhost:3000"))).toContain("text-alternative");
  });

  test("rejects remote tile requests", () => {
    expect(codes(inspectMap({ ...goodMap, externalTiles: ["https://example.com/tiles/1/2/3.png"] }, "http://localhost:3000"))).toContain("external-tile");
  });

  test("rejects missing source attribution", () => {
    expect(codes(inspectMap({ ...goodMap, attribution: "" }, "http://localhost:3000"))).toContain("attribution");
  });

  test("rejects visually hidden attribution", () => {
    expect(codes(inspectMap({ ...goodMap, attributionVisible: false }, "http://localhost:3000"))).toContain("attribution");
  });

  test("checks map control geometry", () => {
    expect(codes(inspectMap({ ...goodMap, controls: [{ ...goodAction, width: 20 }] }, "http://localhost:3000"))).toContain("target-size");
  });

  test("accepts a fully announced search change", () => {
    expect(inspectSearch(search, "places")).toEqual([]);
  });

  test("rejects an unnamed search field", () => {
    expect(codes(inspectSearch({ ...search, inputName: "" }, "places"))).toContain("name");
  });

  test("rejects a silent search results change", () => {
    expect(codes(inspectSearch({ ...search, stateAnnounced: false }, "places"))).toContain("announcement");
  });

  test("requires an empty-results explanation", () => {
    expect(codes(inspectSearch({ ...search, afterCount: 0, emptyState: false }, "places"))).toContain("empty");
  });

  test("accepts explicit empty-results text", () => {
    expect(inspectSearch({ ...search, afterCount: 0, emptyState: true }, "places")).toEqual([]);
  });

  test("accepts an accessible filter", () => {
    expect(inspectFilters([filter], "places")).toEqual([]);
  });

  test("rejects an unlabelled filter", () => {
    expect(codes(inspectFilters([{ ...filter, label: "" }], "places"))).toContain("name");
  });

  test("rejects silent filter results updates", () => {
    expect(codes(inspectFilters([{ ...filter, resultAnnounced: false }], "places"))).toContain("announcement");
  });

  test("rejects positive assumptions about unknown records", () => {
    expect(codes(inspectFilters([{ ...filter, unknownHidden: true }], "places"))).toContain("unknown-hidden");
  });

  test("accepts a normal live status region", () => {
    expect(inspectLiveRegions([region], "places")).toEqual([]);
  });

  test("rejects a silent status region", () => {
    expect(codes(inspectLiveRegions([{ ...region, role: "div", live: null }], "places"))).toContain("silent-region");
  });

  test("rejects explicitly disabled status announcements", () => {
    expect(codes(inspectLiveRegions([{ ...region, live: "off" }], "places"))).toContain("disabled-region");
  });
});

test.describe("P20F: reporting and URL policy", () => {
  test("keeps one entry per distinct finding", () => {
    const finding = issue("map", "external-tile", "/map", "Remote host");
    expect(uniqueIssues([finding, finding])).toEqual([finding]);
  });

  test("keeps different violations on the same route", () => {
    const first = issue("map", "external-tile", "/map", "Remote host");
    const second = issue("map", "name", "/map", "No name");
    expect(uniqueIssues([first, second])).toHaveLength(2);
  });

  test("formats actionable issue details", () => {
    const message = formatIssues([issue("search", "empty", "/en", "No empty state")]);
    expect(message).toContain("search/empty");
    expect(message).toContain("/en");
    expect(message).toContain("No empty state");
  });

  test("handles an empty report", () => {
    expect(formatIssues([])).toBe("No findings");
  });

  test("preserves same-origin document links", () => {
    expect(sameOriginDocument("/en/places#results", "http://localhost:3000/")).toBe("http://localhost:3000/en/places");
  });

  test("rejects external links and downloads", () => {
    expect(sameOriginDocument("https://outside.example/en", "http://localhost:3000/")).toBeNull();
    expect(sameOriginDocument("/guide.pdf", "http://localhost:3000/")).toBeNull();
    expect(sameOriginDocument("/map.geojson", "http://localhost:3000/")).toBeNull();
  });

  test("honours bounded route configuration", () => {
    const config = browserConfig("http://localhost:3000/");
    expect(config.maxPages).toBeGreaterThanOrEqual(2);
    expect(config.maxPages).toBeLessThanOrEqual(200);
    expect(new URL(config.entryEN).origin).toBe("http://localhost:3000");
    expect(new URL(config.entryFR).origin).toBe("http://localhost:3000");
  });
});

test.describe("P20F: adversarial contract boundaries", () => {
  test("a status with a date but no attribution still fails", () => {
    const items = inspectStatus({
      id: "sample", state: "PASS",
      provenance: { source: "", licence: "CC0-1.0", date: "2026-11-15" },
    });
    expect(codes(items)).toContain("source");
  });

  test("a status with attribution but no licence still fails", () => {
    const items = inspectStatus({
      id: "sample", state: "BLOCKED",
      provenance: { source: "public listing", licence: null, date: "2026-11-15" },
    });
    expect(codes(items)).toContain("licence");
  });

  test("a barrier and an unknown stay a barrier", () => {
    expect(combineStates(["UNKNOWN", "BLOCKED", "PASS"])).toBe("BLOCKED");
  });

  test("two positive observations do not introduce an unknown", () => {
    expect(combineStates(["PASS", "PASS"])).toBe("PASS");
  });

  test("an unmodified uncertain state requires no new evidence", () => {
    expect(transitionStatus("UNKNOWN", "UNKNOWN", null)).toEqual([]);
  });

  test("a positive state downgraded to unknown is allowed", () => {
    expect(transitionStatus("PASS", "UNKNOWN", null)).toEqual([]);
  });

  test("required controls with an explicit hint do not fail", () => {
    expect(inspectFields([{
      ...goodField, required: true, label: "Search places *",
    }], "page")).toEqual([]);
  });

  test("disabled invalid inputs do not create active error findings", () => {
    expect(inspectFields([{
      ...goodField, disabled: true, invalid: true,
    }], "page")).toEqual([]);
  });

  test("a hidden invalid input is excluded from visible form controls", () => {
    expect(inspectFields([{
      ...goodField, visible: false, invalid: true,
    }], "page")).toEqual([]);
  });

  test("two target issues on one button are both surfaced", () => {
    const errors = inspectActions([{
      ...goodAction, name: "", width: 20, keyboard: false,
    }], "page");
    expect(codes(errors)).toContain("name");
    expect(codes(errors)).toContain("target-size");
    expect(codes(errors)).toContain("keyboard");
  });

  test("a static result view does not require a new announcement", () => {
    expect(inspectSearch({
      ...search, changed: false, stateAnnounced: false,
    }, "page")).toEqual([]);
  });

  test("an unchanged filter does not require an announcement", () => {
    expect(inspectFilters([{
      ...filter,
      selectedAfter: false, resultChanged: false, resultAnnounced: false,
    }], "page")).toEqual([]);
  });

  test("an empty filter collection has no fabricated findings", () => {
    expect(inspectFilters([], "page")).toEqual([]);
  });

  test("a silent region without text has no current announcement to inspect", () => {
    expect(inspectLiveRegions([{
      ...region, text: "", role: "div", live: null,
    }], "page")).toEqual([]);
  });

  test("the same issue in another locale remains distinct", () => {
    const first = issue("language", "title", "/en", "No title");
    const second = issue("language", "title", "/fr", "No title");
    expect(uniqueIssues([first, second])).toHaveLength(2);
  });

  test("a malformed tile URL is an actionable failure", () => {
    const errors = inspectMap({
      ...goodMap, externalTiles: ["http://%invalid"] ,
    }, "http://localhost:3000");
    expect(codes(errors)).toContain("tile-url");
  });

  test("a named map without visible attribution still fails", () => {
    const errors = inspectMap({
      ...goodMap, attribution: "CC-BY-4.0", attributionVisible: false,
    }, "http://localhost:3000");
    expect(codes(errors)).toContain("attribution");
  });

  test("document links reject non-http protocols", () => {
    expect(sameOriginDocument("mailto:someone@example.org", "http://localhost:3000")).toBeNull();
    expect(sameOriginDocument("javascript:void(0)", "http://localhost:3000")).toBeNull();
  });
});
