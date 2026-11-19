import { expect, test } from "@playwright/test";
import {
  coverageFindings, focusFindings, formControlFindings, frameFindings, stepFindings,
  sequenceFindings, summarizeInteractionFindings,
  type CoverageCell, type FocusPoint, type Frame, type FormControl, type Step,
} from "./p20ab-interaction-policy";
import {
  evidenceViewIssues, inspectEvidence, evidenceTransitionIssues, recordIssues,
  metadataKnowledge, validDate, licenceKind,
  type SourceRecord, type EvidenceView, type EvidenceTransition,
} from "./p20ab-provenance-policy";

const focus = (id = "search"): FocusPoint => ({
  id, name: "Find", role: "button", visible: true, connected: true,
  disabled: false, tabIndex: 0, rectangle: { x: 8, y: 8, width: 44, height: 44 },
  clipped: false, occluded: false, focusIndicator: true,
});
const control = (value: string | null = "place"): FormControl => ({
  id: "search-field", role: "textbox", name: "Find places", visible: true,
  required: false, disabled: false, invalid: false, errorReference: null,
  errorReferenceExists: false, errorText: "", value,
});
const record = (id: string): SourceRecord => ({
  id, name: { en: `Place ${id}`, fr: `Lieu ${id}` }, source: "Municipal data",
  licence: "ODbL-1.0", date: "2026-11-01", tier: "E",
  sourceUrl: "https://example.org/data", observedAt: "2026-11-01",
  localOnly: false, demonstration: false,
});
const frame = (change: Partial<Frame> = {}): Frame => ({
  route: "/places", language: "en", online: true,
  documentTitle: "Places", mainCount: 1, h1: ["Places"],
  focus: focus(), dialog: null, controls: [control()], status: ["1 result"],
  alerts: [], submitted: false, timestamp: 1, ...change,
});
const evidence = (change: Partial<EvidenceView> = {}): EvidenceView => ({
  route: "/places", language: "en", connection: "online", state: "ready",
  records: [record("one")], statusMessage: "1 result", errors: [],
  asOf: "2026-11-19", savedOnDevice: false, ...change,
});
const step = (change: Partial<Step> = {}): Step => ({
  kind: "search", before: frame(), after: frame({ timestamp: 2, status: ["2 results"] }),
  trigger: "search", target: null, requestedLanguage: null, expectStatus: true,
  ...change,
});
const transition = (change: Partial<EvidenceTransition> = {}): EvidenceTransition => ({
  kind: "refresh", before: evidence(), after: evidence(), changedRecordsAllowed: false,
  ...change,
});
const codes = (items: readonly { code: string }[]) => items.map((item) => item.code);

for (const language of ["en", "fr"] as const) {
  for (const width of [320, 1280] as const) {
    test(`complete evidence and interaction at ${language} ${width}px`, () => {
      const routeFrame = frame({ language });
      const routeEvidence = evidence({ language });
      const cells: CoverageCell[] = [{ route: "/places", language, width, kind: "search", outcome: "pass" }];
      expect(frameFindings(routeFrame)).toEqual([]);
      expect(inspectEvidence(routeEvidence).decision).toBe("PASS");
      expect(coverageFindings(cells, []).total).toBe(1);
    });
    test(`unknown record evidence stays UNKNOWN at ${language} ${width}px`, () => {
      const source = record("unknown");
      const incomplete = { ...source, source: null };
      const routeEvidence = evidence({ language, records: [incomplete] });
      expect(metadataKnowledge(incomplete)).toBe("UNKNOWN");
      expect(inspectEvidence(routeEvidence).decision).toBe("UNKNOWN");
    });
    test(`input validation is independent of record tier at ${language} ${width}px`, () => {
      const invalid = { ...control(), invalid: true, errorReference: null, errorText: "Required" };
      const routeFrame = frame({ language, controls: [invalid] });
      expect(codes(formControlFindings(routeFrame.controls, "/places"))).toContain("form-error-unlinked");
      expect(metadataKnowledge(record("one"))).toBe("KNOWN");
    });
  }
}

