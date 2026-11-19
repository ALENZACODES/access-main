import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCESS_STATES,
  CACHE_STATES,
  EVIDENCE_TIERS,
  LANGUAGES,
  auditSnapshotConsistency,
  calendarOrdinal,
  cleanText,
  containsControl,
  inspectReadiness,
  inspectReadinessSet,
  localCachePath,
  summarizeReadiness,
  trustedAttributionUrl,
} from "./p16-offline-readiness-round19.mjs";

const enFr = (en = "Step-free entrance", fr = "Entrée sans marches") => ({ en, fr });
function record(overrides = {}) {
  return {
    key: "entrance-en", translationKey: "entrance", locale: "en",
    state: "available",
    title: enFr(),
    summary: enFr("Public entrance information", "Informations sur l'entrée publique"),
    accessInstructions: enFr("Use the side door", "Utilisez la porte latérale"),
    source: {
      publisher: "Open information publisher",
      url: "https://example.org/access/source",
      licence: "CC-BY-4.0",
      tier: "primary",
      collectedOn: "2026-11-01",
    },
    offline: { state: "stored", path: "/offline/entrance-en.json", capturedOn: "2026-11-02" },
    ...overrides,
  };
}
function french() {
  return record({ key: "entrance-fr", locale: "fr", offline: { state: "stored", path: "/offline/entrance-fr.json", capturedOn: "2026-11-02" } });
}
const codes = (result) => result.issues.map((issue) => issue.code);
const changed = (overrides) => inspectReadiness(record(overrides));

for (const state of ACCESS_STATES) test(`access state vocabulary ${state}`, () => assert.ok(["available", "limited", "unavailable", "unknown"].includes(state)));
for (const state of CACHE_STATES) test(`offline state vocabulary ${state}`, () => assert.ok(["stored", "absent", "unknown"].includes(state)));
for (const tier of EVIDENCE_TIERS) test(`evidence tier vocabulary ${tier}`, () => assert.equal(typeof tier, "string"));
for (const locale of LANGUAGES) test(`locale vocabulary ${locale}`, () => assert.ok(["en", "fr"].includes(locale)));

