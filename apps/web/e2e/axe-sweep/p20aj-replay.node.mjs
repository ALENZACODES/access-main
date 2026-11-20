import test from "node:test";
import assert from "node:assert/strict";
import {
  scenarioFindings, plannedAction, sequenceScenario, reconcileReplay,
  compareReplay, preserveRecords, coverageForRoutes, coverageSummary,
  missingCells, sampleRouteWindows, replayDiagnostic, coverageGate,
  timelineFindings,
} from "./p20aj-replay.ts";
import { sampleSnapshot, sampleEvidence } from "./p20aj-types.ts";
import { coverageMatrix } from "./p20aj-offline.ts";
const codes = (items) => items.map((item) => item.code);
const s = (change = {}) => sampleSnapshot(change);
const action = (kind, change = {}) => plannedAction(kind, change);
const scenario = (actions, change = {}) => sequenceScenario(s(change), actions, "Journey");
const frame = (kind, before = s(), after = s(), change = {}) => ({ action: action(kind), before, after, observed: true, ...change });
for (const kind of ["navigate", "search", "clear", "retry", "disconnect", "reconnect", "language", "back", "forward", "open", "close", "export", "import"]) {
  test(`planned action preserves kind ${kind}`, () => {
    assert.equal(action(kind).kind, kind);
  });
  test(`planned action has no invented expected phase for ${kind}`, () => {
    assert.equal(action(kind).expectedPhase, null);
  });
}
test("scenario retains supplied actions", () => {
  assert.equal(scenario([action("search"), action("clear")]).actions.length, 2);
});
test("scenario without name is rejected", () => {
  assert.ok(codes(scenarioFindings(sequenceScenario(s(), [], ""))).includes("scenario-name"));
});
test("unsafe initial route is rejected", () => {
  assert.ok(codes(scenarioFindings(sequenceScenario(s({ route: "//host" }), []))).includes("scenario-route"));
});
test("navigate requires a destination", () => {
  assert.ok(codes(scenarioFindings(scenario([action("navigate")]))).includes("scenario-navigation"));
});
test("navigate with valid destination passes", () => {
  assert.ok(!codes(scenarioFindings(scenario([action("navigate", { route: "/help" })]))).includes("scenario-navigation"));
});
test("unsafe navigation destination fails", () => {
  assert.ok(codes(scenarioFindings(scenario([action("navigate", { route: "https://external.test" })]))).includes("scenario-navigation"));
});
for (const kind of ["back", "forward"]) {
  test(`${kind} without known route reports informational gap`, () => {
    const findings = scenarioFindings(scenario([action(kind)]));
    assert.ok(findings.some((item) => item.code === "scenario-history-target-UNKNOWN" && item.severity === "information"));
  });
  test(`${kind} with known route does not report unknown history destination`, () => {
    assert.ok(!codes(scenarioFindings(scenario([action(kind, { route: "/help" })]))).includes("scenario-history-target-UNKNOWN"));
  });
}
for (const kind of ["clear", "retry", "search", "export"]) {
  test(`${kind} with unsafe optional target is rejected`, () => {
    assert.ok(codes(scenarioFindings(scenario([action(kind, { route: "//host" })]))).includes("scenario-target"));
  });
}
test("unobserved replay is incomplete", () => {
  const result = reconcileReplay(scenario([action("search")]), []);
  assert.equal(result.incomplete, true);
  assert.ok(codes(result.findings).includes("replay-observation-UNKNOWN"));
});
test("recorded replay is complete", () => {
  const result = reconcileReplay(scenario([action("search")]), [frame("search")]);
  assert.equal(result.incomplete, false);
  assert.equal(result.trace.steps.length, 1);
});
test("extra frames are rejected", () => {
  const result = reconcileReplay(scenario([]), [frame("search")]);
  assert.ok(codes(result.findings).includes("replay-extra-frames"));
});
test("mismatched replay action is diagnosed", () => {
  const result = reconcileReplay(scenario([action("search")]), [frame("clear")]);
  assert.ok(codes(result.findings).includes("replay-action-mismatch"));
});
test("disconnected initial snapshot is diagnosed", () => {
  const result = reconcileReplay(scenario([action("search")]), [frame("search", s({ route: "/help" }))]);
  assert.ok(codes(result.findings).includes("replay-disconnected"));
});
test("replay keeps expected action target", () => {
  const result = reconcileReplay(scenario([action("navigate", { route: "/help" })]),
    [frame("navigate", s(), s({ route: "/help", historyIndex: 1 }))]);
  assert.equal(result.trace.steps[0].targetRoute, "/help");
});
test("replay expected phase is enforced", () => {
  const result = reconcileReplay(scenario([action("search", { expectedPhase: "empty" })]), [frame("search")]);
  assert.ok(codes(result.findings).includes("outcome-mismatch"));
});
test("replay preserves evidence policy", () => {
  const result = reconcileReplay(scenario([action("search", { preserveEvidence: true })]), [frame("search")]);
  assert.equal(result.trace.steps[0].preserveEvidence, true);
});
test("replay with empty actions is complete", () => {
  const result = reconcileReplay(scenario([]), []);
  assert.equal(result.incomplete, false);
});
test("trace name survives replay", () => {
  const result = reconcileReplay(sequenceScenario(s(), [], "French offline"), []);
  assert.equal(result.trace.name, "French offline");
});
test("regression comparison catches new error", () => {
  const before = reconcileReplay(scenario([]), []);
  const after = reconcileReplay(scenario([action("search", { expectedPhase: "empty" })]), [frame("search")]);
  assert.ok(codes(compareReplay(before, after)).includes("new-regression"));
});
test("regression comparison catches newly missing observations", () => {
  const before = reconcileReplay(scenario([]), []);
  const after = reconcileReplay(scenario([action("search")]), []);
  assert.ok(codes(compareReplay(before, after)).includes("coverage-regressed"));
});
test("regression comparison catches lost steps", () => {
  const before = reconcileReplay(scenario([action("search")]), [frame("search")]);
  const after = reconcileReplay(scenario([]), []);
  assert.ok(codes(compareReplay(before, after)).includes("steps-lost"));
});
test("stable replay comparison has no change findings", () => {
  const result = reconcileReplay(scenario([]), []);
  assert.deepEqual(compareReplay(result, result), []);
});
test("evidence roundtrip preservation accepts translated label", () => {
  const first = sampleEvidence();
  assert.deepEqual(preserveRecords([first], [{ ...first, label: "Exemple" }], 1), []);
});
test("evidence roundtrip preservation rejects source drift", () => {
  const first = sampleEvidence();
  const second = { ...first, provenance: { ...first.provenance, source: "Other source" } };
  assert.ok(codes(preserveRecords([first], [second], 1)).includes("provenance-drift"));
});
for (const routes of [["/"], ["/", "/places"], ["/", "/help", "/places"]]) {
  test(`coverage is complete for ${routes.length} known routes`, () => {
    assert.deepEqual(coverageForRoutes(routes, coverageMatrix(routes)).findings, []);
  });
  test(`coverage is incomplete after one lost cell for ${routes.length} routes`, () => {
    const observations = coverageMatrix(routes).slice(1);
    assert.ok(codes(coverageForRoutes(routes, observations).findings).includes("matrix-missing"));
  });
  test(`missing cells enumerates ${routes.length} routes accurately`, () => {
    const expected = coverageMatrix(routes);
    assert.equal(missingCells(routes, expected.slice(1)).length, 1);
  });
}
test("coverage summary counts language and connectivity separately", () => {
  const summary = coverageSummary(coverageMatrix(["/"]));
  assert.equal(summary["en/online"], 2);
  assert.equal(summary["fr/offline"], 2);
});
test("coverage gate accepts all known cells", () => {
  assert.deepEqual(coverageGate(coverageForRoutes(["/"], coverageMatrix(["/"]))), []);
});
test("coverage gate reports missing offline cells", () => {
  const observed = coverageMatrix(["/"]).filter((cell) => cell.connectivity === "online");
  assert.ok(codes(coverageGate(coverageForRoutes(["/"], observed))).includes("offline-coverage-missing"));
});
test("coverage gate reports empty inventory", () => {
  assert.ok(codes(coverageGate(coverageForRoutes([], []))).includes("coverage-empty"));
});
for (const maximum of [1, 2, 3, 4, 5]) {
  test(`fair route sample respects maximum=${maximum}`, () => {
    const sample = sampleRouteWindows(["/", "/a", "/b", "/c", "/d", "/e"], maximum);
    assert.ok(sample.length <= maximum);
  });
}
test("fair route sample includes first and last for a nontrivial window", () => {
  const sample = sampleRouteWindows(["/", "/a", "/b", "/c", "/d"], 3);
  assert.equal(sample[0], "/");
  assert.equal(sample.at(-1), "/d");
});
test("invalid zero route window is rejected", () => {
  assert.throws(() => sampleRouteWindows(["/"], 0), RangeError);
});
test("invalid fractional route window is rejected", () => {
  assert.throws(() => sampleRouteWindows(["/"], 1.5), RangeError);
});
test("diagnostic includes trace identity", () => {
  assert.ok(replayDiagnostic(reconcileReplay(scenario([]), [])).includes("Journey"));
});
test("diagnostic states UNKNOWN when incomplete", () => {
  assert.ok(replayDiagnostic(reconcileReplay(scenario([action("search")]), [])).includes("UNKNOWN"));
});
test("diagnostic invalid limit is rejected", () => {
  assert.throws(() => replayDiagnostic(reconcileReplay(scenario([]), []), 0), RangeError);
});
test("timeline with ordered times does not reverse", () => {
  assert.ok(!codes(timelineFindings([s({ time: 100 }), s({ time: 200 })])).includes("timeline-reversed"));
});
test("timeline with reversed times is diagnosed", () => {
  assert.ok(codes(timelineFindings([s({ time: 200 }), s({ time: 100 })])).includes("timeline-reversed"));
});
test("timeline without time remains explicit uncertainty", () => {
  assert.ok(codes(timelineFindings([s({ time: null })])).includes("timeline-time-UNKNOWN"));
});
