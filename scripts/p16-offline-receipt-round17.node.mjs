import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECEIPT_LOCALES,
  RECEIPT_TIERS,
  RECEIPT_STATES,
  CACHE_STATES,
  hasAsciiControl,
  calendarOrdinal,
  sourceUrlAllowed,
  offlineKeyAllowed,
  auditReceipt,
  auditReceiptSet,
  offlineEligibility,
  receiptSummary,
} from "./p16-offline-receipt-round17.mjs";

const AS_OF = "2026-11-19";
const baseSource = () => ({
  id: "sample-data",
  name: "Sample open data",
  url: "https://data.example.org/list",
  licence: "CC BY 4.0",
  collectedOn: "2026-11-17",
});
const base = (change = {}) => ({
  id: "ramp-access",
  locale: "en",
  title: "Entry details",
  description: "Information recorded by the source",
  availability: "available",
  tier: "primary",
  source: baseSource(),
  cache: {
    state: "stored",
    key: "/offline/locations/ramp-access-en.json",
    savedOn: "2026-11-18",
    sourceCollectedOn: "2026-11-17",
  },
  ...change,
});
const french = (change = {}) => base({
  locale: "fr",
  title: "Détails de l'entrée",
  description: "Renseignements fournis par la source",
  cache: { ...base().cache, key: "/offline/locations/ramp-access-fr.json" },
  ...change,
});
const codes = (record) => auditReceipt(record, { asOf: AS_OF }).map((item) => item.code);
const expectIssue = (record, code) => assert.ok(codes(record).includes(code), `Expected ${code}`);
const setCodes = (records, options = {}) => auditReceiptSet(records, { asOf: AS_OF, ...options }).map((item) => item.code);

for (const [name, value] of [
  ["supported language", RECEIPT_LOCALES],
  ["evidence tier", RECEIPT_TIERS],
  ["availability state", RECEIPT_STATES],
  ["cache state", CACHE_STATES],
]) {
  test(`${name} vocabulary is frozen`, () => assert.ok(Object.isFrozen(value)));
}

test("English receipt passes", () => assert.deepEqual(codes(base()), []));
test("French receipt passes", () => assert.deepEqual(codes(french()), []));
test("eligible cache exposes only its local key", () => {
  assert.deepEqual(offlineEligibility(base(), { asOf: AS_OF }), {
    eligible: true, state: "stored", key: "/offline/locations/ramp-access-en.json", reason: "ready",
  });
});

test("broken metadata never makes a cache eligible", () => {
  const result = offlineEligibility(base({ source: { ...baseSource(), licence: "" } }), { asOf: AS_OF });
  assert.equal(result.eligible, false);
  assert.equal(result.key, null);
  assert.equal(result.reason, "invalid-metadata");
});

test("missing cache is ineligible without pretending to have a key", () => {
  assert.deepEqual(offlineEligibility(base({ cache: { state: "missing" } }), { asOf: AS_OF }), {
    eligible: false, state: "missing", key: null, reason: "not-stored",
  });
});

test("stale cache is not eligible", () => {
  const cache = { ...base().cache, state: "stale" };
  assert.equal(offlineEligibility(base({ cache }), { asOf: AS_OF }).eligible, false);
});

test("unknown cache is not eligible", () => {
  assert.equal(offlineEligibility(base({ cache: { state: "unknown" } }), { asOf: AS_OF }).eligible, false);
});

for (const bad of [null, undefined, false, "string", [], 123]) {
  test(`non-record ${String(bad)} is rejected`, () => expectIssue(bad, "receipt.object"));
}

for (const id of ["", "CAPS", "needs space", "../escape", "a".repeat(98), 22]) {
  test(`malformed receipt ID ${String(id).slice(0, 12)}`, () => expectIssue(base({ id }), "receipt.id"));
}

for (const locale of ["en-CA", "FR", "es", null]) {
  test(`unsupported locale ${String(locale)}`, () => expectIssue(base({ locale }), "receipt.locale"));
}

