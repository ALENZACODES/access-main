import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIONS, keyOf, indexRecords, sourceSignature, sourceSignatures, cacheSignature,
  recordDelta, compareSnapshots, countActions, safeRetainPaths, retirementProposals,
  replacementProposals, reviewProposals, resourceInventory, resourceBudget,
  changeTimeline, mergeChangeReasons, pairChangeSummary,
} from "./changes.mjs";
import { TODAY, cache, clone, french, pair, record, source } from "./fixtures.mjs";

const compare = (before, after) => compareSnapshots(before, after, { asOf: TODAY });
test("Actions describe plans rather than commands", () => assert.deepEqual(ACTIONS, ["ADD", "REPLACE", "RETAIN", "REVIEW", "RETIRE"]));
test("Record key is language-specific", () => assert.equal(keyOf(record()), "en/example-en"));
test("French key differs from English", () => assert.equal(keyOf(french()), "fr/example-fr"));
test("Invalid ID has no key", () => assert.equal(keyOf(record({ id: "bad id" })), null));
test("Invalid locale has no key", () => assert.equal(keyOf(record({ language: "de" })), null));
test("Null record has no key", () => assert.equal(keyOf(null), null));
test("Non-array record index is empty", () => assert.equal(indexRecords(null).size, 0));
test("Pair index contains two keys", () => assert.equal(indexRecords(pair()).size, 2));
test("Duplicate key index keeps first", () => { const first = record(); assert.equal(indexRecords([first, clone(first)]).get("en/example-en"), first); });
test("Source signature is null for invalid source", () => assert.equal(sourceSignature(null), null));
test("Source signature tracks URL", () => assert.notEqual(sourceSignature(source()), sourceSignature(source({ url: "https://example.org/new" }))));
test("Source signature tracks publisher", () => assert.notEqual(sourceSignature(source()), sourceSignature(source({ publisher: "Second publisher" }))));
test("Source signature tracks licence", () => assert.notEqual(sourceSignature(source()), sourceSignature(source({ licence: "CC0" }))));
test("Source signature tracks tier", () => assert.notEqual(sourceSignature(source()), sourceSignature(source({ tier: "UNKNOWN" }))));
test("Source signature tracks claim", () => assert.notEqual(sourceSignature(source()), sourceSignature(source({ claim: "UNKNOWN" }))));
test("Source signature tracks collection date", () => assert.notEqual(sourceSignature(source()), sourceSignature(source({ collectedOn: TODAY }))));
test("Source signature tracks review date", () => assert.notEqual(sourceSignature(source()), sourceSignature(source({ reviewedOn: undefined }))));
test("Source signatures are order independent", () => assert.deepEqual(sourceSignatures({ sources: [source(), source({ id: "other" })] }), sourceSignatures({ sources: [source({ id: "other" }), source()] })));
test("Missing source array produces empty signatures", () => assert.deepEqual(sourceSignatures({}), []));
test("Cache signature rejects null", () => assert.equal(cacheSignature(null), null));
test("Cache signature tracks date", () => assert.notEqual(cacheSignature(cache()), cacheSignature(cache({ capturedOn: "2026-11-18" }))));
test("Cache signature tracks size", () => assert.notEqual(cacheSignature(cache()), cacheSignature(cache({ bytes: 10 }))));
test("Cache signature tracks revision", () => assert.notEqual(cacheSignature(cache()), cacheSignature(cache({ revision: 2 }))));
test("Cache signature tracks path", () => assert.notEqual(cacheSignature(cache()), cacheSignature(cache({ path: "/offline/other.json" }))));
test("Cache signature tracks state", () => assert.notEqual(cacheSignature(cache()), cacheSignature({ state: "UNKNOWN" })));
test("Two missing records retain no change", () => assert.deepEqual(recordDelta(null, null), { action: "RETAIN", reasons: [] }));
test("New record yields add", () => assert.equal(recordDelta(null, record()).action, "ADD"));
test("Removed record yields retirement proposal", () => assert.equal(recordDelta(record(), null).action, "RETIRE"));
test("Unchanged record yields retain", () => assert.equal(recordDelta(record(), clone(record())).action, "RETAIN"));
const modifications = [
  ["translation", { translationKey: "different" }, "record.translation-key"],
  ["kind", { kind: "service" }, "record.kind"],
  ["access", { access: "UNKNOWN" }, "record.access"],
  ["revision", { revision: 2 }, "record.revision"],
  ["date", { recordedOn: "2026-11-18" }, "record.date"],
  ["title", { title: { en: "New title", fr: "Nouveau titre" } }, "copy.title"],
  ["summary", { summary: { en: "New summary", fr: "Nouveau résumé" } }, "copy.summary"],
  ["source", { sources: [source({ id: "changed" })] }, "source.attribution"],
  ["cache", { cache: cache({ bytes: 2048 }) }, "cache.snapshot"],
];
for (const [name, change, code] of modifications) {
  test(`Record delta detects ${name}`, () => {
    const delta = recordDelta(record(), record(change));
    assert.equal(delta.action, "REPLACE");
    assert.ok(delta.reasons.includes(code));
  });
}
test("Snapshot unchanged retains both languages", () => assert.deepEqual(compare(pair(), pair()).actions, { ADD: 0, REPLACE: 0, RETAIN: 2, REVIEW: 0, RETIRE: 0 }));
test("Snapshot new bilingual pair has two add proposals", () => assert.equal(compare([], pair()).actions.ADD, 2));
test("Snapshot removed bilingual pair has two retirement proposals", () => assert.equal(compare(pair(), []).actions.RETIRE, 2));
test("Snapshot changed revision has two replacements", () => assert.equal(compare(pair(), pair().map((item) => ({ ...item, revision: 2, cache: { ...item.cache, revision: 2 } }))).actions.REPLACE, 2));
test("Snapshot unknown access is a review", () => assert.equal(compare([], [record({ access: "UNKNOWN" }), french()]).actions.REVIEW, 1));
test("Snapshot unknown source is a review", () => assert.equal(compare([], [record({ sources: [source({ claim: "UNKNOWN" })] }), french()]).actions.REVIEW, 1));
test("Snapshot unknown tier is a review", () => assert.equal(compare([], [record({ sources: [source({ tier: "UNKNOWN" })] }), french()]).actions.REVIEW, 1));
test("Snapshot unknown cache is a review", () => assert.equal(compare([], [record({ cache: { state: "UNKNOWN" } }), french()]).actions.REVIEW, 1));
test("Snapshot unsupported record is review", () => assert.equal(compare([], [record({ access: "UNSUPPORTED" }), french()]).actions.REVIEW, 1));
test("Revision regression requires review", () => assert.ok(compare([record({ revision: 4 })], [record()]).findings.some((item) => item.code === "change.revision-regression")));
test("Date regression requires review", () => assert.ok(compare([record({ recordedOn: TODAY })], [record({ recordedOn: "2026-11-18" })]).findings.some((item) => item.code === "change.date-regression")));
test("Bad previous input yields separate finding", () => assert.ok(compare(null, pair()).findings.some((item) => item.code === "snapshot.before-invalid")));
test("Bad new input yields separate finding", () => assert.ok(compare(pair(), null).findings.some((item) => item.code === "snapshot.after-invalid")));
test("Action counter initializes all codes", () => assert.deepEqual(countActions([]), { ADD: 0, REPLACE: 0, RETAIN: 0, REVIEW: 0, RETIRE: 0 }));
test("Action counter excludes unknown action", () => assert.equal(countActions([{ action: "PUBLISH" }]).ADD, 0));
test("Action counter counts repeats", () => assert.equal(countActions([{ action: "ADD" }, { action: "ADD" }]).ADD, 2));
test("Safe retain returns stable cache assets", () => assert.deepEqual(safeRetainPaths(pair(), pair(), { asOf: TODAY }), ["/offline/example-en.json", "/offline/example-fr.json"]));
test("Changed records cannot retain prior assets", () => assert.deepEqual(safeRetainPaths(pair(), pair().map((item) => ({ ...item, revision: 2 })), { asOf: TODAY }), []));
test("Missing prior records cannot retain assets", () => assert.deepEqual(safeRetainPaths([], pair(), { asOf: TODAY }), []));
test("Retirement proposals include both locales", () => assert.deepEqual(retirementProposals(pair(), [], { asOf: TODAY }), ["en/example-en", "fr/example-fr"]));
test("No retirements when snapshots equal", () => assert.deepEqual(retirementProposals(pair(), pair(), { asOf: TODAY }), []));
test("Replacement proposals return reasons", () => assert.ok(replacementProposals(pair(), pair().map((item) => ({ ...item, recordedOn: "2026-11-18" })), { asOf: TODAY }).every((item) => item.reasons.includes("record.date"))));
test("Review proposals expose uncertainty", () => assert.ok(reviewProposals([], [record({ access: "UNKNOWN" }), french()], { asOf: TODAY }).some((item) => item.reasons.includes("record.unknown"))));
test("Resource inventory counts distinct paths", () => assert.equal(resourceInventory(pair()).count, 2));
test("Resource inventory sums bytes", () => assert.equal(resourceInventory(pair()).bytes, 2048));
test("Resource inventory rejects non-array", () => assert.equal(resourceInventory(null).count, 0));
test("Resource inventory notes path collision", () => assert.equal(resourceInventory([record(), french({ cache: cache() })]).conflicts.length, 1));
test("Resource inventory omits absent cache", () => assert.equal(resourceInventory([record({ cache: { state: "ABSENT" } })]).count, 0));
test("Resource budget passes small assets", () => assert.equal(resourceBudget(pair(), 2048).status, "READY"));
test("Resource budget holds oversize inventory", () => assert.equal(resourceBudget(pair(), 2047).status, "HOLD"));
test("Resource budget flags path conflict", () => assert.equal(resourceBudget([record(), french({ cache: cache() })]).status, "HOLD"));
test("Resource budget refuses missing collection", () => assert.equal(resourceBudget(null).status, "HOLD"));
for (const value of [0, -1, 1.5, NaN, Infinity, "100"]) {
  test(`Resource budget rejects invalid limit ${String(value)}`, () => assert.throws(() => resourceBudget(pair(), value), TypeError));
}
test("Timeline compares adjacent snapshots", () => assert.equal(changeTimeline([{ asOf: "2026-11-18", records: pair() }, { asOf: TODAY, records: pair() }]).length, 1));
test("Timeline permits no change observations", () => assert.deepEqual(changeTimeline([], { asOf: TODAY }), []));
test("Timeline rejects non-array", () => assert.throws(() => changeTimeline(null), TypeError));
test("Timeline rejects reversed dates", () => assert.throws(() => changeTimeline([{ asOf: TODAY, records: pair() }, { asOf: "2026-11-18", records: pair() }]), TypeError));
test("Timeline rejects repeated dates", () => assert.throws(() => changeTimeline([{ asOf: TODAY, records: pair() }, { asOf: TODAY, records: pair() }]), TypeError));
test("Timeline rejects malformed observations", () => assert.throws(() => changeTimeline([null, {}]), TypeError));
test("Timeline rejects excess observations", () => assert.throws(() => changeTimeline(Array(101).fill({})), TypeError));
test("Reason merge counts duplicate reasons", () => assert.deepEqual(mergeChangeReasons([{ reasons: ["x", "y"] }, { reasons: ["x"] }]), [{ reason: "x", count: 2 }, { reason: "y", count: 1 }]));
test("Pair change summary identifies identical actions", () => assert.deepEqual(pairChangeSummary([{ key: "en/example", action: "RETAIN" }, { key: "fr/example", action: "RETAIN" }]), [{ id: "example", actions: ["RETAIN"], mixed: false }]));
test("Pair change summary identifies mixed actions", () => assert.equal(pairChangeSummary([{ key: "en/example", action: "RETAIN" }, { key: "fr/example", action: "REPLACE" }])[0].mixed, true));
test("Planning never changes the snapshots", () => { const before = pair(); const after = pair(); const copies = clone([before, after]); compare(before, after); assert.deepEqual([before, after], copies); });
test("Planning output does not include record descriptions", () => assert.equal(JSON.stringify(compare(pair(), pair())).includes("Public entrance information"), false));
