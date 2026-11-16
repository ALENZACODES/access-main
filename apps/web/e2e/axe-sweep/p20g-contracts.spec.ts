import { expect, test } from "@playwright/test";
import {
  assertCompleteMatrix, controlFindings, detailFindings, dialogFindings, evidenceFindings,
  fieldFindings, focusFindings, landmarkFindings, languageTransitionFindings,
  linkFindings, liveRegionFindings, matrixKey, navigationFindings, offlineFindings, mediaFindings, tableFindings,
  report, searchFindings, validCalendarDate,
  type Context, type ControlGeometry, type DetailSnapshot, type DialogSnapshot,
  type EvidenceSnapshot, type FieldSnapshot, type FocusSnapshot, type LandmarkSnapshot,
  type LanguageTransition, type LinkSnapshot, type LiveRegionSnapshot,
  type NavigationSnapshot, type OfflineSnapshot, type SearchSnapshot,
} from "./p20g-contracts";

const ctx: Context = { route: "/finders", language: "en", viewport: 320 };
const fr: Context = { route: "/finders", language: "fr", viewport: 1280 };
const rules = (items: readonly { rule: string }[]) => items.map((item) => item.rule);
const control = (overrides: Partial<ControlGeometry> = {}): ControlGeometry => ({
  id: "search", tag: "input", role: "", name: "Search", width: 48,
  height: 48, connected: true, visible: true, disabled: false,
  inViewport: true, boundingSource: "self", sourceIsInteractive: true, ...overrides,
});
const landmark = (overrides: Partial<LandmarkSnapshot> = {}): LandmarkSnapshot => ({
  title: "Finders", documentLanguage: "en", mainCount: 1, h1: ["Finders"],
  skipLinks: [{ href: "#main", text: "Skip to main", targetExists: true }],
  pageText: "Finders and search options", horizontalOverflow: 0,
  loading: false, fatalError: false, ...overrides,
});
const field = (overrides: Partial<FieldSnapshot> = {}): FieldSnapshot => ({
  id: "query", tag: "input", type: "search", label: "Search", accessibleName: "Search",
  placeholder: "Enter keywords", required: false, disabled: false,
  descriptionIds: [], brokenDescriptions: [], autocomplete: "off",
  invalid: false, errorIds: [], visible: true, ...overrides,
});
const focus = (overrides: Partial<FocusSnapshot> = {}): FocusSnapshot => ({
  firstTab: "skip", secondTab: "home", returnedTab: "skip",
  firstVisible: true, secondVisible: true, forwardCount: 12,
  visitedMain: true, endedOnBody: false, traps: [], ...overrides,
});
const live = (overrides: Partial<LiveRegionSnapshot> = {}): LiveRegionSnapshot => ({
  id: "search-status", role: "status", live: "polite", atomic: "true",
  text: "0 results", hidden: false, busy: false, ...overrides,
});
const language = (overrides: Partial<LanguageTransition> = {}): LanguageTransition => ({
  before: "en", after: "fr", buttonUsed: true,
  hrefBefore: "http://localhost/finders", hrefAfter: "http://localhost/finders",
  headingBefore: "Finders", headingAfter: "Outils de recherche",
  buttonLabelAfter: "English", ...overrides,
});
const evidence = (overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
  id: "record-1", status: "UNKNOWN", source: null, licence: null,
  date: null, tier: null, link: null, ...overrides,
});
const supported = (overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => evidence({
  status: "PASS", source: "Public fixture", licence: "CC0-1.0",
  date: "2026-11-01", tier: "S", ...overrides,
});
const detail = (overrides: Partial<DetailSnapshot> = {}): DetailSnapshot => ({
  requestedId: "example", activePath: "/places/example", heading: "Example place",
  mainText: "Example place details", visibleRecord: true, emptyState: false,
  errorState: false, loading: false, linkedFromList: true, ...overrides,
});
const anchor = (overrides: Partial<LinkSnapshot> = {}): LinkSnapshot => ({
  href: "/help/start", text: "Start", target: "", rel: "", download: false,
  visible: true, width: 44, height: 44, ...overrides,
});
const dialog = (overrides: Partial<DialogSnapshot> = {}): DialogSnapshot => ({
  count: 1, accessibleName: "Filters", focusInside: true,
  backgroundInert: true, dismissible: true, escapeClosed: true,
  focusRestored: true, ...overrides,
});
const navigation = (overrides: Partial<NavigationSnapshot> = {}): NavigationSnapshot => ({
  from: "http://localhost/places", to: "http://localhost/places/example",
  titleBefore: "Places", titleAfter: "Example", headingAfter: "Example",
  languageBefore: "en", languageAfter: "en", historyReturned: true, ...overrides,
});
const search = (overrides: Partial<SearchSnapshot> = {}): SearchSnapshot => ({
  query: "access", enabled: true, entered: true, submitted: true,
  statusBefore: "Ready", statusAfter: "0 results", resultsBefore: 0,
  resultsAfter: 0, busyAfter: false, errorVisible: false, ...overrides,
});
const offline = (overrides: Partial<OfflineSnapshot> = {}): OfflineSnapshot => ({
  documentLoaded: true, language: "en", title: "The App", mainCount: 1,
  statusText: "Offline content available", networkError: false,
  claimedFresh: false, ...overrides,
});

// Matrix completeness is an explicit contract, independent of Playwright
// worker scheduling or local test filtering.
test.describe("P20G route matrix", () => {
  const routes = ["/", "/places", "/help", "/finders"];
  const complete = routes.flatMap((route) => ["en", "fr"].flatMap((lang) =>
    [320, 1280].map((width) => matrixKey(route, lang as "en" | "fr", width))));
  test("passes a complete 4-way matrix", () => {
    expect(assertCompleteMatrix(routes, ["en", "fr"], [320, 1280], complete)).toEqual([]);
  });
  test("rejects a missing language row", () => {
    const result = assertCompleteMatrix(routes, ["en", "fr"], [320, 1280], complete.slice(1));
    expect(rules(result)).toContain("matrix-coverage");
  });
  test("rejects a repeated browser run", () => {
    const result = assertCompleteMatrix(routes, ["en", "fr"], [320, 1280], [...complete, complete[0]]);
    expect(rules(result)).toContain("matrix-coverage");
  });
  test("rejects unrecognized route inspections", () => {
    const result = assertCompleteMatrix(routes, ["en", "fr"], [320, 1280],
      [...complete, matrixKey("/unlisted", "en", 320)]);
    expect(rules(result)).toContain("matrix-extraneous");
  });
  test("rejects missing English", () => {
    expect(rules(assertCompleteMatrix(routes, ["fr"], [320, 1280], complete))).toContain("inventory-languages");
  });
  test("rejects missing French", () => {
    expect(rules(assertCompleteMatrix(routes, ["en"], [320, 1280], complete))).toContain("inventory-languages");
  });
  test("rejects a missing mobile viewport", () => {
    expect(rules(assertCompleteMatrix(routes, ["en", "fr"], [1280], complete))).toContain("inventory-widths");
  });
  test("rejects a missing desktop viewport", () => {
    expect(rules(assertCompleteMatrix(routes, ["en", "fr"], [320], complete))).toContain("inventory-widths");
  });
  test("rejects duplicate router entries", () => {
    expect(rules(assertCompleteMatrix([...routes, "/help"], ["en", "fr"], [320, 1280], complete))).toContain("inventory-duplicate");
  });
  test("rejects query-string route seeds", () => {
    expect(rules(assertCompleteMatrix([...routes, "/help?lang=fr"], ["en", "fr"], [320, 1280], complete))).toContain("inventory-path");
  });
  test("rejects a double-slash route", () => {
    expect(rules(assertCompleteMatrix([...routes, "//example"], ["en", "fr"], [320, 1280], complete))).toContain("inventory-path");
  });
  test("rejects a route inventory missing the help entry", () => {
    expect(rules(assertCompleteMatrix(["/", "/places"], ["en", "fr"], [320, 1280], complete))).toContain("inventory-required");
  });
});

test.describe("P20G control and link geometry", () => {
  test("48px finder input is accepted", () => {
    expect(controlFindings([control({ width: 48, height: 48 })], ctx)).toEqual([]);
  });
  test("44 by 44 is accepted", () => {
    expect(controlFindings([control({ width: 44, height: 44 })], ctx)).toEqual([]);
  });
  test("43.99px width fails", () => {
    expect(rules(controlFindings([control({ width: 43.99 })], ctx))).toContain("control-44");
  });
  test("43.99px height fails", () => {
    expect(rules(controlFindings([control({ height: 43.99 })], ctx))).toContain("control-44");
  });
  test("zero-width target fails", () => {
    expect(rules(controlFindings([control({ width: 0 })], ctx))).toContain("control-44");
  });
  test("nonfinite geometry fails", () => {
    expect(rules(controlFindings([control({ width: Number.NaN })], ctx))).toContain("control-44");
  });
  test("inline links do not receive a size exception", () => {
    expect(rules(linkFindings([anchor({ width: 18, height: 16 })], ctx, "http://localhost"))).toContain("link-44");
  });
  test("links of exactly 44px pass", () => {
    expect(linkFindings([anchor()], ctx, "http://localhost")).toEqual([]);
  });
  test("missing link names are reported", () => {
    expect(rules(linkFindings([anchor({ text: "" })], ctx, "http://localhost"))).toContain("link-name");
  });
  test("hidden links are not measured as current targets", () => {
    expect(linkFindings([anchor({ visible: false, width: 0, height: 0 })], ctx, "http://localhost")).toEqual([]);
  });
  test("external new-tab links require noopener", () => {
    expect(rules(linkFindings([anchor({ target: "_blank" })], ctx, "http://localhost"))).toContain("link-opener");
  });
  test("noopener satisfies the new-tab requirement", () => {
    expect(linkFindings([anchor({ target: "_blank", rel: "noopener noreferrer" })], ctx, "http://localhost")).toEqual([]);
  });
  test("script URLs are rejected", () => {
    expect(rules(linkFindings([anchor({ href: "javascript:alert(1)" })], ctx, "http://localhost"))).toContain("link-scheme");
  });
  test("radio hit labels are accepted only when interactive", () => {
    expect(controlFindings([control({ boundingSource: "label", sourceIsInteractive: true })], ctx)).toEqual([]);
  });
  test("decorative parent geometry is never a substituted hit area", () => {
    expect(rules(controlFindings([control({ boundingSource: "label", sourceIsInteractive: false })], ctx))).toContain("control-label-hit");
  });
  test("unnamed visible buttons fail", () => {
    expect(rules(controlFindings([control({ tag: "button", name: "" })], ctx))).toContain("control-unnamed");
  });
  test("disabled targets are not activation requirements", () => {
    expect(controlFindings([control({ disabled: true, width: 20, height: 20 })], ctx)).toEqual([]);
  });
  test("detached elements are detectable", () => {
    expect(rules(controlFindings([control({ connected: false })], ctx))).toContain("control-detached");
  });
  test("duplicate geometry identifiers are rejected", () => {
    expect(rules(controlFindings([control(), control()], ctx))).toContain("control-duplicate");
  });
  test("all findings preserve language and width diagnostics", () => {
    const result = report(controlFindings([control({ width: 10 })], fr));
    expect(result).toContain("fr");
    expect(result).toContain("1280px");
  });
});

test.describe("P20G document structure", () => {
  test("a complete document has no findings", () => {
    expect(landmarkFindings([landmark()][0], ctx)).toEqual([]);
  });
  test("document title cannot be blank", () => {
    expect(rules(landmarkFindings(landmark({ title: "   " }), ctx))).toContain("document-title");
  });
  test("a French page cannot retain English html lang", () => {
    expect(rules(landmarkFindings(landmark(), fr))).toContain("document-language");
  });
  test("fr-CA is accepted as French", () => {
    expect(landmarkFindings(landmark({ documentLanguage: "fr-CA" }), fr)).toEqual([]);
  });
  test("missing main fails", () => {
    expect(rules(landmarkFindings(landmark({ mainCount: 0 }), ctx))).toContain("main-count");
  });
  test("two main landmarks fail", () => {
    expect(rules(landmarkFindings(landmark({ mainCount: 2 }), ctx))).toContain("main-count");
  });
  test("no h1 fails", () => {
    expect(rules(landmarkFindings(landmark({ h1: [] }), ctx))).toContain("h1-count");
  });
  test("two visible h1 headings fail", () => {
    expect(rules(landmarkFindings(landmark({ h1: ["One", "Two"] }), ctx))).toContain("h1-count");
  });
  test("blank h1 fails", () => {
    expect(rules(landmarkFindings(landmark({ h1: [" "] }), ctx))).toContain("h1-count");
  });
  test("an empty main fails", () => {
    expect(rules(landmarkFindings(landmark({ pageText: "" }), ctx))).toContain("page-empty");
  });
  test("loading is not silently accepted as content", () => {
    expect(rules(landmarkFindings(landmark({ loading: true }), ctx))).toContain("page-loading");
  });
  test("fatal app boundaries fail", () => {
    expect(rules(landmarkFindings(landmark({ fatalError: true }), ctx))).toContain("page-fatal");
  });
  test("320px overflow is detected", () => {
    expect(rules(landmarkFindings(landmark({ horizontalOverflow: 2 }), ctx))).toContain("reflow");
  });
  test("a one-pixel tolerance avoids rounding false positives", () => {
    expect(landmarkFindings(landmark({ horizontalOverflow: 1 }), ctx)).toEqual([]);
  });
  test("desktop overflow does not use mobile-only rule", () => {
    expect(landmarkFindings(landmark({ horizontalOverflow: 2, documentLanguage: "fr" }), fr)).toEqual([]);
  });
  test("missing skip links fail", () => {
    expect(rules(landmarkFindings(landmark({ skipLinks: [] }), ctx))).toContain("skip-absent");
  });
  test("skip destination must exist", () => {
    expect(rules(landmarkFindings(landmark({ skipLinks: [{ href: "#lost", text: "Skip", targetExists: false }] }), ctx))).toContain("skip-destination");
  });
  test("skip links must be named", () => {
    expect(rules(landmarkFindings(landmark({ skipLinks: [{ href: "#main", text: "", targetExists: true }] }), ctx))).toContain("skip-name");
  });
});

test.describe("P20G fields and live announcements", () => {
  test("a labelled field passes", () => {
    expect(fieldFindings([field()], ctx)).toEqual([]);
  });
  test("placeholder-only input fails", () => {
    expect(rules(fieldFindings([field({ label: "", accessibleName: "" })], ctx))).toContain("field-placeholder");
  });
  test("unnamed field fails", () => {
    expect(rules(fieldFindings([field({ accessibleName: "" })], ctx))).toContain("field-name");
  });
  test("visible label must be part of accessible name", () => {
    expect(rules(fieldFindings([field({ accessibleName: "Unrelated" })], ctx))).toContain("field-label-in-name");
  });
  test("case-insensitive matching permits name expansion", () => {
    expect(fieldFindings([field({ accessibleName: "SEARCH records" })], ctx)).toEqual([]);
  });
  test("broken aria descriptions fail", () => {
    expect(rules(fieldFindings([field({ descriptionIds: ["hint"], brokenDescriptions: ["hint"] })], ctx))).toContain("field-description");
  });
  test("referenced descriptions pass", () => {
    expect(fieldFindings([field({ descriptionIds: ["hint"] })], ctx)).toEqual([]);
  });
  test("invalid input must reference an error", () => {
    expect(rules(fieldFindings([field({ invalid: true })], ctx))).toContain("field-error-association");
  });
  test("an error message association passes", () => {
    expect(fieldFindings([field({ invalid: true, errorIds: ["query-error"] })], ctx)).toEqual([]);
  });
  test("disabled invalid required field is flagged", () => {
    expect(rules(fieldFindings([field({ invalid: true, disabled: true, required: true })], ctx))).toContain("field-disabled-error");
  });
  test("hidden fields are ignored for visible label rules", () => {
    expect(fieldFindings([field({ type: "hidden", accessibleName: "" })], ctx)).toEqual([]);
  });
  test("nonvisible fields are ignored", () => {
    expect(fieldFindings([field({ visible: false, accessibleName: "" })], ctx)).toEqual([]);
  });
  test("polite status is accepted", () => {
    expect(liveRegionFindings([live()], ctx)).toEqual([]);
  });
  test("busy alert is flagged", () => {
    expect(rules(liveRegionFindings([live({ role: "alert", busy: true })], ctx))).toContain("live-busy-alert");
  });
  test("status with aria-live off is flagged", () => {
    expect(rules(liveRegionFindings([live({ live: "off" })], ctx))).toContain("live-muted");
  });
  test("hidden status does not claim visible results", () => {
    expect(liveRegionFindings([live({ hidden: true })], ctx)).toEqual([]);
  });
  test("duplicate live region identifiers fail", () => {
    expect(rules(liveRegionFindings([live(), live()], ctx))).toContain("live-duplicate");
  });
});

test.describe("P20G keyboard, language, dialogs", () => {
  test("healthy keyboard traversal passes", () => {
    expect(focusFindings(focus(), ctx)).toEqual([]);
  });
  test("empty first focus fails", () => {
    expect(rules(focusFindings(focus({ firstTab: null }), ctx))).toContain("focus-first");
  });
  test("hidden first focus fails", () => {
    expect(rules(focusFindings(focus({ firstVisible: false }), ctx))).toContain("focus-hidden");
  });
  test("hidden second focus fails", () => {
    expect(rules(focusFindings(focus({ secondVisible: false }), ctx))).toContain("focus-next-hidden");
  });
  test("stationary tab fails", () => {
    expect(rules(focusFindings(focus({ secondTab: "skip" }), ctx))).toContain("focus-stalled");
  });
  test("broken reverse tab fails", () => {
    expect(rules(focusFindings(focus({ returnedTab: "home" }), ctx))).toContain("focus-reverse");
  });
  test("unobserved walk fails", () => {
    expect(rules(focusFindings(focus({ forwardCount: 0 }), ctx))).toContain("focus-no-walk");
  });
  test("main region must be keyboard accessible when audited", () => {
    expect(rules(focusFindings(focus({ visitedMain: false }), ctx))).toContain("focus-main");
  });
  test("keyboard trap fails", () => {
    expect(rules(focusFindings(focus({ traps: ["Repeated control"] }), ctx))).toContain("focus-trap");
  });
  test("a genuine switch to French passes", () => {
    expect(languageTransitionFindings(language(), ctx)).toEqual([]);
  });
  test("URL seeding is not a language button interaction", () => {
    expect(rules(languageTransitionFindings(language({ buttonUsed: false }), ctx))).toContain("language-button");
  });
  test("an English document after button activation fails", () => {
    expect(rules(languageTransitionFindings(language({ after: "en" }), ctx))).toContain("language-result");
  });
  test("changing URL during language selection fails", () => {
    expect(rules(languageTransitionFindings(language({ hrefAfter: "http://localhost/fr" }), ctx))).toContain("language-navigation");
  });
  test("missing French heading fails", () => {
    expect(rules(languageTransitionFindings(language({ headingAfter: "" }), ctx))).toContain("language-heading");
  });
  test("empty language switcher text fails", () => {
    expect(rules(languageTransitionFindings(language({ buttonLabelAfter: "" }), ctx))).toContain("language-control-name");
  });
  test("a named, contained dialog passes", () => {
    expect(dialogFindings(dialog(), ctx)).toEqual([]);
  });
  test("modal stacking fails", () => {
    expect(rules(dialogFindings(dialog({ count: 2 }), ctx))).toContain("dialog-count");
  });
  test("unnamed dialog fails", () => {
    expect(rules(dialogFindings(dialog({ accessibleName: "" }), ctx))).toContain("dialog-name");
  });
  test("dialog focus outside fails", () => {
    expect(rules(dialogFindings(dialog({ focusInside: false }), ctx))).toContain("dialog-focus");
  });
  test("interactive background fails", () => {
    expect(rules(dialogFindings(dialog({ backgroundInert: false }), ctx))).toContain("dialog-background");
  });
  test("Escape failure is reported for dismissible dialogs", () => {
    expect(rules(dialogFindings(dialog({ escapeClosed: false }), ctx))).toContain("dialog-escape");
  });
  test("focus must restore after dismissal", () => {
    expect(rules(dialogFindings(dialog({ focusRestored: false }), ctx))).toContain("dialog-restore");
  });
  test("non-dismissable dialogs are not forced to close", () => {
    expect(dialogFindings(dialog({ dismissible: false, escapeClosed: false, focusRestored: false }), ctx)).toEqual([]);
  });
  test("no dialog means no issues", () => {
    expect(dialogFindings(null, ctx)).toEqual([]);
  });
});

test.describe("P20G evidence and detail routes", () => {
  test("UNKNOWN records retain uncertainty", () => {
    expect(evidenceFindings([evidence()], ctx)).toEqual([]);
  });
  test("complete open source provenance passes", () => {
    expect(evidenceFindings([supported()], ctx)).toEqual([]);
  });
  test("missing source fails on a positive record", () => {
    expect(rules(evidenceFindings([supported({ source: null })], ctx))).toContain("evidence-source");
  });
  test("missing licence fails", () => {
    expect(rules(evidenceFindings([supported({ licence: null })], ctx))).toContain("evidence-licence");
  });
  test("unrecognized licence does not become open by inference", () => {
    expect(rules(evidenceFindings([supported({ licence: "Proprietary" })], ctx))).toContain("evidence-licence");
  });
  test("missing date fails", () => {
    expect(rules(evidenceFindings([supported({ date: null })], ctx))).toContain("evidence-date");
  });
  test("invalid February date fails", () => {
    expect(rules(evidenceFindings([supported({ date: "2026-02-30" })], ctx))).toContain("evidence-date");
  });
  test("missing tier fails", () => {
    expect(rules(evidenceFindings([supported({ tier: null })], ctx))).toContain("evidence-tier");
  });
  test("blocked records also require provenance", () => {
    expect(rules(evidenceFindings([supported({ status: "BLOCKED", source: "" })], ctx))).toContain("evidence-source");
  });
  test("unsafe evidence links fail", () => {
    expect(rules(evidenceFindings([supported({ link: "javascript:alert(1)" })], ctx))).toContain("evidence-link");
  });
  test("an HTTPS citation is accepted", () => {
    expect(evidenceFindings([supported({ link: "https://example.org/source" })], ctx)).toEqual([]);
  });
  test("duplicate record identifiers fail", () => {
    expect(rules(evidenceFindings([supported(), supported()], ctx))).toContain("evidence-duplicate");
  });
  test("leap day 2024 is a date", () => {
    expect(validCalendarDate("2024-02-29")).toBe(true);
  });
  test("2025 leap day is invalid", () => {
    expect(validCalendarDate("2025-02-29")).toBe(false);
  });
  test("year-zero is invalid", () => {
    expect(validCalendarDate("0000-01-01")).toBe(false);
  });
  test("a full place detail passes", () => {
    expect(detailFindings(detail(), "places", ctx)).toEqual([]);
  });
  test("missing ID fails", () => {
    expect(rules(detailFindings(detail({ requestedId: "" }), "places", ctx))).toContain("detail-id");
  });
  test("wrong destination fails", () => {
    expect(rules(detailFindings(detail({ activePath: "/help/example" }), "places", ctx))).toContain("detail-route");
  });
  test("a blank heading fails", () => {
    expect(rules(detailFindings(detail({ heading: "" }), "places", ctx))).toContain("detail-heading");
  });
  test("a blank main fails", () => {
    expect(rules(detailFindings(detail({ mainText: " " }), "places", ctx))).toContain("detail-content");
  });
  test("perpetual loading fails", () => {
    expect(rules(detailFindings(detail({ loading: true }), "places", ctx))).toContain("detail-loading");
  });
  test("an error-only route fails", () => {
    expect(rules(detailFindings(detail({ errorState: true }), "places", ctx))).toContain("detail-error");
  });
  test("a blank detail without an honest empty state fails", () => {
    expect(rules(detailFindings(detail({ visibleRecord: false }), "places", ctx))).toContain("detail-no-record");
  });
  test("an honest empty state cannot substitute for a linked record", () => {
    expect(rules(detailFindings(detail({ visibleRecord: false, emptyState: true }), "places", ctx))).toContain("detail-no-record");
  });
  test("unlinked synthetic record fails", () => {
    expect(rules(detailFindings(detail({ linkedFromList: false }), "places", ctx))).toContain("detail-unlinked");
  });
  test("help articles require the help route", () => {
    expect(detailFindings(detail({ activePath: "/help/start" }), "help", ctx)).toEqual([]);
  });
});

test.describe("P20G navigation, search and offline", () => {
  test("a healthy navigation passes", () => {
    expect(navigationFindings(navigation(), ctx)).toEqual([]);
  });
  test("stationary navigation is flagged", () => {
    expect(rules(navigationFindings(navigation({ to: "http://localhost/places" }), ctx))).toContain("route-stationary");
  });
  test("missing destination title fails", () => {
    expect(rules(navigationFindings(navigation({ titleAfter: "" }), ctx))).toContain("route-title");
  });
  test("missing destination heading fails", () => {
    expect(rules(navigationFindings(navigation({ headingAfter: "" }), ctx))).toContain("route-h1");
  });
  test("unexpected language drift fails", () => {
    expect(rules(navigationFindings(navigation({ languageAfter: "fr" }), ctx))).toContain("route-language");
  });
  test("broken browser-back state fails", () => {
    expect(rules(navigationFindings(navigation({ historyReturned: false }), ctx))).toContain("route-back");
  });
  test("a submitted search with empty results is a valid outcome", () => {
    expect(searchFindings(search(), ctx)).toEqual([]);
  });
  test("disabled search is not forced to submit", () => {
    expect(searchFindings(search({ enabled: false, submitted: false }), ctx)).toEqual([]);
  });
  test("field entry failure is detected", () => {
    expect(rules(searchFindings(search({ entered: false }), ctx))).toContain("search-entry");
  });
  test("submit failure is detected", () => {
    expect(rules(searchFindings(search({ submitted: false }), ctx))).toContain("search-submit");
  });
  test("permanent busy state is detected", () => {
    expect(rules(searchFindings(search({ busyAfter: true }), ctx))).toContain("search-busy");
  });
  test("visible search errors are detected", () => {
    expect(rules(searchFindings(search({ errorVisible: true }), ctx))).toContain("search-error");
  });
  test("missing status announcement is detected", () => {
    expect(rules(searchFindings(search({ statusAfter: "" }), ctx))).toContain("search-status");
  });
  test("offline shell can remain usable", () => {
    expect(offlineFindings(offline(), ctx)).toEqual([]);
  });
  test("network error fails the offline document gate", () => {
    expect(rules(offlineFindings(offline({ networkError: true }), ctx))).toContain("offline-document");
  });
  test("missing cached document fails", () => {
    expect(rules(offlineFindings(offline({ documentLoaded: false }), ctx))).toContain("offline-document");
  });
  test("offline locale drift fails", () => {
    expect(rules(offlineFindings(offline({ language: "fr" }), ctx))).toContain("offline-language");
  });
  test("missing offline main fails", () => {
    expect(rules(offlineFindings(offline({ mainCount: 0 }), ctx))).toContain("offline-main");
  });
  test("missing offline message fails", () => {
    expect(rules(offlineFindings(offline({ statusText: "" }), ctx))).toContain("offline-status");
  });
  test("offline copy cannot claim fresh updates", () => {
    expect(rules(offlineFindings(offline({ claimedFresh: true }), ctx))).toContain("offline-freshness");
  });
});

test.describe("P20G media and data-table semantics", () => {
  const image = { kind: "image" as const, id: "map", visible: true, decorative: false,
    alternative: "Map with a text alternative", captions: false, controls: false };
  const video = { ...image, kind: "video" as const, id: "clip", captions: true, controls: true };
  const table = { id: "comparison", rowCount: 3, headerCount: 2, caption: "Comparison",
    isLayout: false, hasHeaderAssociations: true };
  test("described image passes", () => {
    expect(mediaFindings([image], ctx)).toEqual([]);
  });
  test("undocumented image fails", () => {
    expect(rules(mediaFindings([{ ...image, alternative: null }], ctx))).toContain("media-alternative");
  });
  test("decorative image is exempt", () => {
    expect(mediaFindings([{ ...image, decorative: true, alternative: null }], ctx)).toEqual([]);
  });
  test("canvas has an explicit alternative", () => {
    expect(rules(mediaFindings([{ ...image, kind: "canvas", alternative: "" }], ctx))).toContain("media-alternative");
  });
  test("captions are required for visible video", () => {
    expect(rules(mediaFindings([{ ...video, captions: false }], ctx))).toContain("video-captions");
  });
  test("video controls are required", () => {
    expect(rules(mediaFindings([{ ...video, controls: false }], ctx))).toContain("video-controls");
  });
  test("audio controls are required", () => {
    expect(rules(mediaFindings([{ ...video, kind: "audio", controls: false }], ctx))).toContain("audio-controls");
  });
  test("semantic table passes", () => {
    expect(tableFindings([table], ctx)).toEqual([]);
  });
  test("data table without headers fails", () => {
    expect(rules(tableFindings([{ ...table, headerCount: 0 }], ctx))).toContain("table-headers");
  });
  test("data table without caption fails", () => {
    expect(rules(tableFindings([{ ...table, caption: "" }], ctx))).toContain("table-caption");
  });
  test("unassociated headers fail", () => {
    expect(rules(tableFindings([{ ...table, hasHeaderAssociations: false }], ctx))).toContain("table-associations");
  });
  test("presentation layout table is not treated as data", () => {
    expect(tableFindings([{ ...table, isLayout: true, headerCount: 0, caption: "" }], ctx)).toEqual([]);
  });
});
