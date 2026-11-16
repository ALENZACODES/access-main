import { expect, test } from "@playwright/test";
import {
  assertJourneyStep, dialogProblems, evidenceTransitionProblems, filterProblems,
  historyProblems, localeTransitionProblems, searchProblems,
  type DialogState, type FilterState, type HistoryTransition,
  type JourneyStep, type LocaleTransition, type SearchState,
} from "./p20e-journeys";
import type { AuditContext, StatusRecord } from "./p20e-policy";
const ctx: AuditContext = { page: "http://localhost/en/places", locale: "en" };
const record = (overrides: Partial<StatusRecord> = {}): StatusRecord => ({
  id: "entrance-1", status: "UNKNOWN", source: null, licence: null,
  observedAt: null, expiresAt: null, collectedAt: null,
  text: "Entrance information unavailable", ...overrides,
});
const step = (overrides: Partial<JourneyStep> = {}): JourneyStep => ({
  name: "places", pageBefore: ctx.page, pageAfter: "http://localhost/en/place/1",
  languageBefore: "en", languageAfter: "en", titleBefore: "Places",
  titleAfter: "Place details", mainBefore: "All places", mainAfter: "Place details",
  focusedName: null, errors: [], ...overrides,
});
const dialog = (overrides: Partial<DialogState> = {}): DialogState => ({
  open: true, count: 1, accessibleName: "Filters", focusedInside: true,
  backdropInert: true, scrollLocked: true, ...overrides,
});
const search = (overrides: Partial<SearchState> = {}): SearchState => ({
  query: "park", results: ["Park listing"], statusText: "1 result",
  busy: false, location: ctx.page, ...overrides,
});
const filter = (overrides: Partial<FilterState> = {}): FilterState => ({
  selected: [], resultCount: 3, ariaBusy: false, status: "3 results", ...overrides,
});
const locale = (overrides: Partial<LocaleTransition> = {}): LocaleTransition => ({
  before: "en", after: "fr", href: "/fr/places", htmlLang: "fr-CA",
  heading: "Lieux", evidence: [], ...overrides,
});
const history = (overrides: Partial<HistoryTransition> = {}): HistoryTransition => ({
  original: ctx.page, destination: "http://localhost/en/places/1",
  returned: ctx.page, title: "Places", language: "en", ...overrides,
});
const codes = (results: readonly { rule: string }[]): string[] => results.map((item) => item.rule);
test.describe("P20E: route journeys", () => {
  test("healthy transitions pass", () => {
    expect(assertJourneyStep(step(), ctx)).toEqual([]);
  });
  test("a blank navigation destination fails", () => {
    expect(codes(assertJourneyStep(step({ pageAfter: "about:blank" }), ctx))).toContain("journey-navigation");
  });
  test("destination title must not disappear", () => {
    expect(codes(assertJourneyStep(step({ titleAfter: "" }), ctx))).toContain("journey-title");
  });
  test("destination needs accessible content", () => {
    expect(codes(assertJourneyStep(step({ mainAfter: "   " }), ctx))).toContain("journey-main");
  });
  test("a locale drift fails", () => {
    expect(codes(assertJourneyStep(step({ languageAfter: "fr" }), ctx))).toContain("journey-locale");
  });
  test("missing document language fails", () => {
    expect(codes(assertJourneyStep(step({ languageAfter: null }), ctx))).toContain("journey-locale");
  });
  test("unclear destination focus fails", () => {
    expect(codes(assertJourneyStep(step({ focusedName: "" }), ctx))).toContain("journey-focus");
  });
  test("unfocused navigation is not arbitrarily rejected", () => {
    expect(assertJourneyStep(step({ focusedName: null }), ctx)).toEqual([]);
  });
  test("page errors fail the audit", () => {
    expect(codes(assertJourneyStep(step({ errors: ["Unexpected error"] }), ctx))).toContain("journey-console");
  });
  test("multiple errors remain independently visible", () => {
    expect(assertJourneyStep(step({ errors: ["Error A", "Error B"] }), ctx).filter((item) => item.rule === "journey-console")).toHaveLength(2);
  });
});
test.describe("P20E: evidence transitions", () => {
  const asOf = "2026-11-15";
  const supported = { status: "PASS", source: "public-fixture", licence: "CC0-1.0", observedAt: "2026-11-01" } as const;
  test("a stable unknown observation stays unknown", () => {
    const before = [record()];
    expect(evidenceTransitionProblems({ before, after: before, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf)).toEqual([]);
  });
  test("a stable supported observation is accepted", () => {
    const before = [record(supported)];
    expect(evidenceTransitionProblems({ before, after: before, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf)).toEqual([]);
  });
  test("unknown cannot become positive without a new source or date", () => {
    const before = [record({ source: "public-fixture", observedAt: "2026-11-01" })];
    const after = [record(supported)];
    expect(codes(evidenceTransitionProblems({ before, after, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf))).toContain("journey-evidence-promotion");
  });
  test("a new dated observation may resolve uncertainty", () => {
    const before = [record({ source: "public-fixture", observedAt: "2026-10-15" })];
    const after = [record(supported)];
    expect(evidenceTransitionProblems({ before, after, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf)).toEqual([]);
  });
  test("supported barriers cannot flip to PASS on unchanged evidence", () => {
    const before = [record({ ...supported, status: "BLOCKED" })];
    const after = [record(supported)];
    expect(codes(evidenceTransitionProblems({ before, after, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf))).toContain("journey-evidence-conflict");
  });
  test("supported PASS cannot flip to BLOCKED on unchanged evidence", () => {
    const before = [record(supported)];
    const after = [record({ ...supported, status: "BLOCKED" })];
    expect(codes(evidenceTransitionProblems({ before, after, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf))).toContain("journey-evidence-conflict");
  });
  test("source removal produces a loss finding", () => {
    const before = [record(supported)];
    const after = [record({ ...supported, source: null })];
    expect(codes(evidenceTransitionProblems({ before, after, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf))).toContain("journey-source-loss");
  });
  test("missing destination record does not invent a positive outcome", () => {
    const before = [record(supported)];
    expect(evidenceTransitionProblems({ before, after: [], sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf)).toEqual([]);
  });
  test("unrelated records are compared by identifier", () => {
    const before = [record(supported)];
    const after = [record({ ...supported, id: "other", status: "BLOCKED" })];
    expect(evidenceTransitionProblems({ before, after, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf)).toEqual([]);
  });
  test("expired records cannot create a supported transition", () => {
    const before = [record({ ...supported, expiresAt: "2026-11-10" })];
    const after = [record({ ...supported, status: "BLOCKED", expiresAt: "2026-11-10" })];
    expect(evidenceTransitionProblems({ before, after, sourcePage: ctx.page, destinationPage: ctx.page }, ctx, asOf)).toEqual([]);
  });
});
test.describe("P20E: modal dialogs", () => {
  test("well-described modal has no findings", () => {
    expect(dialogProblems(dialog(), ctx)).toEqual([]);
  });
  test("closed dialogs do not trigger", () => {
    expect(dialogProblems(dialog({ open: false }), ctx)).toEqual([]);
  });
  test("two simultaneous modal dialogs fail", () => {
    expect(codes(dialogProblems(dialog({ count: 2 }), ctx))).toContain("dialog-stacking");
  });
  test("unnamed dialog fails", () => {
    expect(codes(dialogProblems(dialog({ accessibleName: "" }), ctx))).toContain("dialog-name");
  });
  test("dialog that leaves focus outside fails", () => {
    expect(codes(dialogProblems(dialog({ focusedInside: false }), ctx))).toContain("dialog-focus");
  });
  test("keyboard-reachable backdrop fails", () => {
    expect(codes(dialogProblems(dialog({ backdropInert: false }), ctx))).toContain("dialog-background");
  });
  test("several modal problems are not hidden by the first one", () => {
    const result = dialogProblems(dialog({ count: 3, accessibleName: "", focusedInside: false, backdropInert: false }), ctx);
    expect(result).toHaveLength(4);
  });
});
test.describe("P20E: search and filters", () => {
  test("unchanged search has no result announcement requirement", () => {
    expect(searchProblems(search(), search(), ctx)).toEqual([]);
  });
  test("changed search with announcements passes", () => {
    expect(searchProblems(search(), search({ query: "library", results: ["Library"], statusText: "1 result" }), ctx)).toEqual([]);
  });
  test("changed search without announcement fails", () => {
    expect(codes(searchProblems(search(), search({ query: "library", results: ["Library"], statusText: "" }), ctx))).toContain("search-update");
  });
  test("busy search without a message fails", () => {
    expect(codes(searchProblems(search(), search({ busy: true, statusText: "" }), ctx))).toContain("search-busy");
  });
  test("unnamed results fail", () => {
    expect(codes(searchProblems(search(), search({ results: [""] }), ctx))).toContain("search-result-name");
  });
  test("no results may be an intentional state", () => {
    expect(searchProblems(search(), search({ results: [], statusText: "No matches" }), ctx)).toEqual([]);
  });
  test("stable filters pass", () => {
    expect(filterProblems(filter(), filter(), ctx)).toEqual([]);
  });
  test("filter updates announce changes", () => {
    expect(filterProblems(filter(), filter({ selected: ["Step-free"], resultCount: 2, status: "2 results" }), ctx)).toEqual([]);
  });
  test("unannounced filter count change fails", () => {
    expect(codes(filterProblems(filter(), filter({ selected: ["Step-free"], resultCount: 2, status: "" }), ctx))).toContain("filter-announcement");
  });
  test("filter busy state needs a message", () => {
    expect(codes(filterProblems(filter(), filter({ ariaBusy: true, status: "" }), ctx))).toContain("filter-busy");
  });
});
test.describe("P20E: locale switching", () => {
  test("EN to FR passes with a French heading", () => {
    expect(localeTransitionProblems(locale(), ctx)).toEqual([]);
  });
  test("FR to EN passes with an English heading", () => {
    expect(localeTransitionProblems(locale({ before: "fr", after: "en", htmlLang: "en-CA", heading: "Places" }), ctx)).toEqual([]);
  });
  test("switch without locale change fails", () => {
    expect(codes(localeTransitionProblems(locale({ after: "en", htmlLang: "en" }), ctx))).toContain("switch-no-change");
  });
  test("wrong document language fails", () => {
    expect(codes(localeTransitionProblems(locale({ htmlLang: "en" }), ctx))).toContain("switch-document");
  });
  test("missing localized heading fails", () => {
    expect(codes(localeTransitionProblems(locale({ heading: "" }), ctx))).toContain("switch-heading");
  });
  test("provenance cannot disappear after a locale change", () => {
    expect(codes(localeTransitionProblems(locale({ evidence: [record({ status: "PASS" })] }), ctx))).toContain("switch-evidence");
  });
  test("unknown records do not become stated outcomes", () => {
    expect(localeTransitionProblems(locale({ evidence: [record()] }), ctx)).toEqual([]);
  });
  test("supported evidence survives the switch", () => {
    expect(localeTransitionProblems(locale({ evidence: [record({ status: "PASS", source: "open-fixture", licence: "CC0-1.0", observedAt: "2026-11-01" })] }), ctx)).toEqual([]);
  });
});
test.describe("P20E: browser history", () => {
  test("returning to the same route passes", () => {
    expect(historyProblems(history(), ctx)).toEqual([]);
  });
  test("returning to another route fails", () => {
    expect(codes(historyProblems(history({ returned: "http://localhost/en" }), ctx))).toContain("history-return");
  });
  test("back navigation needs a title", () => {
    expect(codes(historyProblems(history({ title: "" }), ctx))).toContain("history-title");
  });
  test("back navigation must retain locale", () => {
    expect(codes(historyProblems(history({ language: "fr" }), ctx))).toContain("history-language");
  });
  test("missing locale on return fails", () => {
    expect(codes(historyProblems(history({ language: "" }), ctx))).toContain("history-language");
  });
  test("all history failures are reported together", () => {
    expect(historyProblems(history({ returned: "http://localhost/", title: "", language: "fr" }), ctx)).toHaveLength(3);
  });
});
