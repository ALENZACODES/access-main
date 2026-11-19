import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HEADERS, buildPublicationExport, csvCell, csvLine, exportDiagnosticText,
  exportLanguageStats, exportManifest, exportSizeEstimate, exportStatusStats,
  overview, planCsv, planReport, publicRows, publicationCsv, publicationJson,
  publicationJsonl,
} from "./export.mjs";
import { planSnapshotTransition } from "./changes.mjs";
import { DEFAULT_POLICY, anotherRecord, exampleRecord, withCache, withSource } from "./fixtures.mjs";

const base = exampleRecord();
const build = (records) => buildPublicationExport(records, DEFAULT_POLICY);

test("a complete card generates two language rows", () => {
  const packet = build([base]);
  assert.equal(packet.rows.length, 2);
  assert.deepEqual(packet.rows.map((item) => item.locale), ["en", "fr"]);
});

test("two cards generate four rows", () => {
  assert.equal(build([base, anotherRecord()]).rows.length, 4);
});

test("export header fields stay deterministic", () => {
  assert.equal(HEADERS[0], "record_id");
  assert.equal(HEADERS.at(-1), "publication_status");
});

test("unknown evidence survives export intact", () => {
  const packet = build([{ ...base, access: "unknown", tier: "unknown" }]);
  assert.equal(packet.status, "UNKNOWN");
  assert.ok(packet.rows.every((row) => row.evidence_tier === "unknown"));
});

test("unsupported access never leaks into exported rows", () => {
  const packet = build([{ ...base, access: "maybe" }]);
  assert.equal(packet.status, "HOLD");
  assert.equal(packet.rows.length, 0);
});

test("a malformed source prevents export", () => {
  const packet = build([withSource(base, { url: "http://example.org" })]);
  assert.equal(packet.rows.length, 0);
});

test("a malformed cache path prevents export", () => {
  const packet = build([withCache(base, { path: "/offline/../bad" })]);
  assert.equal(packet.rows.length, 0);
});

test("CSV starts with its stable header", () => {
  const csv = publicationCsv(build([base]));
  assert.ok(csv.startsWith(csvLine(HEADERS)));
});

test("CSV rows use CRLF endings", () => {
  const csv = publicationCsv(build([base]));
  assert.ok(csv.includes("\r\n"));
  assert.ok(csv.endsWith("\r\n"));
});

test("CSV quotes embedded double quotes", () => {
  assert.equal(csvCell('a"b'), '"a""b"');
});

test("CSV shields formula-like cells", () => {
  for (const value of ["=2+2", "+SUM(A1)", "@command", "-1+2"]) {
    assert.ok(csvCell(value).startsWith('"\''));
  }
});

test("CSV does not infer values from null", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("CSV escaping remains stable across multiple calls", () => {
  assert.equal(publicationCsv(build([base])), publicationCsv(build([base])));
});

test("JSON contains exactly two localized records", () => {
  const data = JSON.parse(publicationJson(build([base])));
  assert.equal(data.rows.length, 2);
  assert.equal(data.status, "READY");
});

test("JSONL contains one object per row", () => {
  const lines = publicationJsonl(build([base])).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).locale, "fr");
});

test("empty JSONL exports are empty", () => {
  assert.equal(publicationJsonl(build([])), "");
});

test("manifest reports format and language counts", () => {
  const manifest = exportManifest(build([base]));
  assert.equal(manifest.localeCount, 2);
  assert.deepEqual(manifest.formats, ["csv", "json", "jsonl"]);
});

test("manifest does not claim network contact", () => {
  assert.equal(exportManifest(build([base])).noNetworkRequired, true);
});

test("diagnostic report suppresses private source copy", () => {
  const packet = build([withSource(base, { licence: "" })]);
  const report = exportDiagnosticText(packet);
  assert.equal(report.includes(base.summary.en), false);
  assert.ok(report.includes("source.licence"));
});

test("language stats count each language equally", () => {
  assert.deepEqual(exportLanguageStats(build([base, anotherRecord()])), { en: 2, fr: 2 });
});

test("status stats count one decision for each language", () => {
  assert.deepEqual(exportStatusStats(build([base])), { READY: 2, HOLD: 0, UNKNOWN: 0 });
});

test("size estimates reflect byte-length of exports", () => {
  const packet = build([base]);
  const sizes = exportSizeEstimate(packet);
  assert.equal(sizes.csv, Buffer.byteLength(publicationCsv(packet)));
  assert.ok(sizes.json > 0);
});

test("plan CSV includes change action fields", () => {
  const plan = planSnapshotTransition([], [base], DEFAULT_POLICY);
  const csv = planCsv(plan);
  assert.ok(csv.includes("record_id"));
  assert.ok(csv.includes("ADD"));
});

test("plan report exposes counts, not source descriptions", () => {
  const plan = planSnapshotTransition([], [base], DEFAULT_POLICY);
  const report = planReport(plan);
  assert.equal(report.counts.ADD, 1);
  assert.equal(JSON.stringify(report).includes(base.summary.en), false);
});

test("overview provides bilingual status and manifest", () => {
  const value = overview([base], DEFAULT_POLICY);
  assert.equal(value.status, "READY");
  assert.equal(value.manifest.rowCount, 2);
  assert.equal(value.languages.fr, 1);
});

test("public row mapping is read-only", () => {
  const before = structuredClone(base);
  publicRows(base, "READY");
  assert.deepEqual(base, before);
});

test("public rows do not expose arbitrary input properties", () => {
  const rows = publicRows({ ...base, privateField: "never expose this" }, "READY");
  assert.equal(JSON.stringify(rows).includes("never expose this"), false);
});

test("public rows for malformed data are empty", () => {
  assert.deepEqual(publicRows(null, "READY"), []);
});

test("source attribution survives export without modification", () => {
  const row = build([base]).rows[0];
  assert.equal(row.source_url, base.source.url);
  assert.equal(row.source_licence, base.source.licence);
  assert.equal(row.source_collected_on, base.source.collectedOn);
});

test("cache metadata travels only with stored observations", () => {
  const packet = build([{ ...base, cache: { state: "unknown" } }]);
  assert.ok(packet.rows.every((row) => row.cache_path === ""));
});

test("all outputs preserve unknown tokens", () => {
  const packet = build([{ ...base, access: "unknown", tier: "unknown" }]);
  assert.equal(packet.rows[0].evidence_tier, "unknown");
  assert.equal(packet.rows[0].publication_status, "UNKNOWN");
});
