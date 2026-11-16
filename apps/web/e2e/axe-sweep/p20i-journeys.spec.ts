import { expect, test } from "@playwright/test";
import {
  containsUnfoundedClaim, detailIdFromHref, detailOutcomeIssues, historyOutcomeIssues,
  offlineOutcomeIssues, preferenceOutcomeIssues, resultStatusFromText,
  routeIdentityIssues, searchOutcomeIssues,
  type DetailOutcome, type HistoryOutcome, type OfflineOutcome,
  type SavedPreferenceOutcome, type SearchOutcome,
} from "./p20i-journeys";
import type { Context } from "./p20i-contracts";

const ctx: Context = { route: "/places", locale: "en", width: 320 };
const origin = "https://example.invalid";
const validDetail: DetailOutcome = {
  parentRoute: "/places", href: "/places/record-1", requestedId: "record-1",
  path: "/places/record-1", heading: "Example location", mainText: "Example location and source details",
  recordVisible: true, emptyState: false, linkedFromList: true,
  loading: false, source: "Open source", licence: "ODbL-1.0",
  sourceDate: "2026-11-16", accessibility: "UNKNOWN",
};
const search: SearchOutcome = {
  route: "/places", enabled: true, submitted: true,
  query: "Library", priorStatus: "Loading", nextStatus: "0 results",
  pending: false, resultCount: 0, error: null,
};
const offline: OfflineOutcome = {
  requestedRoute: "/places", locale: "en", documentLoaded: true,
  networkFailure: false, mainCount: 1, title: "Places",
  message: "Saved information, last updated on the stated date",
  claimedCurrent: false, hadCachedContent: true, cacheDate: "2026-11-15",
};
const history: HistoryOutcome = {
  before: "/places", after: "/places/record-1", back: "/places",
  langBefore: "en", langAfter: "en", focusReturned: true,
  navigationSucceeded: true,
};
const preference: SavedPreferenceOutcome = {
  selectedLanguage: "fr", reloadedLanguage: "fr", reloadedPath: "/places",
  expectedPath: "/places", storageEnabled: true,
};
const codes = (items: readonly { rule: string }[]): string[] => items.map((item) => item.rule);

test.describe("P20I real detail route contracts", () => {
  test("valid local place ID is read", () => expect(detailIdFromHref("/places/record-1", origin)).toBe("record-1"));
  test("valid local help ID is read", () => expect(detailIdFromHref("/help/guide-1", origin)).toBe("guide-1"));
  test("encoded ID is decoded", () => expect(detailIdFromHref("/places/Union%20Station", origin)).toBe("Union Station"));
  test("external detail link is excluded", () => expect(detailIdFromHref("https://remote.invalid/places/x", origin)).toBeNull());
  test("root list is not a detail link", () => expect(detailIdFromHref("/places", origin)).toBeNull());
  test("help index is not a detail link", () => expect(detailIdFromHref("/help", origin)).toBeNull());
  test("unknown route is not a detail link", () => expect(detailIdFromHref("/other/x", origin)).toBeNull());
  test("empty ID is rejected", () => expect(detailIdFromHref("/places/", origin)).toBeNull());
  test("nested ID is rejected", () => expect(detailIdFromHref("/places/a/b", origin)).toBeNull());
  test("fragment ID is rejected", () => expect(detailIdFromHref("/places/a#part", origin)).toBeNull());
  test("query ID is rejected", () => expect(detailIdFromHref("/places/a?lang=fr", origin)).toBeNull());
  test("broken percent encoding is rejected", () => expect(detailIdFromHref("/places/%ZZ", origin)).toBeNull());
  test("plain place detail passes", () => expect(detailOutcomeIssues(validDetail, ctx, origin)).toEqual([]));
  test("detail must originate in a list", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, linkedFromList: false }, ctx, origin))).toContain("detail-navigation");
  });
  test("detail ID must match the clicked link", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, requestedId: "other" }, ctx, origin))).toContain("detail-id");
  });
  test("external place link is rejected", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, href: "https://remote.invalid/places/record-1" }, ctx, origin))).toContain("detail-link");
  });
  test("wrong route path is rejected", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, path: "/help/record-1" }, ctx, origin))).toContain("detail-path");
  });
  test("empty heading is rejected", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, heading: "" }, ctx, origin))).toContain("detail-heading");
  });
  test("empty main content is rejected", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, mainText: "" }, ctx, origin))).toContain("detail-content");
  });
  test("loading detail is rejected", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, loading: true }, ctx, origin))).toContain("detail-loading");
  });
  test("no record and no empty state is rejected", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, recordVisible: false }, ctx, origin))).toContain("detail-record");
  });
  test("honest empty state may lack source details", () => {
    const item = { ...validDetail, recordVisible: false, emptyState: true, source: null, licence: null, sourceDate: null };
    expect(detailOutcomeIssues(item, ctx, origin)).toEqual([]);
  });
  test("visible record must show a source", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, source: null }, ctx, origin))).toContain("detail-source");
  });
  test("visible record must show an open licence", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, licence: "closed" }, ctx, origin))).toContain("detail-licence");
  });
  test("visible record must show a date", () => {
    expect(codes(detailOutcomeIssues({ ...validDetail, sourceDate: null }, ctx, origin))).toContain("detail-date");
  });
  test("help detail uses the same provenance gate", () => {
    const item: DetailOutcome = {
      ...validDetail, parentRoute: "/help", href: "/help/guide-1",
      requestedId: "guide-1", path: "/help/guide-1",
    };
    expect(detailOutcomeIssues(item, { ...ctx, route: "/help/:id" }, origin)).toEqual([]);
  });
  test("known name does not upgrade UNKNOWN accessibility", () => {
    expect(validDetail.accessibility).toBe("UNKNOWN");
    expect(detailOutcomeIssues(validDetail, ctx, origin)).toEqual([]);
  });
});