test("missing title is rejected", () => expectIssue(base({ title: " " }), "receipt.title"));
test("long title is rejected", () => expectIssue(base({ title: "x".repeat(201) }), "receipt.title"));
test("missing description is rejected", () => expectIssue(base({ description: "" }), "receipt.description"));
test("long description is rejected", () => expectIssue(base({ description: "x".repeat(2401) }), "receipt.description"));
test("control character in copy is rejected", () => expectIssue(base({ title: "a\u0001b" }), "receipt.title"));
test("unsupported availability is rejected", () => expectIssue(base({ availability: "maybe" }), "receipt.availability"));
test("unsupported tier is rejected", () => expectIssue(base({ tier: "official" }), "receipt.tier"));
test("unknown availability with a stronger tier is rejected", () => expectIssue(base({ availability: "unknown" }), "receipt.unknown-tier"));
test("unknown availability and tier can coexist", () => assert.deepEqual(codes(base({ availability: "unknown", tier: "unknown" })), []));

test("missing source fails", () => expectIssue(base({ source: null }), "source.object"));
test("missing source ID fails", () => expectIssue(base({ source: { ...baseSource(), id: "" } }), "source.id"));
test("missing publisher name fails", () => expectIssue(base({ source: { ...baseSource(), name: "" } }), "source.name"));
test("missing licence fails", () => expectIssue(base({ source: { ...baseSource(), licence: "" } }), "source.licence"));
test("missing source URL fails", () => expectIssue(base({ source: { ...baseSource(), url: "" } }), "source.url"));
test("missing source date fails", () => expectIssue(base({ source: { ...baseSource(), collectedOn: "" } }), "source.date"));
test("future source date fails", () => expectIssue(base({ source: { ...baseSource(), collectedOn: "2026-11-20" } }), "source.future"));
test("aged source fails at configured limit", () => {
  expectIssue(base({ source: { ...baseSource(), collectedOn: "2024-11-17" } }), "source.age");
});
test("caller can explicitly extend maximum age", () => {
  const old = base({ source: { ...baseSource(), collectedOn: "2024-11-17" } });
  assert.equal(auditReceipt(old, { asOf: AS_OF, maxAgeDays: 2000 }).some((finding) => finding.code === "source.age"), false);
});
test("invalid asOf rejected", () => assert.throws(() => auditReceipt(base(), { asOf: "not-a-date" }), TypeError));
test("invalid maxAgeDays rejected", () => {
  for (const age of [-1, 1.5, Number.NaN, 36501]) {
    assert.throws(() => auditReceipt(base(), { asOf: AS_OF, maxAgeDays: age }), TypeError);
  }
});

test("missing cache object fails", () => expectIssue(base({ cache: null }), "cache.object"));
test("unsupported cache state fails", () => expectIssue(base({ cache: { state: "downloaded" } }), "cache.state"));
test("stored cache requires a safe key", () => expectIssue(base({ cache: { ...base().cache, key: "/../unsafe" } }), "cache.key"));
test("stored cache requires save date", () => expectIssue(base({ cache: { ...base().cache, savedOn: "" } }), "cache.saved-date"));
test("stored cache requires original source date", () => expectIssue(base({ cache: { ...base().cache, sourceCollectedOn: "" } }), "cache.source-date"));
test("cache cannot claim an unrecorded source revision", () => {
  expectIssue(base({ cache: { ...base().cache, sourceCollectedOn: "2026-11-16" } }), "cache.source-mismatch");
});
test("cache cannot predate collection", () => {
  expectIssue(base({ cache: { ...base().cache, savedOn: "2026-11-16" } }), "cache.before-source");
});
test("cache cannot have future save date", () => {
  expectIssue(base({ cache: { ...base().cache, savedOn: "2026-11-20" } }), "cache.future");
});
test("missing cache must not claim a key", () => {
  expectIssue(base({ cache: { state: "missing", key: "/offline/entry.json" } }), "cache.unexpected-fields");
});
test("unknown cache must not claim a save date", () => {
  expectIssue(base({ cache: { state: "unknown", savedOn: AS_OF } }), "cache.unexpected-fields");
});