test("complete card ready", () => assert.equal(inspectReadiness(record()).status, "ready"));
test("complete pair ready", () => assert.equal(inspectReadinessSet([record(), french()], { requireBothLanguages: true }).status, "ready"));
test("not an object", () => assert.deepEqual(codes(inspectReadiness(null)), ["record.object"]));
test("array not an object", () => assert.deepEqual(codes(inspectReadiness([])), ["record.object"]));
test("set needs an array", () => assert.deepEqual(codes(inspectReadinessSet({})), ["set.array"]));
test("empty set allowed", () => assert.equal(inspectReadinessSet([]).status, "ready"));
test("two cards counted", () => assert.equal(inspectReadinessSet([record(), french()]).recordCount, 2));
test("id must exist", () => assert.ok(codes(changed({ key: "" })).includes("record.key")));
test("id must be canonical", () => assert.ok(codes(changed({ key: "bad id" })).includes("record.key")));
test("id cannot start with number", () => assert.ok(codes(changed({ key: "1bad" })).includes("record.key")));
test("id permits hyphens", () => assert.equal(changed({ key: "place-123-a" }).status, "ready"));
test("unknown state fails closed", () => assert.ok(codes(changed({ state: "no" })).includes("record.state")));
test("missing title", () => assert.ok(codes(changed({ title: null })).includes("text.object")));
test("missing summary", () => assert.ok(codes(changed({ summary: null })).includes("text.object")));
test("missing instructions", () => assert.ok(codes(changed({ accessInstructions: null })).includes("text.object")));
test("missing English", () => assert.ok(codes(changed({ title: { en: "", fr: "Bonjour" } })).includes("text.language")));
test("missing French", () => assert.ok(codes(changed({ title: { en: "Hello", fr: "" } })).includes("text.language")));
test("identical language requires review", () => assert.ok(codes(changed({ title: enFr("Hello", "Hello") })).includes("text.same-language")));
test("identical language is not blocking", () => assert.equal(changed({ title: enFr("Hello", "Hello") }).status, "review"));
test("source required", () => assert.ok(codes(changed({ source: null })).includes("source.object")));
test("source publisher required", () => assert.ok(codes(changed({ source: { ...record().source, publisher: "" } })).includes("source.publisher")));
test("licence required", () => assert.ok(codes(changed({ source: { ...record().source, licence: "" } })).includes("source.licence")));
test("unlisted licence needs review", () => assert.ok(codes(changed({ source: { ...record().source, licence: "Other open licence" } })).includes("source.licence-review")));
test("known open licence accepted", () => assert.equal(changed({ source: { ...record().source, licence: "CC0-1.0" } }).status, "ready"));
test("tier required", () => assert.ok(codes(changed({ source: { ...record().source, tier: "" } })).includes("source.tier")));
test("unknown tier needs review", () => assert.ok(codes(changed({ source: { ...record().source, tier: "unknown" } })).includes("source.unknown-tier")));
test("collection date required", () => assert.ok(codes(changed({ source: { ...record().source, collectedOn: "" } })).includes("source.date")));
test("invalid calendar date rejected", () => assert.ok(codes(changed({ source: { ...record().source, collectedOn: "2026-02-30" } })).includes("source.date")));
test("future collection rejected", () => assert.ok(codes(changed({ source: { ...record().source, collectedOn: "2026-12-01" } })).includes("source.future")));
test("stale source flagged", () => assert.ok(codes(changed({ source: { ...record().source, collectedOn: "2025-01-01" } })).includes("source.stale")));
test("freshness threshold configurable", () => assert.ok(codes(inspectReadiness(record(), { maxAgeDays: 1 })).includes("source.stale")));
test("as-of date configurable", () => assert.equal(inspectReadiness(record(), { asOf: "2026-11-03" }).status, "ready"));
test("malformed as-of throws", () => assert.throws(() => inspectReadiness(record(), { asOf: "yesterday" }), TypeError));
test("negative max-age throws", () => assert.throws(() => inspectReadiness(record(), { maxAgeDays: -1 }), RangeError));
test("fractional max-age throws", () => assert.throws(() => inspectReadiness(record(), { maxAgeDays: 0.5 }), RangeError));
test("too large max-age throws", () => assert.throws(() => inspectReadiness(record(), { maxAgeDays: 36501 }), RangeError));
test("offline object required", () => assert.ok(codes(changed({ offline: null })).includes("offline.object")));
test("offline state required", () => assert.ok(codes(changed({ offline: {} })).includes("offline.state")));
test("stored cache path required", () => assert.ok(codes(changed({ offline: { state: "stored", capturedOn: "2026-11-02" } })).includes("offline.path")));
test("stored capture date required", () => assert.ok(codes(changed({ offline: { state: "stored", path: "/offline/a.json" } })).includes("offline.date")));
test("capture cannot precede source", () => assert.ok(codes(changed({ offline: { state: "stored", path: "/offline/a.json", capturedOn: "2026-10-01" } })).includes("offline.outdated")));
test("future cache date rejected", () => assert.ok(codes(changed({ offline: { state: "stored", path: "/offline/a.json", capturedOn: "2026-12-01" } })).includes("offline.future")));
test("stale cached date flagged", () => assert.ok(codes(changed({ offline: { state: "stored", path: "/offline/a.json", capturedOn: "2025-01-01" } })).includes("offline.stale")));
test("absent cache with path rejected", () => assert.ok(codes(changed({ offline: { state: "absent", path: "/offline/a.json" } })).includes("offline.unexpected")));
test("unknown cache with date rejected", () => assert.ok(codes(changed({ offline: { state: "unknown", capturedOn: "2026-11-02" } })).includes("offline.unexpected")));
test("available but absent cache is review", () => assert.ok(codes(changed({ offline: { state: "absent" } })).includes("offline.unavailable")));
test("unavailable and absent cache can be ready", () => assert.equal(changed({ state: "unavailable", offline: { state: "absent" } }).status, "ready"));
test("duplicate record IDs flagged", () => assert.ok(codes(inspectReadinessSet([record(), record()])).includes("set.duplicate-key")));
test("cache ownership collision flagged", () => assert.ok(codes(inspectReadinessSet([record(), record({ key: "other-entry" })])).includes("set.cache-collision")));
test("duplicate translation language flagged", () => assert.ok(codes(inspectReadinessSet([record(), record({ key: "other-entry" })], { requireBothLanguages: true })).includes("set.duplicate-translation")));
test("missing translated record flagged", () => assert.ok(codes(inspectReadinessSet([record()], { requireBothLanguages: true })).includes("set.missing-translation")));
test("invalid translation key flagged", () => assert.ok(codes(inspectReadinessSet([record({ translationKey: "bad key" })], { requireBothLanguages: true })).includes("set.translation-key")));
test("invalid locale flagged", () => assert.ok(codes(inspectReadinessSet([record({ locale: "es" })], { requireBothLanguages: true })).includes("set.locale")));
test("auditor does not modify input", () => {
  const input = [record(), french()];
  const copy = structuredClone(input);
  auditSnapshotConsistency(input, { requireBothLanguages: true });
  assert.deepEqual(input, copy);
});
test("summary counts codes only", () => {
  const summary = summarizeReadiness(inspectReadinessSet([record(), record()]));
  assert.ok(summary.some((row) => row.code === "set.duplicate-key" && row.occurrences === 1));
});
test("diagnostics do not echo source content", () => {
  const secret = "user private text should not be logged";
  const result = inspectReadiness(record({ title: enFr(secret, "") }));
  assert.equal(JSON.stringify(result).includes(secret), false);
});
test("source ordinal exposed for consumers", () => assert.equal(Number.isInteger(inspectReadiness(record()).sourceDate), true));
test("cache ordinal exposed for consumers", () => assert.equal(Number.isInteger(inspectReadiness(record()).cacheDate), true));
test("invalid record source date is null", () => assert.equal(changed({ source: { ...record().source, collectedOn: "bad" } }).sourceDate, null));

