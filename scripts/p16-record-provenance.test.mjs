import assert from "node:assert/strict";
import { test } from "node:test";

import {
  auditRecord,
  auditRecordSet,
  isCalendarDate,
  isSafeCacheKey,
  isSecureSourceUrl,
  summarizeFindings,
} from "./p16-record-provenance.mjs";

function record(overrides = {}) {
  return {
    id: "bus-stop-01",
    translationKey: "stop-01",
    locale: "en",
    title: "Step-free entrance",
    description: "An accessible entrance is described in the source.",
    tier: "primary",
    state: "available",
    source: {
      name: "Community transit data",
      url: "https://data.example.org/entrances",
      licence: "Open data licence",
      collectedOn: "2026-11-18",
      lastReviewedOn: "2026-11-19",
    },
    offline: { state: "cached", key: "/offline/entrances/stop-01.json" },
    ...overrides,
  };
}

function codes(input) {
  return input.map((finding) => finding.code);
}

const valid = record();

test("a complete English card passes", () => {
  assert.deepEqual(auditRecord(valid), []);
});

test("French cards use the same data contract", () => {
  assert.deepEqual(auditRecord(record({ locale: "fr", title: "Entrée accessible", description: "Source des accès." })), []);
});

test("missing or non-object records fail closed", () => {
  for (const value of [null, undefined, [], "text", 0]) {
    assert.deepEqual(codes(auditRecord(value)), ["record.object"]);
  }
});

test("a stable id is mandatory", () => {
  for (const id of ["", "bad id", "?", 44, "a".repeat(129)]) {
    assert.ok(codes(auditRecord(record({ id }))).includes("record.id"));
  }
});

test("language must be explicitly English or French", () => {
  for (const locale of ["", "es", "EN", "fr-CA", null]) {
    assert.ok(codes(auditRecord(record({ locale }))).includes("record.locale"));
  }
});

test("unlabelled cards are rejected", () => {
  assert.ok(codes(auditRecord(record({ title: " " }))).includes("record.title"));
  assert.ok(codes(auditRecord(record({ description: "" }))).includes("record.description"));
});

test("control characters and very long copy are rejected", () => {
  assert.ok(codes(auditRecord(record({ title: "Name\u0000" }))).includes("record.title"));
  assert.ok(codes(auditRecord(record({ description: "A".repeat(2001) }))).includes("record.description"));
});

test("unknown status cannot borrow an elevated reliability tier", () => {
  assert.deepEqual(codes(auditRecord(record({ state: "unknown", tier: "primary" }))), ["record.unknown-tier"]);
  assert.deepEqual(auditRecord(record({ state: "unknown", tier: "unknown" })), []);
});

test("unrecognised source tiers and states are rejected", () => {
  assert.ok(codes(auditRecord(record({ tier: "gold" }))).includes("record.tier"));
  assert.ok(codes(auditRecord(record({ state: "approved" }))).includes("record.state"));
});

test("a source object is mandatory", () => {
  assert.deepEqual(codes(auditRecord(record({ source: null }))), ["source.object"]);
});

test("source name, licence, and collection date are required", () => {
  const source = { ...valid.source, name: "", licence: "", collectedOn: "" };
  const result = codes(auditRecord(record({ source })));
  assert.ok(result.includes("source.name"));
  assert.ok(result.includes("source.licence"));
  assert.ok(result.includes("source.collected-on"));
});

test("source URL requires TLS, a host, and no credentials", () => {
  for (const url of ["http://example.org", "javascript:alert(1)", "https://a:b@example.org", "/relative", "https://", "https://x.org/\u0000"]) {
    assert.equal(isSecureSourceUrl(url), false, url);
  }
  assert.equal(isSecureSourceUrl("https://example.org/path"), true);
});

