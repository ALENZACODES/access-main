import test from "node:test";
import assert from "node:assert/strict";
import {
  routeCoverage, replay, compareReplays, scenarioMatrix, scenarioCoverage,
  boundedScenarioSample, replayReport, replayFailureCodes, evidenceAtEnd,
} from "./p20ai-replay.ts";
const evidence = (changes = {}) => ({ id: "demo", value: "Example record", source: "Source",
  licence: "Licence", retrievedOn: "2026-11-20", tier: "E", ...changes });
const a11y = (changes = {}) => ({ focusId: "search", focusVisible: true, focusInDialog: false,
  focusInsideInert: false, targetWidth: 44, targetHeight: 44, dialogId: null,
  mainCount: 1, title: "Journey", heading: "Journey", horizontalOverflow: 0, ...changes });
const state = (changes = {}) => ({ route: "/journey", locale: "en", connection: "online",
  cache: "available", outcome: "ready", at: 100, historyIndex: 1, scrollY: 0,
  query: "", a11y: a11y(), evidence: [], statuses: [], ...changes });
const action = (changes = {}) => ({ id: "disconnect", kind: "disconnect", before: state(),
  after: state({ connection: "offline", cache: "available", at: 101 }), ...changes });
const entry = (changes = {}) => ({ url: "/index.html", purpose: "shell", result: "cache",
  cache: "hit", status: 200, bytes: 1200, capturedAt: 100, critical: true, ...changes });
const resources = (changes = {}) => ({ route: "/journey", locale: "en", offline: true,
  entries: [entry()], preparedAt: 101, displayReady: true, displayedProvenance: [], ...changes });
const step = (changes = {}) => ({ action: action(), label: "Connection lost", resources: resources(), ...changes });
const plan = (changes = {}) => ({ initial: state(), steps: [step()], requiredRoutes: ["/journey"],
  expectedLocale: "en", requireEvidence: false, offlineMustHaveCachedShell: true, ...changes });
const codes = (findings) => findings.map((item) => item.code);

