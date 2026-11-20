import test from "node:test";
import assert from "node:assert/strict";
import {
  snapshotFindings, transitionFindings, traceFindings, traceTimeline,
  finalSnapshot, receiptFromTrace, routeMatrix, matrixKey, matrixFindings,
  routeInventoryFindings, diagnosticDelta, failingSteps, traceSummary,
  expectedStatusText, reportedOrUnknown, retainBySeverity,
} from "./p20ak-replay.ts";
import { sampleEvent, sampleSnapshot, sampleTarget, sampleWorker, UNKNOWN } from "./p20ak-types.ts";
const codes = (findings) => findings.map((finding) => finding.code);
const valid = (patch = {}) => sampleSnapshot({ worker: sampleWorker({ supported: false, controlling: false }), ...patch });
const event = (patch = {}) => sampleEvent({ before: valid(), after: valid(), ...patch });
const trace = (patch = {}) => ({ id: "trace-one", initial: valid(), events: [], ...patch });
const announcement = (patch = {}) => ({ key: "status", text: "No results", language: "en",
  politeness: "polite", busy: false, visible: true, observedAt: 100, ...patch });

test("baseline document has no structural issues", () => {
  assert.deepEqual(snapshotFindings(valid()), []);
});
for (const [patch, expected] of [
  [{ route: "//other" }, "route-unsafe"],
  [{ language: UNKNOWN }, "language-unknown"],
  [{ mainCount: 0 }, "main-count"],
  [{ mainCount: 2 }, "main-count"],
  [{ heading: "" }, "heading-empty"],
  [{ title: "" }, "title-empty"],
  [{ width: 0 }, "viewport-invalid"],
  [{ width: -1 }, "viewport-invalid"],
  [{ horizontalOverflow: -1 }, "overflow-invalid"],
  [{ horizontalOverflow: 30 }, "horizontal-overflow"],
  [{ scrollY: -1 }, "scroll-invalid"],
  [{ historyIndex: -1 }, "history-index-invalid"],
  [{ historyIndex: 1.5 }, "history-index-invalid"],
  [{ observedAt: -1 }, "snapshot-time-invalid"],
  [{ phase: "loading" }, "loading-not-busy"],
  [{ phase: "empty" }, "outcome-silent"],
  [{ phase: "error" }, "outcome-silent"],
]) {
  test(`snapshot failure ${expected} from ${JSON.stringify(patch)}`, () => {
    assert.ok(codes(snapshotFindings(valid(patch))).includes(expected));
  });
}
test("loading phase passes with busy live announcement", () => {
  const state = valid({ phase: "loading", announcements: [announcement({ busy: true })] });
  assert.equal(codes(snapshotFindings(state)).includes("loading-not-busy"), false);
});
test("empty phase passes with accessible live announcement", () => {
  const state = valid({ phase: "empty", announcements: [announcement()] });
  assert.equal(codes(snapshotFindings(state)).includes("outcome-silent"), false);
});
test("route event checks intended target", () => {
  assert.ok(codes(transitionFindings(event({ action: "navigate", expectedRoute: "/help" }))).includes("navigation-route-mismatch"));
});
test("unrelated action cannot silently navigate", () => {
  const changed = valid({ route: "/help" });
  assert.ok(codes(transitionFindings(event({ action: "retry", after: changed }))).includes("unexpected-route-change"));
});
test("disconnect requires an offline observation", () => {
  assert.ok(codes(transitionFindings(event({ action: "disconnect" }))).includes("disconnect-unobserved"));
});
test("reconnect requires an online observation", () => {
  const before = valid({ connectivity: "offline" });
  const after = valid({ connectivity: UNKNOWN });
  assert.ok(codes(transitionFindings(event({ action: "reconnect", before, after }))).includes("reconnect-unobserved"));
});
test("language switch cannot reset route", () => {
  const after = valid({ language: "fr", route: "/help" });
  assert.ok(codes(transitionFindings(event({ action: "language", after }))).includes("locale-route-reset"));
});
test("event timestamps must not move backwards", () => {
  const after = valid({ observedAt: 50 });
  assert.ok(codes(transitionFindings(event({ after }))).includes("event-clock-reversed"));
});
test("missing event duration remains an information finding", () => {
  assert.ok(codes(transitionFindings(event({ elapsedMs: null }))).includes("event-duration-unknown"));
});
test("negative event duration is rejected", () => {
  assert.ok(codes(transitionFindings(event({ elapsedMs: -1 }))).includes("event-duration-invalid"));
});
test("retry from ready state is rejected", () => {
  assert.ok(codes(transitionFindings(event({ action: "retry" }))).includes("retry-without-failure"));
});
test("clear action cannot immediately begin loading without intent", () => {
  const after = valid({ phase: "loading" });
  assert.ok(codes(transitionFindings(event({ action: "clear", after }))).includes("clear-started-loading"));
});
test("search cannot stay idle", () => {
  const after = valid({ phase: "idle" });
  assert.ok(codes(transitionFindings(event({ action: "search", after }))).includes("search-still-idle"));
});
test("expected resource outcome must be observed", () => {
  assert.ok(codes(transitionFindings(event({ expectedResponse: "success" }))).includes("response-unobserved"));
});
test("back history must go backwards", () => {
  assert.ok(codes(transitionFindings(event({ action: "back" }))).includes("history-back-direction"));
});
test("forward history must go forwards", () => {
  assert.ok(codes(transitionFindings(event({ action: "forward" }))).includes("history-forward-direction"));
});
test("unexpected language changes are caught", () => {
  const after = valid({ language: "fr" });
  assert.ok(codes(transitionFindings(event({ action: "focus", after }))).includes("unexpected-language-change"));
});
test("trace with no actions preserves initial snapshot", () => {
  assert.deepEqual(finalSnapshot(trace()), valid());
});
test("trace timeline includes each resulting snapshot", () => {
  const next = valid({ observedAt: 150 });
  assert.equal(traceTimeline(trace({ events: [event({ after: next })] })).length, 2);
});
test("trace requires identifier", () => {
  assert.ok(codes(traceFindings(trace({ id: "" }))).includes("trace-id-empty"));
});
test("trace detects repeated event identifiers", () => {
  const first = event();
  assert.ok(codes(traceFindings(trace({ events: [first, first] }))).includes("event-id-duplicate"));
});
test("trace detects broken state chain", () => {
  const first = event({ after: valid({ observedAt: 150 }) });
  const second = event({ id: "next" });
  assert.ok(codes(traceFindings(trace({ events: [first, second] }))).includes("trace-chain-broken"));
});
test("receipt for clean trace is pass", () => {
  assert.equal(receiptFromTrace(trace()).result, "pass");
});
test("receipt for unknown locale is UNKNOWN", () => {
  assert.equal(receiptFromTrace(trace({ initial: valid({ language: UNKNOWN }) })).result, UNKNOWN);
});
test("receipt for structural failure is fail", () => {
  assert.equal(receiptFromTrace(trace({ initial: valid({ mainCount: 0 }) })).result, "fail");
});
test("receipt keeps evidence from final screen", () => {
  assert.deepEqual(receiptFromTrace(trace()).evidence, []);
});
test("matrix has eight cells per route", () => {
  assert.equal(routeMatrix(["/", "/help"]).length, 16);
});
test("matrix covers two languages and two widths", () => {
  const matrix = routeMatrix(["/"]);
  assert.equal(new Set(matrix.map((cell) => cell.locale)).size, 2);
  assert.equal(new Set(matrix.map((cell) => cell.width)).size, 2);
});
test("matrix keys are unique", () => {
  const cells = routeMatrix(["/"]);
  assert.equal(new Set(cells.map(matrixKey)).size, cells.length);
});
test("full matrix is complete", () => {
  const cells = routeMatrix(["/", "/help"]);
  assert.deepEqual(matrixFindings(cells, cells), []);
});
test("missing matrix cell is diagnosed", () => {
  const cells = routeMatrix(["/"]);
  assert.ok(codes(matrixFindings(cells, cells.slice(1))).includes("matrix-missing"));
});
test("duplicate matrix cell is diagnosed", () => {
  const cells = routeMatrix(["/"]);
  assert.ok(codes(matrixFindings(cells, [...cells, cells[0]])).includes("matrix-duplicate"));
});
test("unexpected matrix cell is diagnosed", () => {
  const cells = routeMatrix(["/"]);
  assert.ok(codes(matrixFindings(cells, [...cells, ...routeMatrix(["/other"]).slice(0, 1)])).includes("matrix-unexpected"));
});
test("route inventory accepts safe paths", () => {
  assert.deepEqual(routeInventoryFindings(["/", "/places", "/help"]), []);
});
test("route inventory rejects duplicates", () => {
  assert.ok(codes(routeInventoryFindings(["/", "/"])).includes("route-duplicate"));
});
test("route inventory rejects unsafe paths", () => {
  assert.ok(codes(routeInventoryFindings(["//outside"])).includes("route-invalid"));
});
test("diagnostic delta exposes a new failure", () => {
  const before = snapshotFindings(valid());
  const after = snapshotFindings(valid({ mainCount: 0 }));
  assert.ok(diagnosticDelta(before, after).newCodes.some((name) => name.includes("main-count")));
});
test("diagnostic delta exposes a fixed failure", () => {
  const before = snapshotFindings(valid({ mainCount: 0 }));
  const after = snapshotFindings(valid());
  assert.ok(diagnosticDelta(before, after).fixedCodes.some((name) => name.includes("main-count")));
});
test("failing steps include initial snapshot", () => {
  assert.ok(failingSteps(trace({ initial: valid({ title: "" }) })).includes(0));
});
test("trace summary counts zero actions", () => {
  assert.equal(traceSummary(trace()).actions, 0);
});
test("trace summary counts offline snapshots", () => {
  const changed = valid({ connectivity: "offline", phase: "offline" });
  const run = trace({ events: [event({ action: "disconnect", after: changed })] });
  assert.equal(traceSummary(run).offlineSteps, 1);
});
test("missing status text remains UNKNOWN", () => {
  assert.equal(expectedStatusText(valid()), UNKNOWN);
});
test("visible status text can be read", () => {
  assert.equal(expectedStatusText(valid({ announcements: [announcement()] })), "No results");
});
test("non-string reported value remains UNKNOWN", () => {
  assert.equal(reportedOrUnknown(5), UNKNOWN);
});
test("severity filters do not promote information to errors", () => {
  const findings = snapshotFindings(valid({ language: UNKNOWN }));
  assert.equal(retainBySeverity(findings, "error").some((finding) => finding.code === "language-unknown"), false);
});
test("a live interactive target can be retained in trace snapshot", () => {
  const state = valid({ targets: [sampleTarget()] });
  assert.equal(state.targets.length, 1);
});