test("calendar validation rejects rolled-over days and malformed values", () => {
  for (const date of ["2026-02-29", "2026-13-01", "2026-04-31", "2026-1-1", "2026-00-10", "bad"]) {
    assert.equal(isCalendarDate(date), false, date);
  }
  assert.equal(isCalendarDate("2024-02-29"), true);
  assert.equal(isCalendarDate("2026-11-19"), true);
});

test("a review date cannot precede its collection date", () => {
  const source = { ...valid.source, lastReviewedOn: "2026-11-01" };
  assert.ok(codes(auditRecord(record({ source }))).includes("source.review-before-collection"));
});

test("a malformed optional review date is rejected", () => {
  const source = { ...valid.source, lastReviewedOn: "yesterday" };
  assert.ok(codes(auditRecord(record({ source }))).includes("source.last-reviewed-on"));
});

test("offline state must be explicit", () => {
  assert.deepEqual(codes(auditRecord(record({ offline: null }))), ["offline.object"]);
  assert.ok(codes(auditRecord(record({ offline: { state: "maybe" } }))).includes("offline.state"));
});

test("cached entries require a safe, local cache key", () => {
  for (const key of ["", "//evil.example/a", "../file", "/a/../b", "/a/%2e%2e/b", "https://example.org/x", "/a?q=1", "/a#x", "/a\\b"]) {
    assert.equal(isSafeCacheKey(key), false, String(key));
    assert.ok(codes(auditRecord(record({ offline: { state: "cached", key } }))).includes("offline.cache-key"));
  }
  assert.equal(isSafeCacheKey("/offline/data/example.json"), true);
});

test("not-cached and unknown do not claim a cache entry", () => {
  for (const state of ["not-cached", "unknown"]) {
    assert.deepEqual(auditRecord(record({ offline: { state } })), []);
    assert.ok(codes(auditRecord(record({ offline: { state, key: "/data" } }))).includes("offline.unexpected-key"));
  }
});

test("record arrays are required", () => {
  assert.deepEqual(codes(auditRecordSet({})), ["set.array"]);
});

test("repeated IDs in one language are rejected", () => {
  const findings = auditRecordSet([record(), record()]);
  assert.ok(codes(findings).includes("set.duplicate-id"));
});

test("matching IDs in different languages are legal", () => {
  assert.deepEqual(auditRecordSet([record(), record({ locale: "fr" })]), []);
});

test("bilingual pairs require one card in each language", () => {
  const pair = [record(), record({ locale: "fr", id: "bus-stop-fr" })];
  assert.deepEqual(auditRecordSet(pair, { requireBothLocales: true }), []);
  assert.deepEqual(codes(auditRecordSet([record()], { requireBothLocales: true })), ["set.missing-translation"]);
});

test("repeated translation keys in one language are rejected", () => {
  const second = record({ id: "bus-stop-02" });
  assert.ok(codes(auditRecordSet([record(), second], { requireBothLocales: true })).includes("set.duplicate-translation"));
});

test("missing translation keys cannot be silently inferred", () => {
  assert.ok(codes(auditRecordSet([record({ translationKey: undefined })], { requireBothLocales: true })).includes("set.translation-key"));
});

test("diagnostics are deterministic and omit source text", () => {
  const bad = record({ title: "Private rider information", source: null });
  const first = auditRecord(bad);
  assert.deepEqual(first, auditRecord(bad));
  assert.equal(JSON.stringify(first).includes("Private rider information"), false);
});

test("audit never changes the input records", () => {
  const original = record();
  const snapshot = structuredClone(original);
  auditRecordSet([original]);
  assert.deepEqual(original, snapshot);
});

test("summaries are sorted with stable counts", () => {
  const findings = [
    { code: "z", path: "x", recordId: null },
    { code: "a", path: "y", recordId: null },
    { code: "z", path: "z", recordId: null },
  ];
  assert.deepEqual(summarizeFindings(findings), [{ code: "a", count: 1 }, { code: "z", count: 2 }]);
});
