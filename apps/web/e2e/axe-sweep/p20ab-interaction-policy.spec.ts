import { expect, test } from "@playwright/test";
import {
  coverageFindings, coverageKey, dialogFindings, focusFindings, formControlFindings,
  formatInteractionFindings, frameFindings, incompleteCoverage, languageCode,
  observedInteractions, routeCoverageInventory, sequenceFindings, stepFindings,
  summarizeInteractionFindings, validRoute,
  type CoverageCell, type DialogPoint, type FocusPoint, type FormControl,
  type Frame, type InteractionKind, type Sequence, type Step,
} from "./p20ab-interaction-policy";

const focus = (update: Partial<FocusPoint> = {}): FocusPoint => ({
  id: "search", name: "Search", role: "button", visible: true, connected: true,
  disabled: false, tabIndex: 0,
  rectangle: { x: 12, y: 16, width: 48, height: 48 },
  clipped: false, occluded: false, focusIndicator: true, ...update,
});
const control = (update: Partial<FormControl> = {}): FormControl => ({
  id: "query", role: "textbox", name: "Search for a place", visible: true,
  required: false, disabled: false, invalid: false, errorReference: null,
  errorReferenceExists: false, errorText: "", value: "library", ...update,
});
const dialog = (update: Partial<DialogPoint> = {}): DialogPoint => ({
  id: "details", open: true, modal: true, name: "Details", description: "Information",
  labelledByResolved: true, describedByResolved: true, dismissible: true,
  inertOutside: true, focusWithin: true, openerId: "open", ...update,
});
const frame = (update: Partial<Frame> = {}): Frame => ({
  route: "/finders", language: "en", online: true, documentTitle: "Finders",
  mainCount: 1, h1: ["Finders"], focus: focus(), dialog: null,
  controls: [control()], status: ["3 results"], alerts: [], submitted: false,
  timestamp: 10, ...update,
});
const step = (update: Partial<Step> = {}): Step => ({
  kind: "search", before: frame({ timestamp: 10 }), after: frame({ timestamp: 20, status: ["4 results"] }),
  trigger: "search", target: null, requestedLanguage: null,
  expectStatus: true, ...update,
});
const codes = (items: readonly { code: string }[]): string[] => items.map((entry) => entry.code);
const has = (items: readonly { code: string }[], code: string): boolean => codes(items).includes(code);

const goodRoutes = ["/", "/places", "/help", "/more/housing", "/settings/language", "/finders"];
for (const route of goodRoutes) {
  test(`accepts a canonical local path ${route}`, () => {
    expect(validRoute(route)).toBe(true);
  });
}
for (const route of ["", "places", "//server", "/a?x=1", "/a#b", "/a\\b", "/a/*", "/a/:id", "/a/../b", "/a/./b"]) {
  test(`rejects a non-static route ${JSON.stringify(route)}`, () => {
    expect(validRoute(route)).toBe(false);
  });
}
for (const character of [0, 1, 8, 9, 10, 13, 27, 31, 127]) {
  test(`rejects control code ${character} without a regular-expression character range`, () => {
    expect(validRoute(`/x${String.fromCharCode(character)}y`)).toBe(false);
  });
}
for (const [tag, language] of [["fr", "fr"], ["FR-ca", "fr"], ["en-CA", "en"], ["EN-us", "en"], ["de", null], ["und", null], ["", null], ["français", null]] as const) {
  test(`classifies document language ${JSON.stringify(tag)}`, () => {
    expect(languageCode(tag)).toBe(language);
  });
}

test("a named focus with visible bounds and clear indicator produces no findings", () => {
  expect(focusFindings(focus(), "/finders")).toEqual([]);
});
test("missing focus measurement remains unknown rather than a pass", () => {
  expect(has(focusFindings(null, "/finders"), "focus-unknown")).toBe(true);
});
for (const [code, changes] of [
  ["focus-detached", { connected: false }],
  ["focus-hidden", { visible: false }],
  ["focus-disabled", { disabled: true }],
  ["focus-unnamed", { name: " " }],
  ["focus-tabindex-invalid", { tabIndex: -2 }],
  ["focus-positive-tabindex", { tabIndex: 3 }],
  ["focus-clipped", { clipped: true }],
  ["focus-obscured", { occluded: true }],
  ["focus-indicator-missing", { focusIndicator: false }],
  ["focus-indicator-unknown", { focusIndicator: null }],
  ["focus-geometry-unknown", { rectangle: null }],
] as const) {
  test(`detects ${code}`, () => {
    expect(has(focusFindings(focus(changes), "/finders"), code)).toBe(true);
  });
}
test("main is allowed to be programmatically focused without an accessible name", () => {
  expect(has(focusFindings(focus({ role: "main", name: "" }), "/"), "focus-unnamed")).toBe(false);
});
test("zero geometry is not considered usable focus", () => {
  expect(has(focusFindings(focus({ rectangle: { x: 0, y: 0, width: 0, height: 0 } }), "/"), "focus-zero-size")).toBe(true);
});
test("nonfinite geometry is rejected", () => {
  expect(has(focusFindings(focus({ rectangle: { x: NaN, y: 0, width: 50, height: 48 } }), "/"), "focus-geometry-invalid")).toBe(true);
});
test("positive tab index is a warning rather than a successful keyboard-order state", () => {
  expect(focusFindings(focus({ tabIndex: 2 }), "/")).toContainEqual(expect.objectContaining({ severity: "warning" }));
});