test("reference plan replays cleanly", () => {
  const result = replay(plan());
  assert.equal(result.pass, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.actionCount, 1);
  assert.equal(result.offlineStepCount, 1);
});
test("the final state is the last action outcome", () => {
  assert.equal(replay(plan()).finalState.connection, "offline");
});
test("replay exposes visited routes", () => {
  assert.deepEqual(replay(plan()).visitedRoutes, ["/journey", "/journey"]);
});
test("empty plan has no actions", () => {
  const result = replay(plan({ steps: [], offlineMustHaveCachedShell: false }));
  assert.equal(result.actionCount, 0);
  assert.equal(result.pass, true);
});
test("route coverage accepts visited required routes", () => assert.deepEqual(routeCoverage(["/help"], ["/help"]), []));
test("missing route is diagnosed", () => {
  assert.ok(codes(routeCoverage(["/help"], ["/"])).includes("required-route-missing"));
});
test("unsafe required route is diagnosed", () => {
  assert.ok(codes(routeCoverage(["//outside"], ["//outside"])).includes("required-route-invalid"));
});
for (const [change, expected] of [
  [{ label: "" }, "step-label-UNKNOWN"],
  [{ resources: undefined }, "offline-envelope-UNKNOWN"],
  [{ resources: resources({ route: "/help" }) }, "envelope-route-mismatch"],
  [{ resources: resources({ locale: "fr" }) }, "envelope-locale-mismatch"],
  [{ resources: resources({ offline: false }) }, "envelope-connectivity-mismatch"],
  [{ resources: resources({ entries: [entry({ purpose: "image" })] }) }, "offline-shell-not-cached"],
  [{ resources: resources({ entries: [entry({ bytes: null })] }) }, "resource-total-UNKNOWN"],
  [{ resources: resources({ entries: [entry({ result: "failed" })] }) }, "critical-resource-unavailable"],
]) {
  test(`replay flags ${expected}`, () => {
    assert.ok(codes(replay(plan({ steps: [step(change)] })).findings).includes(expected));
  });
}
test("unexpected route change is reported as trace regression", () => {
  const altered = step({ action: action({ after: state({ route: "/help", connection: "offline" }) }) });
  const result = replay(plan({ steps: [altered], requiredRoutes: ["/journey"] }));
  assert.ok(codes(result.findings).includes("route-changed-unexpectedly"));
});
test("French locale mismatch is reported", () => {
  const altered = step({ action: action({ after: state({ locale: "fr", connection: "offline" }) }) });
  assert.ok(codes(replay(plan({ steps: [altered] })).findings).includes("replay-locale-drift"));
});
test("keyboard mismatched locale is detected", () => {
  const keyboard = { locale: "fr", items: [], strokes: [], openDialogId: null, startingId: null };
  assert.ok(codes(replay(plan({ steps: [step({ keyboard })] })).findings).includes("keyboard-locale-mismatch"));
});
test("keyboard failures are forwarded into replay", () => {
  const keyboard = { locale: "en", items: [{ id: "one", name: "", role: "button", tabIndex: 0,
    visible: true, disabled: false, inert: false, width: 44, height: 44, insideDialog: false }],
  strokes: [], openDialogId: null, startingId: null };
  assert.ok(codes(replay(plan({ steps: [step({ keyboard })] })).findings).includes("control-name-UNKNOWN"));
});
test("announcement failures are forwarded into replay", () => {
  const announcements = [{ locale: "en", text: "", priority: "off", busy: false,
    actionAt: 50, announcedAt: 60, outcome: "error" }];
  assert.ok(codes(replay(plan({ steps: [step({ announcements })] })).findings).includes("error-silenced"));
});
test("announcement language mismatch is detected", () => {
  const announcements = [{ locale: "fr", text: "Aucun résultat.", priority: "polite", busy: false,
    actionAt: 50, announcedAt: 60, outcome: "empty" }];
  assert.ok(codes(replay(plan({ steps: [step({ announcements })] })).findings).includes("announcement-locale-mismatch"));
});
test("required provenance survives disconnection", () => {
  const e = evidence();
  const before = state({ evidence: [e] });
  const after = state({ evidence: [e], connection: "offline", at: 101 });
  const result = replay(plan({ initial: before, steps: [step({ action: action({ before, after }) })], requireEvidence: true }));
  assert.equal(result.pass, true);
  assert.deepEqual(evidenceAtEnd(result), [e]);
});
test("required provenance lost during disconnect is diagnosed", () => {
  const before = state({ evidence: [evidence()] });
  const after = state({ evidence: [], connection: "offline", at: 101 });
  const result = replay(plan({ initial: before, steps: [step({ action: action({ before, after }) })], requireEvidence: true }));
  assert.ok(codes(result.findings).includes("evidence-lost"));
});
test("comparative replay detects newly introduced errors", () => {
  const before = replay(plan());
  const after = replay(plan({ steps: [step({ label: "" })] }));
  assert.ok(codes(compareReplays(before, after)).includes("new-regression"));
});
test("comparative replay detects action count loss", () => {
  const before = replay(plan());
  const after = replay(plan({ steps: [] }));
  assert.ok(codes(compareReplays(before, after)).includes("coverage-actions-lost"));
});
test("comparative replay detects offline case loss", () => {
  const before = replay(plan());
  const after = replay(plan({ steps: [] }));
  assert.ok(codes(compareReplays(before, after)).includes("coverage-offline-lost"));
});
test("comparative replay detects lost route coverage", () => {
  const before = replay(plan({ requiredRoutes: ["/journey"] }));
  const after = replay(plan({ initial: state({ route: "/help" }),
    steps: [], requiredRoutes: ["/help"] }));
  assert.ok(codes(compareReplays(before, after)).includes("coverage-route-lost"));
});
test("full scenario grid covers locale viewport and connectivity", () => {
  const matrix = scenarioMatrix(["/", "/help"]);
  assert.equal(matrix.length, 16);
  assert.equal(new Set(matrix.map((item) => item.key)).size, 16);
  assert.deepEqual(scenarioCoverage(matrix, matrix), []);
});
test("missing scenario is diagnosed", () => {
  const matrix = scenarioMatrix(["/"]);
  assert.ok(codes(scenarioCoverage(matrix, matrix.slice(1))).includes("scenario-missing"));
});
test("duplicated scenario is diagnosed", () => {
  const matrix = scenarioMatrix(["/"]);
  assert.ok(codes(scenarioCoverage(matrix, [...matrix, matrix[0]])).includes("scenario-duplicate"));
});
test("unexpected scenario is diagnosed", () => {
  const matrix = scenarioMatrix(["/"]);
  assert.ok(codes(scenarioCoverage(matrix, [...matrix, ...scenarioMatrix(["/help"])]))
    .includes("scenario-unexpected"));
});
for (const size of [1, 2, 3, 4, 6, 8]) {
  test(`bounded scenario sampling respects limit ${size}`, () => {
    const matrix = scenarioMatrix(["/", "/help"]);
    const result = boundedScenarioSample(matrix, size);
    assert.ok(result.length <= size);
    assert.equal(result[0].key, matrix[0].key);
    if (size > 1) assert.equal(result.at(-1).key, matrix.at(-1).key);
  });
}
test("invalid scenario sample size fails", () => assert.throws(() => boundedScenarioSample([], 0), RangeError));
test("report retains trace summary", () => assert.match(replayReport(replay(plan())), /status=PASS/));
test("report includes failure code", () => {
  const result = replay(plan({ steps: [step({ label: "" })] }));
  assert.ok(replayFailureCodes(result).includes("step-label-UNKNOWN"));
  assert.match(replayReport(result), /step-label-UNKNOWN/);
});
test("report rejects noninteger limit", () => assert.throws(() => replayReport(replay(plan()), 1.5), RangeError));