test.describe("P20I search completion", () => {
  test("completed search with zero results is valid", () => expect(searchOutcomeIssues(search, ctx)).toEqual([]));
  test("submitted search with matches is valid", () => expect(searchOutcomeIssues({ ...search, resultCount: 2, nextStatus: "2 results" }, ctx)).toEqual([]));
  test("wrong search route fails", () => expect(codes(searchOutcomeIssues({ ...search, route: "/other" }, ctx))).toContain("search-route"));
  test("enabled search requires submit", () => expect(codes(searchOutcomeIssues({ ...search, submitted: false }, ctx))).toContain("search-submit"));
  test("blank submitted query fails", () => expect(codes(searchOutcomeIssues({ ...search, query: "" }, ctx))).toContain("search-query"));
  test("pending search is not counted as complete", () => expect(codes(searchOutcomeIssues({ ...search, pending: true }, ctx))).toContain("search-pending"));
  test("missing status fails", () => expect(codes(searchOutcomeIssues({ ...search, nextStatus: "" }, ctx))).toContain("search-status"));
  test("stale status fails", () => expect(codes(searchOutcomeIssues({ ...search, nextStatus: search.priorStatus }, ctx))).toContain("search-stale-status"));
  test("negative result count fails", () => expect(codes(searchOutcomeIssues({ ...search, resultCount: -1 }, ctx))).toContain("search-count"));
  test("fractional result count fails", () => expect(codes(searchOutcomeIssues({ ...search, resultCount: 2.5 }, ctx))).toContain("search-count"));
  test("error must be announced", () => expect(codes(searchOutcomeIssues({ ...search, error: "Unavailable" }, ctx))).toContain("search-error-announcement"));
  test("announced error passes", () => {
    expect(searchOutcomeIssues({ ...search, error: "Unavailable", nextStatus: "Unavailable" }, ctx)).toEqual([]);
  });
  test("disabled form is not required to submit", () => {
    expect(searchOutcomeIssues({ ...search, enabled: false, submitted: false }, ctx)).toEqual([]);
  });
  test("unknown status does not imply count", () => expect(resultStatusFromText("Waiting", "en")).toBe("UNKNOWN"));
  test("English singular result is counted", () => expect(resultStatusFromText("1 result", "en")).toBe("COUNT"));
  test("English plural result is counted", () => expect(resultStatusFromText("2 results", "en")).toBe("COUNT"));
  test("French singular result is counted", () => expect(resultStatusFromText("1 résultat", "fr")).toBe("COUNT"));
  test("French plural result is counted", () => expect(resultStatusFromText("2 résultats", "fr")).toBe("COUNT"));
  test("English loading is pending", () => expect(resultStatusFromText("Loading", "en")).toBe("PENDING"));
  test("French loading is pending", () => expect(resultStatusFromText("Chargement", "fr")).toBe("PENDING"));
  test("English unavailable is an error", () => expect(resultStatusFromText("Unavailable", "en")).toBe("ERROR"));
  test("French unavailable is an error", () => expect(resultStatusFromText("Indisponible", "fr")).toBe("ERROR"));
});

