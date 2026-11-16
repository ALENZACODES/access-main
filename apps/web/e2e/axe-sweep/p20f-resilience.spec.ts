import { expect, test } from "@playwright/test";
import {
  inspectFailureState, inspectFocusTrial, inspectNetworkTrial,
  inspectPersistence, type NetworkTrial,
} from "./p20f-resilience";

const baseline: NetworkTrial = {
  locale: "en",
  url: "http://localhost:3000/en/places",
  wasLoadedOnline: true,
  wasReadableOffline: true,
  documentLanguage: "en-CA",
  accessibleRetry: true,
  retryTargetSize: { width: 44, height: 44 },
  offlineMessage: "You are offline. Saved results may be out of date. Try again.",
  showedUnsupportedSuccess: false,
  staleLabel: true,
  routeSurvived: true,
  outboundRequests: [],
};

function codes(items: readonly { code: string }[]): string[] {
  return items.map((item) => item.code);
}

test.describe("P20F: offline degradation", () => {
  test("accepts an explanatory English fallback", () => {
    expect(inspectNetworkTrial(baseline)).toEqual([]);
  });

  test("accepts an explanatory French fallback", () => {
    expect(inspectNetworkTrial({
      ...baseline, locale: "fr", documentLanguage: "fr-CA",
      offlineMessage: "Vous êtes hors ligne. Les résultats enregistrés peuvent dater. Réessayer.",
    })).toEqual([]);
  });

  test("flags an unloaded online baseline", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, wasLoadedOnline: false }))).toEqual(["baseline"]);
  });

  test("flags missing offline content", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, wasReadableOffline: false }))).toContain("unreadable");
  });

  test("flags missing route shell", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, routeSurvived: false }))).toContain("route");
  });

  test("flags incorrect offline document language", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, documentLanguage: "fr" }))).toContain("language");
  });

  test("flags missing offline explanation", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, offlineMessage: "Error 0" }))).toContain("message");
  });

  test("flags inaccessible retry", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, accessibleRetry: false }))).toContain("retry");
  });

  test("flags undersized retry target", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, retryTargetSize: { width: 43, height: 44 } }))).toContain("retry-size");
  });

  test("flags invented positive access results", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, showedUnsupportedSuccess: true }))).toContain("unsupported-success");
  });

  test("flags missing stale-data indicator", () => {
    expect(codes(inspectNetworkTrial({ ...baseline, staleLabel: false }))).toContain("stale");
  });

  test("flags remote requests during offline fallback", () => {
    expect(codes(inspectNetworkTrial({
      ...baseline,
      outboundRequests: ["https://example.org/tiles/1/2/3.png"],
    }))).toContain("remote-request");
  });

  test("accepts same-origin offline requests", () => {
    expect(inspectNetworkTrial({
      ...baseline,
      outboundRequests: ["http://localhost:3000/service-worker.js"],
    })).toEqual([]);
  });
});

test.describe("P20F: failed requests preserve uncertainty", () => {
  test("does not infer access from a failed request", () => {
    expect(codes(inspectFailureState({
      requested: "UNKNOWN", responseOk: false, responseStatus: null,
      recordSource: null, fallback: "PASS",
    }))).toContain("failed-request-pass");
  });

  test("does not infer a barrier from failed requests", () => {
    expect(codes(inspectFailureState({
      requested: "UNKNOWN", responseOk: false, responseStatus: 503,
      recordSource: null, fallback: "BLOCKED",
    }))).toContain("failed-request-blocked");
  });

  test("permits unknown when the network fails", () => {
    expect(inspectFailureState({
      requested: "PASS", responseOk: false, responseStatus: 500,
      recordSource: null, fallback: "UNKNOWN",
    })).toEqual([]);
  });

  test("rejects positive status on server errors", () => {
    expect(codes(inspectFailureState({
      requested: "UNKNOWN", responseOk: true, responseStatus: 502,
      recordSource: null, fallback: "PASS",
    }))).toContain("server-pass");
  });

  test("permits a supported cached barrier", () => {
    expect(inspectFailureState({
      requested: "BLOCKED", responseOk: false, responseStatus: null,
      recordSource: "open dataset", fallback: "BLOCKED",
    })).toEqual([]);
  });
});

test.describe("P20F: navigation and state continuity", () => {
  test("preserves explicitly saved preferences", () => {
    expect(inspectPersistence({
      key: "language", locale: "fr", before: "fr", afterReload: "fr",
      explicitSaved: true, hadWarning: false,
    })).toEqual([]);
  });

  test("flags a dropped saved preference", () => {
    expect(codes(inspectPersistence({
      key: "language", locale: "fr", before: "fr", afterReload: "en",
      explicitSaved: true, hadWarning: false,
    }))).toContain("lost-preference");
  });

  test("flags an unexplained transient state reset", () => {
    expect(codes(inspectPersistence({
      key: "filter", locale: "en", before: "on", afterReload: "off",
      explicitSaved: false, hadWarning: false,
    }))).toContain("silent-reset");
  });

  test("permits a disclosed transient state reset", () => {
    expect(inspectPersistence({
      key: "filter", locale: "en", before: "on", afterReload: "off",
      explicitSaved: false, hadWarning: true,
    })).toEqual([]);
  });

  test("rejects focus moved into a hidden region", () => {
    expect(codes(inspectFocusTrial({
      starting: "search", after: "hidden", contentChanged: true,
      focusedInHiddenTree: true, activeName: "Hidden button", announcement: "",
    }, "/en"))).toContain("hidden-focus");
  });

  test("rejects lost focus after dynamic content changes", () => {
    expect(codes(inspectFocusTrial({
      starting: "search", after: null, contentChanged: true,
      focusedInHiddenTree: false, activeName: "", announcement: "",
    }, "/en"))).toContain("lost-focus");
  });

  test("accepts an announced dynamic change", () => {
    expect(inspectFocusTrial({
      starting: "search", after: null, contentChanged: true,
      focusedInHiddenTree: false, activeName: "", announcement: "Two results",
    }, "/en")).toEqual([]);
  });

  test("rejects unnamed focus targets", () => {
    expect(codes(inspectFocusTrial({
      starting: "search", after: "button", contentChanged: true,
      focusedInHiddenTree: false, activeName: "", announcement: "",
    }, "/en"))).toContain("unnamed-focus");
  });
});
