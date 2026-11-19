import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCESS, DECISIONS, KINDS, LOCALES, OFFLINE, TIERS, add, auditCollection,
  auditRecord, cachePath, day, hasControl, object, policy, safeText,
  sorted, sourceUrl, validId,
} from "./core.mjs";
import {
  DEFAULT_POLICY, anotherRecord, copy, exampleRecord, ids, withCache,
  withSource, withSummary, withTitle,
} from "./fixtures.mjs";

const base = exampleRecord();
const rules = policy(DEFAULT_POLICY);
const audit = (record) => auditRecord(record, 0, rules).findings;
const codes = (record) => ids(audit(record));
const bad = (record, code) => assert.ok(codes(record).includes(code), `${code} should be detected`);

test("contract enums remain distinct and stable", () => {
  assert.deepEqual(LOCALES, ["en", "fr"]);
  assert.deepEqual(TIERS, ["primary", "secondary", "community", "unknown"]);
  assert.deepEqual(ACCESS, ["available", "limited", "unavailable", "unknown"]);
  assert.deepEqual(OFFLINE, ["stored", "missing", "unknown"]);
  assert.deepEqual(DECISIONS, ["READY", "HOLD", "UNKNOWN"]);
  assert.deepEqual(KINDS, ["place", "service", "guide", "alert"]);
});

test("ordinary record has no contract errors", () => {
  assert.deepEqual(audit(base), []);
  assert.equal(auditRecord(base, 0, rules).record, base);
});

test("contract inspection does not modify the caller's record", () => {
  const record = copy(base);
  const before = copy(record);
  auditRecord(record, 0, rules);
  assert.deepEqual(record, before);
});

test("plain-object guard excludes arrays, nulls and dates", () => {
  for (const value of [null, undefined, [], 0, "x", new Date()]) assert.equal(object(value), false);
  assert.equal(object({}), true);
  assert.equal(object(Object.create(null)), true);
});

test("record root must be a plain object", () => {
  for (const value of [null, undefined, [], "hello", 5]) {
    assert.deepEqual(ids(audit(value)), ["record.object"]);
  }
});

test("record identifier must be canonical and bounded", () => {
  for (const id of ["", "UPPER", "bad id", " bad", "x_1", "x/2", "a".repeat(97), 42]) {
    bad({ ...base, id }, "record.id");
  }
});

test("record kind must be declared", () => {
  for (const kind of ["traffic", "", "PLACE", null]) bad({ ...base, kind }, "record.kind");
  for (const kind of KINDS) assert.deepEqual(audit({ ...base, kind }), []);
});

test("unknown access requires unknown tier", () => {
  bad({ ...base, access: "unknown", tier: "primary" }, "record.unknown-tier");
  assert.deepEqual(audit({ ...base, access: "unknown", tier: "unknown" }), []);
});

test("unsupported access and evidence tiers fail closed", () => {
  for (const access of ["yes", "UNKNOWN", false]) bad({ ...base, access }, "record.access");
  for (const tier of ["gold", "UNKNOWN", 3]) bad({ ...base, tier }, "record.tier");
});

test("both localized title fields are required", () => {
  bad(withTitle(base, { en: "" }), "locale.text");
  bad(withTitle(base, { fr: " " }), "locale.text");
  bad({ ...base, title: null }, "locale.object");
});

test("localized summaries must have bounded real text", () => {
  bad(withSummary(base, { en: "" }), "locale.text");
  bad(withSummary(base, { fr: "x".repeat(2401) }), "locale.text");
  bad({ ...base, summary: [] }, "locale.object");
});

test("source reference cannot be omitted", () => {
  bad({ ...base, source: null }, "source.object");
  bad({ ...base, source: [] }, "source.object");
});

test("source publisher and licence are required", () => {
  bad(withSource(base, { publisher: "" }), "source.publisher");
  bad(withSource(base, { licence: null }), "source.licence");
});

test("source URL must be a safe HTTPS public link", () => {
  for (const url of ["http://example.org", "https://a:b@example.org", "https://localhost/x", "javascript:x", "/offline/a", "https://example.org/#frag"]) {
    bad(withSource(base, { url }), "source.url");
  }
});

test("calendar dates reject overflow and malformed input", () => {
  for (const date of ["2026-02-29", "2026-13-01", "2026-04-31", "2026-1-1", "yesterday", null]) {
    assert.equal(day(date), null);
  }
  assert.ok(Number.isInteger(day("2024-02-29")));
});

test("collection date cannot be in the future", () => {
  bad(withSource(base, { collectedOn: "2026-11-20" }), "source.future");
  bad(withSource(base, { collectedOn: "2026-02-29" }), "source.date");
});

test("stale collection is flagged as review only", () => {
  const result = audit(withSource(base, { collectedOn: "2024-01-01" }));
  assert.ok(result.some((f) => f.code === "source.stale" && f.severity === "review"));
});

test("review dates cannot precede collection dates", () => {
  bad({ ...base, reviewedOn: "2026-11-16" }, "record.review-before-source");
});

