import { assertNoForbiddenOrg, endorsedByForbiddenOrgSample } from "../../../../packages/shared/test/forbiddenOrg";
import { expect, test } from "@playwright/test";
import {
  assertUniqueMatrix, focusNodeIssues, hashIssues, idIssues, languageIssues,
  localePart, referenceIssues, reportIssues, routeInventoryIssues, snapshotIssues,
  type FocusNode, type RouteSnapshot,
} from "./semantic-integrity";

const SAMPLE: RouteSnapshot = {
  route: "/places",
  documentLanguage: "en",
  title: "Places",
  mainCount: 1,
  headings: ["Places"],
  ids: [{ id: "main", tag: "main", visible: true }],
  references: [{ owner: "skip", attribute: "aria-controls", token: "main", targetCount: 1 }],
  hashes: [{ href: "#main", visible: true, targetCount: 1 }],
  fragments: [],
  focusables: [{ selector: "search", name: "Search", visible: true, connected: true, disabled: false }],
  horizontalOverflow: 0,
};

const focus = (changes: Partial<FocusNode> = {}): FocusNode => ({
  selector: "control", name: "Find", visible: true, connected: true, disabled: false, ...changes,
});

test.describe("semantic integrity contracts", () => {
  test("rendered-copy guard uses the shared forbidden-name builder", () => {
    expect(() => assertNoForbiddenOrg("A local prototype", "copy")).not.toThrow();
    expect(() => assertNoForbiddenOrg(endorsedByForbiddenOrgSample(), "copy")).toThrow();
    expect(() => assertNoForbiddenOrg(endorsedByForbiddenOrgSample("fr"), "copy")).toThrow();
  });

  test("a complete evidence-free page passes its structural contract", () => {
    expect(snapshotIssues(SAMPLE, "en", 320)).toEqual([]);
    expect(snapshotIssues({ ...SAMPLE, documentLanguage: "fr" }, "fr", 1280)).toEqual([]);
  });

  test("the route matrix checks identity rather than a magic total", () => {
    const routes = ["/", "/places", "/help"];
    expect(routeInventoryIssues(routes, routes)).toEqual([]);
    expect(routeInventoryIssues([...routes, "/places"], routes).map((entry) => entry.rule))
      .toContain("route-duplicate");
    expect(routeInventoryIssues(routes, [...routes, "/finders"]).map((entry) => entry.rule))
      .toContain("route-missing");
    expect(routeInventoryIssues([], []).map((entry) => entry.rule)).toContain("route-empty");
  });

  for (const invalidRoute of ["//server", "a", "/path?query=1", "/path#hash", "/../escape", "/a/./b", "/x\\y"]) {
    test(`rejects unsafe route ${invalidRoute}`, () => {
      expect(routeInventoryIssues([invalidRoute], []).some((entry) => entry.rule === "route-shape")).toBe(true);
    });
  }

  test("a complete 2 by 2 route matrix passes", () => {
    const routes = ["/", "/finders"];
    const scheduled = routes.flatMap((route) => ["en", "fr"].flatMap((lang) => [320, 1280].map((width) => `${route}|${lang}|${width}`)));
    expect(assertUniqueMatrix(routes, ["en", "fr"], [320, 1280], scheduled)).toEqual([]);
    expect(assertUniqueMatrix(routes, ["en", "fr"], [320, 1280], scheduled.slice(1))
      .map((entry) => entry.rule)).toContain("matrix-missing");
    expect(assertUniqueMatrix(routes, ["en", "fr"], [320, 1280], [...scheduled, scheduled[0]!])
      .map((entry) => entry.rule)).toContain("matrix-duplicate");
  });

  test("identical identifiers are a violation even when one is hidden", () => {
    expect(idIssues([
      { id: "city", tag: "input", visible: true },
      { id: "city", tag: "input", visible: false },
    ], "/finders")).toEqual([{ rule: "duplicate-id", location: "/finders", detail: "city: 2 occurrences" }]);
    expect(idIssues([{ id: "", tag: "div", visible: false }], "/").map((entry) => entry.rule))
      .toContain("empty-id");
  });

  test("ARIA references reject absent and ambiguous destinations", () => {
    const refs = [
      { owner: "button", attribute: "aria-controls", token: "missing", targetCount: 0 },
      { owner: "field", attribute: "aria-describedby", token: "description", targetCount: 2 },
      { owner: "input", attribute: "aria-labelledby", token: "", targetCount: 0 },
    ];
    expect(referenceIssues(refs, "/").map((entry) => entry.rule)).toEqual([
      "aria-missing-reference", "aria-ambiguous-reference", "aria-empty-reference",
    ]);
  });

  test("valid ARIA associations have exactly one destination", () => {
    expect(referenceIssues([
      { owner: "input", attribute: "aria-labelledby", token: "label", targetCount: 1 },
      { owner: "input", attribute: "aria-describedby", token: "hint", targetCount: 1 },
    ], "/")).toEqual([]);
  });

  test("visible skip and fragment links require real destinations", () => {
    expect(hashIssues([{ href: "#main", visible: true, targetCount: 0 }], "/")
      .map((entry) => entry.rule)).toEqual(["hash-destination"]);
    expect(hashIssues([{ href: "#main", visible: false, targetCount: 0 }], "/")).toEqual([]);
    expect(hashIssues([{ href: "#main", visible: true, targetCount: 1 }], "/")).toEqual([]);
  });

  test("language checks distinguish French, English and unknown", () => {
    expect(localePart("fr-CA")).toBe("fr");
    expect(localePart("en-US")).toBe("en");
    expect(localePart("und")).toBeNull();
    expect(localePart("français")).toBeNull();
    expect(languageIssues("en", "fr", [], "/").map((entry) => entry.rule))
      .toEqual(["document-language"]);
  });

  test("explicit language fragments cannot use malformed tags", () => {
    expect(languageIssues("fr", "fr", [
      { language: "en", parentLanguage: "fr", text: "English", visible: true },
      { language: "", parentLanguage: "fr", text: "Text", visible: true },
      { language: "?", parentLanguage: "fr", text: "Text", visible: true },
    ], "/").map((entry) => entry.rule)).toEqual([
      "fragment-language-empty", "fragment-language-invalid",
    ]);
  });

  test("a disabled, invisible or disconnected keyboard stop is rejected", () => {
    const issues = focusNodeIssues([
      focus({ disabled: true }), focus({ visible: false }), focus({ connected: false }), focus({ name: " " }),
    ], "/");
    expect(issues.map((entry) => entry.rule)).toEqual([
      "focus-disabled", "focus-hidden", "focus-disconnected", "focus-unnamed",
    ]);
    expect(focusNodeIssues([focus()], "/")).toEqual([]);
  });

  test("document structure must have one main and one named first heading", () => {
    const modified: RouteSnapshot = { ...SAMPLE, title: "", headings: [], mainCount: 2 };
    expect(snapshotIssues(modified, "en", 320).map((entry) => entry.rule)).toEqual([
      "document-title", "main-count", "heading-one",
    ]);
    expect(snapshotIssues({ ...SAMPLE, headings: ["", "Extra"] }, "en", 1280)
      .map((entry) => entry.rule)).toEqual(["heading-one"]);
  });

  test("the 320px overflow threshold is intentionally stricter", () => {
    expect(snapshotIssues({ ...SAMPLE, horizontalOverflow: 2 }, "en", 320)
      .map((entry) => entry.rule)).toContain("reflow");
    expect(snapshotIssues({ ...SAMPLE, horizontalOverflow: 2 }, "en", 1280)).toEqual([]);
    expect(snapshotIssues({ ...SAMPLE, horizontalOverflow: 1 }, "en", 320)).toEqual([]);
  });

  test("diagnostics have stable deduplication and explicit truncation", () => {
    const issues = Array.from({ length: 5 }, (_, index) => ({
      rule: "example", location: "/", detail: String(index),
    }));
    const reported = reportIssues([...issues, issues[0]!], 2);
    expect(reported).toContain("example /: 0");
    expect(reported).toContain("3 additional findings");
  });
});
