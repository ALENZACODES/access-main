import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DECISIONS, PRIORITIES, policyOptions, sourceAge, cacheAge,
  sourceDecision, cacheDecision, recordReadiness, pairedReadiness,
  readinessSummary, candidateQueues, inspectPublicationWindow,
  transitionSignals, evidenceCoverage, readinessIssues,
} from "./readiness.mjs";
import { AT, cache, clone, findCodes, french, pair, record, source } from "./fixtures.node.mjs";

const policy = policyOptions({ asOf: AT });
const reasons = (result) => result.reasons;

test("readiness vocabulary includes unknown", () => {
  assert.deepEqual(DECISIONS, ["READY", "HOLD", "UNKNOWN"]);
});
test("priorities are stable vocabulary", () => {
  assert.deepEqual(PRIORITIES, ["critical", "high", "normal", "low"]);
});
test("default policy contains bounded dates", () => {
  assert.equal(policy.asOf, AT);
  assert.equal(policy.maximumAgeDays, 90);
  assert.equal(policy.maximumCaptureAgeDays, 30);
});
test("policy is immutable", () => assert.equal(Object.isFrozen(policy), true));
for (const value of [null, [], "policy", 1]) {
  test(`non-object policy rejected: ${String(value)}`, () => {
    assert.throws(() => policyOptions(value), TypeError);
  });
}
for (const [key, value] of [
  ["asOf", "yesterday"], ["maximumAgeDays", -1], ["maximumAgeDays", 3651],
  ["maximumAgeDays", 0.5], ["maximumCaptureAgeDays", -1],
  ["maximumCaptureAgeDays", 4000], ["maximumBytes", 0],
  ["maximumBytes", 1.5], ["maximumBytes", 1_000_000_001],
  ["allowCommunity", "yes"],
]) {
  test(`invalid policy field ${key} rejected: ${value}`, () => {
    assert.throws(() => policyOptions({ [key]: value }), TypeError);
  });
}
test("explicit zero-day limits are allowed", () => {
  assert.equal(policyOptions({ maximumAgeDays: 0 }).maximumAgeDays, 0);
});
test("explicit false community setting is retained", () => {
  assert.equal(policyOptions({ allowCommunity: false }).allowCommunity, false);
});
test("source age counts elapsed calendar days", () => {
  assert.equal(sourceAge(source(), AT), 2);
});
test("cache age counts elapsed calendar days", () => {
  assert.equal(cacheAge(cache(), AT), 1);
});
test("invalid source dates produce no invented age", () => {
  assert.equal(sourceAge(source({ collectedOn: "invalid" }), AT), null);
});
test("invalid cache dates produce no invented age", () => {
  assert.equal(cacheAge(cache({ capturedOn: "invalid" }), AT), null);
});

test("fresh primary source is ready", () => {
  assert.equal(sourceDecision(source(), policy).decision, "READY");
});
test("fresh secondary source is ready", () => {
  assert.equal(sourceDecision(source({ tier: "SECONDARY" }), policy).decision, "READY");
});
test("fresh community source is ready when policy permits it", () => {
  assert.equal(sourceDecision(source({ tier: "COMMUNITY" }), policy).decision, "READY");
});
test("disabled community source is held", () => {
  const result = sourceDecision(source({ tier: "COMMUNITY" }), policyOptions({ allowCommunity: false }));
  assert.equal(result.decision, "HOLD");
  assert.ok(reasons(result).includes("source.communityDisabled"));
});
test("unknown source tier stays unknown", () => {
  assert.equal(sourceDecision(source({ tier: "UNKNOWN", claim: "UNKNOWN" }), policy).decision, "UNKNOWN");
});
test("unknown source claim stays unknown", () => {
  assert.equal(sourceDecision(source({ claim: "UNKNOWN" }), policy).decision, "UNKNOWN");
});
test("unsupported source claim is held", () => {
  assert.equal(sourceDecision(source({ claim: "UNSUPPORTED" }), policy).decision, "HOLD");
});
test("missing source is held", () => {
  assert.equal(sourceDecision(null, policy).decision, "HOLD");
});
test("unrecognised source tier is held", () => {
  assert.equal(sourceDecision(source({ tier: "UNLISTED" }), policy).decision, "HOLD");
});
test("source older than policy limit is held", () => {
  const result = sourceDecision(source({ collectedOn: "2026-09-01" }), policyOptions({ maximumAgeDays: 30 }));
  assert.ok(result.reasons.includes("source.stale"));
});
test("source exactly at age boundary is ready", () => {
  const result = sourceDecision(source({ collectedOn: "2026-11-17" }), policyOptions({ maximumAgeDays: 2 }));
  assert.equal(result.decision, "READY");
});
test("source with future date is held", () => {
  assert.ok(sourceDecision(source({ collectedOn: "2026-11-20" }), policy).reasons.includes("source.futureDate"));
});
test("source with absent date is held", () => {
  assert.ok(sourceDecision(source({ collectedOn: "n/a" }), policy).reasons.includes("source.missingDate"));
});