test("closed dialogs do not require focus containment or a dismiss control", () => {
  expect(dialogFindings(dialog({ open: false, focusWithin: false, dismissible: false }), "/")).toEqual([]);
});
test("no dialog is acceptable on an ordinary route", () => {
  expect(dialogFindings(null, "/")).toEqual([]);
});
test("well-described open dialog passes its structural policy", () => {
  expect(dialogFindings(dialog(), "/")).toEqual([]);
});
for (const [code, change] of [
  ["dialog-id", { id: "" }],
  ["dialog-name", { name: "" }],
  ["dialog-label-reference", { labelledByResolved: false }],
  ["dialog-description-reference", { describedByResolved: false }],
  ["dialog-background-operable", { inertOutside: false }],
  ["dialog-focus-outside", { focusWithin: false }],
  ["dialog-undismissable", { dismissible: false }],
  ["dialog-opener-unknown", { openerId: null }],
] as const) {
  test(`reports ${code} for an active dialog`, () => {
    expect(has(dialogFindings(dialog(change), "/help"), code)).toBe(true);
  });
}
test("nonmodal disclosure does not require an inert outside region", () => {
  expect(has(dialogFindings(dialog({ modal: false, inertOutside: false }), "/help"), "dialog-background-operable")).toBe(false);
});
test("a blank dialog identifier is rejected even when closed", () => {
  expect(has(dialogFindings(dialog({ id: "", open: false }), "/help"), "dialog-id")).toBe(true);
});

test("a labelled optional input without validation errors passes", () => {
  expect(formControlFindings([control()], "/finders")).toEqual([]);
});
test("duplicate identifiers are detected across visible and hidden fields", () => {
  expect(has(formControlFindings([control(), control({ visible: false })], "/finders"), "form-duplicate-id")).toBe(true);
});
for (const [code, change] of [
  ["form-unnamed", { name: "" }],
  ["form-error-unlinked", { invalid: true, errorText: "Invalid" }],
  ["form-error-reference-missing", { errorReference: "missing", errorReferenceExists: false }],
  ["form-error-message-empty", { invalid: true, errorReference: "error", errorReferenceExists: true }],
  ["form-error-disabled", { invalid: true, disabled: true, errorReference: "error", errorReferenceExists: true, errorText: "Invalid" }],
  ["form-value-unknown", { required: true, value: null }],
] as const) {
  test(`reports ${code} on forms`, () => {
    expect(has(formControlFindings([control(change)], "/finders"), code)).toBe(true);
  });
}
test("an associated nonempty error message is allowed", () => {
  expect(formControlFindings([control({ invalid: true, errorReference: "error", errorReferenceExists: true, errorText: "Enter a number" })], "/finders")).toEqual([]);
});
test("a hidden optional unnamed field is ignored", () => {
  expect(formControlFindings([control({ visible: false, name: "" })], "/finders")).toEqual([]);
});
test("null required input is information, not fabricated input text", () => {
  const result = formControlFindings([control({ required: true, value: null })], "/finders");
  expect(result).toContainEqual(expect.objectContaining({ severity: "information" }));
});

