import { expect, test } from "@playwright/test";
import {
  auditMatrix, fairRouteSample, formatRouteFindings, hasCompleteLocaleCoverage,
  inventoryFindings, matrixFindings, matrixKey, navigationFindings,
  noDuplicateTargets, normalizedRoute, partitionMatrix, requiredAuditRoutes,
  routeLocale, summaryByPrefix, transitionFindings,
  type MatrixCell, type NavigationObservation, type RouteFinding,
} from "./p20w-route-coverage";

const ROUTES = ["/", "/about", "/help", "/places", "/finders", "/journey", "/more/housing", "/more/diary", "/more/auditors"];
const observation = (changes: Partial<NavigationObservation> = {}): NavigationObservation => ({
  route: "/places", requested: "en", actual: "en-CA", heading: "Places",
  mainRegions: 1, available: true, loadError: null, ...changes,
});
const codes = (results: readonly RouteFinding[]) => results.map((entry) => entry.code);

test.describe("P20W route inventory", () => {
  test("required paths include the core tools", () => {
    expect(requiredAuditRoutes()).toContain("/");
    expect(requiredAuditRoutes()).toContain("/more/housing");
    expect(requiredAuditRoutes()).toContain("/more/diary");
    expect(requiredAuditRoutes()).toContain("/more/auditors");
  });
  test("the expected inventory passes without any numeric count contract", () => {
    expect(inventoryFindings(ROUTES)).toEqual([]);
    expect(inventoryFindings([...ROUTES, "/new-page"])).toEqual([]);
  });
  test("an empty inventory is not silently accepted", () => {
    expect(codes(inventoryFindings([], []))).toEqual(["inventory-empty"]);
  });
  test("required paths cannot be removed", () => {
    expect(codes(inventoryFindings(ROUTES.filter((route) => route !== "/places")))).toContain("route-missing");
  });
  test("multiple missing paths report separately", () => {
    const issues = inventoryFindings(["/"], ["/", "/help", "/places"]);
    expect(issues.filter((issue) => issue.code === "route-missing")).toHaveLength(2);
  });
  test("a repeated literal path produces a duplicate finding", () => {
    expect(codes(inventoryFindings(["/", "/"], ["/"]))).toContain("route-duplicate");
  });
  test("canonical trailing slash collisions are not overlooked", () => {
    const issues = inventoryFindings(["/places", "/places/"], ["/places"]);
    expect(codes(issues)).toContain("route-noncanonical");
    expect(codes(issues)).toContain("route-duplicate");
  });
  for (const route of ["/", "/help", "/settings/access", "/more/diary", "/a-b/c_d", "/a%20b"]) {
    test(`accepts static route ${route}`, () => {
      expect(normalizedRoute(route)).toBe(route);
    });
  }
  for (const route of ["", "relative", "//elsewhere", "/a?b=1", "/a#fragment", "/../a", "/a/./b", "/a\\b", "/place/:id", "/a/*", "/a\n"] ) {
    test(`rejects non-static route ${JSON.stringify(route)}`, () => {
      expect(normalizedRoute(route)).toBeNull();
      expect(codes(inventoryFindings([route], []))).toContain("route-invalid");
    });
  }
  test("root route does not lose its only slash", () => {
    expect(normalizedRoute("/")).toBe("/");
  });
  test("a non-root trailing slash is normalized for comparison", () => {
    expect(normalizedRoute("/help/")).toBe("/help");
  });
});

test.describe("P20W locale and viewport matrix", () => {
  test("each route generates both languages and both widths", () => {
    const matrix = auditMatrix(["/", "/places"]);
    expect(matrix).toHaveLength(8);
    expect(matrixKey(matrix[0]!)).toBe("/|en|320");
    expect(matrixKey(matrix[7]!)).toBe("/places|fr|1280");
  });
  test("matrix generation preserves future routes", () => {
    const matrix = auditMatrix([...ROUTES, "/next"]);
    expect(matrix.map(matrixKey)).toContain("/next|fr|1280");
  });
  test("complete identity-based matrix has no gaps", () => {
    const expected = auditMatrix(ROUTES);
    expect(matrixFindings(expected, expected)).toEqual([]);
    expect(hasCompleteLocaleCoverage(expected, ROUTES)).toBe(true);
    expect(noDuplicateTargets(expected)).toBe(true);
  });
  test("missing matrix cell is identified by full identity", () => {
    const expected = auditMatrix(["/places"]);
    const actual = expected.slice(1);
    expect(codes(matrixFindings(expected, actual))).toEqual(["matrix-missing"]);
    expect(hasCompleteLocaleCoverage(actual, ["/places"])).toBe(false);
  });
  test("an extra locale-width cell is not a valid replacement", () => {
    const expected = auditMatrix(["/places"]);
    const extra: MatrixCell = { route: "/another", locale: "en", width: 320 };
    expect(codes(matrixFindings(expected, [...expected, extra]))).toContain("matrix-unexpected");
  });
  test("a duplicated schedule entry does not add coverage", () => {
    const expected = auditMatrix(["/places"]);
    expect(codes(matrixFindings(expected, [...expected, expected[0]!]))).toContain("matrix-duplicate");
    expect(noDuplicateTargets([...expected, expected[0]!])).toBe(false);
  });
  test("different widths are not treated as duplicates", () => {
    const matrix = auditMatrix(["/places"]);
    expect(new Set(matrix.map(matrixKey)).size).toBe(4);
  });
  test("partition preserves route coverage in both languages", () => {
    const matrix = auditMatrix(ROUTES);
    const groups = partitionMatrix(matrix);
    expect(groups.en).toHaveLength(ROUTES.length * 2);
    expect(groups.fr).toHaveLength(ROUTES.length * 2);
    expect(groups.fr.every((cell) => cell.locale === "fr")).toBe(true);
  });
  test("an empty route list yields no scheduled work", () => {
    expect(auditMatrix([])).toEqual([]);
    expect(matrixFindings([], [])).toEqual([]);
  });
});

