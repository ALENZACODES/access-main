import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessPacket, assessPacketRecord, bilingualStatus,
  cacheLifetime, confidenceBand, publicationCounts, publicationMatrix,
  readinessSummary, sourceLifetime, supportedAccess,
} from "./readiness.mjs";
import {
  DEFAULT_POLICY, anotherRecord, copy, exampleRecord, ids, withCache,
  withSource, withSummary, withTitle,
} from "./fixtures.mjs";

import { baselineAssessment } from "./changes.mjs";
const base = exampleRecord();
const assess = (record, options = DEFAULT_POLICY) => assessPacketRecord(record, options);

test("a complete fresh record is ready for publication", () => {
  const result = assess(base);
  assert.equal(result.status, "READY");
  assert.deepEqual(result.reasons, []);
});

test("UNKNOWN access stays explicitly UNKNOWN", () => {
  const result = assess({ ...base, access: "unknown", tier: "unknown" });
  assert.equal(result.status, "UNKNOWN");
});

test("UNKNOWN tier stays UNKNOWN without promotion", () => {
  assert.equal(assess({ ...base, tier: "unknown" }).status, "UNKNOWN");
});

test("UNKNOWN cache observation stays UNKNOWN", () => {
  assert.equal(assess({ ...base, cache: { state: "unknown" } }).status, "UNKNOWN");
});

test("missing cache is held back", () => {
  const result = assess({ ...base, cache: { state: "missing" } });
  assert.equal(result.status, "HOLD");
  assert.ok(result.reasons.includes("cache.missing"));
});

test("missing record fields hold publication", () => {
  assert.equal(assess({ ...base, id: "" }).status, "HOLD");
});

test("malformed record is not treated as UNKNOWN", () => {
  assert.equal(assess(null).status, "HOLD");
});

test("stale source evidence triggers review", () => {
  assert.equal(assess(withSource(base, { collectedOn: "2024-01-01" })).status, "HOLD");
});

test("stale cache observation triggers review", () => {
  assert.equal(assess(withCache(base, { savedOn: "2026-08-01" })).status, "HOLD");
});

test("missing translation holds publication", () => {
  assert.equal(assess(withTitle(base, { fr: "" })).status, "HOLD");
});

test("French typography failures hold publication", () => {
  assert.equal(assess(withSummary(base, { fr: "Attention !" })).status, "HOLD");
});

test("copy needs no rewriting for a clean packet", () => {
  const record = copy(base);
  const before = copy(record);
  assess(record);
  assert.deepEqual(record, before);
});

test("unknown status cannot conceal malformed source URLs", () => {
  const record = withSource({ ...base, access: "unknown", tier: "unknown" }, { url: "http://example.org" });
  assert.equal(assess(record).status, "HOLD");
});

test("non-array packet is rejected", () => {
  assert.equal(assessPacket({}).status, "HOLD");
});

test("empty packet has no false evidence findings", () => {
  const result = assessPacket([], DEFAULT_POLICY);
  assert.equal(result.status, "READY");
  assert.deepEqual(result.decisions, []);
});

test("two complete records form a ready packet", () => {
  const result = assessPacket([base, anotherRecord()], DEFAULT_POLICY);
  assert.equal(result.status, "READY");
  assert.equal(result.decisions.length, 2);
});

test("mixed packet holds when one record is broken", () => {
  const result = assessPacket([base, { ...anotherRecord(), title: null }], DEFAULT_POLICY);
  assert.equal(result.status, "HOLD");
});

test("mixed packet remains UNKNOWN when evidence is unknown", () => {
  const result = assessPacket([base, { ...anotherRecord(), access: "unknown", tier: "unknown" }], DEFAULT_POLICY);
  assert.equal(result.status, "UNKNOWN");
});

test("source lifetime measures whole calendar days", () => {
  const result = sourceLifetime(base, DEFAULT_POLICY);
  assert.equal(result.ageDays, 2);
  assert.equal(result.status, "READY");
});

