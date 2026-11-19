import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditSourceDrift,
  boundedText,
  findingCounts,
  hasControlCharacters,
  isoDay,
  localAsset,
  secureSource,
} from "./p16-source-drift-round21.mjs";

const source = () => ({
  name: "Accessible public dataset",
  url: "https://example.org/records/entrance",
  licence: "CC BY 4.0",
  collectedOn: "2026-11-18",
  tier: "primary",
});

function entry(locale, changes = {}) {
  return {
    id: `entry-${locale}`,
    pairKey: "entry",
    locale,
    availability: "available",
    title: locale === "fr" ? "Entrée accessible" : "Step-free entrance",
    description: locale === "fr" ? "Notice publique." : "Public notice.",
    source: source(),
    cache: { state: "stored", path: `/offline/entry-${locale}.json`, capturedOn: "2026-11-19" },
    ...changes,
  };
}

const today = "2026-11-19";
const scan = (items, options = {}) => auditSourceDrift(items, { asOf: today, ...options });
const codes = (items, options) => scan(items, options).findings.map((item) => item.code);
const pair = () => [entry("en"), entry("fr")];

for (const language of ["en", "fr"]) {
  test(`${language}: valid standalone record with optional counterpart`, () => {
    assert.deepEqual(codes([entry(language)], { requireBothLocales: false }), []);
  });
  test(`${language}: incomplete source rejected`, () => {
    assert.ok(codes([entry(language, { source: null })]).includes("source.object"));
  });
  test(`${language}: missing licence rejected`, () => {
    assert.ok(codes([entry(language, { source: { ...source(), licence: "" } })]).includes("source.licence"));
  });
  test(`${language}: missing title rejected`, () => {
    assert.ok(codes([entry(language, { title: " " })]).includes("record.title"));
  });
}

test("a complete bilingual pair passes", () => assert.deepEqual(scan(pair()).findings, []));
test("bilingual pair statistics are stable", () => assert.deepEqual({ records: scan(pair()).records, pairs: scan(pair()).pairs, stored: scan(pair()).stored }, { records: 2, pairs: 1, stored: 2 }));
test("input must be an array", () => assert.deepEqual(codes(null), ["set.array"]));
test("an impossible asOf date fails before inspecting records", () => assert.throws(() => auditSourceDrift([], { asOf: "2026-02-29" }), TypeError));
test("missing asOf date fails closed", () => assert.throws(() => auditSourceDrift([], {}), TypeError));

test("missing English half has a predictable code", () => assert.ok(codes([entry("fr")]).includes("pair.missing-en")));
test("missing French half has a predictable code", () => assert.ok(codes([entry("en")]).includes("pair.missing-fr")));
test("two records sharing an id are rejected", () => assert.ok(codes([entry("en"), entry("fr", { id: "entry-en" })]).includes("set.duplicate-id")));
test("repeated language in one pair is rejected", () => assert.ok(codes([entry("en"), entry("en", { id: "other-id" })]).includes("pair.duplicate-locale")));
test("unmatched availability is detected", () => assert.ok(codes([entry("en"), entry("fr", { availability: "unknown" })]).includes("pair.availability")));
test("unmatched source URL is detected", () => assert.ok(codes([entry("en"), entry("fr", { source: { ...source(), url: "https://example.org/other" } })]).includes("pair.source-drift")));
test("unmatched source licence is detected", () => assert.ok(codes([entry("en"), entry("fr", { source: { ...source(), licence: "Other" } })]).includes("pair.source-drift")));
test("unmatched collection dates are detected", () => assert.ok(codes([entry("en"), entry("fr", { source: { ...source(), collectedOn: "2026-11-17" } })]).includes("pair.source-drift")));
test("unmatched tier is detected", () => assert.ok(codes([entry("en"), entry("fr", { source: { ...source(), tier: "unknown" } })]).includes("pair.source-drift")));
test("unmatched cache state is detected", () => assert.ok(codes([entry("en"), entry("fr", { cache: { state: "not-stored" } })]).includes("pair.cache-state")));
test("unmatched cache capture date is detected", () => assert.ok(codes([entry("en"), entry("fr", { cache: { state: "stored", path: "/offline/entry-fr.json", capturedOn: "2026-11-18" } })]).includes("pair.cache-date")));
test("shared cache assets are rejected", () => {
  const items = [entry("en"), entry("fr", { cache: { state: "stored", path: "/offline/entry-en.json", capturedOn: today } })];
  assert.ok(codes(items).includes("pair.shared-asset"));
  assert.ok(codes(items).includes("set.asset-conflict"));
});
test("two unrelated records cannot own the same cache path", () => {
  const one = entry("en", { pairKey: "one" });
  const two = entry("fr", { pairKey: "two", cache: one.cache });
  assert.ok(codes([one, two]).includes("set.asset-conflict"));
});

