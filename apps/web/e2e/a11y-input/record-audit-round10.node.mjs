/** Run with node --experimental-strip-types --test path/to/this-file. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { auditRecords, formatAudit } from "./record-audit-round10.ts";

const day = "2026-11-19";
const bilingual = (en = "English text", fr = "Texte français") => ({ en, fr });
const source = (changes = {}) => ({
  id: "source-one",
  title: bilingual("Public document", "Document public"),
  url: "https://example.org/accessible/source",
  publisher: "Public publisher",
  licence: "CC BY 4.0",
  collectedOn: "2026-11-17",
  tier: "primary",
  ...changes,
});
const record = (changes = {}) => ({
  id: "accessible-place",
  kind: "place",
  title: bilingual("Accessible place", "Lieu accessible"),
  summary: bilingual("Description", "Description française"),
  sources: [source()],
  reviewedOn: day,
  offline: { state: "stored", path: "/offline/accessible-place.json", capturedOn: "2026-11-18" },
  ...changes,
});
const audit = (...items) => auditRecords(items, { asOf: day });
const codes = (...items) => audit(...items).findings.map(({ code }) => code);
const has = (name, ...items) => assert.ok(codes(...items).includes(name), `${name} should be raised`);

const goodKinds = ["place", "service", "guide", "alert"];
for (const kind of goodKinds) {
  test(`accepts complete ${kind} records`, () => assert.deepEqual(codes(record({ kind })), []));
}
for (const tier of ["primary", "secondary", "community", "unknown"]) {
  test(`accepts explicit ${tier} source tier`, () => {
    assert.deepEqual(codes(record({ sources: [source({ tier })] })), []);
  });
}
for (const state of ["not-stored", "unknown"]) {
  test(`accepts ${state} when no cache evidence is asserted`, () => {
    assert.deepEqual(codes(record({ offline: { state } })), []);
  });
}

test("counts inputs without modifying them", () => {
  const item = record();
  const before = JSON.stringify(item);
  assert.deepEqual(audit(item), {
    findings: [], recordCount: 1, sourceCount: 1, storedCount: 1, locales: ["en", "fr"],
  });
  assert.equal(JSON.stringify(item), before);
});

test("non-array input fails without crashing", () => {
  assert.deepEqual(auditRecords({}, { asOf: day }).findings, [{ code: "invalid-record", path: "records" }]);
});
test("non-object record fails", () => has("invalid-record", null));
test("invalid record identifier fails", () => has("invalid-record-id", record({ id: "Two Words" })));
test("duplicate record identifiers fail", () => has("duplicate-record", record(), record()));
test("invalid kind fails", () => has("invalid-kind", record({ kind: "unknown" })));
test("missing English title fails", () => has("missing-language", record({ title: bilingual("", "Titre") })));
test("missing French summary fails", () => has("missing-language", record({ summary: bilingual("Text", " ") })));
test("placeholder French text fails", () => has("placeholder-language", record({ title: bilingual("Title", "à venir") })));
test("missing source list fails", () => has("missing-source", record({ sources: [] })));
test("non-object source fails", () => has("missing-source", record({ sources: [null] })));
test("duplicate source id fails", () => has("duplicate-source", record({ sources: [source(), source()] })));
test("invalid source id fails", () => has("invalid-source-id", record({ sources: [source({ id: "UPPER" })] })));
test("HTTP source fails", () => has("invalid-source-url", record({ sources: [source({ url: "http://example.org/source" })] })));
test("credentials in source URL fail", () => has("invalid-source-url", record({ sources: [source({ url: "https://a:b@example.org" })] })));
test("local source URL fails", () => has("invalid-source-url", record({ sources: [source({ url: "https://localhost/source" })] })));
test("source URL fragments fail", () => has("invalid-source-url", record({ sources: [source({ url: "https://example.org/path#part" })] })));
test("missing publisher fails", () => has("missing-publisher", record({ sources: [source({ publisher: "" })] })));
test("missing licence fails", () => has("missing-licence", record({ sources: [source({ licence: "" })] })));
test("unknown custom tier fails", () => has("invalid-tier", record({ sources: [source({ tier: "gold" })] })));
test("impossible collection date fails", () => has("invalid-collection-date", record({ sources: [source({ collectedOn: "2026-02-30" })] })));
test("future collection date fails", () => has("future-collection-date", record({ sources: [source({ collectedOn: "2026-11-20" })] })));
test("invalid review date fails", () => has("invalid-review-date", record({ reviewedOn: "2026-13-01" })));
test("review before collection fails", () => has("review-before-collection", record({ reviewedOn: "2026-11-16" })));
test("invalid offline state fails", () => has("invalid-offline-state", record({ offline: { state: "cached" } })));
test("missing offline path fails", () => has("missing-offline-path", record({ offline: { state: "stored", capturedOn: day } })));
test("remote offline path fails", () => has("unsafe-offline-path", record({ offline: { state: "stored", path: "https://example.org/file", capturedOn: day } })));
test("traversal offline path fails", () => has("unsafe-offline-path", record({ offline: { state: "stored", path: "/offline/../private", capturedOn: day } })));
test("encoded offline path fails", () => has("unsafe-offline-path", record({ offline: { state: "stored", path: "/offline/%2e%2e/private", capturedOn: day } })));
test("query string offline path fails", () => has("unsafe-offline-path", record({ offline: { state: "stored", path: "/offline/a?b=1", capturedOn: day } })));
test("missing offline capture date fails", () => has("invalid-offline-date", record({ offline: { state: "stored", path: "/offline/a" } })));
test("offline capture before collection fails", () => has("offline-before-collection", record({ offline: { state: "stored", path: "/offline/a", capturedOn: "2026-11-16" } })));
test("offline capture after review fails", () => has("offline-after-review", record({ offline: { state: "stored", path: "/offline/a", capturedOn: "2026-11-20" } })));
test("path on an uncached record fails", () => has("unexpected-offline-path", record({ offline: { state: "unknown", path: "/offline/a" } })));
test("two records cannot claim the same offline file", () => {
  has("conflicting-offline-path", record(), record({ id: "second-place" }));
});
test("distinct offline files are allowed", () => {
  assert.deepEqual(codes(record(), record({ id: "second-place", offline: {
    state: "stored", path: "/offline/second-place.json", capturedOn: "2026-11-18",
  } })), []);
});
test("custom canonical offline prefix works", () => {
  const result = auditRecords([record({ offline: { state: "stored", path: "/app-data/record.json", capturedOn: day } })], {
    asOf: day, allowedOfflinePrefixes: ["/app-data"],
  });
  assert.equal(result.findings.length, 0);
});
test("invalid offline prefix throws", () => {
  assert.throws(() => auditRecords([], { asOf: day, allowedOfflinePrefixes: ["../cache"] }), TypeError);
});
test("invalid asOf throws", () => assert.throws(() => auditRecords([], { asOf: "yesterday" }), TypeError));
test("formatting never echoes original content", () => {
  const item = record({ title: bilingual("Private title phrase", "Expression privée") });
  const formatted = formatAudit(audit(item));
  assert.ok(formatted.includes("records=1"));
  assert.equal(formatted.includes("Private title phrase"), false);
  assert.equal(formatted.includes("Expression privée"), false);
});
test("results are stable across repeat runs", () => {
  const item = record({ summary: bilingual("", " "), offline: { state: "unknown", path: "/offline/a" } });
  assert.deepEqual(audit(item), audit(item));
});