test.describe("P20W navigation observations", () => {
  test("English and regional English agree", () => {
    expect(routeLocale("en")).toBe("en");
    expect(routeLocale("en-CA")).toBe("en");
    expect(navigationFindings(observation())).toEqual([]);
  });
  test("French and regional French agree", () => {
    expect(routeLocale("fr-CA")).toBe("fr");
    expect(navigationFindings(observation({ requested: "fr", actual: "fr-CA" }))).toEqual([]);
  });
  for (const invalid of ["", "und", "de", "français", "en-", "fr-@", "EN_XX"]) {
    test(`unsupported locale is not silently coerced: ${JSON.stringify(invalid)}`, () => {
      expect(routeLocale(invalid)).toBeNull();
    });
  }
  test("a response in the wrong language is a finding", () => {
    expect(codes(navigationFindings(observation({ requested: "fr" })))).toContain("route-language");
  });
  test("navigation failure is not converted to route success", () => {
    expect(codes(navigationFindings(observation({ available: false })))).toContain("route-unavailable");
  });
  test("load errors and unavailable states can coexist", () => {
    const issues = navigationFindings(observation({ available: false, loadError: "Network unreachable" }));
    expect(codes(issues)).toContain("route-unavailable");
    expect(codes(issues)).toContain("route-load-error");
  });
  test("missing first-level heading is reported", () => {
    expect(codes(navigationFindings(observation({ heading: " " })))).toContain("route-heading");
  });
  for (const count of [0, 2, 3]) {
    test(`rejects ${count} main regions`, () => {
      expect(codes(navigationFindings(observation({ mainRegions: count })))).toContain("route-main");
    });
  }
  test("missing document language stays UNKNOWN", () => {
    const problems = navigationFindings(observation({ actual: "" }));
    expect(problems.find((entry) => entry.code === "route-language")?.detail).toContain("UNKNOWN");
  });
  test("a user language transition completes after the requested change", () => {
    const before = observation();
    const after = observation({ requested: "fr", actual: "fr-CA", heading: "Lieux" });
    expect(transitionFindings({ route: "/places", before, after, expected: "fr", navigationChanged: true })).toEqual([]);
  });
  test("transition requires a change in requested language", () => {
    const same = observation();
    expect(codes(transitionFindings({ route: "/places", before: same, after: same, expected: "en", navigationChanged: false })))
      .toEqual(expect.arrayContaining(["transition-no-change", "transition-not-applied"]));
  });
  test("transition fails on mismatched route identity", () => {
    const before = observation({ route: "/finders" });
    const after = observation({ requested: "fr", actual: "fr" });
    expect(codes(transitionFindings({ route: "/places", before, after, expected: "fr", navigationChanged: true })))
      .toContain("transition-route");
  });
});

test.describe("P20W diagnostics and summary", () => {
  test("reports one line for duplicate diagnostic objects", () => {
    const issue = { code: "example", route: "/places", detail: "Visible item" };
    expect(formatRouteFindings([issue, issue]).split("\n")).toHaveLength(1);
  });
  test("truncation reports remaining findings", () => {
    const issues = Array.from({ length: 7 }, (_, index) => ({ code: "x", route: "/", detail: String(index) }));
    expect(formatRouteFindings(issues, 3)).toContain("4 additional findings");
  });
  test("invalid report limits are not accepted", () => {
    expect(() => formatRouteFindings([], 0)).toThrow();
    expect(() => formatRouteFindings([], -1)).toThrow();
  });
  test("prefix summary does not confuse root with nested paths", () => {
    const summary = summaryByPrefix(["/", "/places", "/more/housing", "/more/diary"]);
    expect(summary.home).toBe(1);
    expect(summary.more).toBe(2);
    expect(summary.places).toBe(1);
  });
  test("smaller inventories can all be included", () => {
    expect(fairRouteSample(ROUTES, ROUTES.length + 1)).toEqual(ROUTES);
  });
  test("a route sample must use a positive integer maximum", () => {
    expect(() => fairRouteSample(ROUTES, 0)).toThrow();
    expect(() => fairRouteSample(ROUTES, 2.5)).toThrow();
  });
  test("sampling preserves a first and last path", () => {
    const sample = fairRouteSample(ROUTES, 4);
    expect(sample[0]).toBe(ROUTES[0]);
    expect(sample[sample.length - 1]).toBe(ROUTES[ROUTES.length - 1]);
  });
});
