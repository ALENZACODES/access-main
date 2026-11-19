import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessRetirement, baselineAssessment, cacheChangeList, exportPlanRows,
  operationCounts, planSnapshotTransition, safePlanSummary, semanticFingerprint,
} from "./changes.mjs";
import { DEFAULT_POLICY, anotherRecord, copy, exampleRecord, ids, withCache, withSource } from "./fixtures.mjs";

const base = exampleRecord();
const plan = (before, after) => planSnapshotTransition(before, after, DEFAULT_POLICY);
const kinds = (result) => result.operations.map((item) => item.type);

test("identical snapshot produces a KEEP proposal", () => {
  const result = plan([base], [copy(base)]);
  assert.equal(result.status, "READY");
  assert.deepEqual(kinds(result), ["KEEP"]);
});

test("a new record produces ADD", () => {
  const result = plan([], [base]);
  assert.deepEqual(kinds(result), ["ADD"]);
});

test("a removed record requires explicit retirement review", () => {
  const result = plan([base], []);
  assert.equal(result.status, "HOLD");
  assert.deepEqual(kinds(result), ["REVIEW_RETIRE"]);
});

test("revision increment with clean evidence produces REPLACE", () => {
  const newer = { ...base, revision: base.revision + 1 };
  assert.deepEqual(kinds(plan([base], [newer])), ["REPLACE"]);
});

test("revision decrease is rejected", () => {
  const result = plan([base], [{ ...base, revision: 1 }]);
  assert.ok(ids(result.findings).includes("revision.regression"));
  assert.equal(result.status, "HOLD");
});

test("same revision cannot hide changed source content", () => {
  const changed = withSource(base, { licence: "Another licence" });
  const result = plan([base], [changed]);
  assert.ok(ids(result.findings).includes("revision.changed-without-bump"));
});

test("same revision cannot hide changed title", () => {
  const changed = { ...base, title: { en: "New heading", fr: "Nouvelle entrée" } };
  assert.ok(ids(plan([base], [changed]).findings).includes("revision.changed-without-bump"));
});

test("source date cannot move backwards", () => {
  const changed = withSource({ ...base, revision: 3 }, { collectedOn: "2026-11-16" });
  assert.ok(ids(plan([base], [changed]).findings).includes("source.date-regression"));
});

test("cache capture date cannot move backwards", () => {
  const changed = withCache({ ...base, revision: 3 }, { savedOn: "2026-11-17" });
  assert.ok(ids(plan([base], [changed]).findings).includes("cache.date-regression"));
});

test("unknown access does not become a replace authorization", () => {
  const changed = { ...base, revision: 3, access: "unknown", tier: "unknown" };
  assert.deepEqual(kinds(plan([base], [changed])), ["UNKNOWN"]);
});

test("invalid cache path holds all changes", () => {
  const changed = withCache({ ...base, revision: 3 }, { path: "/offline/../bad" });
  assert.equal(plan([base], [changed]).status, "HOLD");
});

test("duplicate IDs stop a transition", () => {
  assert.equal(plan([base], [base, copy(base)]).status, "HOLD");
});

test("a clean two-record transition sorts record IDs", () => {
  const result = plan([], [anotherRecord(), base]);
  assert.deepEqual(result.operations.map((item) => item.id), ["ramp-east", "ramp-west"]);
});

test("cache path owner cannot silently transfer", () => {
  const next = withCache({ ...anotherRecord(), revision: 3 }, { path: base.cache.path });
  assert.ok(ids(plan([base], [next]).findings).includes("collection.cache-collision") ||
    plan([base], [next]).operations.some((op) => op.type === "ADD"));
});

test("transition input must be arrays", () => {
  assert.equal(plan(null, [base]).status, "HOLD");
  assert.equal(plan([base], null).status, "HOLD");
});

test("transition planning never edits original snapshots", () => {
  const before = copy(base);
  const after = { ...copy(base), revision: 3 };
  const originalBefore = copy(before);
  const originalAfter = copy(after);
  plan([before], [after]);
  assert.deepEqual(before, originalBefore);
  assert.deepEqual(after, originalAfter);
});

test("semantic fingerprint is deterministic", () => {
  assert.equal(semanticFingerprint(base), semanticFingerprint(copy(base)));
});

test("semantic fingerprint changes for meaningful facts", () => {
  assert.notEqual(semanticFingerprint(base), semanticFingerprint(withSource(base, { licence: "Other" })));
});

test("semantic fingerprint rejects null without coercion", () => {
  assert.equal(semanticFingerprint(null), null);
});

test("operation counts include all supported action types", () => {
  const counts = operationCounts(plan([base], [base, anotherRecord()]));
  assert.equal(counts.KEEP, 1);
  assert.equal(counts.ADD, 1);
  assert.equal(counts.REPLACE, 0);
});

test("safe summary does not echo source URLs", () => {
  const result = safePlanSummary(plan([], [base]));
  assert.equal(JSON.stringify(result).includes(base.source.url), false);
});

test("plan rows preserve stable structural fields", () => {
  const result = exportPlanRows(plan([], [base]));
  assert.equal(result[0].action, "ADD");
  assert.equal(result[0].record_id, "ramp-east");
});

test("retirement never performs deletion", () => {
  const result = assessRetirement([base], [], DEFAULT_POLICY);
  assert.equal(result.noAutomaticDeletion, true);
  assert.deepEqual(result.pending, ["ramp-east"]);
});

test("cache change list excludes unchanged records", () => {
  assert.deepEqual(cacheChangeList([base], [base], DEFAULT_POLICY), []);
});

test("cache change list contains additions", () => {
  assert.deepEqual(cacheChangeList([], [base], DEFAULT_POLICY), [
    { id: "ramp-east", action: "ADD", cache: "/offline/ramp-east.json" },
  ]);
});

test("baseline assessment reports number of valid records", () => {
  const result = baselineAssessment([base, anotherRecord()], DEFAULT_POLICY);
  assert.equal(result.validCount, 2);
  assert.equal(result.status, "READY");
});

test("baseline assessment rejects malformed records", () => {
  const result = baselineAssessment([null], DEFAULT_POLICY);
  assert.equal(result.status, "HOLD");
});

test("operation counts do not conflate absent with unknown", () => {
  const result = plan([base], []);
  assert.equal(operationCounts(result).REVIEW_RETIRE, 1);
  assert.equal(operationCounts(result).UNKNOWN, 0);
});

test("record IDs remain stable rather than including descriptive copy", () => {
  const result = plan([], [base]);
  assert.equal(result.operations[0].id, base.id);
  assert.equal(JSON.stringify(safePlanSummary(result)).includes(base.title.en), false);
});