test("baseline frame passes structural checks", () => {
  expect(frameFindings(frame())).toEqual([]);
});
for (const [code, change] of [
  ["route-invalid", { route: "bad" }],
  ["document-language", { language: "und" }],
  ["document-title", { documentTitle: " " }],
  ["main-count", { mainCount: 2 }],
  ["heading-count", { h1: [] }],
  ["time-invalid", { timestamp: Infinity }],
  ["connectivity-unknown", { online: null }],
  ["status-empty", { status: [""] }],
  ["alert-empty", { alerts: ["   "] }],
] as const) {
  test(`frame policy reports ${code}`, () => {
    expect(has(frameFindings(frame(change)), code)).toBe(true);
  });
}
test("an embedded open dialog is audited as part of the route frame", () => {
  expect(has(frameFindings(frame({ dialog: dialog({ name: "" }) })), "dialog-name")).toBe(true);
});
test("a disabled focused button is rejected by frame audit", () => {
  expect(has(frameFindings(frame({ focus: focus({ disabled: true }) })), "focus-disabled")).toBe(true);
});
test("incomplete form error state is not concealed by frame wrapper", () => {
  expect(has(frameFindings(frame({ controls: [control({ invalid: true })] })), "form-error-unlinked")).toBe(true);
});

test("successful search updates status and keeps focus", () => {
  expect(stepFindings(step())).toEqual([]);
});
test("time reversal across interactions is detected", () => {
  expect(has(stepFindings(step({ after: frame({ timestamp: 9, status: ["New"] }) })), "time-regression")).toBe(true);
});
test("ordinary interactions cannot navigate unexpectedly", () => {
  expect(has(stepFindings(step({ after: frame({ route: "/places", timestamp: 20, status: ["New"] }) })), "unexpected-route")).toBe(true);
});
test("navigation can change route to the requested destination", () => {
  const result = stepFindings(step({ kind: "navigate", target: "/places", expectStatus: false, after: frame({ route: "/places", timestamp: 20 }) }));
  expect(has(result, "unexpected-route")).toBe(false);
  expect(has(result, "wrong-destination")).toBe(false);
});
test("navigation to a different destination is reported", () => {
  const result = stepFindings(step({ kind: "navigate", target: "/help", after: frame({ route: "/places", timestamp: 20 }) }));
  expect(has(result, "wrong-destination")).toBe(true);
});
test("requested French language must be applied", () => {
  const result = stepFindings(step({ kind: "language", requestedLanguage: "fr", after: frame({ language: "en", timestamp: 20 }) }));
  expect(has(result, "language-not-applied")).toBe(true);
});
test("missing selected language remains UNKNOWN", () => {
  const result = stepFindings(step({ kind: "language", requestedLanguage: null }));
  expect(result).toContainEqual(expect.objectContaining({ code: "language-target-unknown", severity: "information" }));
});
test("ordinary search changing document language is a failure", () => {
  expect(has(stepFindings(step({ after: frame({ language: "fr", timestamp: 20 }) })), "language-unexpected")).toBe(true);
});
test("language change may change language without an unexpected-language finding", () => {
  const result = stepFindings(step({ kind: "language", requestedLanguage: "fr", after: frame({ language: "fr", timestamp: 20 }) }));
  expect(has(result, "language-unexpected")).toBe(false);
});
for (const [kind, online, code] of [
  ["offline", true, "offline-state"], ["offline", null, "offline-state"],
  ["online", false, "online-state"], ["online", null, "online-state"],
] as const) {
  test(`reports ${code} for ${kind} state ${String(online)}`, () => {
    expect(has(stepFindings(step({ kind, after: frame({ online, timestamp: 20 }) })), code)).toBe(true);
  });
}
test("correct offline transition is accepted", () => {
  expect(has(stepFindings(step({ kind: "offline", after: frame({ online: false, timestamp: 20 }) })), "offline-state")).toBe(false);
});
test("correct online transition is accepted", () => {
  expect(has(stepFindings(step({ kind: "online", after: frame({ online: true, timestamp: 20 }) })), "online-state")).toBe(false);
});
test("opening a dialog must actually open the intended target", () => {
  const result = stepFindings(step({ kind: "open-dialog", target: "details", after: frame({ dialog: null, timestamp: 20 }) }));
  expect(has(result, "dialog-not-opened")).toBe(true);
});
test("wrong dialog target is reported", () => {
  const result = stepFindings(step({ kind: "open-dialog", target: "other", after: frame({ dialog: dialog(), timestamp: 20 }) }));
  expect(has(result, "dialog-wrong-target")).toBe(true);
});
test("dialog opening requires focus within the dialog", () => {
  const result = stepFindings(step({ kind: "open-dialog", target: "details", after: frame({ dialog: dialog({ focusWithin: false }), timestamp: 20 }) }));
  expect(has(result, "dialog-no-initial-focus")).toBe(true);
});
test("closing a dialog must return focus to its opener", () => {
  const result = stepFindings(step({ kind: "close-dialog", trigger: "open", after: frame({ focus: focus({ id: "last" }), timestamp: 20 }) }));
  expect(has(result, "dialog-focus-not-restored")).toBe(true);
});
test("a dialog remaining open after close is a failure", () => {
  const result = stepFindings(step({ kind: "close-dialog", after: frame({ dialog: dialog(), timestamp: 20 }) }));
  expect(has(result, "dialog-not-closed")).toBe(true);
});
test("successful form submission is not silent", () => {
  const result = stepFindings(step({ kind: "submit", expectStatus: false, after: frame({ submitted: true, timestamp: 20 }) }));
  expect(has(result, "submit-silent")).toBe(false);
});
test("submission without result or validation feedback fails", () => {
  const result = stepFindings(step({ kind: "submit", expectStatus: false, after: frame({ submitted: false, timestamp: 20 }) }));
  expect(has(result, "submit-silent")).toBe(true);
});
test("a form error must have an alert summary", () => {
  const result = stepFindings(step({ kind: "submit", expectStatus: false, after: frame({ controls: [control({ invalid: true })], alerts: [], timestamp: 20 }) }));
  expect(has(result, "form-error-summary-missing")).toBe(true);
});
test("search with unchanged status is a silent update", () => {
  const result = stepFindings(step({ after: frame({ timestamp: 20 }) }));
  expect(has(result, "announcement-unchanged")).toBe(true);
});
test("a changed alert can satisfy the status requirement", () => {
  const result = stepFindings(step({ after: frame({ timestamp: 20, alerts: ["Search failed"] }) }));
  expect(has(result, "announcement-unchanged")).toBe(false);
});
test("unexpected focus change after reset is detected", () => {
  const result = stepFindings(step({ kind: "reset", after: frame({ focus: focus({ id: "other" }), timestamp: 20, status: ["Cleared"] }) }));
  expect(has(result, "action-focus-lost")).toBe(true);
});
test("retry focus remains on the originating control", () => {
  const result = stepFindings(step({ kind: "retry", after: frame({ timestamp: 20, status: ["Retry complete"] }) }));
  expect(has(result, "action-focus-lost")).toBe(false);
});
test("offline search requires an explicit offline message", () => {
  const result = stepFindings(step({ after: frame({ online: false, timestamp: 20, status: ["3 results"] }) }));
  expect(has(result, "offline-search-undisclosed")).toBe(true);
});
test("offline search with French notice is recognized", () => {
  const result = stepFindings(step({ after: frame({ online: false, timestamp: 20, status: ["Hors ligne"] }) }));
  expect(has(result, "offline-search-undisclosed")).toBe(false);
});
test("persistent form errors on retry remain visible as warnings", () => {
  const before = frame({ controls: [control({ invalid: true })], timestamp: 10 });
  const after = frame({ controls: [control({ invalid: true })], timestamp: 20, status: ["Retried"] });
  expect(has(stepFindings(step({ kind: "retry", before, after })), "retry-errors-persist")).toBe(true);
});