test.describe("P20I offline and cache correctness", () => {
  test("dated offline state passes", () => expect(offlineOutcomeIssues(offline, ctx)).toEqual([]));
  test("wrong requested offline route fails", () => expect(codes(offlineOutcomeIssues({ ...offline, requestedRoute: "/help" }, ctx))).toContain("offline-route"));
  test("offline locale must be preserved", () => expect(codes(offlineOutcomeIssues({ ...offline, locale: "fr" }, ctx))).toContain("offline-locale"));
  test("missing document and known network failure is reported honestly", () => {
    expect(offlineOutcomeIssues({ ...offline, documentLoaded: false, networkFailure: true }, ctx)).toEqual([]);
  });
  test("missing document without network failure fails", () => {
    expect(codes(offlineOutcomeIssues({ ...offline, documentLoaded: false, networkFailure: false }, ctx))).toContain("offline-unexplained");
  });
  test("missing offline main fails", () => expect(codes(offlineOutcomeIssues({ ...offline, mainCount: 0 }, ctx))).toContain("offline-main"));
  test("duplicate offline main fails", () => expect(codes(offlineOutcomeIssues({ ...offline, mainCount: 2 }, ctx))).toContain("offline-main"));
  test("missing offline title fails", () => expect(codes(offlineOutcomeIssues({ ...offline, title: "" }, ctx))).toContain("offline-title"));
  test("missing offline explanation fails", () => expect(codes(offlineOutcomeIssues({ ...offline, message: "" }, ctx))).toContain("offline-message"));
  test("cached data cannot be described as current", () => expect(codes(offlineOutcomeIssues({ ...offline, claimedCurrent: true }, ctx))).toContain("offline-freshness"));
  test("cached content needs its retrieval date", () => expect(codes(offlineOutcomeIssues({ ...offline, cacheDate: null }, ctx))).toContain("offline-cache-date"));
  test("invalid cache date fails", () => expect(codes(offlineOutcomeIssues({ ...offline, cacheDate: "yesterday" }, ctx))).toContain("offline-cache-date"));
  test("no cached content need not have a date", () => {
    expect(offlineOutcomeIssues({ ...offline, hadCachedContent: false, cacheDate: null }, ctx)).toEqual([]);
  });
});

test.describe("P20I navigation and language continuity", () => {
  test("normal browser back passes", () => expect(historyOutcomeIssues(history, ctx)).toEqual([]));
  test("navigation to same URL fails", () => expect(codes(historyOutcomeIssues({ ...history, after: history.before }, ctx))).toContain("navigation-noop"));
  test("failed browser back fails", () => expect(codes(historyOutcomeIssues({ ...history, back: "/" }, ctx))).toContain("navigation-back"));
  test("language unexpectedly changing fails", () => expect(codes(historyOutcomeIssues({ ...history, langAfter: "fr" }, ctx))).toContain("navigation-language"));
  test("lost focus after back fails", () => expect(codes(historyOutcomeIssues({ ...history, focusReturned: false }, ctx))).toContain("navigation-focus"));
  test("navigation error fails", () => expect(codes(historyOutcomeIssues({ ...history, navigationSucceeded: false }, ctx))).toContain("navigation-result"));
  test("selected French remains after reload", () => expect(preferenceOutcomeIssues(preference, ctx)).toEqual([]));
  test("lost saved language fails", () => expect(codes(preferenceOutcomeIssues({ ...preference, reloadedLanguage: "en" }, ctx))).toContain("language-persistence"));
  test("lost in-memory language fails", () => expect(codes(preferenceOutcomeIssues({ ...preference, storageEnabled: false, reloadedLanguage: "en" }, ctx))).toContain("language-session"));
  test("reload route drift fails", () => expect(codes(preferenceOutcomeIssues({ ...preference, reloadedPath: "/" }, ctx))).toContain("language-route"));
  test("missing route inventory entry fails", () => expect(codes(routeIdentityIssues(["/", "/help"], ["/", "/help", "/places"], ctx))).toContain("missing-route"));
  test("unexpected route inventory entry fails", () => expect(codes(routeIdentityIssues(["/", "/extra"], ["/"], ctx))).toContain("unexpected-route"));
  test("duplicate route inventory entry fails", () => expect(codes(routeIdentityIssues(["/", "/"], ["/"], ctx))).toContain("duplicate-route"));
  test("complete route inventory passes", () => expect(routeIdentityIssues(["/", "/help"], ["/", "/help"], ctx)).toEqual([]));
  test("unsafe certainty claim is detected", () => expect(containsUnfoundedClaim("Always accessible")).toBe(true));
  test("uncertainty statement is permitted", () => expect(containsUnfoundedClaim("Accessibility is Unknown")).toBe(false));
});
