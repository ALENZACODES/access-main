import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXPORT_FIELDS, EXPORT_LANGUAGES, EXPORT_TIERS, EXPORT_STATES, EXPORT_OFFLINE,
  hasUnsafeCodeUnit, textField, validDate, safeSourceUrl, safeAppPath,
  inspectExportRecord, prepareEvidenceExport, safeCsvCell, evidenceCsv, summarizeExport,
} from "./p16-accessible-export-round20.mjs";

const source = () => ({
  name: "City open data", url: "https://example.org/data", licence: "CC BY 4.0", collectedOn: "2026-11-18",
});
const card = (change = {}) => ({
  id: "place-one", language: "en", title: "Accessible entrance", summary: "Public record summary",
  state: "available", tier: "primary", reviewedOn: "2026-11-19",
  source: source(), offline: { state: "cached", path: "/offline/place-one.json" }, ...change,
});
const fr = (change = {}) => card({ language: "fr", title: "Entrée accessible", summary: "Résumé public", ...change });
const codes = (findings) => findings.map((finding) => finding.code);
const check = (changed, expected) => {
  const result = inspectExportRecord(card(changed), 0);
  assert.ok(codes(result.findings).includes(expected), `Expected ${expected}`);
  assert.equal(result.row, null);
};

test("stable export contract has EN and FR", () => {
  assert.deepEqual(EXPORT_LANGUAGES, ["en", "fr"]);
  assert.equal(EXPORT_FIELDS.length, 13);
  assert.deepEqual(EXPORT_TIERS, ["primary", "secondary", "community", "unknown"]);
  assert.deepEqual(EXPORT_STATES, ["available", "unavailable", "unknown"]);
  assert.deepEqual(EXPORT_OFFLINE, ["cached", "not-cached", "unknown"]);
});

test("well formed English and French records pass", () => {
  assert.deepEqual(inspectExportRecord(card(), 0).findings, []);
  assert.deepEqual(inspectExportRecord(fr(), 0).findings, []);
});

test("unknown states keep unknown tier and offline truthfulness", () => {
  const input = card({ state: "unknown", tier: "unknown", offline: { state: "unknown" } });
  const item = inspectExportRecord(input, 0);
  assert.deepEqual(item.findings, []);
  assert.equal(item.row.offline_path, "");
});

test("a missing source is rejected", () => check({ source: null }, "source.object"));
test("records must be objects", () => {
  for (const value of [null, 0, "hello", [], false]) {
    assert.deepEqual(codes(inspectExportRecord(value, 4).findings), ["record.object"]);
  }
});

test("duplicate key pairs are not exported twice", () => {
  const output = prepareEvidenceExport([card(), card()]);
  assert.equal(output.rows.length, 1);
  assert.deepEqual(codes(output.findings), ["set.duplicate"]);
});

test("same record in different languages is permitted", () => {
  const output = prepareEvidenceExport([fr(), card()], { requireBothLanguages: true });
  assert.deepEqual(output.findings, []);
  assert.deepEqual(output.rows.map((row) => row.language), ["en", "fr"]);
});

test("missing translation produces stable diagnostic", () => {
  assert.deepEqual(codes(prepareEvidenceExport([card()], { requireBothLanguages: true }).findings), ["set.missing-language"]);
});

test("safe duplicate cache ownership by same id", () => {
  assert.deepEqual(prepareEvidenceExport([card(), fr()]).findings, []);
});

test("conflicting cache ownership reports without leaking content", () => {
  const output = prepareEvidenceExport([card(), card({ id: "other-place" })]);
  assert.deepEqual(codes(output.findings), ["set.cache-conflict"]);
  assert.equal(JSON.stringify(output.findings).includes("City open data"), false);
});

test("non-array and huge collections fail closed", () => {
  assert.deepEqual(codes(prepareEvidenceExport(null).findings), ["set.array"]);
  assert.deepEqual(codes(prepareEvidenceExport(new Array(20001)).findings), ["set.capacity"]);
});

test("unsafe code units are detected without control regex", () => {
  for (const value of ["A\u0000", "A\u001f", "A\u007f", "A\u0085"]) assert.equal(hasUnsafeCodeUnit(value), true);
  assert.equal(hasUnsafeCodeUnit("Entrée accessible"), false);
  assert.equal(hasUnsafeCodeUnit(44), true);
});

test("text bounds preserve accents and reject object coercion", () => {
  assert.equal(textField("  École ", 30), "École");
  assert.equal(textField({}, 30), null);
  assert.equal(textField("   ", 30), null);
  assert.equal(textField("large", 4), null);
});