test("present fresh cache is ready", () => {
  assert.equal(cacheDecision(cache(), policy).decision, "READY");
});
test("absent cache is held", () => {
  assert.equal(cacheDecision({ state: "ABSENT" }, policy).decision, "HOLD");
});
test("unknown cache remains unknown", () => {
  assert.equal(cacheDecision({ state: "UNKNOWN" }, policy).decision, "UNKNOWN");
});
test("missing cache is held", () => {
  assert.equal(cacheDecision(null, policy).decision, "HOLD");
});
test("invalid cache state is held", () => {
  assert.ok(cacheDecision(cache({ state: "MAYBE" }), policy).reasons.includes("cache.invalidState"));
});
test("untrusted cache path is held", () => {
  assert.ok(cacheDecision(cache({ path: "/elsewhere/a" }), policy).reasons.includes("cache.invalidPath"));
});
test("cache beyond individual size policy is held", () => {
  assert.ok(cacheDecision(cache({ bytes: 1024 }), policyOptions({ maximumBytes: 100 })).reasons.includes("cache.tooLarge"));
});
test("cache missing positive bytes is held", () => {
  assert.ok(cacheDecision(cache({ bytes: 0 }), policy).reasons.includes("cache.invalidBytes"));
});
test("cache past capture-age limit is held", () => {
  assert.ok(cacheDecision(cache({ capturedOn: "2026-10-01" }), policy).reasons.includes("cache.stale"));
});
test("cache exactly at age limit is ready", () => {
  assert.equal(cacheDecision(cache({ capturedOn: "2026-11-18" }), policyOptions({ maximumCaptureAgeDays: 1 })).decision, "READY");
});
test("cache future capture is held", () => {
  assert.ok(cacheDecision(cache({ capturedOn: "2026-11-20" }), policy).reasons.includes("cache.futureDate"));
});
test("cache invalid capture is held", () => {
  assert.ok(cacheDecision(cache({ capturedOn: "yesterday" }), policy).reasons.includes("cache.missingDate"));
});

test("complete record is ready", () => {
  assert.equal(recordReadiness(record(), policy).decision, "READY");
});
test("uncertain record remains uncertain", () => {
  assert.equal(recordReadiness(record({ state: "UNKNOWN" }), policy).decision, "UNKNOWN");
});
test("unsupported record is held", () => {
  assert.equal(recordReadiness(record({ state: "UNSUPPORTED" }), policy).decision, "HOLD");
});
test("record with invalid language is held", () => {
  assert.equal(recordReadiness(record({ language: "xx" }), policy).decision, "HOLD");
});
test("record missing French title is held", () => {
  assert.equal(recordReadiness(record({ title: { en: "Entrance" } }), policy).decision, "HOLD");
});
test("record with unknown cache remains uncertain", () => {
  assert.equal(recordReadiness(record({ cache: { state: "UNKNOWN" } }), policy).decision, "UNKNOWN");
});
test("record with old cache is held", () => {
  assert.equal(recordReadiness(record({ cache: cache({ capturedOn: "2026-09-01" }) }), policy).decision, "HOLD");
});
test("record with unknown evidence tier stays uncertain", () => {
  const item = record({ state: "UNKNOWN", sources: [source({ tier: "UNKNOWN", claim: "UNKNOWN" })] });
  assert.equal(recordReadiness(item, policy).decision, "UNKNOWN");
});

