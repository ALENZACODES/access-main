import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DECISIONS, PRIORITIES, policyOptions, policyDifferences, evidenceAge, cacheAge,
  sourceReadiness, cacheReadiness, joinDecisions, recordReadiness, batchReadiness,
  queueByStatus, readinessTrends, trendSignals, classifyFindingPriority,
  actionQueue, releaseGate, reasonSummary, readinessIssues,
} from "./readiness.mjs";
import { TODAY, cache, clone, french, pair, record, source } from "./fixtures.mjs";

const baseline = policyOptions({ asOf: TODAY });
test("Decisions are frozen and include unknown", () => assert.deepEqual(DECISIONS, ["READY", "HOLD", "UNKNOWN"]));
test("Priority options cover review urgency", () => assert.deepEqual(PRIORITIES, ["immediate", "high", "normal", "low"]));
test("Policy is immutable", () => assert.equal(Object.isFrozen(baseline), true));
test("Default policy uses stated date", () => assert.equal(baseline.asOf, TODAY));
test("Default age limit is explicit", () => assert.equal(baseline.maxSourceAgeDays, 120));
test("Default capture limit is explicit", () => assert.equal(baseline.maxCacheAgeDays, 30));
test("Default byte limit is explicit", () => assert.equal(baseline.maxCacheBytes, 100_000_000));
test("Language pairs are required by default", () => assert.equal(baseline.requirePairs, true));
test("French typography is opt-in", () => assert.equal(baseline.frenchTypography, false));
test("Community evidence is enabled by default", () => assert.equal(baseline.allowCommunity, true));
for (const value of [null, false, [], "options", 23]) {
  test(`Policy rejects invalid object ${typeof value}`, () => assert.throws(() => policyOptions(value), TypeError));
}
for (const [field, value] of [["asOf", "tomorrow"], ["maxSourceAgeDays", -1], ["maxSourceAgeDays", 36501], ["maxSourceAgeDays", 1.2], ["maxCacheAgeDays", -1], ["maxCacheAgeDays", 36501], ["maxCacheAgeDays", 0.1], ["maxCacheBytes", 0], ["maxCacheBytes", 1.5], ["maxCacheBytes", 1_000_000_001], ["allowCommunity", "yes"], ["requirePairs", 1], ["frenchTypography", "true"]]) {
  test(`Policy rejects ${field} invalid value`, () => assert.throws(() => policyOptions({ [field]: value }), TypeError));
}
test("Policy permits zero-day source limit", () => assert.equal(policyOptions({ maxSourceAgeDays: 0 }).maxSourceAgeDays, 0));
test("Policy permits zero-day cache limit", () => assert.equal(policyOptions({ maxCacheAgeDays: 0 }).maxCacheAgeDays, 0));
test("Policy comparison has no differences for equals", () => assert.deepEqual(policyDifferences({}, {}), []));
test("Policy comparison identifies changed cache days", () => assert.deepEqual(policyDifferences({}, { maxCacheAgeDays: 0 }), ["maxCacheAgeDays"]));
test("Policy comparison identifies changed community restriction", () => assert.deepEqual(policyDifferences({}, { allowCommunity: false }), ["allowCommunity"]));
test("Source age is one day", () => assert.equal(evidenceAge(source(), TODAY), 1));
test("Cache age is zero days", () => assert.equal(cacheAge(cache(), TODAY), 0));
test("Source age does not infer malformed date", () => assert.equal(evidenceAge(source({ collectedOn: "bad" }), TODAY), null));
test("Cache age does not infer malformed date", () => assert.equal(cacheAge(cache({ capturedOn: "bad" }), TODAY), null));
test("Source age is negative for future date", () => assert.equal(evidenceAge(source({ collectedOn: "2026-11-20" }), TODAY), -1));
test("Source with primary support is ready", () => assert.equal(sourceReadiness(source(), baseline).status, "READY"));
test("Source with secondary support is ready", () => assert.equal(sourceReadiness(source({ tier: "SECONDARY" }), baseline).status, "READY"));
test("Source with community support is ready by default", () => assert.equal(sourceReadiness(source({ tier: "COMMUNITY" }), baseline).status, "READY"));
test("Disabled community source is held", () => assert.equal(sourceReadiness(source({ tier: "COMMUNITY" }), { allowCommunity: false }).status, "HOLD"));
test("Unknown source tier stays unknown", () => assert.equal(sourceReadiness(source({ tier: "UNKNOWN" }), baseline).status, "UNKNOWN"));
test("Unknown source claim stays unknown", () => assert.equal(sourceReadiness(source({ claim: "UNKNOWN" }), baseline).status, "UNKNOWN"));
test("Unsupported source claim is held", () => assert.equal(sourceReadiness(source({ claim: "UNSUPPORTED" }), baseline).status, "HOLD"));
test("Missing source is held", () => assert.equal(sourceReadiness(null, baseline).status, "HOLD"));
test("Missing source date is held", () => assert.equal(sourceReadiness(source({ collectedOn: "invalid" }), baseline).status, "HOLD"));
test("Future source date is held", () => assert.equal(sourceReadiness(source({ collectedOn: "2026-11-20" }), baseline).status, "HOLD"));
test("Stale source is held", () => assert.equal(sourceReadiness(source({ collectedOn: "2026-01-01" }), baseline).status, "HOLD"));
test("Source at exact age boundary is ready", () => assert.equal(sourceReadiness(source(), { asOf: TODAY, maxSourceAgeDays: 1 }).status, "READY"));
test("Source past age boundary is held", () => assert.equal(sourceReadiness(source(), { asOf: TODAY, maxSourceAgeDays: 0 }).status, "HOLD"));
test("Unknown source preserves unknown over stale date", () => assert.equal(sourceReadiness(source({ claim: "UNKNOWN", collectedOn: "2020-01-01" }), baseline).status, "UNKNOWN"));
test("Present cache is ready", () => assert.equal(cacheReadiness(cache(), baseline).status, "READY"));
test("Missing cache is held", () => assert.equal(cacheReadiness(null, baseline).status, "HOLD"));
test("Absent cache is held", () => assert.equal(cacheReadiness({ state: "ABSENT" }, baseline).status, "HOLD"));
test("Unknown cache stays unknown", () => assert.equal(cacheReadiness({ state: "UNKNOWN" }, baseline).status, "UNKNOWN"));
test("Unknown cache cannot become ready with bytes", () => assert.equal(cacheReadiness({ state: "UNKNOWN", bytes: 1 }, baseline).status, "UNKNOWN"));
test("Invalid cache state is held", () => assert.equal(cacheReadiness(cache({ state: "MAYBE" }), baseline).status, "HOLD"));
test("Cache missing date is held", () => assert.equal(cacheReadiness(cache({ capturedOn: "bad" }), baseline).status, "HOLD"));
test("Future captured cache is held", () => assert.equal(cacheReadiness(cache({ capturedOn: "2026-11-20" }), baseline).status, "HOLD"));
test("Stale cached source is held", () => assert.equal(cacheReadiness(cache({ capturedOn: "2026-01-01" }), baseline).status, "HOLD"));
test("Cache over budget is held", () => assert.equal(cacheReadiness(cache(), { maxCacheBytes: 512 }).status, "HOLD"));
test("Cache at byte budget is ready", () => assert.equal(cacheReadiness(cache(), { maxCacheBytes: 1024 }).status, "READY"));
test("Cache with zero bytes is held", () => assert.equal(cacheReadiness(cache({ bytes: 0 }), baseline).status, "HOLD"));
test("Cache with fractional bytes is held", () => assert.equal(cacheReadiness(cache({ bytes: 1.3 }), baseline).status, "HOLD"));
test("Join does not infer ready from unknown", () => assert.equal(joinDecisions([{ status: "UNKNOWN" }, { status: "READY" }]), "UNKNOWN"));
test("Join prioritizes hold over unknown", () => assert.equal(joinDecisions([{ status: "HOLD" }, { status: "UNKNOWN" }]), "HOLD"));
test("Join returns ready for all ready", () => assert.equal(joinDecisions([{ status: "READY" }, { status: "READY" }]), "READY"));
test("Complete record is ready", () => assert.equal(recordReadiness(record(), baseline).status, "READY"));
test("Unknown record stays unknown", () => assert.equal(recordReadiness(record({ access: "UNKNOWN" }), baseline).status, "UNKNOWN"));
test("Unsupported record is held", () => assert.equal(recordReadiness(record({ access: "UNSUPPORTED" }), baseline).status, "HOLD"));
test("Invalid record is held", () => assert.equal(recordReadiness(record({ id: "bad id" }), baseline).status, "HOLD"));
test("Missing source holds record", () => assert.equal(recordReadiness(record({ sources: [] }), baseline).status, "HOLD"));
test("Unknown evidence holds uncertainty", () => assert.equal(recordReadiness(record({ sources: [source({ claim: "UNKNOWN" })] }), baseline).status, "UNKNOWN"));
test("Unknown cache holds uncertainty", () => assert.equal(recordReadiness(record({ cache: { state: "UNKNOWN" } }), baseline).status, "UNKNOWN"));
test("Over-budget cache holds record", () => assert.equal(recordReadiness(record(), { maxCacheBytes: 100 }).status, "HOLD"));
test("Valid pair is ready", () => assert.equal(batchReadiness(pair(), baseline).status, "READY"));
test("Single language is held", () => assert.equal(batchReadiness([record()], baseline).status, "HOLD"));
test("Single language without pairing requirement can be ready", () => assert.equal(batchReadiness([record()], { requirePairs: false }).status, "READY"));
test("Unknown language in pair remains unknown", () => assert.equal(batchReadiness([record({ access: "UNKNOWN" }), french()], baseline).status, "UNKNOWN"));
test("Absent cache holds pair", () => assert.equal(batchReadiness([record({ cache: { state: "ABSENT" } }), french()], baseline).status, "HOLD"));
test("Invalid collection is held", () => assert.equal(batchReadiness(null, baseline).status, "HOLD"));
test("Pair counts are by translation key", () => assert.equal(batchReadiness(pair(), baseline).pairs.length, 1));
test("Pair queue separates ready", () => assert.deepEqual(queueByStatus(batchReadiness(pair(), baseline)).READY, ["example"]));
test("Pair queue separates hold", () => assert.deepEqual(queueByStatus(batchReadiness([record()], baseline)).HOLD, ["example"]));
test("Pair queue separates unknown", () => assert.deepEqual(queueByStatus(batchReadiness([record({ access: "UNKNOWN" }), french()], baseline)).UNKNOWN, ["example"]));
test("Trends have one observation per date", () => assert.equal(readinessTrends(pair(), ["2026-11-18", TODAY]).length, 2));
test("Trends reject decreasing dates", () => assert.throws(() => readinessTrends(pair(), [TODAY, "2026-11-18"]), TypeError));
test("Trends reject duplicate dates", () => assert.throws(() => readinessTrends(pair(), [TODAY, TODAY]), TypeError));
test("Trends reject invalid date", () => assert.throws(() => readinessTrends(pair(), ["yesterday"]), TypeError));
test("Trends reject more than 366 dates", () => assert.throws(() => readinessTrends(pair(), Array(367).fill(TODAY)), TypeError));
test("Trends allow empty observation series", () => assert.deepEqual(readinessTrends(pair(), []), []));
test("Signal detects decrease in ready", () => assert.ok(trendSignals([{ asOf: "a", status: "READY", READY: 1, HOLD: 0, UNKNOWN: 0 }, { asOf: "b", status: "HOLD", READY: 0, HOLD: 1, UNKNOWN: 0 }]).some((item) => item.code === "ready.decreased")));
test("Signal detects new unknown", () => assert.ok(trendSignals([{ asOf: "a", status: "READY", READY: 1, HOLD: 0, UNKNOWN: 0 }, { asOf: "b", status: "UNKNOWN", READY: 0, HOLD: 0, UNKNOWN: 1 }]).some((item) => item.code === "unknown.increased")));
test("Signal-free identical records", () => assert.deepEqual(trendSignals([{ asOf: "a", status: "READY", READY: 1, HOLD: 0, UNKNOWN: 0 }, { asOf: "b", status: "READY", READY: 1, HOLD: 0, UNKNOWN: 0 }]), []));
test("Error priority is high", () => assert.equal(classifyFindingPriority({ severity: "error", code: "record.id" }), "high"));
test("Unknown priority remains normal", () => assert.equal(classifyFindingPriority({ severity: "unknown", code: "source.unknown" }), "normal"));
test("French spacing review is low priority", () => assert.equal(classifyFindingPriority({ severity: "review", code: "fr.colon-space" }), "low"));
test("Action queue for ready pair is empty", () => assert.deepEqual(actionQueue(pair(), baseline), []));
test("Action queue uses RESEARCH for uncertainty", () => assert.ok(actionQueue([record({ access: "UNKNOWN" }), french()], baseline).some((item) => item.action === "RESEARCH")));
test("Action queue uses REPAIR for malformed record", () => assert.ok(actionQueue([record({ id: "bad id" }), french()], baseline).some((item) => item.action === "REPAIR")));
test("Release gate allows ready records", () => assert.equal(releaseGate(pair(), baseline).canPublish, true));
test("Release gate denies unknown records", () => assert.equal(releaseGate([record({ access: "UNKNOWN" }), french()], baseline).canPublish, false));
test("Release gate denies missing translations", () => assert.equal(releaseGate([record()], baseline).canPublish, false));
test("Reason summary reports repeated problems", () => assert.ok(reasonSummary([record()], baseline).some((item) => item.code === "translation.missing")));
test("Readiness issues include uncertainty", () => assert.ok(readinessIssues([record({ access: "UNKNOWN" }), french()], baseline).some((item) => item.severity === "unknown")));
test("Readiness produces no raw record copy in diagnostics", () => assert.equal(JSON.stringify(readinessIssues([record({ access: "UNKNOWN" }), french()], baseline)).includes("Public publisher"), false));
test("Policy scans do not mutate data", () => { const items = pair(); const saved = clone(items); batchReadiness(items, baseline); assert.deepEqual(items, saved); });