test("source URLs must be public credential-free HTTPS URLs", () => {
  for (const value of ["http://example.org", "javascript:alert(1)", "https://u:p@example.org", "https://example.org/#part", "https://localhost/x", "https://127.0.0.1/x", "https://example.org/a\u0000", "https://example.org/ x"]) {
    assert.equal(safeSourceUrl(value), false, String(value));
  }
  assert.equal(safeSourceUrl("https://example.org/data"), true);
});

test("calendar dates reject rollovers", () => {
  for (const value of ["2026-02-29", "2026-04-31", "2026-00-01", "2026-1-1", "1969-12-31", "2030-13-01"]) assert.equal(validDate(value), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-11-19"), true);
});

test("local cache paths reject traversal and escapes", () => {
  for (const value of ["//evil", "/offline/../other", "/offline/%2e%2e", "/offline/a?b", "/offline/a#b", "/offline/a\\b", "/offline//a", "https://example.org", "/wrong/a"]) assert.equal(safeAppPath(value), false, value);
  assert.equal(safeAppPath("/offline/a.json"), true);
});

test("no input mutation", () => {
  const input = [card(), fr()];
  const before = structuredClone(input);
  prepareEvidenceExport(input, { requireBothLanguages: true });
  assert.deepEqual(input, before);
});

test("CSV fields are escaped and formula-like content neutralized", () => {
  assert.equal(safeCsvCell('say "hello"'), '"say ""hello"""');
  for (const value of ["=SUM(A1:A2)", "+1", "-10", "@cmd", "  =SUM(A1:A2)"]) {
    assert.ok(safeCsvCell(value).startsWith('"\''));
  }
});

test("CSV is deterministic with CRLF endings and safe quoting", () => {
  const result = prepareEvidenceExport([fr(), card()], { requireBothLanguages: true });
  const csv = evidenceCsv(result, { requireClean: true });
  assert.ok(csv.startsWith('"record_id","language"'));
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(csv.split("\r\n").length, 4);
});

test("strict export rejects outstanding findings", () => {
  const result = prepareEvidenceExport([card({ title: "" })]);
  assert.throws(() => evidenceCsv(result, { requireClean: true }));
  assert.equal(evidenceCsv(result).split("\r\n").length, 2);
});

test("malformed manual export is rejected", () => {
  assert.throws(() => evidenceCsv(null), TypeError);
  assert.throws(() => evidenceCsv({ rows: [{ record_id: null }], findings: [] }), TypeError);
});

test("summary uses stable codes only", () => {
  const summary = summarizeExport(prepareEvidenceExport([card({ source: null }), card({ title: "" })]));
  assert.deepEqual(summary.map((entry) => entry.code), ["record.title", "source.object"]);
  assert.equal(JSON.stringify(summary).includes("City open data"), false);
});

test("a date reviewed before collection is blocked", () => check({ reviewedOn: "2026-11-01" }, "source.review-order"));
test("a wrong language is blocked", () => check({ language: "es" }, "record.language"));
test("wrong tier is blocked", () => check({ tier: "gold" }, "record.tier"));
test("unknown state cannot claim primary tier", () => check({ state: "unknown" }, "record.unknown-tier"));
test("an invalid ID is blocked", () => check({ id: "bad id" }, "record.id"));
test("an empty title is blocked", () => check({ title: "" }, "record.title"));
test("an empty summary is blocked", () => check({ summary: "" }, "record.summary"));
test("missing source licence is blocked", () => check({ source: { ...source(), licence: "" } }, "source.licence"));
test("missing source name is blocked", () => check({ source: { ...source(), name: "" } }, "source.name"));
test("invalid collected date is blocked", () => check({ source: { ...source(), collectedOn: "yesterday" } }, "source.collected-on"));
test("non HTTPS source link is blocked", () => check({ source: { ...source(), url: "http://example.org" } }, "source.url"));
test("missing offline details are blocked", () => check({ offline: null }, "offline.object"));
test("wrong offline state is blocked", () => check({ offline: { state: "maybe" } }, "offline.state"));
test("cached record with wrong path is blocked", () => check({ offline: { state: "cached", path: "/bad/x" } }, "offline.path"));
test("uncached record cannot claim a path", () => check({ offline: { state: "not-cached", path: "/offline/x" } }, "offline.unexpected-path"));
test("invalid review date is blocked", () => check({ reviewedOn: "tomorrow" }, "record.reviewed-on"));
