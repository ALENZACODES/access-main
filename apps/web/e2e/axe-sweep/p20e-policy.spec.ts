import { expect, test } from "@playwright/test";
import {
  canonicalRoute, documentProblems, evidenceProblems, focusProblems, formProblems,
  formatProblems, intersects, isDay, isLocalRoute, joinKnowledge, knowledge,
  linkProblems, liveProblems, localeRouteKey, mediaProblems, normalizeLocale,
  offlineProblems, overlappingTargets, resourceProblems, routeLocale, routeParityProblems,
  safeStatus, targetProblems,
  type AuditContext, type DocumentMetadata, type FocusFrame, type FormControl,
  type Interactive, type LiveRegion, type MediaNode, type NavigationLink,
  type NetworkResource, type OfflineState, type Rect, type StatusRecord,
} from "./p20e-policy";
const BASE = "http://127.0.0.1:4173";
const CTX: AuditContext = { page: `${BASE}/en/places`, locale: "en" };
const RECT: Rect = { x: 10, y: 10, width: 48, height: 48 };
function status(overrides: Partial<StatusRecord> = {}): StatusRecord {
  return {
    id: "fixture", status: "PASS", source: "fixture-open-dataset",
    licence: "CC0-1.0", observedAt: "2026-11-01", expiresAt: null,
    collectedAt: "2026-11-02", text: "Entry observation", ...overrides,
  };
}
function control(overrides: Partial<Interactive> = {}): Interactive {
  return {
    key: "#control", role: "button", name: "Search", tag: "button", href: null,
    disabled: false, hidden: false, rect: RECT, fontSize: 16,
    lineHeight: 24, outlineStyle: "solid", outlineWidth: 2,
    touchAction: "auto", position: "static", zIndex: 0,
    hasClickHandler: false, tabIndex: 0, ...overrides,
  };
}
function doc(overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return {
    url: CTX.page, lang: "en-CA", title: "Places — the App", direction: "ltr",
    headings: [{ level: 1, text: "Places", hidden: false }], mainCount: 1,
    landmarks: [{ role: "main", name: "Places" }], viewportWidth: 320,
    documentWidth: 320, horizontalOverflow: 0, bodyScrollLocked: false,
    viewportMeta: "width=device-width, initial-scale=1", ...overrides,
  };
}
function field(overrides: Partial<FormControl> = {}): FormControl {
  return {
    id: "#search", type: "search", role: "input", name: "query", label: "Search",
    required: false, invalid: false, disabled: false, visible: true,
    description: "", errorId: null, value: "", autocomplete: "off", ...overrides,
  };
}
function media(overrides: Partial<MediaNode> = {}): MediaNode {
  return {
    id: "#visual", kind: "img", alt: "Entrance diagram", role: "img",
    ariaLabel: null, describedBy: null, hasCaptions: false,
    hasTranscript: false, isDecorative: false, hidden: false, ...overrides,
  };
}
function region(overrides: Partial<LiveRegion> = {}): LiveRegion {
  return {
    id: "#notice", role: "status", live: "polite", atomic: "true",
    relevant: "additions text", text: "Results updated", hidden: false, ...overrides,
  };
}
function focus(overrides: Partial<FocusFrame> = {}): FocusFrame {
  return {
    id: "#search", name: "Search", tag: "button", rect: RECT,
    viewport: { x: 0, y: 0, width: 320, height: 640 },
    outlineStyle: "solid", outlineWidth: 2, ringColor: "rgb(0,0,0)",
    isVisible: true, ariaHidden: false, inert: false, disabled: false,
    ...overrides,
  };
}
function link(overrides: Partial<NavigationLink> = {}): NavigationLink {
  return {
    id: "#places", href: `${BASE}/en/places`, text: "Places", lang: null,
    hreflang: "en", current: "page", hidden: false, ...overrides,
  };
}
function offline(overrides: Partial<OfflineState> = {}): OfflineState {
  return {
    url: CTX.page, locale: "en", title: "Offline — the App", lang: "en",
    mainText: "Saved places remain available while offline.", links: [],
    statuses: [status()], serviceWorkerControlled: true, storageKeys: [], ...overrides,
  };
}
function rules(result: readonly { rule: string }[]): string[] {
  return result.map((item) => item.rule);
}
test.describe("P20E policy: status and provenance", () => {
  test("all three knowledge values remain distinct", () => {
    expect(knowledge("PASS")).toBe("PASS");
    expect(knowledge("BLOCKED")).toBe("BLOCKED");
    expect(knowledge("UNKNOWN")).toBe("UNKNOWN");
  });
  test("missing and human-language claims are not inferred", () => {
    for (const value of [null, undefined, "", "yes", "accessible", "true", "PASS ", "pass"]) {
      expect(knowledge(value)).toBe("UNKNOWN");
    }
  });
  test("empty evidence sets remain unknown", () => {
    expect(joinKnowledge([])).toBe("UNKNOWN");
  });
  test("unknown in a positive set remains unknown", () => {
    expect(joinKnowledge(["PASS", "UNKNOWN"])).toBe("UNKNOWN");
    expect(joinKnowledge(["UNKNOWN", "PASS", "PASS"])).toBe("UNKNOWN");
  });
  test("documented barriers take priority", () => {
    expect(joinKnowledge(["PASS", "BLOCKED"])).toBe("BLOCKED");
    expect(joinKnowledge(["UNKNOWN", "BLOCKED"])).toBe("BLOCKED");
  });
  test("complete positive observations can return pass", () => {
    expect(joinKnowledge(["PASS", "PASS", "PASS"])).toBe("PASS");
  });
  test("open-licence source and date preserve a supported observation", () => {
    expect(safeStatus(status(), "2026-11-15")).toBe("PASS");
  });
  test("a supported barrier remains a barrier", () => {
    expect(safeStatus(status({ status: "BLOCKED" }), "2026-11-15")).toBe("BLOCKED");
  });
  test("unknown stays unknown even with provenance", () => {
    expect(safeStatus(status({ status: "UNKNOWN" }), "2026-11-15")).toBe("UNKNOWN");
  });
  test("missing sources cannot support positive claims", () => {
    for (const source of [null, "", "   "]) {
      expect(safeStatus(status({ source }), "2026-11-15")).toBe("UNKNOWN");
      expect(rules(evidenceProblems([status({ source })], CTX, "2026-11-15"))).toContain("evidence-provenance");
    }
  });
  test("closed licences cannot support observations", () => {
    for (const licence of [null, "", "all-rights-reserved", "custom-private", "CC-BY-NC-4.0"]) {
      expect(safeStatus(status({ licence }), "2026-11-15")).toBe("UNKNOWN");
    }
  });
  test("valid open licences are accepted without silently swapping identifiers", () => {
    for (const licence of ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-Ontario-1.0", "OGL-Ontario-2.0"]) {
      expect(safeStatus(status({ licence }), "2026-11-15")).toBe("PASS");
    }
  });
  test("invalid days do not support evidence", () => {
    for (const observedAt of [null, "", "2026-02-29", "2026-11-31", "2026-13-01", "yesterday", "2026-1-01"]) {
      expect(safeStatus(status({ observedAt }), "2026-11-15")).toBe("UNKNOWN");
    }
  });
  test("leap years follow Gregorian rules", () => {
    expect(isDay("2024-02-29")).toBe(true);
    expect(isDay("2000-02-29")).toBe(true);
    expect(isDay("1900-02-29")).toBe(false);
    expect(isDay("2100-02-29")).toBe(false);
  });
  test("out-of-range calendar values fail", () => {
    for (const value of ["0000-01-01", "2026-00-10", "2026-13-01", "2026-04-31", "2026-01-00", "2026-01-32"]) {
      expect(isDay(value)).toBe(false);
    }
  });
  test("future observations remain unknown", () => {
    expect(safeStatus(status({ observedAt: "2026-12-01" }), "2026-11-15")).toBe("UNKNOWN");
  });
  test("expiry is inclusive and becomes unknown the following day", () => {
    const value = status({ expiresAt: "2026-11-15" });
    expect(safeStatus(value, "2026-11-15")).toBe("PASS");
    expect(safeStatus(value, "2026-11-16")).toBe("UNKNOWN");
  });
  test("expiration predating observation cannot support a claim", () => {
    expect(safeStatus(status({ expiresAt: "2026-10-31" }), "2026-11-15")).toBe("UNKNOWN");
  });
  test("unrecognized state words are reported", () => {
    expect(rules(evidenceProblems([status({ status: "yes" })], CTX, "2026-11-15"))).toEqual(expect.arrayContaining(["evidence-enum", "evidence-status"]));
  });
  test("collection dates must be valid and chronologically plausible", () => {
    expect(rules(evidenceProblems([status({ collectedAt: "2026-02-30" })], CTX, "2026-11-15"))).toContain("evidence-collected");
    expect(rules(evidenceProblems([status({ collectedAt: "2026-10-01" })], CTX, "2026-11-15"))).toContain("evidence-chronology");
  });
  test("unknown observations cannot be advertised as unconditional access", () => {
    expect(rules(evidenceProblems([status({ status: "UNKNOWN", text: "Step-free entrance" })], CTX, "2026-11-15"))).toContain("evidence-unknown-copy");
  });
  test("unknown copy with neutral language does not trigger", () => {
    expect(evidenceProblems([status({ status: "UNKNOWN", text: "Entrance details unavailable" })], CTX, "2026-11-15")).toEqual([]);
  });
});
test.describe("P20E policy: interactive targets", () => {
  test("a 44×44 target meets the floor", () => {
    expect(targetProblems([control({ rect: { ...RECT, width: 44, height: 44 } })], CTX)).toEqual([]);
  });
  test("one short dimension fails", () => {
    expect(rules(targetProblems([control({ rect: { ...RECT, width: 43 } })], CTX))).toContain("control-size");
    expect(rules(targetProblems([control({ rect: { ...RECT, height: 43 } })], CTX))).toContain("control-size");
  });
  test("zero-area controls fail", () => {
    expect(rules(targetProblems([control({ rect: { ...RECT, width: 0 } })], CTX))).toContain("control-size");
  });
  test("a visible unnamed button fails", () => {
    expect(rules(targetProblems([control({ name: "" })], CTX))).toContain("control-name");
  });
  test("disabled and hidden targets are not treated as available", () => {
    expect(targetProblems([control({ hidden: true, name: "", rect: { ...RECT, width: 0 } })], CTX)).toEqual([]);
    expect(targetProblems([control({ disabled: true, name: "", rect: { ...RECT, width: 0 } })], CTX)).toEqual([]);
  });
  test("an unreachable custom control fails keyboard audit", () => {
    expect(rules(targetProblems([control({ tag: "div", hasClickHandler: true, tabIndex: -1 })], CTX))).toContain("control-keyboard");
  });
  test("small interactive text is reported", () => {
    expect(rules(targetProblems([control({ fontSize: 11 })], CTX))).toContain("control-text-size");
  });
  test("rectangles with shared boundary do not overlap", () => {
    expect(intersects(RECT, { ...RECT, x: RECT.x + RECT.width })).toBe(false);
  });
  test("rectangles with overlapping area intersect", () => {
    expect(intersects(RECT, { ...RECT, x: 20 })).toBe(true);
  });
  test("large overlaps of separate controls are reported", () => {
    expect(rules(overlappingTargets([control(), control({ key: "#other", rect: { ...RECT, x: 12 } })], CTX))).toContain("control-overlap");
  });
  test("small boundary overlap is ignored", () => {
    expect(overlappingTargets([control(), control({ key: "#other", rect: { ...RECT, x: 55 } })], CTX)).toEqual([]);
  });
  test("hidden overlays are excluded from target comparison", () => {
    expect(overlappingTargets([control(), control({ key: "#hidden", hidden: true })], CTX)).toEqual([]);
  });
});
test.describe("P20E policy: document and reflow", () => {
  test("complete page metadata has no errors", () => {
    expect(documentProblems(doc(), CTX)).toEqual([]);
  });
  test("language mismatch fails", () => {
    expect(rules(documentProblems(doc({ lang: "fr" }), CTX))).toContain("document-language");
  });
  test("regional Canadian language codes work", () => {
    expect(normalizeLocale("fr-CA")).toBe("fr");
    expect(normalizeLocale("en-CA")).toBe("en");
    expect(normalizeLocale("de-DE")).toBeNull();
  });
  test("missing title fails", () => {
    expect(rules(documentProblems(doc({ title: " " }), CTX))).toContain("document-title");
  });
  test("zero or duplicate main landmarks fail", () => {
    for (const mainCount of [0, 2, 3]) {
      expect(rules(documentProblems(doc({ mainCount }), CTX))).toContain("main-landmark");
    }
  });
  test("zero or multiple primary headings fail", () => {
    expect(rules(documentProblems(doc({ headings: [] }), CTX))).toContain("page-heading");
    expect(rules(documentProblems(doc({ headings: [{ level: 1, text: "One", hidden: false }, { level: 1, text: "Two", hidden: false }] }), CTX))).toContain("page-heading");
  });
  test("heading hierarchy gaps fail", () => {
    expect(rules(documentProblems(doc({ headings: [
      { level: 1, text: "One", hidden: false }, { level: 3, text: "Three", hidden: false },
    ] }), CTX))).toContain("heading-order");
  });
  test("proper heading progression succeeds", () => {
    expect(documentProblems(doc({ headings: [
      { level: 1, text: "One", hidden: false }, { level: 2, text: "Two", hidden: false },
      { level: 3, text: "Three", hidden: false }, { level: 2, text: "Four", hidden: false },
    ] }), CTX)).toEqual([]);
  });
  test("horizontal reflow overflow fails at 320px", () => {
    expect(rules(documentProblems(doc({ documentWidth: 400, horizontalOverflow: 80 }), CTX))).toContain("reflow");
  });
  test("one pixel rounding error is tolerated", () => {
    expect(documentProblems(doc({ documentWidth: 321, horizontalOverflow: 1 }), CTX)).toEqual([]);
  });
  test("disabling browser zoom fails", () => {
    expect(rules(documentProblems(doc({ viewportMeta: "width=device-width, user-scalable=no" }), CTX))).toContain("viewport-zoom");
    expect(rules(documentProblems(doc({ viewportMeta: "maximum-scale=1" }), CTX))).toContain("viewport-zoom");
  });
  test("overflow with disabled scrolling fails", () => {
    expect(rules(documentProblems(doc({ documentWidth: 420, horizontalOverflow: 100, bodyScrollLocked: true }), CTX))).toContain("scroll-locked");
  });
});
test.describe("P20E policy: forms and announcements", () => {
  test("a labelled search field is accepted", () => {
    expect(formProblems([field()], CTX)).toEqual([]);
  });
  test("an unnamed visible field fails", () => {
    expect(rules(formProblems([field({ label: "" })], CTX))).toContain("form-name");
  });
  test("invalid input needs a description", () => {
    expect(rules(formProblems([field({ invalid: true })], CTX))).toContain("form-error");
  });
  test("connected invalid descriptions can pass", () => {
    expect(formProblems([field({ invalid: true, description: "Enter a location." })], CTX)).toEqual([]);
  });
  test("required controls need a field name", () => {
    expect(rules(formProblems([field({ required: true, name: "" })], CTX))).toContain("form-identity");
  });
  test("hidden controls are excluded", () => {
    expect(formProblems([field({ visible: false, label: "" })], CTX)).toEqual([]);
  });
  test("disabled controls are excluded", () => {
    expect(formProblems([field({ disabled: true, label: "" })], CTX)).toEqual([]);
  });
  test("personal data fields need autocomplete purpose", () => {
    for (const name of ["email", "tel", "name", "street-address", "postal-code"]) {
      expect(rules(formProblems([field({ name, autocomplete: null })], CTX))).toContain("form-autocomplete");
    }
  });
  test("empty status updates do not trigger", () => {
    expect(liveProblems([region({ text: "" })], CTX)).toEqual([]);
  });
  test("alerts with announcements off fail", () => {
    expect(rules(liveProblems([region({ role: "alert", live: "off" })], CTX))).toContain("alert-disabled");
  });
  test("status updates with announcements off fail", () => {
    expect(rules(liveProblems([region({ live: "off" })], CTX))).toContain("status-disabled");
  });
  test("unsupported announcement mode fails", () => {
    expect(rules(liveProblems([region({ live: "loud" })], CTX))).toContain("live-value");
  });
  test("valid polite announcements pass", () => {
    expect(liveProblems([region()], CTX)).toEqual([]);
  });
});
test.describe("P20E policy: accessible media and keyboard", () => {
  test("named meaningful images pass", () => {
    expect(mediaProblems([media()], CTX)).toEqual([]);
  });
  test("meaningful images without alternatives fail", () => {
    expect(rules(mediaProblems([media({ alt: null, ariaLabel: null, describedBy: null })], CTX))).toContain("media-name");
  });
  test("intentional decorations do not need an alternative", () => {
    expect(mediaProblems([media({ alt: "", isDecorative: true })], CTX)).toEqual([]);
  });
  test("meaningful SVG illustrations need labels", () => {
    expect(rules(mediaProblems([media({ kind: "svg", alt: null })], CTX))).toContain("media-name");
  });
  test("canvas maps need a readable alternative", () => {
    expect(rules(mediaProblems([media({ kind: "canvas", alt: null, ariaLabel: null })], CTX))).toContain("media-name");
  });
  test("video requires captions", () => {
    expect(rules(mediaProblems([media({ kind: "video", hasCaptions: false })], CTX))).toContain("video-captions");
  });
  test("audio requires a transcript reference", () => {
    expect(rules(mediaProblems([media({ kind: "audio", hasTranscript: false })], CTX))).toContain("audio-transcript");
  });
  test("a normal focus frame passes", () => {
    expect(focusProblems([focus()], CTX)).toEqual([]);
  });
  test("focus in an inert subtree fails", () => {
    expect(rules(focusProblems([focus({ inert: true })], CTX))).toContain("focus-hidden");
  });
  test("focus in aria-hidden subtree fails", () => {
    expect(rules(focusProblems([focus({ ariaHidden: true })], CTX))).toContain("focus-hidden");
  });
  test("invisible focus styling fails", () => {
    expect(rules(focusProblems([focus({ isVisible: false })], CTX))).toContain("focus-invisible");
  });
  test("offscreen focus fails", () => {
    expect(rules(focusProblems([focus({ rect: { ...RECT, x: 2000 } })], CTX))).toContain("focus-offscreen");
  });
  test("nameless focus fails", () => {
    expect(rules(focusProblems([focus({ name: "" })], CTX))).toContain("focus-name");
  });
  test("eight consecutive focus loops are reported", () => {
    expect(rules(focusProblems(Array.from({ length: 8 }, () => focus()), CTX))).toContain("focus-trap");
  });
  test("sequential focus to different nodes is accepted", () => {
    expect(focusProblems([focus(), focus({ id: "#next" })], CTX)).toEqual([]);
  });
});
test.describe("P20E policy: links, routes and network", () => {
  test("same-origin page URLs are crawlable", () => {
    expect(isLocalRoute("/en/places", BASE)).toBe(true);
    expect(canonicalRoute("/en/places#entrance", BASE)).toBe(`${BASE}/en/places`);
  });
  test("external and non-document URLs are not crawled", () => {
    for (const url of ["https://elsewhere.example/en", "javascript:alert(1)", "/feed.json", "/map.png", "/guide.pdf"]) {
      expect(isLocalRoute(url, BASE)).toBe(false);
    }
  });
  test("hash fragments do not multiply routes", () => {
    expect(canonicalRoute("/fr/places#map", BASE)).toBe(canonicalRoute("/fr/places#results", BASE));
  });
  test("query order is canonical", () => {
    expect(canonicalRoute("/en/places?b=2&a=1", BASE)).toBe(`${BASE}/en/places?a=1&b=2`);
  });
  test("language-neutral route keys correspond", () => {
    expect(localeRouteKey(`${BASE}/en/places?type=park`)).toBe(localeRouteKey(`${BASE}/fr/places?type=park`));
  });
  test("language from pathname and query are recognized", () => {
    expect(routeLocale(`${BASE}/fr/places`)).toBe("fr");
    expect(routeLocale(`${BASE}/en/places`)).toBe("en");
    expect(routeLocale(`${BASE}/places?lang=fr`)).toBe("fr");
    expect(routeLocale(`${BASE}/places`)).toBeNull();
  });
  test("paired routes have no parity problem", () => {
    expect(routeParityProblems([`${BASE}/en/places`, `${BASE}/fr/places`], CTX)).toEqual([]);
  });
  test("missing French counterpart fails", () => {
    expect(rules(routeParityProblems([`${BASE}/en/places`], CTX))).toContain("locale-parity");
  });
  test("missing English counterpart fails", () => {
    expect(rules(routeParityProblems([`${BASE}/fr/places`], CTX))).toContain("locale-parity");
  });
  test("normal links pass", () => {
    expect(linkProblems([link()], CTX, BASE)).toEqual([]);
  });
  test("unnamed links fail", () => {
    expect(rules(linkProblems([link({ text: "" })], CTX, BASE))).toContain("link-name");
  });
  test("script navigation URLs fail", () => {
    expect(rules(linkProblems([link({ href: "javascript:void(0)" })], CTX, BASE))).toContain("link-script");
  });
  test("invalid current-state annotation fails", () => {
    expect(rules(linkProblems([link({ current: "selected-ish" })], CTX, BASE))).toContain("link-current");
  });
  test("incorrect locale annotation fails", () => {
    expect(rules(linkProblems([link({ href: `${BASE}/fr/places`, hreflang: "en" })], CTX, BASE))).toContain("link-locale");
  });
  test("external map tile service fails", () => {
    const resources: NetworkResource[] = [{ url: "https://tile.openstreetmap.org/1/2/3.png", type: "image", initiator: "response", status: 200, failure: null }];
    expect(rules(resourceProblems(resources, CTX, BASE))).toContain("remote-map-service");
  });
  test("local map asset does not count as external", () => {
    const resources: NetworkResource[] = [{ url: `${BASE}/assets/map.png`, type: "image", initiator: "response", status: 200, failure: null }];
    expect(resourceProblems(resources, CTX, BASE)).toEqual([]);
  });
  test("failed documents are reported", () => {
    expect(rules(resourceProblems([{ url: `${BASE}/fr`, type: "document", initiator: "response", status: 404, failure: null }], CTX, BASE))).toContain("document-response");
  });
  test("network failures on documents are reported", () => {
    expect(rules(resourceProblems([{ url: `${BASE}/fr`, type: "document", initiator: "failure", status: null, failure: "offline" }], CTX, BASE))).toContain("document-network");
  });
});
test.describe("P20E policy: offline resilience", () => {
  test("supported offline state passes", () => {
    expect(offlineProblems(offline(), CTX)).toEqual([]);
  });
  test("offline document cannot silently change language", () => {
    expect(rules(offlineProblems(offline({ lang: "fr" }), CTX))).toContain("offline-language");
  });
  test("offline document needs a title", () => {
    expect(rules(offlineProblems(offline({ title: "" }), CTX))).toContain("offline-title");
  });
  test("offline content must remain meaningful", () => {
    expect(rules(offlineProblems(offline({ mainText: "" }), CTX))).toContain("offline-content");
  });
  test("service worker control is required", () => {
    expect(rules(offlineProblems(offline({ serviceWorkerControlled: false }), CTX))).toContain("offline-service-worker");
  });
  test("lost evidence source is reported", () => {
    expect(rules(offlineProblems(offline({ statuses: [status({ source: "" })] }), CTX))).toContain("offline-source");
  });
  test("uncertain offline data must not be presented as established access", () => {
    expect(rules(offlineProblems(offline({ statuses: [status({ status: "UNKNOWN", text: "Step-free" })] }), CTX))).toContain("offline-unknown");
  });
  test("neutral unknown offline language passes", () => {
    expect(offlineProblems(offline({ statuses: [status({ status: "UNKNOWN", text: "Information unavailable" })] }), CTX)).toEqual([]);
  });
  test("problem formatting includes rule, route and target", () => {
    const finding = targetProblems([control({ name: "" })], CTX)[0];
    expect(finding).toBeDefined();
    if (!finding) return;
    expect(formatProblems([finding])).toContain("control-name");
    expect(formatProblems([finding])).toContain("/en/places");
    expect(formatProblems([finding])).toContain("#control");
  });
  test("formatting caps displayed failures without dropping count", () => {
    const findings = Array.from({ length: 8 }, () => targetProblems([control({ name: "" })], CTX)[0]).filter((item) => item !== undefined);
    expect(formatProblems(findings, 2)).toContain("6 further problems");
  });
});
