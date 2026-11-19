import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOCALES, ACCESS, TIERS, CACHE, SEVERITY, TYPES, hasControl, plain, validId,
  cleanText, dayOrdinal, safeSourceUrl, safeOfflinePath, finding, sortFindings,
  checkFrenchTypography, textIssues, sourceIssues, cacheIssues, recordIssues,
  collectionIssues, issueSummary, groupIssues,
} from "./contracts.mjs";
import { TODAY, cache, codes, clone, french, pair, record, source } from "./fixtures.mjs";

const asOf = { asOf: TODAY };
const inspect = (value) => codes(recordIssues(value, "record", asOf));
const sourceCodes = (value) => codes(sourceIssues(value, "source", dayOrdinal(TODAY)));
const cacheCodes = (value) => codes(cacheIssues(value, "cache", dayOrdinal(TODAY)));

test("language vocabulary is frozen", () => assert.deepEqual(LOCALES, ["en", "fr"]));
test("access vocabulary includes uncertainty", () => assert.deepEqual(ACCESS, ["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]));
test("evidence tiers include uncertainty", () => assert.deepEqual(TIERS, ["PRIMARY", "SECONDARY", "COMMUNITY", "UNKNOWN"]));
test("cache vocabulary includes uncertainty", () => assert.deepEqual(CACHE, ["PRESENT", "ABSENT", "UNKNOWN"]));
test("finding severities are explicit", () => assert.deepEqual(SEVERITY, ["error", "review", "unknown"]));
test("record kinds are bounded", () => assert.equal(TYPES.length, 5));
for (const [name, value] of [["empty", ""], ["space", "a b"], ["slash", "a/b"], ["upper", "A"], ["leading hyphen", "-a"], ["trailing hyphen", "a-"], ["underscore", "a_b"], ["long", "a".repeat(97)], ["number", 10]]) {
  test(`identifier rejects ${name}`, () => assert.equal(validId(value), false));
}
for (const value of ["a", "a1", "record-2", "source-one", "abc-def-12"]) {
  test(`identifier accepts ${value}`, () => assert.equal(validId(value), true));
}
for (const [index, value] of [null, undefined, 0, [], false, "", "a", Object.create(null)].entries()) {
  test(`plain object guard handles case ${index}`, () => {
    const expected = value !== null && typeof value === "object" && !Array.isArray(value);
    assert.equal(plain(value), expected);
  });
}
test("Date rejects non-string", () => assert.equal(dayOrdinal(44), null));
test("Date accepts leap day", () => assert.notEqual(dayOrdinal("2024-02-29"), null));
test("Date rejects non-leap day", () => assert.equal(dayOrdinal("2026-02-29"), null));
for (const date of ["2026-00-01", "2026-13-01", "2026-04-31", "2026-11-00", "2026-11-32", "2026-1-1", "1969-12-31", "bad", "9999-13-01"]) {
  test(`calendar rejects ${date}`, () => assert.equal(dayOrdinal(date), null));
}
test("Adjacent calendar days differ by one", () => assert.equal(dayOrdinal(TODAY) - dayOrdinal("2026-11-18"), 1));
test("UTC day ordinal independent of offset", () => assert.equal(dayOrdinal(TODAY), Math.floor(Date.UTC(2026, 10, 19) / 86400000)));
for (const number of [0, 1, 9, 10, 31, 127, 128, 159]) {
  test(`ASCII control scanning rejects code ${number}`, () => assert.equal(hasControl(`X${String.fromCharCode(number)}Y`), true));
}
test("Ordinary punctuation is not an ASCII control", () => assert.equal(hasControl("Français — accueil !"), false));
test("Non-text values do not masquerade as controls", () => assert.equal(hasControl(null), false));
test("Text normalization gate rejects decomposed form", () => assert.equal(cleanText("e\u0301"), false));
test("Text gate accepts composed French", () => assert.equal(cleanText("Entrée"), true));
test("Text gate rejects blank", () => assert.equal(cleanText("  "), false));
test("Text gate enforces maximum length", () => assert.equal(cleanText("four", 3), false));
test("Text gate rejects controls", () => assert.equal(cleanText(`a${String.fromCharCode(9)}b`), false));
for (const value of ["http://example.org", "ftp://example.org", "https://", "https://u:p@example.org", "https://example.org/#fragment", "https://localhost/a", "https://127.0.0.1/a", "https://192.168.1.1/a", "https://10.0.0.1/a", "https://example.org/a b", "/relative", "javascript:alert(1)"]) {
  test(`source URL rejects ${value}`, () => assert.equal(safeSourceUrl(value), false));
}
test("Source URL requires an explicit HTTPS host", () => assert.equal(safeSourceUrl("https://example.org/data"), true));
test("Source URL rejects embedded line break", () => assert.equal(safeSourceUrl(`https://example.org/${String.fromCharCode(10)}x`), false));
for (const value of ["", "offline/a", "//elsewhere", "/a", "/offline", "/offline/", "/offline/../a", "/offline/./a", "/offline//a", "/offline/a%2Fb", "/offline/a?b", "/offline/a#x", "/offline/a\\b", "/offline/a b"]) {
  test(`offline path rejects ${value}`, () => assert.equal(safeOfflinePath(value), false));
}
test("Local path supports nested cache folders", () => assert.equal(safeOfflinePath("/offline/region/entrance.json"), true));
test("Local path accepts unambiguous Unicode-free identifiers", () => assert.equal(safeOfflinePath("/offline/a_1-v2.json"), true));
test("Diagnostic shape never contains record copy", () => assert.deepEqual(finding("a", "record.x"), { code: "a", path: "record.x", severity: "error" }));
test("Findings sort by path and code", () => assert.deepEqual(sortFindings([finding("z", "b"), finding("a", "a")]).map((item) => item.code), ["a", "z"]));
test("French straight apostrophe is flagged", () => assert.ok(checkFrenchTypography("l'entrée").includes("fr.apostrophe")));
test("French curly apostrophe is accepted", () => assert.deepEqual(checkFrenchTypography("l’entrée"), []));
test("French colon without no-break space is flagged", () => assert.ok(checkFrenchTypography("Note: texte").includes("fr.colon-space")));
test("French colon with no-break space passes", () => assert.deepEqual(checkFrenchTypography("Note : texte"), []));
for (const punctuation of [";", "!", "?"]) {
  test(`French narrow space required before ${punctuation}`, () => {
    assert.ok(checkFrenchTypography(`Mot ${punctuation}`).includes("fr.narrow-space"));
    assert.deepEqual(checkFrenchTypography(`Mot ${punctuation}`), []);
  });
}
test("Guillemets require narrow spaces inside", () => assert.deepEqual(checkFrenchTypography("« Bienvenue »"), []));
test("Guillemet open without space is flagged", () => assert.ok(checkFrenchTypography("«Bonjour »").includes("fr.guillemet-open")));
test("Guillemet close without space is flagged", () => assert.ok(checkFrenchTypography("« Bonjour»").includes("fr.guillemet-close")));
test("Repeated French issues have one code each", () => assert.equal(checkFrenchTypography("a: b: c:").filter((item) => item === "fr.colon-space").length, 1));
test("Empty text object is not allowed", () => assert.ok(codes(textIssues(null, "title")).includes("text.object")));
test("Missing translation is detected", () => assert.ok(codes(textIssues({ en: "Title" }, "title")).includes("text.missing-or-invalid")));
test("French typography is opt-in", () => assert.deepEqual(textIssues({ en: "Title", fr: "Note: texte" }, "title"), []));
test("French typography checks can be enabled", () => assert.ok(codes(textIssues({ en: "Title", fr: "Note: texte" }, "title", { frenchTypography: true })).includes("fr.colon-space")));
test("Complete synthetic source has no issue", () => assert.deepEqual(sourceCodes(source()), []));
test("Null source produces one structural issue", () => assert.deepEqual(sourceCodes(null), ["source.object"]));
for (const [field, value, code] of [["id", "bad id", "source.id"], ["url", "http://example.org", "source.url"], ["publisher", "", "source.publisher"], ["licence", "", "source.licence"], ["tier", "other", "source.tier"], ["claim", "other", "source.claim"], ["collectedOn", "bad", "source.collection-date"], ["collectedOn", "2026-11-20", "source.future-date"], ["reviewedOn", "bad", "source.review-date"], ["reviewedOn", "2026-11-17", "source.review-before-collection"], ["reviewedOn", "2026-11-20", "source.future-review"]]) {
  test(`source ${field} reports ${code}`, () => assert.ok(sourceCodes(source({ [field]: value })).includes(code)));
}
test("Unknown evidence tier is tracked, not upgraded", () => assert.ok(sourceCodes(source({ tier: "UNKNOWN" })).includes("source.unknown-tier")));
test("Unknown claim is tracked", () => assert.ok(sourceCodes(source({ claim: "UNKNOWN" })).includes("source.unknown-claim")));
test("Unsupported claim requires review", () => assert.ok(sourceCodes(source({ claim: "UNSUPPORTED" })).includes("source.unsupported-claim")));
test("Complete stored cache has no issues", () => assert.deepEqual(cacheCodes(cache()), []));
for (const [field, value, code] of [["state", "else", "cache.state"], ["path", "/bad", "cache.path"], ["capturedOn", "bad", "cache.capture-date"], ["capturedOn", "2026-11-20", "cache.future-capture"], ["bytes", 0, "cache.bytes"], ["bytes", 2.4, "cache.bytes"], ["revision", 0, "cache.revision"]]) {
  test(`cache ${field} reports ${code}`, () => assert.ok(cacheCodes(cache({ [field]: value })).includes(code)));
}
test("Missing cache is structural error", () => assert.deepEqual(cacheCodes(null), ["cache.object"]));
test("Absent cache is explicitly reviewed", () => assert.ok(cacheCodes({ state: "ABSENT" }).includes("cache.absent")));
test("Unknown cache remains unknown", () => assert.ok(cacheCodes({ state: "UNKNOWN" }).includes("cache.unknown")));
test("Unknown cache must not claim local bytes", () => assert.ok(cacheCodes({ state: "UNKNOWN", bytes: 12 }).includes("cache.unexpected-payload")));
test("Synthetic record passes structural audit", () => assert.deepEqual(inspect(record()), []));
test("Synthetic French record passes structural audit", () => assert.deepEqual(inspect(french()), []));
test("Non-object record fails closed", () => assert.deepEqual(inspect(null), ["record.object"]));
for (const [field, value, code] of [["id", "bad id", "record.id"], ["translationKey", "bad id", "record.translation-key"], ["language", "de", "record.language"], ["kind", "something", "record.kind"], ["access", "MAYBE", "record.access"], ["revision", 0, "record.revision"], ["recordedOn", "bad", "record.date"], ["recordedOn", "2026-11-20", "record.future-date"]]) {
  test(`record ${field} reports ${code}`, () => assert.ok(inspect(record({ [field]: value })).includes(code)));
}
test("Record uncertainty is observable", () => assert.ok(inspect(record({ access: "UNKNOWN" })).includes("record.unknown-access")));
test("Unsupported record is observable", () => assert.ok(inspect(record({ access: "UNSUPPORTED" })).includes("record.unsupported-access")));
test("Record lacking sources is rejected", () => assert.ok(inspect(record({ sources: [] })).includes("record.sources")));
test("Repeated source IDs are rejected", () => assert.ok(inspect(record({ sources: [source(), source()] })).includes("source.duplicate-id")));
test("Mismatched cache revision is rejected", () => assert.ok(inspect(record({ revision: 2 })).includes("cache.revision-mismatch")));
test("Invalid assessment date fails early", () => assert.throws(() => recordIssues(record(), "r", { asOf: "bad" }), TypeError));
test("Valid bilingual collection passes", () => assert.deepEqual(collectionIssues(pair(), asOf), []));
test("Collection requires an array", () => assert.ok(codes(collectionIssues(null)).includes("collection.array")));
test("Single-language collection reports missing French", () => assert.ok(codes(collectionIssues([record()], asOf)).includes("translation.missing")));
test("Explicit single-language collection permits missing French", () => assert.deepEqual(collectionIssues([record()], { ...asOf, requirePairs: false }), []));
test("Duplicate IDs flag both owners", () => assert.equal(codes(collectionIssues([record(), clone(record())], { ...asOf, requirePairs: false })).filter((code) => code === "record.duplicate").length, 2));
test("Duplicate translation language is flagged", () => assert.ok(codes(collectionIssues([record(), record({ id: "other-en" })], asOf)).includes("translation.duplicate")));
test("Duplicate local cache asset is flagged", () => assert.ok(codes(collectionIssues([record(), french({ cache: cache() })], asOf)).includes("cache.duplicate-owner")));
test("Issue summary counts severity", () => assert.deepEqual(issueSummary([finding("a", "x"), finding("b", "y", "unknown")]), { error: 1, review: 0, unknown: 1, total: 2 }));
test("Issue grouping counts repeated problems", () => assert.deepEqual(groupIssues([finding("a", "x"), finding("a", "y")]), [{ code: "a", count: 2, severity: "error" }]));
test("Audits never mutate original records", () => { const entries = pair(); const saved = clone(entries); collectionIssues(entries, asOf); assert.deepEqual(entries, saved); });
test("Issue records never leak source descriptions", () => { const issues = collectionIssues([record({ summary: { en: "Private text", fr: "Privé" } })], asOf); assert.equal(JSON.stringify(issues).includes("Private text"), false); });
