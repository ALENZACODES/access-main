import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIONS, indexByLanguageAndId, compareRecord, compareSnapshots,
  actionCounts, proposedRetirements, retainableCachePaths,
  reconcilePairs, planResourceBudget,
} from "./changes.mjs";
import { AT, cache, clone, french, pair, record, source } from "./fixtures.node.mjs";

const policy = { asOf: AT };
const comparison = (before, after) => compareSnapshots(before, after, policy);

test("actions are explicit and non-executing", () => {
  assert.deepEqual(ACTIONS, ["ADD", "REPLACE", "RETAIN", "REVIEW", "RETIRE"]);
});
test("index rejects non-array input safely", () => {
  assert.equal(indexByLanguageAndId(null).size, 0);
});
test("index builds independent language keys", () => {
  assert.deepEqual([...indexByLanguageAndId(pair()).keys()], ["en/example-en", "fr/example-fr"]);
});
test("index does not invent missing identifiers", () => {
  assert.equal(indexByLanguageAndId([record({ id: "invalid id" })]).size, 0);
});
test("index does not store unknown language", () => {
  assert.equal(indexByLanguageAndId([record({ language: "xx" })]).size, 0);
});
test("index preserves first instance for duplicates", () => {
  const first = record();
  const second = record({ revision: 9 });
  assert.equal(indexByLanguageAndId([first, second]).get("en/example-en"), first);
});
test("empty before and after comparisons retain", () => {
  assert.equal(compareRecord(null, null).action, "RETAIN");
});
test("new record calls for add proposal", () => {
  assert.equal(compareRecord(null, record()).action, "ADD");
});
test("absent record calls for retirement proposal", () => {
  assert.equal(compareRecord(record(), null).action, "RETIRE");
});
test("identical record is retain proposal", () => {
  assert.deepEqual(compareRecord(record(), clone(record())), { action: "RETAIN", reasons: [] });
});
const singleChanges = [
  ["translation key", { translationKey: "different" }, "record.translationChanged"],
  ["kind", { kind: "service" }, "record.kindChanged"],
  ["state", { state: "UNKNOWN" }, "record.stateChanged"],
  ["revision", { revision: 2 }, "record.revisionChanged"],
  ["date", { recordedOn: "2026-11-19" }, "record.dateChanged"],
  ["title", { title: { en: "New title", fr: "Nouveau titre" } }, "copy.titleChanged"],
  ["summary", { summary: { en: "New summary", fr: "Nouveau résumé" } }, "copy.summaryChanged"],
  ["source membership", { sources: [source({ id: "second-source" })] }, "source.membershipChanged"],
  ["source tier", { sources: [source({ tier: "SECONDARY" })] }, "source.tierChanged"],
  ["source collection", { sources: [source({ collectedOn: "2026-11-18" })] }, "source.collectionChanged"],
  ["source licence", { sources: [source({ licence: "CC0" })] }, "source.licenceChanged"],
  ["source URL", { sources: [source({ url: "https://example.org/other" })] }, "source.urlChanged"],
  ["cache state", { cache: { state: "ABSENT" } }, "cache.stateChanged"],
  ["cache path", { cache: cache({ path: "/offline/evidence/new.json" }) }, "cache.pathChanged"],
  ["capture date", { cache: cache({ capturedOn: "2026-11-19" }) }, "cache.dateChanged"],
  ["cache bytes", { cache: cache({ bytes: 2048 }) }, "cache.bytesChanged"],
];
for (const [name, changes, reason] of singleChanges) {
  test(`comparison notices ${name}`, () => {
    const result = compareRecord(record(), record(changes));
    assert.equal(result.action, "REPLACE");
    assert.ok(result.reasons.includes(reason));
  });
}
test("comparison does not mutate either snapshot", () => {
  const before = record();
  const after = record({ revision: 2 });
  const copies = clone([before, after]);
  compareRecord(before, after);
  assert.deepEqual([before, after], copies);
});
test("equal bilingual snapshots are retained", () => {
  const result = comparison(pair(), pair());
  assert.deepEqual(result.changes.map((item) => item.action), ["RETAIN", "RETAIN"]);
});
test("pair additions are ordered by language/id", () => {
  const result = comparison([], pair());
  assert.deepEqual(result.changes.map((item) => item.action), ["ADD", "ADD"]);
});
test("missing prior pair yields retire proposals", () => {
  const result = comparison(pair(), []);
  assert.deepEqual(result.changes.map((item) => item.action), ["RETIRE", "RETIRE"]);
});
test("uncertain new record is review, not an approved add", () => {
  const result = comparison([], [record({ state: "UNKNOWN" }), french()]);
  assert.equal(result.changes[0].action, "REVIEW");
});
test("unsupported new record is review", () => {
  const result = comparison([], [record({ state: "UNSUPPORTED" }), french()]);
  assert.equal(result.changes[0].action, "REVIEW");
});
test("invalid copy is not included in an automatic proposal", () => {
  const result = comparison([], [record({ title: { en: "TODO", fr: "À venir" } }), french()]);
  assert.equal(result.changes[0].action, "REVIEW");
});
test("revision regression creates explicit finding", () => {
  const old = [record({ revision: 4 }), french({ revision: 4 })];
  const delta = comparison(old, pair());
  assert.ok(delta.findings.some((finding) => finding.code === "change.revisionRegressed"));
});
test("date regression creates explicit finding", () => {
  const old = [record({ recordedOn: AT }), french({ recordedOn: AT })];
  const delta = comparison(old, pair());
  assert.ok(delta.findings.some((finding) => finding.code === "change.dateRegressed"));
});
test("unchanged snapshots do not produce findings", () => {
  assert.deepEqual(comparison(pair(), pair()).findings, []);
});
test("source metadata changes are proposed for review through replace", () => {
  const after = pair().map((entry) => ({ ...entry, revision: 2, sources: [source({ licence: "CC0" })] }));
  assert.ok(comparison(pair(), after).changes.every((entry) => entry.action === "REPLACE"));
});
test("count summary includes all action types", () => {
  const counts = actionCounts([{ action: "ADD" }, { action: "ADD" }, { action: "RETIRE" }]);
  assert.deepEqual(counts, { ADD: 2, REPLACE: 0, RETAIN: 0, REVIEW: 0, RETIRE: 1 });
});
test("unrecognised action cannot affect action counts", () => {
  assert.equal(actionCounts([{ action: "PUBLISH" }]).ADD, 0);
});
test("retirement paths are proposals only", () => {
  assert.deepEqual(proposedRetirements(pair(), [], policy), ["en/example-en", "fr/example-fr"]);
});
test("retirement proposals do not modify source records", () => {
  const original = pair();
  const backup = clone(original);
  proposedRetirements(original, [], policy);
  assert.deepEqual(original, backup);
});
test("retainable paths include clean English/French cache entries", () => {
  const paths = retainableCachePaths(pair(), pair(), policy);
  assert.deepEqual(paths, ["/offline/evidence/example-en.json", "/offline/evidence/example-fr.json"]);
});
test("changed records cannot reuse cached retain path automatically", () => {
  const result = retainableCachePaths(pair(), pair().map((entry) => ({ ...entry, revision: 2 })), policy);
  assert.deepEqual(result, []);
});
test("retained pair contains a single bilingual group", () => {
  const result = reconcilePairs(pair(), pair(), policy);
  assert.equal(result.pairs.length, 2);
});
test("pair grouping does not claim mixed actions when unchanged", () => {
  const result = reconcilePairs(pair(), pair(), policy);
  assert.ok(result.pairs.every((entry) => entry.mixed === false));
});
test("resource budget counts distinct cache resources", () => {
  const result = planResourceBudget(pair(), policy);
  assert.equal(result.count, 2);
  assert.equal(result.bytes, 2048);
});
test("resource budget holds if total exceeds configured limit", () => {
  const result = planResourceBudget(pair(), { ...policy, maximumBytes: 1500 });
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasons.includes("cache.totalBudgetExceeded"));
});
test("resource budget rejects absent collection", () => {
  assert.equal(planResourceBudget(null, policy).decision, "HOLD");
});
test("resource budget refuses invalid local path", () => {
  const result = planResourceBudget([record({ cache: cache({ path: "/bad/a" }) }), french()], policy);
  assert.ok(result.reasons.includes("cache.unsafePath"));
});
test("resource budget cannot accept unknown record status", () => {
  assert.notEqual(planResourceBudget([record({ state: "UNKNOWN" }), french()], policy).decision, "READY");
});
test("resource planning is deterministic for equal inputs", () => {
  assert.deepEqual(planResourceBudget(pair(), policy), planResourceBudget(pair(), policy));
});