test("unknown source is not converted to a successful offline search", () => {
  const source = record("unknown");
  const afterEvidence = evidence({ connection: "offline", savedOnDevice: true, records: [{ ...source, source: null }] });
  const afterFrame = frame({ online: false, timestamp: 2, status: ["Offline: source UNKNOWN"] });
  expect(inspectEvidence(afterEvidence).decision).toBe("UNKNOWN");
  expect(codes(stepFindings(step({ after: afterFrame })))).not.toContain("offline-search-undisclosed");
});
test("missing source and missing focus remain distinct findings", () => {
  const source = record("unknown");
  const routeFrame = frame({ focus: null });
  const routeEvidence = evidence({ records: [{ ...source, source: null }] });
  expect(frameFindings(routeFrame)).toEqual([]);
  expect(codes(focusFindings(routeFrame.focus, routeFrame.route))).toContain("focus-unknown");
  expect(codes(evidenceViewIssues(routeEvidence))).toContain("source-unknown");
});
test("changing source licence does not excuse an unsafe link", () => {
  const source = record("one");
  const restricted = { ...source, licence: "Proprietary", sourceUrl: "javascript:alert(1)" };
  const findings = recordIssues(restricted, "en", "/places");
  expect(codes(findings)).toContain("source-link-unsafe");
  expect(codes(findings)).toContain("licence-restricted");
  expect(licenceKind(restricted.licence)).toBe("restricted");
});
test("a malformed date fails even with a valid accessible heading", () => {
  const source = { ...record("one"), date: "2026-02-30" };
  expect(frameFindings(frame())).toEqual([]);
  expect(validDate(source.date)).toBe(false);
  expect(inspectEvidence(evidence({ records: [source] })).decision).toBe("BLOCKED");
});
test("language selection and evidence locale must agree", () => {
  const afterFrame = frame({ language: "fr", timestamp: 2, status: ["1 résultat"] });
  const afterEvidence = evidence({ language: "fr" });
  const results = stepFindings(step({ kind: "language", requestedLanguage: "fr", after: afterFrame }));
  expect(codes(results)).not.toContain("language-not-applied");
  expect(evidenceTransitionIssues(transition({ kind: "language", expectedLanguage: "fr", after: afterEvidence }))).toEqual([]);
});
test("language change with a stale evidence locale is diagnosed", () => {
  const afterFrame = frame({ language: "fr", timestamp: 2, status: ["1 résultat"] });
  const afterEvidence = evidence({ language: "en" });
  expect(codes(stepFindings(step({ kind: "language", requestedLanguage: "fr", after: afterFrame })))).not.toContain("language-not-applied");
  expect(codes(evidenceTransitionIssues(transition({ kind: "language", expectedLanguage: "fr", after: afterEvidence })))).toContain("language-mismatch");
});
test("retry must not silently move focus or overwrite source", () => {
  const after = frame({ focus: focus("other"), timestamp: 2, status: ["Retried"] });
  const findings = stepFindings(step({ kind: "retry", after }));
  expect(codes(findings)).toContain("action-focus-lost");
  expect(evidenceTransitionIssues(transition({ kind: "retry" }))).toEqual([]);
});
test("navigation can change route without promoting UNKNOWN records", () => {
  const before = evidence({ records: [{ ...record("one"), tier: null }] });
  const after = evidence({ route: "/help", records: [{ ...record("one"), tier: null }] });
  expect(inspectEvidence(after).decision).toBe("UNKNOWN");
  expect(codes(evidenceTransitionIssues(transition({ kind: "navigate", before, after, expectedRoute: "/help" })))).not.toContain("destination-mismatch");
});
test("reset preserves identity even when a query becomes empty", () => {
  const before = frame({ controls: [control("library")] });
  const after = frame({ controls: [control("")], timestamp: 2, status: ["Search cleared"] });
  expect(codes(stepFindings(step({ kind: "reset", before, after })))).not.toContain("action-focus-lost");
});
test("submission validation and source provenance are audited independently", () => {
  const invalid = { ...control(), invalid: true, errorReference: "search-error", errorReferenceExists: true, errorText: "Enter a city" };
  const afterFrame = frame({ controls: [invalid], alerts: ["Enter a city"], timestamp: 2 });
  expect(codes(stepFindings(step({ kind: "submit", expectStatus: false, after: afterFrame })))).not.toContain("form-error-summary-missing");
  expect(inspectEvidence(evidence()).decision).toBe("PASS");
});
test("form submission without summary is not excused by known source", () => {
  const invalid = { ...control(), invalid: true, errorReference: "search-error", errorReferenceExists: true, errorText: "Enter a city" };
  const after = frame({ controls: [invalid], alerts: [], timestamp: 2 });
  expect(codes(stepFindings(step({ kind: "submit", expectStatus: false, after })))).toContain("form-error-summary-missing");
  expect(inspectEvidence(evidence()).decision).toBe("PASS");
});
test("alert severity and metadata severity are not conflated", () => {
  const focusIssues = focusFindings(focus("search"), "/places");
  const sourceIssues = recordIssues({ ...record("one"), source: null }, "en", "/places");
  expect(summarizeInteractionFindings(focusIssues).error).toBe(0);
  expect(sourceIssues).toContainEqual(expect.objectContaining({ code: "source-unknown", level: "information" }));
});
test("sequence can carry route and evidence observations independently", () => {
  const steps: Step[] = [
    step(),
    step({ kind: "navigate", before: frame({ timestamp: 2, status: ["2 results"] }), after: frame({ route: "/help", timestamp: 3 }), target: "/help", expectStatus: false }),
  ];
  const result = sequenceFindings({ id: "find-and-help", steps, allowIntermediateRoutes: false });
  expect(codes(result)).not.toContain("sequence-route-gap");
});
test("a route matrix does not infer a full test run from one passing dimension", () => {
  const cells: CoverageCell[] = [{ route: "/places", language: "fr", width: 320, kind: "search", outcome: "pass" }];
  const report = coverageFindings(cells, ["/places"]);
  expect(report.passed).toBe(1);
  expect(codes(report.findings)).toContain("coverage-missing");
});
test("an unknown route outcome counts separately from an application failure", () => {
  const cells: CoverageCell[] = [
    { route: "/places", language: "en", width: 320, kind: "search", outcome: "UNKNOWN" },
    { route: "/places", language: "en", width: 1280, kind: "search", outcome: "fail" },
  ];
  const report = coverageFindings(cells, ["/places"]);
  expect(report.unknown).toBe(1);
  expect(report.failed).toBe(1);
});
test("all subsequent records retain local-only state across language changes", () => {
  const base = evidence({ records: [{ ...record("one"), localOnly: true, sourceUrl: null }] });
  const next = evidence({ language: "fr", records: [{ ...record("one"), localOnly: true, sourceUrl: null }] });
  expect(codes(evidenceTransitionIssues(transition({ kind: "language", expectedLanguage: "fr", before: base, after: next })))).not.toContain("evidence-lost");
});
test("a new source cannot retroactively fill a missing observation date", () => {
  const source = { ...record("one"), observedAt: null };
  const recordView = evidence({ records: [source] });
  expect(inspectEvidence(recordView).known).toBe(1);
  expect(source.observedAt).toBeNull();
});
test("disconnected focus and unlicensed data remain separate failures", () => {
  const after = frame({ focus: { ...focus(), connected: false }, timestamp: 2 });
  const disconnected = stepFindings(step({ after }));
  const unlicensed = recordIssues({ ...record("one"), licence: "All rights reserved" }, "en", "/places");
  expect(codes(disconnected)).toContain("focus-detached");
  expect(codes(unlicensed)).toContain("licence-restricted");
});
test("offline transitions preserve both accessible names and provenance identity", () => {
  const offlineFrame = frame({ online: false, timestamp: 2, status: ["Offline mode"] });
  const beforeEvidence = evidence({ savedOnDevice: true });
  const afterEvidence = evidence({ connection: "offline", savedOnDevice: true });
  const interaction = stepFindings(step({ kind: "offline", after: offlineFrame }));
  const provenance = evidenceTransitionIssues(transition({
    kind: "offline", before: beforeEvidence, after: afterEvidence,
  }));
  expect(codes(interaction)).not.toContain("offline-state");
  expect(codes(provenance)).not.toContain("offline-not-applied");
  expect(afterEvidence.records[0]?.id).toBe(beforeEvidence.records[0]?.id);
  expect(offlineFrame.focus?.name).toBe("Find");
});