test("future and missing review dates are distinct", () => {
  bad({ ...base, reviewedOn: "2026-11-20" }, "record.future-review");
  bad({ ...base, reviewedOn: "not a day" }, "record.review-date");
});

test("stored cache requires a safe local path", () => {
  for (const path of ["", "//example.org", "../data", "/offline/../x", "/offline/%2e%2e/x", "/offline/a?x=1", "https://example.org/x"]) {
    bad(withCache(base, { path }), "cache.path");
  }
});

test("cached copy requires a real captured date", () => {
  bad(withCache(base, { savedOn: "2026-02-29" }), "cache.saved-date");
  bad(withCache(base, { savedOn: "2026-11-20" }), "cache.future");
  bad(withCache(base, { savedOn: "2026-11-16" }), "cache.before-source");
});

test("not stored records must not claim an asset key", () => {
  bad(withCache(base, { state: "missing" }), "cache.unexpected-location");
  bad(withCache(base, { state: "unknown" }), "cache.unexpected-location");
  assert.deepEqual(audit({ ...base, cache: { state: "missing" } }), []);
});

test("record revision is a positive safe integer", () => {
  for (const revision of [0, -1, 1.5, Infinity, "1", 1000001]) bad({ ...base, revision }, "record.revision");
  assert.deepEqual(audit({ ...base, revision: 1 }), []);
});

test("collection detects duplicate IDs", () => {
  const result = auditCollection([base, copy(base)], DEFAULT_POLICY);
  assert.ok(ids(result.findings).includes("collection.duplicate-id"));
  assert.equal(result.validCount, 0);
});

test("collection detects conflicting cache ownership", () => {
  const result = auditCollection([base, withCache(anotherRecord(), { path: base.cache.path })], DEFAULT_POLICY);
  assert.ok(ids(result.findings).includes("collection.cache-collision"));
});

test("collection detects conflicting source provenance", () => {
  const result = auditCollection([base, withSource(anotherRecord(), { id: base.source.id })], DEFAULT_POLICY);
  assert.ok(ids(result.findings).includes("collection.source-conflict"));
});

test("clean collection retains both source records", () => {
  const result = auditCollection([base, anotherRecord()], DEFAULT_POLICY);
  assert.deepEqual(result.findings, []);
  assert.equal(result.validCount, 2);
});

test("invalid top-level collection fails closed", () => {
  const result = auditCollection({}, DEFAULT_POLICY);
  assert.deepEqual(ids(result.findings), ["collection.array"]);
  assert.equal(result.validCount, 0);
});

test("cache path protects against encoded and empty segments", () => {
  for (const path of ["/offline/a//b", "/offline/a/%2F", "/offline/a/./b", "/offline/a/../b", "/offline/a b"]) assert.equal(cachePath(path), false);
  assert.equal(cachePath("/offline/region-one/data.json"), true);
});

test("URLs with fragments, local hosts, or credentials are excluded", () => {
  for (const url of ["https://u:p@example.org/a", "https://example.org/#x", "https://127.0.0.1/a", "https://[::1]/a", "https://example.org/a b"]) assert.equal(sourceUrl(url), false);
  assert.equal(sourceUrl("https://example.org/data"), true);
});

test("code-unit scan rejects ASCII controls without regex escapes", () => {
  for (const n of [0, 1, 8, 9, 10, 31, 127, 159]) assert.equal(hasControl(String.fromCharCode(n)), true);
  assert.equal(hasControl("Entrée accessible"), false);
});

test("safe text rejects oversized and empty strings", () => {
  assert.equal(safeText(""), false);
  assert.equal(safeText("  "), false);
  assert.equal(safeText("x".repeat(10), 9), false);
  assert.equal(safeText("Valid", 10), true);
});

test("identifier guard rejects noncanonical IDs", () => {
  assert.equal(validId("record-one"), true);
  for (const id of ["-a", "A", "a_b", "", null]) assert.equal(validId(id), false);
});

test("policy parameters must be bounded", () => {
  for (const badValue of [-1, 1.5, 36501, "3", NaN]) {
    assert.throws(() => policy({ ...DEFAULT_POLICY, cacheMaxDays: badValue }));
  }
  assert.throws(() => policy({ asOf: "bad" }));
});

test("findings can be sorted without changing original order", () => {
  const items = [{ code: "z", path: "b", severity: "error" }, { code: "a", path: "a", severity: "review" }];
  assert.deepEqual(sorted(items).map((x) => x.path), ["a", "b"]);
  assert.equal(items[0].path, "b");
});

test("add creates structured diagnostics only", () => {
  const findings = [];
  add(findings, "record.title", "records[0].title");
  assert.deepEqual(findings, [{ code: "record.title", path: "records[0].title", severity: "error" }]);
});

test("valid record survives alternate state tokens", () => {
  for (const access of ["available", "limited", "unavailable"]) {
    assert.deepEqual(audit({ ...base, access }), []);
  }
});

test("invalid records never leak title into finding values", () => {
  const secretCopy = withTitle(base, { en: "Private text must not appear" });
  const findings = audit({ ...secretCopy, reviewedOn: "bad" });
  assert.equal(JSON.stringify(findings).includes("Private text must not appear"), false);
});
