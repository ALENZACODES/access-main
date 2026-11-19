import { expect, test } from "@playwright/test";
import {
  classifyDestination, collapseNavigationText, focusOrderIssues, frameIssues,
  landmarkIssues, linkIssues, missingNavigationMatrixCells, navigationLanguage,
  navigationMatrix, routeFromHref, skipLinkIssues, summarizeNavigationIssues,
  transitionIssues, type FocusObservation, type LinkObservation,
  type NavigationFrame, type NavigationTransition, type SkipLinkObservation,
} from "./p20y-navigation";

const link = (changes: Partial<LinkObservation> = {}): LinkObservation => ({
  id: "places", href: "/places", accessibleName: "Places", visible: true,
  disabled: false, opensNewWindow: false, windowWarning: null,
  declaredLanguage: null, ...changes,
});

const focus = (changes: Partial<FocusObservation> = {}): FocusObservation => ({
  id: "find", role: "button", name: "Find", visible: true,
  disabled: false, withinDialog: false, withinInertRegion: false,
  order: 0, ...changes,
});

const frame = (changes: Partial<NavigationFrame> = {}): NavigationFrame => ({
  route: "/places", language: "en", documentTitle: "Places",
  mainCount: 1, firstHeadings: ["Places"], activeId: "find",
  focusedRole: "button", links: [link()], regions: [
    { id: "main", role: "main", visible: true, focusable: true },
  ], focusables: [focus()], ...changes,
});

const skip = (changes: Partial<SkipLinkObservation> = {}): SkipLinkObservation => ({
  sourceId: "skip", href: "#main", targetId: "main", destinationCount: 1,
  targetFocusable: true, activeAfterActivation: "main", visibleOnFocus: true,
  ...changes,
});

const transition = (changes: Partial<NavigationTransition> = {}): NavigationTransition => ({
  cause: "link", before: frame({ route: "/" }), after: frame(),
  expectedRoute: "/places", expectedLanguage: "en",
  shouldChangeRoute: true, shouldRestoreFocus: true,
  expectedFocusId: "find", ...changes,
});

const codes = (items: readonly { code: string }[]): string[] => items.map((item) => item.code);

for (const [href, expected] of [
  ["/places", "internal"], ["./article", "internal"], ["../home", "internal"],
  ["#main", "fragment"], ["#", "unknown"], ["", "unknown"],
  ["https://example.test/path", "external"], ["http://example.test", "external"],
  ["//example.test", "external"], ["tel:+14165551234", "telephone"],
  ["mailto:help@example.test", "email"], ["javascript:alert(1)", "unsafe"],
  ["data:text/plain,abc", "unsafe"], ["blob:local", "unsafe"],
  ["file:///tmp/a", "unsafe"], ["custom:external", "unsafe"],
] as const) {
  test(`classifies destination ${href || "empty"}`, () => {
    expect(classifyDestination(href)).toBe(expected);
  });
}

test("null destination remains unknown", () => {
  expect(classifyDestination(null)).toBe("unknown");
});

test("local route resolution does not follow external links", () => {
  expect(routeFromHref("/places?filter=yes")).toBe("/places");
  expect(routeFromHref("./about")).toBe("/about");
  expect(routeFromHref("#main")).toBe("/");
  expect(routeFromHref("https://outside.test/")).toBeNull();
  expect(routeFromHref("javascript:alert(1)")).toBeNull();
});

test("link with name and internal destination passes", () => {
  expect(linkIssues([link()], "/places")).toEqual([]);
});

for (const [change, code] of [
  [{ accessibleName: "" }, "link-unnamed"],
  [{ href: null }, "link-no-destination"],
  [{ href: "javascript:doBad()" }, "link-unsafe-scheme"],
  [{ opensNewWindow: true }, "link-window-warning"],
  [{ declaredLanguage: "?" }, "link-language-invalid"],
] as const) {
  test(`link contract detects ${code}`, () => {
    expect(codes(linkIssues([link(change)], "/places"))).toContain(code);
  });
}

test("properly described new window is allowed", () => {
  expect(linkIssues([link({ opensNewWindow: true, windowWarning: "Opens in a new tab" })], "/places")).toEqual([]);
});

test("hidden and disabled links do not trigger interaction findings", () => {
  expect(linkIssues([
    link({ visible: false, href: null, accessibleName: "" }),
    link({ disabled: true, href: null, accessibleName: "" }),
  ], "/places")).toEqual([]);
});

test("duplicate visible link identifiers are detected", () => {
  const issues = linkIssues([link(), link({ href: "/help" })], "/places");
  expect(codes(issues)).toContain("link-id-duplicate");
});

test("valid landmark tree passes", () => {
  expect(landmarkIssues(frame())).toEqual([]);
});

for (const [change, code] of [
  [{ mainCount: 0 }, "main-count"],
  [{ mainCount: 2 }, "main-count"],
  [{ firstHeadings: [] }, "heading-one"],
  [{ firstHeadings: ["One", "Two"] }, "heading-one"],
  [{ documentTitle: "   " }, "document-title"],
  [{ language: "und" }, "document-language"],
] as const) {
  test(`landmark contract detects ${code}: ${JSON.stringify(change)}`, () => {
    expect(codes(landmarkIssues(frame(change)))).toContain(code);
  });
}