test("source lifetime never infers a missing date", () => {
  assert.equal(sourceLifetime(null, DEFAULT_POLICY).status, "UNKNOWN");
  assert.equal(sourceLifetime(withSource(base, { collectedOn: "bad" }), DEFAULT_POLICY).status, "UNKNOWN");
});

test("cache lifetime measures the expiry window", () => {
  const result = cacheLifetime(base, DEFAULT_POLICY);
  assert.equal(result.ageDays, 1);
  assert.equal(result.expiresInDays, 89);
  assert.equal(result.expired, false);
});

test("cache lifetime returns nulls for missing cache", () => {
  assert.equal(cacheLifetime({ ...base, cache: { state: "missing" } }, DEFAULT_POLICY).ageDays, null);
});

test("expired cached copy is detected", () => {
  const result = cacheLifetime(withCache(base, { savedOn: "2026-07-01" }), DEFAULT_POLICY);
  assert.equal(result.expired, true);
  assert.equal(result.expiresInDays, 0);
});

test("future cache capture cannot produce negative ages", () => {
  assert.equal(cacheLifetime(withCache(base, { savedOn: "2026-11-20" }), DEFAULT_POLICY).ageDays, null);
});

test("publication summary counts every status", () => {
  const summary = readinessSummary(assessPacket([
    base,
    { ...anotherRecord(), access: "unknown", tier: "unknown" },
  ], DEFAULT_POLICY));
  assert.equal(summary.counts.READY, 1);
  assert.equal(summary.counts.UNKNOWN, 1);
});

test("publication matrix exposes structural decisions", () => {
  const result = publicationMatrix([base], DEFAULT_POLICY);
  assert.equal(result[0].recordId, "ramp-east");
  assert.equal(result[0].decision, "READY");
});

test("publication counts include both locales", () => {
  const result = publicationCounts([base], DEFAULT_POLICY);
  assert.deepEqual(result.languages, ["en", "fr"]);
  assert.equal(result.total, 1);
});

test("confidence band distinguishes states without upgrading unknown", () => {
  assert.equal(confidenceBand("READY"), "available-copy");
  assert.equal(confidenceBand("HOLD"), "requires-review");
  assert.equal(confidenceBand("UNKNOWN"), "UNKNOWN");
  assert.equal(confidenceBand("unexpected"), "UNKNOWN");
});

test("status descriptions exist in English and French", () => {
  for (const state of ["READY", "HOLD", "UNKNOWN"]) {
    assert.ok(bilingualStatus(state).en.length > 0);
    assert.ok(bilingualStatus(state).fr.length > 0);
  }
});

test("supported access keeps known categories", () => {
  for (const state of ["available", "limited", "unavailable"]) {
    assert.equal(supportedAccess({ access: state }), state);
  }
});

test("unsupported access is never guessed", () => {
  assert.equal(supportedAccess({ access: "maybe" }), "UNKNOWN");
  assert.equal(supportedAccess(null), "UNKNOWN");
});

test("readiness reasons do not echo descriptive record content", () => {
  const record = withTitle(base, { en: "Private content for testing" });
  const result = assess({ ...record, reviewedOn: "bad" });
  assert.equal(JSON.stringify(result.reasons).includes("Private content for testing"), false);
});

test("baseline assessment separates valid and invalid records", () => {
  assert.equal(baselineAssessment([base], DEFAULT_POLICY).validCount, 1);
  assert.equal(baselineAssessment([{ ...base, id: "?" }], DEFAULT_POLICY).status, "HOLD");
});

test("packet decisions preserve record input order", () => {
  const result = assessPacket([anotherRecord(), base], DEFAULT_POLICY);
  assert.deepEqual(result.decisions.map((item) => item.index), [0, 1]);
});

test("duplicate records cannot produce an overall READY packet", () => {
  const result = assessPacket([base, copy(base)], DEFAULT_POLICY);
  assert.equal(result.status, "HOLD");
  assert.ok(ids(result.findings).includes("collection.duplicate-id"));
});