for (const value of ["\u0000", "\u001f", "\u007f", "prefix\n", "prefix\r"]) {
  test("control codes are detected without regular expressions", () => assert.equal(hasAsciiControl(value), true));
}

test("regular Unicode lettering is not an ASCII control", () => {
  assert.equal(hasAsciiControl("Français – entrée"), false);
});

test("calendar ordinals reject impossible dates", () => {
  for (const bad of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-1", "1969-12-31", 1]) {
    assert.equal(calendarOrdinal(bad), null);
  }
});

test("leap day is accepted", () => assert.notEqual(calendarOrdinal("2024-02-29"), null));

for (const url of [
  "http://example.org/x", "https://x:y@example.org", "https://example.org/#frag",
  "https://localhost/a", "https://127.0.0.1/a", "https://example.local/x",
  "javascript:alert(1)", "https://example.org/\u0000", "/local", " https://example.org/",
]) {
  test(`unsafe URL is rejected ${url.slice(0, 24)}`, () => assert.equal(sourceUrlAllowed(url), false));
}

test("clean source URL is accepted", () => assert.equal(sourceUrlAllowed("https://data.example.org/a?lang=fr"), true));

for (const path of [
  "https://example.org/offline", "//evil/asset", "/offline/../asset", "/offline/a//b",
  "/offline/a/./b", "/offline/asset%2f.json", "/offline/x?key=1", "/offline/x#fragment",
  "/offline/a\\b", "/somewhere/file.json", "/offline/\u0000bad", "/offline/",
]) {
  test(`unsafe local cache path ${path.slice(0, 25)}`, () => assert.equal(offlineKeyAllowed(path), false));
}

test("safe nested local path is accepted", () => {
  assert.equal(offlineKeyAllowed("/offline/fr/catalogue/file-1.json"), true);
});

test("paired EN and FR records pass", () => {
  assert.deepEqual(setCodes([base(), french()], { requireBothLocales: true }), []);
});

test("missing French counterpart is a finding", () => {
  assert.ok(setCodes([base()], { requireBothLocales: true }).includes("set.missing-locale"));
});

test("missing English counterpart is a finding", () => {
  assert.ok(setCodes([french()], { requireBothLocales: true }).includes("set.missing-locale"));
});

test("duplicate records in same language are a finding", () => {
  assert.ok(setCodes([base(), base()]).includes("set.duplicate"));
});

test("two records cannot claim the same cache asset", () => {
  const second = french({ id: "other-record", cache: base().cache });
  assert.ok(setCodes([base(), second]).includes("set.cache-collision"));
});

test("same source ID must have consistent provenance", () => {
  const second = french({ source: { ...baseSource(), licence: "Other open licence" } });
  assert.ok(setCodes([base(), second]).includes("set.source-inconsistent"));
});

test("distinct source IDs can use different licensing", () => {
  const second = french({ source: { ...baseSource(), id: "source-two", licence: "Other open licence" } });
  assert.equal(setCodes([base(), second]).includes("set.source-inconsistent"), false);
});

test("non-array input fails closed", () => assert.deepEqual(setCodes({}), ["set.array"]));

test("large collections fail bounded", () => {
  assert.deepEqual(setCodes(Array.from({ length: 10001 }, () => null)), ["set.too-large"]);
});

test("audit does not mutate records", () => {
  const receipt = base();
  const snapshot = structuredClone(receipt);
  auditReceiptSet([receipt], { asOf: AS_OF });
  assert.deepEqual(receipt, snapshot);
});

test("diagnostics omit private source contents", () => {
  const receipt = base({ description: "Private personal information", source: null });
  assert.equal(JSON.stringify(auditReceipt(receipt)).includes("Private personal information"), false);
});

test("summary is sorted and aggregates counts", () => {
  assert.deepEqual(receiptSummary([
    { code: "z", path: "one" }, { code: "a", path: "two" }, { code: "z", path: "three" },
  ]), [{ code: "a", count: 1 }, { code: "z", count: 2 }]);
});

test("summary ignores unknown objects", () => {
  assert.deepEqual(receiptSummary([null, {}, { code: "found" }]), [{ code: "found", count: 1 }]);
});