test("sequence with no events cannot be considered complete", () => {
  expect(has(sequenceFindings({ id: "none", steps: [], allowIntermediateRoutes: false }), "sequence-empty")).toBe(true);
});
test("sequence without identity is diagnosed", () => {
  expect(has(sequenceFindings({ id: "", steps: [step()], allowIntermediateRoutes: false }), "sequence-id")).toBe(true);
});
test("single successful action forms a coherent sequence", () => {
  expect(sequenceFindings({ id: "search-1", steps: [step()], allowIntermediateRoutes: false })).toEqual([]);
});
test("sequential events must share a timestamp boundary", () => {
  const first = step();
  const second = step({ before: frame({ timestamp: 22 }), after: frame({ timestamp: 30, status: ["Five results"] }) });
  const result = sequenceFindings({ id: "seq", steps: [first, second], allowIntermediateRoutes: false });
  expect(has(result, "sequence-time-gap")).toBe(true);
});
test("sequence cannot silently jump to an unrelated route", () => {
  const first = step();
  const second = step({ before: frame({ route: "/other", timestamp: 20 }), after: frame({ route: "/other", timestamp: 30, status: ["Updated"] }) });
  const result = sequenceFindings({ id: "seq", steps: [first, second], allowIntermediateRoutes: false });
  expect(has(result, "sequence-route-gap")).toBe(true);
});
test("sequence with explicit intermediate-route permission preserves coverage", () => {
  const first = step();
  const second = step({ before: frame({ route: "/other", timestamp: 20 }), after: frame({ route: "/other", timestamp: 30, status: ["Updated"] }) });
  const result = sequenceFindings({ id: "seq", steps: [first, second], allowIntermediateRoutes: true });
  expect(has(result, "sequence-route-gap")).toBe(false);
});
test("inconsistent inherited language between steps is flagged", () => {
  const first = step();
  const second = step({ before: frame({ language: "fr", timestamp: 20 }), after: frame({ language: "fr", timestamp: 30, status: ["Updated"] }) });
  const result = sequenceFindings({ id: "seq", steps: [first, second], allowIntermediateRoutes: false });
  expect(has(result, "sequence-language-gap")).toBe(true);
});

