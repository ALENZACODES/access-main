import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalDay,
  containsAsciiControl,
  inspectOfflineHistory,
  localAssetPath,
  secureAttribution,
  summary,
} from "./p16-offline-history-round16.mjs";

const base = (overrides = {}) => ({
  id: "access-point", locale: "en", revision: 1, title: "Step-free entrance",
  capturedOn: "2026-11-18", cacheState: "cached", assetPath: "/offline/access-point-en.json",
  source: { name: "Open information source", url: "https://example.org/source", licence: "CC BY 4.0", collectedOn: "2026-11-17", tier: "primary" },
  ...overrides,
});
const fr = (overrides = {}) => base({ locale: "fr", title: "Entrée accessible", assetPath: "/offline/access-point-fr.json", ...overrides });
const inspect = (rows, options = {}) => inspectOfflineHistory(rows, { asOf: "2026-11-19", ...options });
const codes = (rows, options = {}) => inspect(rows, options).findings.map((finding) => finding.code);
const has = (code, rows, options) => assert.ok(codes(rows, options).includes(code), `${code} not reported`);

for (const locale of ["en", "fr"]) {
  test(`${locale}: valid cached record`, () => {
    assert.deepEqual(codes([base({ locale })]), []);
  });
  test(`${locale}: unavailable copy must not claim cache path`, () => {
    has("entry.unexpected-asset", [base({ locale, cacheState: "not-cached" })]);
  });
  test(`${locale}: missing licence rejected`, () => {
    has("source.licence", [base({ locale, source: { ...base().source, licence: "" } })]);
  });
  test(`${locale}: invalid tier rejected`, () => {
    has("source.tier", [base({ locale, source: { ...base().source, tier: "excellent" } })]);
  });
}

test("a complete bilingual pair passes", () => assert.deepEqual(codes([base(), fr()], { requireLanguages: true }), []));
test("missing French counterpart flagged", () => has("language.missing-counterpart", [base()], { requireLanguages: true }));
test("missing English counterpart flagged", () => has("language.missing-counterpart", [fr()], { requireLanguages: true }));
test("optional bilingual pairing stays optional", () => assert.deepEqual(codes([base()]), []));
test("unknown offline state is explicit", () => assert.deepEqual(codes([base({ cacheState: "unknown", assetPath: undefined })]), []));
test("source with unknown tier allowed", () => assert.deepEqual(codes([base({ source: { ...base().source, tier: "unknown" } })]), []));
test("revision two follows revision one", () => {
  assert.deepEqual(codes([base(), base({ revision: 2, capturedOn: "2026-11-19" })]), []);
  assert.equal(inspect([base(), base({ revision: 2, capturedOn: "2026-11-19" })]).current[0].revision, 2);
});
test("input order does not choose stale revision", () => {
  assert.equal(inspect([base({ revision: 3 }), base()]).current[0].revision, 3);
});
test("duplicate revision fails", () => has("revision.duplicate", [base(), base()]));
test("missing intermediate revision fails", () => has("revision.gap", [base(), base({ revision: 3 })]));
test("capture dates cannot go backward", () => has("revision.date-regression", [base(), base({ revision: 2, capturedOn: "2026-11-17" })]));
test("current entries sorted by id", () => {
  const current = inspect([base({ id: "zeta" }), base({ id: "alpha", assetPath: "/offline/alpha.json" })]).current;
  assert.deepEqual(current.map((item) => item.id), ["alpha", "zeta"]);
});
test("unrelated records cannot share an asset", () => {
  has("asset.shared-by-records", [base(), base({ id: "different" })]);
});
test("a single record may reuse an asset across revisions", () => {
  assert.deepEqual(codes([base(), base({ revision: 2 })]), []);
});
test("null input fails with one diagnostic", () => assert.deepEqual(codes(null), ["history.not-array"]));
test("null entry fails", () => has("entry.not-object", [null]));
test("invalid id fails", () => has("entry.id", [base({ id: "bad id" })]));
test("invalid locale fails", () => has("entry.locale", [base({ locale: "es" })]));
test("missing revision fails", () => has("entry.revision", [base({ revision: 0 })]));
test("fractional revision fails", () => has("entry.revision", [base({ revision: 2.5 })]));
test("missing title fails", () => has("entry.title", [base({ title: " " })]));
test("invalid capture date fails", () => has("entry.captured-on", [base({ capturedOn: "2026-02-29" })]));
test("future capture date fails", () => has("entry.captured-on", [base({ capturedOn: "2026-11-20" })]));
test("unknown cache status rejected", () => has("entry.cache-state", [base({ cacheState: "maybe" })]));
test("unsafe cache path rejected", () => has("entry.asset-path", [base({ assetPath: "/offline/../secret" })]));
test("missing source object fails", () => has("source.not-object", [base({ source: null })]));
test("missing publisher fails", () => has("source.name", [base({ source: { ...base().source, name: "" } })]));
test("plain HTTP URL fails", () => has("source.url", [base({ source: { ...base().source, url: "http://example.org" } })]));
test("invalid collection date fails", () => has("source.collected-on", [base({ source: { ...base().source, collectedOn: "bad" } })]));
test("collection cannot postdate capture", () => has("source.collection-after-capture", [base({ source: { ...base().source, collectedOn: "2026-11-19" } })]));
test("collection after asOf fails", () => has("source.collected-on", [base({ source: { ...base().source, collectedOn: "2026-11-21" } })]));

for (const value of ["2024-02-29", "2026-11-19"]) test(`valid calendar ${value}`, () => assert.equal(canonicalDay(value), true));
for (const value of ["2026-02-29", "2026-04-31", "2026-1-1", "bad", null]) test(`invalid calendar ${value}`, () => assert.equal(canonicalDay(value), false));
for (const value of ["/offline/a.json", "/offline/sub/a.json"]) test(`safe cache ${value}`, () => assert.equal(localAssetPath(value), true));
for (const value of ["/offline/../x", "//example.org", "/offline/%2e%2e", "/offline/a?x=1", "/offline/a\\b", "/offline//x"]) test(`unsafe cache ${value}`, () => assert.equal(localAssetPath(value), false));
test("secure attribution URL", () => assert.equal(secureAttribution("https://example.org/a"), true));
for (const value of ["http://example.org", "https://a:b@example.org", "https://example.org/#x", "/relative"]) test(`unsafe URL ${value}`, () => assert.equal(secureAttribution(value), false));
test("ASCII control inspection catches both bounds", () => {
  assert.equal(containsAsciiControl(String.fromCharCode(0)), true);
  assert.equal(containsAsciiControl(String.fromCharCode(127)), true);
  assert.equal(containsAsciiControl("ordinary text"), false);
});
test("caller records remain unchanged", () => {
  const input = [base(), fr()];
  const snapshot = structuredClone(input);
  inspect(input, { requireLanguages: true });
  assert.deepEqual(input, snapshot);
});
test("diagnostic summaries have no source text", () => {
  const result = inspect([base({ title: "Private description", source: null })]);
  const text = JSON.stringify(summary(result));
  assert.equal(text.includes("Private description"), false);
});
test("invalid options fail closed", () => assert.throws(() => inspectOfflineHistory([], { asOf: "tomorrow" }), TypeError));