test("visible duplicate main roles are detected", () => {
  const changed = frame({ regions: [
    { id: "first", role: "main", visible: true, focusable: true },
    { id: "second", role: "main", visible: true, focusable: true },
  ] });
  expect(codes(landmarkIssues(changed))).toContain("main-role-duplicate");
});

test("landmark identifiers must be unique", () => {
  const changed = frame({ regions: [
    { id: "main", role: "main", visible: true, focusable: true },
    { id: "main", role: "navigation", visible: true, focusable: false },
  ] });
  expect(codes(landmarkIssues(changed))).toContain("landmark-id-duplicate");
});

test("simple keyboard sequence passes", () => {
  expect(focusOrderIssues([focus(), focus({ id: "help", order: 1, name: "Help" })], "/")).toEqual([]);
});

for (const [change, code] of [
  [{ name: "" }, "focus-unnamed"],
  [{ order: -2 }, "focus-order-invalid"],
  [{ order: 1.5 }, "focus-order-invalid"],
  [{ withinInertRegion: true }, "inert-focusable"],
] as const) {
  test(`focus audit catches ${code}`, () => {
    expect(codes(focusOrderIssues([focus(change)], "/"))).toContain(code);
  });
}

test("duplicate keyboard stops are exposed", () => {
  const changed = [focus(), focus({ id: "find", order: 0 })];
  const findings = codes(focusOrderIssues(changed, "/"));
  expect(findings).toContain("focus-order-duplicate");
  expect(findings).toContain("focus-id-duplicate");
});

test("hidden or disabled controls are outside the current keyboard order", () => {
  expect(focusOrderIssues([
    focus({ visible: false, name: "", order: -1 }),
    focus({ disabled: true, name: "", order: -1 }),
  ], "/")).toEqual([]);
});

test("functional skip link passes", () => {
  expect(skipLinkIssues([skip()], "/")).toEqual([]);
});

for (const [change, code] of [
  [{ href: "#" }, "skip-invalid-href"],
  [{ href: "/main" }, "skip-invalid-href"],
  [{ destinationCount: 0 }, "skip-destination"],
  [{ destinationCount: 2 }, "skip-destination"],
  [{ targetId: null }, "skip-target-missing"],
  [{ targetFocusable: false }, "skip-target-unfocusable"],
  [{ activeAfterActivation: null }, "skip-focus-lost"],
  [{ visibleOnFocus: false }, "skip-invisible"],
] as const) {
  test(`skip navigation rejects ${code}`, () => {
    expect(codes(skipLinkIssues([skip(change)], "/"))).toContain(code);
  });
}

test("multiple identical skip destinations create duplicate finding", () => {
  expect(codes(skipLinkIssues([skip(), skip({ sourceId: "other" })], "/")))
    .toContain("skip-duplicate");
});

test("working navigation transition passes", () => {
  expect(transitionIssues(transition())).toEqual([]);
});

for (const [change, code] of [
  [{ expectedRoute: "/help" }, "route-transition"],
  [{ expectedLanguage: "fr" }, "language-transition"],
  [{ shouldChangeRoute: false }, "route-changed-unexpectedly"],
  [{ expectedFocusId: "other" }, "focus-not-restored"],
] as const) {
  test(`transition reports ${code}`, () => {
    expect(codes(transitionIssues(transition(change)))).toContain(code);
  });
}

test("language switch must preserve route", () => {
  const event = transition({ cause: "language", before: frame({ route: "/help" }),
    after: frame({ language: "fr" }), expectedLanguage: "fr" });
  expect(codes(transitionIssues(event))).toContain("language-navigation-reset");
});

test("screen contract combines focus links and landmarks", () => {
  expect(frameIssues(frame())).toEqual([]);
  const changed = frame({ links: [link({ href: null })], firstHeadings: [] });
  expect(codes(frameIssues(changed))).toContain("link-no-destination");
  expect(codes(frameIssues(changed))).toContain("heading-one");
});

test("locale normalization is limited to supported languages", () => {
  expect(navigationLanguage("fr-CA")).toBe("fr");
  expect(navigationLanguage("en-US")).toBe("en");
  expect(navigationLanguage("und")).toBeNull();
  expect(navigationLanguage("français")).toBeNull();
  expect(collapseNavigationText("  Un\n deux   trois  ")).toBe("Un deux trois");
});

test("route matrix covers the two languages and two widths without a magic route count", () => {
  const routes = ["/", "/help", "/more/auditors"];
  expect(navigationMatrix(routes)).toHaveLength(routes.length * 2 * 2);
  expect(missingNavigationMatrixCells(routes, navigationMatrix(routes))).toEqual([]);
  expect(codes(missingNavigationMatrixCells(routes, navigationMatrix(routes).slice(1))))
    .toContain("matrix-cell-missing");
});

test("diagnostics deduplicate repeated findings and limit output", () => {
  const problems = linkIssues([link({ href: null }), link({ id: "help", href: "" })], "/");
  const message = summarizeNavigationIssues([...problems, ...problems], 1);
  expect(message).toContain("link-no-destination");
  expect(message).toContain("more findings");
});

test("invalid report size is rejected", () => {
  expect(() => summarizeNavigationIssues([], 0)).toThrow();
});