test("collection date in the future is rejected", () => assert.ok(codes([entry("en", { source: { ...source(), collectedOn: "2026-11-20" } })]).includes("source.future-date")));
test("cache capture before collection is rejected", () => assert.ok(codes([entry("en", { cache: { state: "stored", path: "/offline/en.json", capturedOn: "2026-11-17" } })]).includes("cache.predates-source")));
test("cache capture in future is rejected", () => assert.ok(codes([entry("en", { cache: { state: "stored", path: "/offline/en.json", capturedOn: "2026-11-20" } })]).includes("cache.future-date")));
test("uncached record must not claim a path", () => assert.ok(codes([entry("en", { cache: { state: "not-stored", path: "/offline/en.json" } })]).includes("cache.unexpected-data")));
test("unknown cache state is allowed without a claimed path", () => assert.deepEqual(codes([entry("en", { cache: { state: "unknown" } })], { requireBothLocales: false }), []));
test("unknown availability is accepted explicitly", () => assert.deepEqual(codes([entry("en", { availability: "unknown" })], { requireBothLocales: false }), []));
test("missing cache object is rejected", () => assert.ok(codes([entry("en", { cache: null })]).includes("cache.object")));
test("bad cache state is rejected", () => assert.ok(codes([entry("en", { cache: { state: "ready" } })]).includes("cache.state")));

test("invalid record element is rejected", () => assert.ok(codes([null]).includes("record.object")));
test("invalid record identifier is rejected", () => assert.ok(codes([entry("en", { id: "bad id" })]).includes("record.id")));
test("invalid pair identifier is rejected", () => assert.ok(codes([entry("en", { pairKey: "bad/id" })]).includes("record.pair-key")));
test("unsupported language is rejected", () => assert.ok(codes([entry("en", { locale: "es" })]).includes("record.locale")));
test("unsupported availability is rejected", () => assert.ok(codes([entry("en", { availability: "maybe" })]).includes("record.availability")));
test("long description is rejected", () => assert.ok(codes([entry("en", { description: "x".repeat(2049) })]).includes("record.description")));
test("unsupported tier is rejected", () => assert.ok(codes([entry("en", { source: { ...source(), tier: "gold" } })]).includes("source.tier")));
test("URL with credentials is rejected", () => assert.ok(codes([entry("en", { source: { ...source(), url: "https://a:b@example.org/a" } })]).includes("source.url")));
test("offline path with traversal is rejected", () => assert.ok(codes([entry("en", { cache: { state: "stored", path: "/offline/a/../b", capturedOn: today } })]).includes("cache.path")));

for (const value of ["/offline/a", "/offline/a/b.json", "/offline/a-b_2.json"]) {
  test(`accepts local asset ${value}`, () => assert.equal(localAsset(value), true));
}
for (const value of ["", "//offline/a", "/offline", "/offline/a/../b", "/offline/a//b", "/offline/a?x=1", "/offline/a#top", "/offline/a%2e", "/offline/a\\b", "https://example.org/a"]) {
  test(`rejects unsafe asset ${value}`, () => assert.equal(localAsset(value), false));
}
for (const value of ["https://example.org/a", "https://example.org/a?b=2"]) {
  test(`accepts source URL ${value}`, () => assert.equal(secureSource(value), true));
}
for (const value of ["", "https://a:b@example.org", "http://example.org", "https://example.org/a#frag", "https://example.org/white space", "/relative", "https://localhost/x"]) {
  test(`rejects source URL ${value}`, () => assert.equal(secureSource(value), false));
}
for (const value of ["2024-02-29", "2026-11-19", "1970-01-01"]) {
  test(`accepts calendar day ${value}`, () => assert.notEqual(isoDay(value), null));
}
for (const value of ["2026-02-29", "2026-13-01", "1969-12-31", "2026-1-1"]) {
  test(`rejects calendar day ${value}`, () => assert.equal(isoDay(value), null));
}

test("ASCII control detection finds an unsafe character", () => assert.equal(hasControlCharacters(`A${String.fromCodePoint(10)}B`), true));
test("regular text has no control characters", () => assert.equal(hasControlCharacters("Public source"), false));
test("bounded text requires a real string", () => assert.equal(boundedText(123), false));
test("bounded text requires nonempty content", () => assert.equal(boundedText("  "), false));
test("diagnostics do not echo record text", () => {
  const result = scan([entry("en", { title: "Private access note", source: null })]);
  assert.equal(JSON.stringify(result).includes("Private access note"), false);
});
test("records are never altered", () => {
  const records = pair();
  const previous = structuredClone(records);
  scan(records);
  assert.deepEqual(records, previous);
});
test("findings are sorted deterministically", () => {
  const original = [entry("en", { title: "" }), entry("fr", { cache: null })];
  assert.deepEqual(scan(original), scan(original));
  const paths = scan(original).findings.map((issue) => issue.path);
  assert.deepEqual(paths, [...paths].sort((a, b) => a.localeCompare(b, "en")));
});
test("counts are grouped without reflecting source text", () => {
  const x = findingCounts([{ code: "b", path: "x" }, { code: "a", path: "y" }, { code: "b", path: "z" }]);
  assert.deepEqual(x, [{ code: "a", count: 1 }, { code: "b", count: 2 }]);
});
