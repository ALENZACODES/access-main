import { expect, test } from "@playwright/test";
import {
  combineKnowledge, documentIssues, evidenceIssues, fieldIssues, issueText,
  linkIssues, matrixIssues, matrixKeys, targetIssues,
  type Context, type DocumentSummary, type Evidence, type NavigationLink,
  type Target, type TextControl,
} from "./p20i-contracts";
import { detailOutcomeIssues, searchOutcomeIssues, type DetailOutcome, type SearchOutcome } from "./p20i-journeys";

const ctx: Context = { route: "/places", locale: "en", width: 320 };
const doc: DocumentSummary = {
  lang: "en", title: "Places", h1: ["Places"], mainCount: 1,
  mainText: "Find a location", horizontalOverflow: 0, loading: false,
  skipTargetExists: true,
};
const target: Target = {
  id: "search", label: "Search", kind: "button", visible: true,
  disabled: false, rect: { x: 0, y: 0, width: 48, height: 48 },
  labelRect: null, labelInteractive: false,
};
const field: TextControl = {
  id: "search-input", kind: "search", label: "Search", ariaLabel: "",
  ariaLabelledby: "", title: "", placeholder: "", visible: true,
  disabled: false, describedBy: [], missingDescriptions: [], required: false,
  invalid: false, errorText: "",
};
const link: NavigationLink = {
  id: "place", href: "/places/1", text: "View", visible: true,
  external: false, blank: false, rel: "", downloaded: false,
  rect: { x: 0, y: 0, width: 48, height: 48 },
};
const evidence: Evidence = {
  source: "Fixture", licence: "CC0-1.0", date: "2026-11-16", status: "PASS",
};
const detail: DetailOutcome = {
  parentRoute: "/places", href: "/places/1", requestedId: "1", path: "/places/1",
  heading: "Example", mainText: "Example record", recordVisible: true,
  emptyState: false, linkedFromList: true, loading: false,
  source: "Fixture", licence: "CC0-1.0", sourceDate: "2026-11-16",
  accessibility: "UNKNOWN",
};
const search: SearchOutcome = {
  route: "/places", query: "example", enabled: true, submitted: true,
  priorStatus: "Loading", nextStatus: "0 results", pending: false,
  resultCount: 0, error: null,
};

/**
 * Single-fault mutations assert that the policy fails because of the changed
 * field. These are executable regressions, not examples of app records.
 */
test.describe("P20I single-fault mutation gates", () => {
  for (const [name, change, rule] of [
    ["missing page title", { title: "" }, "document-title"],
    ["blank page title", { title: "  " }, "document-title"],
    ["missing main", { mainCount: 0 }, "main-landmark"],
    ["duplicate main", { mainCount: 2 }, "main-landmark"],
    ["missing h1", { h1: [] }, "page-heading"],
    ["multiple h1", { h1: ["One", "Two"] }, "page-heading"],
    ["missing text", { mainText: "" }, "empty-main"],
    ["broken skip", { skipTargetExists: false }, "skip-destination"],
    ["stuck loading", { loading: true }, "loading-incomplete"],
    ["mobile reflow", { horizontalOverflow: 25 }, "reflow"],
    ["wrong language", { lang: "fr" }, "document-language"],
  ] as const) {
    test(`document mutation: ${name}`, () => {
      const findings = documentIssues({ ...doc, ...change }, ctx);
      expect(findings.map((item) => item.rule)).toContain(rule);
    });
  }

  for (const [name, next, rule] of [
    ["too short", { rect: { ...target.rect, height: 20 } }, "target-44"],
    ["too narrow", { rect: { ...target.rect, width: 20 } }, "target-44"],
    ["unnamed", { label: "" }, "target-name"],
    ["invalid width", { rect: { ...target.rect, width: -1 } }, "invalid-target-geometry"],
  ] as const) {
    test(`target mutation: ${name}`, () => {
      expect(targetIssues([{ ...target, ...next }], ctx).map((item) => item.rule)).toContain(rule);
    });
  }

  for (const [name, next, rule] of [
    ["no label", { label: "" }, "field-name"],
    ["invalid without description", { invalid: true }, "field-error"],
    ["dangling description", { missingDescriptions: ["absent"] }, "field-description"],
  ] as const) {
    test(`field mutation: ${name}`, () => {
      expect(fieldIssues([{ ...field, ...next }], ctx).map((item) => item.rule)).toContain(rule);
    });
  }

  for (const [name, next, rule] of [
    ["small link", { rect: { ...link.rect, height: 10 } }, "link-44"],
    ["unnamed link", { text: "" }, "link-name"],
    ["unsafe link", { href: "javascript:void(0)" }, "link-scheme"],
    ["unexpected tab", { blank: true }, "unneeded-new-tab"],
  ] as const) {
    test(`link mutation: ${name}`, () => {
      expect(linkIssues([{ ...link, ...next }], ctx, "http://localhost").map((item) => item.rule)).toContain(rule);
    });
  }

  for (const [name, next, rule] of [
    ["missing source", { source: null }, "evidence-source"],
    ["missing licence", { licence: null }, "evidence-licence"],
    ["closed licence", { licence: "unknown" }, "evidence-licence"],
    ["missing date", { date: null }, "evidence-date"],
    ["invalid date", { date: "2026-13-20" }, "evidence-date"],
  ] as const) {
    test(`positive evidence mutation: ${name}`, () => {
      expect(evidenceIssues([{ ...evidence, ...next }], ctx).map((item) => item.rule)).toContain(rule);
    });
  }

  for (const [name, next, rule] of [
    ["detached list", { linkedFromList: false }, "detail-navigation"],
    ["missing heading", { heading: "" }, "detail-heading"],
    ["empty text", { mainText: "" }, "detail-content"],
    ["no record", { recordVisible: false }, "detail-record"],
    ["missing source", { source: null }, "detail-source"],
    ["missing licence", { licence: null }, "detail-licence"],
    ["missing date", { sourceDate: null }, "detail-date"],
  ] as const) {
    test(`detail mutation: ${name}`, () => {
      expect(detailOutcomeIssues({ ...detail, ...next }, ctx, "https://example.invalid").map((item) => item.rule)).toContain(rule);
    });
  }

  for (const [name, next, rule] of [
    ["unsubmitted", { submitted: false }, "search-submit"],
    ["blank query", { query: "" }, "search-query"],
    ["pending", { pending: true }, "search-pending"],
    ["blank status", { nextStatus: "" }, "search-status"],
    ["stale status", { nextStatus: "Loading" }, "search-stale-status"],
    ["bad count", { resultCount: -1 }, "search-count"],
  ] as const) {
    test(`search mutation: ${name}`, () => {
      expect(searchOutcomeIssues({ ...search, ...next }, ctx).map((item) => item.rule)).toContain(rule);
    });
  }

  test("all four required route combinations are enumerated", () => {
    const wanted = matrixKeys(["/places"]);
    expect(wanted).toHaveLength(4);
    for (const omitted of wanted) {
      const found = wanted.filter((key) => key !== omitted);
      expect(matrixIssues(["/places"], found)).toHaveLength(1);
    }
  });
  test("knowledge never promotes an unknown to a pass", () => {
    for (const value of ["PASS", "BLOCKED", "UNKNOWN"] as const) {
      expect(combineKnowledge([value, "UNKNOWN"])).not.toBe("PASS");
    }
  });
  test("formatting never hides a first failure", () => {
    const first = documentIssues({ ...doc, title: "" }, ctx);
    expect(issueText(first)).toContain("document-title");
  });
});
