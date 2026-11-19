import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LANGUAGES, STATES, TIERS, CACHE_STATES, KINDS, MAX_RECORDS,
  plainObject, containsAsciiControl, canonicalIdentifier, safeText,
  calendarOrdinal, secureSourceUrl, localCachePath, bilingualCopy,
  diagnostic, sortDiagnostics, findSourceIssues, findCacheIssues,
  findRecordIssues, auditCollection, summarizeIssues,
} from "./contract.mjs";
import { AT, cache, clone, findCodes, french, pair, record, source } from "./fixtures.node.mjs";

const codes = (items) => findCodes(items);
const sourceIssues = (change) => findSourceIssues(source(change), "source", AT);
const cacheIssues = (change) => findCacheIssues(cache(change), "cache", AT);
const recordIssues = (change) => findRecordIssues(record(change), "record", { asOf: AT });

test("contract exports exact language variants", () => {
  assert.deepEqual(LANGUAGES, ["en", "fr"]);
  assert.ok(Object.isFrozen(LANGUAGES));
});
test("contract makes uncertain state explicit", () => {
  assert.deepEqual(STATES, ["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]);
  assert.ok(Object.isFrozen(STATES));
});
test("source tiers never imply certainty", () => {
  assert.deepEqual(TIERS, ["PRIMARY", "SECONDARY", "COMMUNITY", "UNKNOWN"]);
});
test("cache state includes uncertainty", () => {
  assert.deepEqual(CACHE_STATES, ["PRESENT", "ABSENT", "UNKNOWN"]);
});
test("record kinds have a finite vocabulary", () => {
  assert.deepEqual(KINDS, ["entrance", "washroom", "route", "service", "notice"]);
});

test("ordinary objects qualify as plain", () => assert.equal(plainObject({ a: 1 }), true));
test("null-prototype objects qualify as plain", () => assert.equal(plainObject(Object.create(null)), true));
test("arrays are not plain records", () => assert.equal(plainObject([]), false));
test("dates are not plain records", () => assert.equal(plainObject(new Date()), false));
test("strings are not plain records", () => assert.equal(plainObject("a"), false));
test("null is not a plain record", () => assert.equal(plainObject(null), false));
test("class instances are not plain records", () => assert.equal(plainObject(new (class Data {})()), false));

for (const codePoint of [0, 1, 9, 10, 13, 28, 31, 127]) {
  test(`control character ${codePoint} is rejected without regex escapes`, () => {
    assert.equal(containsAsciiControl(`x${String.fromCharCode(codePoint)}y`), true);
  });
}
for (const phrase of ["hello", "Français", "entrée", "—", "éducation", "🙂"]) {
  test(`ordinary text has no ASCII control: ${phrase}`, () => {
    assert.equal(containsAsciiControl(phrase), false);
  });
}
test("control scanner tolerates non-string values", () => {
  assert.equal(containsAsciiControl(undefined), false);
  assert.equal(containsAsciiControl({}), false);
});

for (const id of ["entrance", "route-01", "a1", "source-2-3", "a".repeat(128)]) {
  test(`valid identifier accepted: ${id.slice(0, 12)}`, () => {
    assert.equal(canonicalIdentifier(id), true);
  });
}
for (const id of ["", "with space", "UPPER", "a_1", "a--b", "-first", "last-", "a".repeat(129), null, 1]) {
  test(`invalid identifier rejected: ${String(id).slice(0, 12)}`, () => {
    assert.equal(canonicalIdentifier(id), false);
  });
}

for (const copy of ["Accessible entrance", "Entrée accessible", "Public information", "Données publiques"]) {
  test(`acceptable accessible copy: ${copy}`, () => assert.equal(safeText(copy), true));
}
for (const copy of ["", " ", "leading ", " trailing", "TODO", "TBD", "n/a", "unknown", "inconnu", "à venir", "-", "A".repeat(4001)]) {
  test(`unsafe or placeholder copy rejected: ${copy.slice(0, 12)}`, () => {
    assert.equal(safeText(copy), false);
  });
}
test("copy length is an explicit contract", () => {
  assert.equal(safeText("valid", 4), false);
  assert.equal(safeText("valid", 5), true);
});
test("control content is rejected in copy", () => {
  assert.equal(safeText(`abc${String.fromCharCode(0)}def`), false);
});
test("non-text copy is rejected", () => {
  assert.equal(safeText({ en: "hello" }), false);
  assert.equal(safeText(17), false);
});

for (const date of ["2024-02-29", "2026-11-19", "1970-01-01", "9999-12-31"]) {
  test(`calendar day accepted: ${date}`, () => assert.notEqual(calendarOrdinal(date), null));
}
for (const date of ["2026-02-29", "2026-11-31", "2026-13-01", "1969-12-31", "0000-01-01", "2026-1-1", "2026-01-1", "not-a-date", undefined]) {
  test(`invalid calendar date rejected: ${date}`, () => assert.equal(calendarOrdinal(date), null));
}
test("consecutive days have adjacent ordinals", () => {
  assert.equal(calendarOrdinal("2026-11-19") - calendarOrdinal("2026-11-18"), 1);
});
test("leap day advances exactly one ordinal", () => {
  assert.equal(calendarOrdinal("2024-03-01") - calendarOrdinal("2024-02-29"), 1);
});

for (const url of ["https://example.org", "https://example.org/data", "https://data.example.org/a?b=1"]) {
  test(`secure reference URL accepted: ${url}`, () => assert.equal(secureSourceUrl(url), true));
}
for (const url of ["http://example.org", "javascript:alert(1)", "https://u:p@example.org", "https://example.org/#secret", "https://localhost/a", "https://a.localhost/", "https://127.0.0.1/a", "https://[::1]/", "https://example.org/a b", "https://example.org/a\\b", "//example.org", "", null]) {
  test(`unsafe reference URL rejected: ${String(url)}`, () => assert.equal(secureSourceUrl(url), false));
}
test("URL controls are rejected before URL normalization", () => {
  assert.equal(secureSourceUrl(`https://example.org/a${String.fromCharCode(10)}b`), false);
});

for (const path of ["/offline/evidence/a.json", "/offline/evidence/en/route-1.json", "/offline/evidence/record_1.txt"]) {
  test(`local cache path accepted: ${path}`, () => assert.equal(localCachePath(path), true));
}
for (const path of ["/offline/evidence", "/offline/evidence/", "//offline/evidence/a", "/offline/evidence/../a", "/offline/evidence/a/./b", "/offline/evidence/a//b", "/offline/evidence/a?q=x", "/offline/evidence/a#x", "/offline/evidence/%2e", "/offline/evidence/a\\b", "/elsewhere/a", "https://example.org/a", null]) {
  test(`unsafe cache path rejected: ${String(path)}`, () => assert.equal(localCachePath(path), false));
}
test("local cache path rejects control codes", () => {
  assert.equal(localCachePath(`/offline/evidence/a${String.fromCharCode(0)}.json`), false);
});
test("different cache prefix can be explicitly selected", () => {
  assert.equal(localCachePath("/other/entry.json", "/other"), true);
  assert.equal(localCachePath("/offline/evidence/a.json", "/other"), false);
});

for (const content of [null, {}, { en: "Good" }, { fr: "Bien" }, { en: "TODO", fr: "Bien" }, { en: "Good", fr: "à venir" }]) {
  test(`incomplete bilingual copy rejected: ${JSON.stringify(content)}`, () => {
    assert.equal(bilingualCopy(content), false);
  });
}
test("two complete translations satisfy the copy contract", () => {
  assert.equal(bilingualCopy({ en: "Entrance", fr: "Entrée" }), true);
});
test("diagnostics never include underlying copy", () => {
  assert.deepEqual(diagnostic("record.title", "records[0].title"), {
    code: "record.title", path: "records[0].title", severity: "error",
  });
});
test("diagnostics are frozen once emitted", () => {
  assert.equal(Object.isFrozen(diagnostic("x", "y")), true);
});
test("diagnostics are sorted by path and code", () => {
  const sorted = sortDiagnostics([diagnostic("b", "z"), diagnostic("b", "a"), diagnostic("a", "a")]);
  assert.deepEqual(sorted.map((item) => `${item.path}:${item.code}`), ["a:a", "a:b", "z:b"]);
});

test("complete source has no findings", () => assert.deepEqual(sourceIssues({}), []));
for (const [field, bad, code] of [
  ["id", "bad id", "source.id"],
  ["title", { en: "Okay" }, "source.title"],
  ["publisher", "", "source.publisher"],
  ["licence", "TODO", "source.licence"],
  ["url", "http://example.org", "source.url"],
  ["tier", "UNLISTED", "source.tier"],
  ["collectedOn", "2026-02-29", "source.collectedOn"],
  ["collectedOn", "2026-11-20", "source.futureDate"],
  ["updatedOn", "2026-11-16", "source.dateOrder"],
  ["updatedOn", "last month", "source.updatedOn"],
]) {
  test(`source field ${field} raises ${code}`, () => {
    assert.ok(codes(sourceIssues({ [field]: bad })).includes(code));
  });
}
test("absent source object yields a single path-based issue", () => {
  assert.deepEqual(codes(findSourceIssues(null)), ["source.object"]);
});
test("unknown tier cannot claim supported evidence", () => {
  assert.ok(codes(sourceIssues({ tier: "UNKNOWN", claim: "SUPPORTED" })).includes("source.unknownSupport"));
});
test("unknown tier with unknown claim is accepted without upgrading evidence", () => {
  assert.deepEqual(sourceIssues({ tier: "UNKNOWN", claim: "UNKNOWN" }), []);
});

test("complete offline metadata has no findings", () => assert.deepEqual(cacheIssues({}), []));
for (const [field, bad, code] of [
  ["state", "broken", "cache.state"],
  ["path", "/outside.json", "cache.path"],
  ["capturedOn", "2026-11-20", "cache.futureDate"],
  ["capturedOn", "bad", "cache.capturedOn"],
  ["bytes", 0, "cache.bytes"],
  ["bytes", 1.5, "cache.bytes"],
  ["bytes", 100_000_001, "cache.bytes"],
]) {
  test(`cache field ${field} raises ${code}`, () => {
    assert.ok(codes(cacheIssues({ [field]: bad })).includes(code));
  });
}
for (const state of ["ABSENT", "UNKNOWN"]) {
  test(`${state} cache needs no invented local path`, () => {
    assert.deepEqual(findCacheIssues({ state }), []);
  });
  test(`${state} cache may not claim an offline path`, () => {
    assert.ok(codes(findCacheIssues({ state, path: "/offline/evidence/a.json" })).includes("cache.unexpectedField"));
  });
  test(`${state} cache may not claim byte size`, () => {
    assert.ok(codes(findCacheIssues({ state, bytes: 50 })).includes("cache.unexpectedField"));
  });
}

test("complete record has no findings", () => assert.deepEqual(recordIssues({}), []));
for (const [field, bad, code] of [
  ["id", "Invalid", "record.id"],
  ["translationKey", "", "record.translationKey"],
  ["language", "es", "record.language"],
  ["kind", "invalid", "record.kind"],
  ["state", "maybe", "record.state"],
  ["title", { en: "English" }, "record.title"],
  ["summary", { fr: "Français" }, "record.summary"],
  ["revision", 0, "record.revision"],
  ["revision", 0.5, "record.revision"],
  ["recordedOn", "2026-11-30", "record.futureDate"],
  ["recordedOn", "invalid", "record.recordedOn"],
  ["sources", [], "record.sources"],
  ["cache", null, "cache.object"],
]) {
  test(`record field ${field} raises ${code}`, () => {
    assert.ok(codes(recordIssues({ [field]: bad })).includes(code));
  });
}
test("record rejects duplicate source IDs", () => {
  assert.ok(codes(recordIssues({ sources: [source(), source()] })).includes("record.duplicateSource"));
});
test("uncertain record cannot advertise a supported cache claim", () => {
  const data = record({ state: "UNKNOWN", cache: cache({ claim: "SUPPORTED" }) });
  assert.ok(codes(findRecordIssues(data)).includes("record.unknownCacheClaim"));
});
test("supported record cannot rely only on unknown-tier sources", () => {
  const data = record({ sources: [source({ tier: "UNKNOWN", claim: "UNKNOWN" })] });
  assert.ok(codes(findRecordIssues(data)).includes("record.unsourcedSupport"));
});
test("invalid record shape fails closed", () => {
  assert.deepEqual(codes(findRecordIssues(null)), ["record.object"]);
});
test("invalid policy date is rejected", () => {
  assert.throws(() => findRecordIssues(record(), "record", { asOf: "yesterday" }), TypeError);
});

test("complete bilingual collection has no findings", () => {
  assert.deepEqual(auditCollection(pair(), { asOf: AT }).findings, []);
});
test("collection requires array input", () => {
  assert.deepEqual(codes(auditCollection(null).findings), ["collection.array"]);
});
test("too many records fail with bounded result", () => {
  assert.deepEqual(codes(auditCollection(Array.from({ length: MAX_RECORDS + 1 }, () => record())).findings), ["collection.tooMany"]);
});
test("duplicate record ID within a language is found", () => {
  assert.ok(codes(auditCollection([record(), record(), french()]).findings).includes("collection.duplicateRecord"));
});
test("duplicate language per translation key is found", () => {
  assert.ok(codes(auditCollection([record(), record({ id: "second-en" }), french()]).findings).includes("collection.duplicateLanguage"));
});
test("missing translation is a finding", () => {
  assert.ok(codes(auditCollection([record()]).findings).includes("collection.missingLanguage"));
});
test("missing translation gate can be disabled explicitly", () => {
  assert.deepEqual(auditCollection([record()], { requireBothLanguages: false }).findings, []);
});
test("cache-path ownership may not be shared across translations", () => {
  const other = record({ id: "other-en", translationKey: "other" });
  assert.ok(codes(auditCollection([...pair(), other]).findings).includes("collection.cacheConflict"));
});
test("collection audit leaves input untouched", () => {
  const records = pair();
  const snapshot = clone(records);
  auditCollection(records);
  assert.deepEqual(records, snapshot);
});
test("summary counts findings without echoing raw copy", () => {
  const findings = [diagnostic("x", "a"), diagnostic("y", "b"), diagnostic("x", "c")];
  assert.deepEqual(summarizeIssues(findings), [{ code: "x", count: 2 }, { code: "y", count: 1 }]);
});