test("complete pair is ready", () => {
  assert.equal(pairedReadiness(pair(), policy).decision, "READY");
});
test("single-language pair is held", () => {
  assert.equal(pairedReadiness([record()], policy).decision, "HOLD");
});
test("one uncertain language yields uncertain pair", () => {
  const results = pairedReadiness([record({ state: "UNKNOWN" }), french()], policy);
  assert.equal(results.records[0].decision, "UNKNOWN");
});
test("held source overrides unknown cache in a pair", () => {
  const data = record({ sources: [source({ claim: "UNSUPPORTED" })], cache: { state: "UNKNOWN" } });
  assert.equal(pairedReadiness([data, french()], policy).decision, "HOLD");
});
test("invalid collection yields diagnostic rather than a crash", () => {
  assert.equal(pairedReadiness(null, policy).decision, "HOLD");
});
test("pair count reflects translations, not duplicate rows", () => {
  assert.equal(readinessSummary(pairedReadiness(pair(), policy)).pairs, 1);
});
test("candidate queues preserve ready pair IDs", () => {
  assert.deepEqual(candidateQueues(pairedReadiness(pair(), policy)).READY, ["example"]);
});
test("candidate queues separate held content", () => {
  assert.deepEqual(candidateQueues(pairedReadiness([record()], policy)).HOLD, ["example"]);
});
test("candidate queues separate unknown content", () => {
  const result = pairedReadiness([record({ state: "UNKNOWN" }), french()], policy);
  assert.deepEqual(candidateQueues(result).UNKNOWN, ["example"]);
});
test("readiness window takes ordered dates", () => {
  const window = inspectPublicationWindow(pair(), ["2026-11-18", "2026-11-19"], policy);
  assert.equal(window.length, 2);
});
for (const dates of [["2026-11-19", "2026-11-18"], ["2026-11-19", "2026-11-19"], ["n/a"], null]) {
  test(`invalid timeline rejected: ${JSON.stringify(dates)}`, () => {
    assert.throws(() => inspectPublicationWindow(pair(), dates, policy), TypeError);
  });
}
test("readiness window rejects overly large requests", () => {
  assert.throws(() => inspectPublicationWindow(pair(), Array(367).fill(AT)), TypeError);
});
test("transition signals identify a reduction in readiness", () => {
  const result = transitionSignals([{ date: "a", decision: "READY", ready: 2, held: 0, unknown: 0 }, { date: "b", decision: "HOLD", ready: 1, held: 1, unknown: 0 }]);
  assert.ok(result.some((entry) => entry.code === "ready.decreased"));
  assert.ok(result.some((entry) => entry.code === "overall.decisionChanged"));
});
test("no transition signals for identical counts", () => {
  const result = transitionSignals([{ date: "a", decision: "READY", ready: 1, held: 0, unknown: 0 }, { date: "b", decision: "READY", ready: 1, held: 0, unknown: 0 }]);
  assert.deepEqual(result, []);
});
test("coverage counts evidence sources", () => {
  assert.deepEqual(evidenceCoverage(pair()), { sources: 2, knownTier: 2, unknownTier: 0, missingDates: 0 });
});
test("coverage does not upgrade unknown-tier references", () => {
  const result = evidenceCoverage([record({ sources: [source({ tier: "UNKNOWN" })] })]);
  assert.equal(result.unknownTier, 1);
});
test("coverage counts absent collection dates", () => {
  assert.equal(evidenceCoverage([record({ sources: [source({ collectedOn: null })] })]).missingDates, 1);
});
test("coverage safely accepts invalid input", () => {
  assert.equal(evidenceCoverage(null).sources, 0);
});
test("readiness findings exclude underlying source text", () => {
  const findings = readinessIssues([record({ state: "UNKNOWN" }), french()], policy);
  assert.equal(JSON.stringify(findings).includes("Example public publisher"), false);
});
test("readiness assessment does not mutate records", () => {
  const original = pair();
  const before = clone(original);
  pairedReadiness(original, policy);
  assert.deepEqual(original, before);
});
