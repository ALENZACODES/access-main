import { expect, test } from "@playwright/test";
import {
  discoverRound11Routes,
  round11Routes,
  routeTag,
  findingsByCode,
  formatRound11Findings,
  ROUND11_LOCALES,
} from "./route-catalog-round11";

test("source-backed route discovery includes the home path", () => {
  expect(discoverRound11Routes()).toContain("/");
});

test("route discovery does not create parameter URLs", () => {
  for (const route of discoverRound11Routes()) {
    expect(route).toMatch(/^\//);
    expect(route).not.toContain(":");
    expect(route).not.toContain("*");
  }
});

test("route discovery does not duplicate paths", () => {
  const routes = discoverRound11Routes();
  expect(routes.length).toBe(new Set(routes).size);
});

test("overrides are validated as local paths", () => {
  const original = process.env.A11Y_ROUTES;
  try {
    process.env.A11Y_ROUTES = "/,/help,/help";
    expect(round11Routes()).toEqual(["/", "/help"]);
    process.env.A11Y_ROUTES = "https://example.org";
    expect(() => round11Routes()).toThrow();
    process.env.A11Y_ROUTES = "//example.org";
    expect(() => round11Routes()).toThrow();
    process.env.A11Y_ROUTES = "/help?view=1";
    expect(() => round11Routes()).toThrow();
    process.env.A11Y_ROUTES = "/help#section";
    expect(() => round11Routes()).toThrow();
  } finally {
    if (original === undefined) delete process.env.A11Y_ROUTES;
    else process.env.A11Y_ROUTES = original;
  }
});

test("round identifiers are deterministic for nested paths", () => {
  expect(routeTag("/")).toBe("root");
  expect(routeTag("/settings/controls")).toBe("settings--controls");
  expect(routeTag("/more/handoff")).toBe("more--handoff");
});

test("finding tally distinguishes repeated error codes", () => {
  const counts = findingsByCode([{ code: "missing" }, { code: "invalid" }, { code: "missing" }]);
  expect(counts.missing).toBe(2);
  expect(counts.invalid).toBe(1);
});

test("human-readable findings retain source path and detail", () => {
  const printed = formatRound11Findings([
    { code: "missing", path: "#open", detail: "Cannot find panel" },
    { code: "invalid", target: "#save", detail: "No name" },
  ]);
  expect(printed).toContain("missing #open Cannot find panel");
  expect(printed).toContain("invalid #save No name");
});

test("empty findings are represented by an empty diagnostic", () => {
  expect(formatRound11Findings([])).toBe("");
  expect(findingsByCode([])).toEqual({});
});

test("English and French are both explicitly included", () => {
  expect(ROUND11_LOCALES).toEqual(["en", "fr"]);
});