for (const value of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-1", "bad", 12, null]) {
  test(`invalid calendar ${String(value)}`, () => assert.equal(calendarOrdinal(value), null));
}
for (const value of ["2024-02-29", "2026-11-19", "1970-01-01"]) {
  test(`valid calendar ${value}`, () => assert.equal(Number.isInteger(calendarOrdinal(value)), true));
}
for (const value of ["http://example.org", "https://user:pass@example.org", "https://localhost/a", "https://127.0.0.1/a", "https://example.org/a#x", "/relative", "javascript:alert(1)"]) {
  test(`unsafe attribution ${value}`, () => assert.equal(trustedAttributionUrl(value), false));
}
test("safe attribution", () => assert.equal(trustedAttributionUrl("https://example.org/data"), true));
for (const value of ["/offline", "//offline/a", "/offline/a/../b", "/offline/a//b", "/offline/a?q=1", "/offline/a#x", "/offline/a%2fb", "/offline/a\\b", "https://example.org/a"]) {
  test(`unsafe offline path ${value}`, () => assert.equal(localCachePath(value), false));
}
test("safe offline path", () => assert.equal(localCachePath("/offline/maps/cell.json"), true));
test("reject embedded control", () => assert.equal(containsControl("abc\u0000def"), true));
test("reject delete code", () => assert.equal(containsControl("abc\u007f"), true));
test("normal string has no control", () => assert.equal(containsControl("Café"), false));
test("blank text invalid", () => assert.equal(cleanText("  "), false));
test("long text invalid", () => assert.equal(cleanText("x".repeat(4001)), false));
test("short text valid", () => assert.equal(cleanText("Bonjour"), true));