const cell = (change: Partial<CoverageCell> = {}): CoverageCell => ({ route: "/finders", language: "en", width: 320, kind: "search", outcome: "pass", ...change });
const completeCells = (route: string): CoverageCell[] => [
  cell({ route, language: "en", width: 320 }),
  cell({ route, language: "en", width: 1280 }),
  cell({ route, language: "fr", width: 320 }),
  cell({ route, language: "fr", width: 1280 }),
];
test("all locale/viewport dimensions count toward one route", () => {
  const report = coverageFindings(completeCells("/finders"), ["/finders"]);
  expect(report).toMatchObject({ total: 4, passed: 4, failed: 0, unknown: 0, findings: [] });
});
test("a missing French mobile cell stays missing", () => {
  const report = coverageFindings(completeCells("/finders").slice(0, 3), ["/finders"]);
  expect(has(report.findings, "coverage-missing")).toBe(true);
});
test("duplicate cells are rejected even when both pass", () => {
  const cells = completeCells("/finders");
  expect(has(coverageFindings([...cells, cells[0]!], ["/finders"]).findings, "coverage-duplicate")).toBe(true);
});
test("extra routes are not treated as a required route", () => {
  const cells = [...completeCells("/finders"), cell({ route: "/unexpected" })];
  expect(has(coverageFindings(cells, ["/finders"]).findings, "coverage-unexpected-route")).toBe(true);
});
test("coverage with unknown result remains UNKNOWN", () => {
  const report = coverageFindings(completeCells("/finders").map((entry, index) => index === 0 ? { ...entry, outcome: "UNKNOWN" } : entry), ["/finders"]);
  expect(report.unknown).toBe(1);
  expect(has(report.findings, "coverage-unknown")).toBe(true);
});
test("one failed cell is not represented as a passed cell", () => {
  const report = coverageFindings(completeCells("/finders").map((entry, index) => index === 0 ? { ...entry, outcome: "fail" } : entry), ["/finders"]);
  expect(report.failed).toBe(1);
  expect(report.passed).toBe(3);
});
test("matrix key includes interaction kind", () => {
  expect(coverageKey(cell({ kind: "navigate" }))).not.toBe(coverageKey(cell({ kind: "search" })));
});
test("route inventory is deduplicated and sorted", () => {
  const cells = [...completeCells("/places"), ...completeCells("/finders")];
  expect(routeCoverageInventory(cells)).toEqual(["/finders", "/places"]);
});
test("incomplete coverage returns failed and unknown cells only", () => {
  const cells = [cell(), cell({ route: "/places", outcome: "fail" }), cell({ route: "/help", outcome: "UNKNOWN" })];
  expect(incompleteCoverage(cells).map((entry) => entry.route)).toEqual(["/places", "/help"]);
});
test("summaries classify informational and warning findings separately", () => {
  const result = focusFindings(focus({ tabIndex: 2, focusIndicator: null, rectangle: null }), "/");
  const summary = summarizeInteractionFindings(result);
  expect(summary.warning).toBeGreaterThan(0);
  expect(summary.information).toBeGreaterThan(0);
  expect(summary.error).toBe(0);
});
test("report formatter removes duplicate lines", () => {
  const findings = focusFindings(focus({ clipped: true }), "/");
  expect(formatInteractionFindings([...findings, ...findings]).split("\n")).toHaveLength(findings.length);
});
test("report formatter has explicit truncation", () => {
  const findings = focusFindings(focus({ visible: false, disabled: true, connected: false }), "/");
  expect(formatInteractionFindings(findings, 1)).toContain("further findings");
});
test("invalid formatter limit is rejected", () => {
  expect(() => formatInteractionFindings([], 0)).toThrow(RangeError);
});
test("interaction count inventory has every supported action", () => {
  const kinds: InteractionKind[] = ["navigate", "open-dialog", "close-dialog", "search", "reset", "language", "offline", "online", "submit", "retry"];
  const steps = kinds.map((kind) => step({ kind }));
  const seq: Sequence = { id: "all", steps, allowIntermediateRoutes: true };
  const counts = observedInteractions(seq);
  for (const kind of kinds) expect(counts[kind]).toBe(1);
});
