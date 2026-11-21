import { expect, test } from "@playwright/test";
import {
  normalizedRoute, inventoryFindings, auditMatrix, matrixFindings,
  matrixKey, routeLocale, fairRouteSample, requiredAuditRoutes,
  formatRouteFindings,
} from "./p20w-route-coverage";

const codes = (items: readonly { code: string }[]) => items.map((item) => item.code);

// Regression: character-code inspection avoids a control-range regex literal.
for (const code of [0, 1, 2, 7, 9, 10, 13, 27, 30, 31]) {
  test(`rejects the control character at position one (${code})`, () => {
    expect(normalizedRoute(`/a${String.fromCharCode(code)}b`)).toBeNull();
  });
  test(`rejects the control character at the end (${code})`, () => {
    expect(normalizedRoute(`/places${String.fromCharCode(code)}`)).toBeNull();
  });
}

test("a valid route survives character-by-character inspection", () => {
  expect(normalizedRoute("/more/auditors")).toBe("/more/auditors");
  expect(normalizedRoute("/more/housing")).toBe("/more/housing");
  expect(normalizedRoute("/help")).toBe("/help");
});

test("question mark, fragment, backslash and unsafe path segments are rejected", () => {
  expect(normalizedRoute("/help?name=1")).toBeNull();
  expect(normalizedRoute("/help#topic")).toBeNull();
  expect(normalizedRoute("/help\\topic")).toBeNull();
  expect(normalizedRoute("/a/../help")).toBeNull();
  expect(normalizedRoute("/a/./help")).toBeNull();
  expect(normalizedRoute("//other.test/path")).toBeNull();
});

test("canonical trailing slash is diagnosed, not erased silently", () => {
  expect(normalizedRoute("/places/")).toBe("/places");
  expect(codes(inventoryFindings(["/places/"], ["/places"]))).toContain("route-noncanonical");
});

test("route inventory does not pin a route count", () => {
  const inventory = [...requiredAuditRoutes(), "/new-feature"];
  expect(inventoryFindings(inventory, requiredAuditRoutes())).toEqual([]);
});

test("a duplicate route fails even with equivalent slash spelling", () => {
  const findings = inventoryFindings(["/places", "/places/"], []);
  expect(codes(findings)).toContain("route-duplicate");
});

test("matrix has four cells per route", () => {
  const routes = ["/", "/places", "/more/diary"];
  const matrix = auditMatrix(routes);
  expect(matrix).toHaveLength(12);
  expect(matrixFindings(matrix, matrix)).toEqual([]);
  expect(codes(matrixFindings(matrix, matrix.slice(1)))).toContain("matrix-missing");
});

test("matrix keys distinguish language and viewport", () => {
  const cells = auditMatrix(["/help"]);
  expect(new Set(cells.map(matrixKey)).size).toBe(4);
});

test("locale parsing is limited to supported language tags", () => {
  expect(routeLocale("fr-CA")).toBe("fr");
  expect(routeLocale("en-US")).toBe("en");
  expect(routeLocale("und")).toBeNull();
});

test("representative sampling keeps route endpoints", () => {
  const sample = fairRouteSample(["/", "/a", "/b", "/c", "/d", "/e"], 3);
  expect(sample[0]).toBe("/");
  expect(sample[sample.length - 1]).toBe("/e");
});

test("diagnostics stay bounded without losing the finding code", () => {
  const findings = inventoryFindings(["bad", "//host", "/a#frag"], ["/help"]);
  const result = formatRouteFindings(findings, 1);
  expect(result).toContain("route-invalid");
  expect(result).toContain("additional findings");
});
