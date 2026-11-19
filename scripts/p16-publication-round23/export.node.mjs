import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HEADERS, spreadsheetCell, csvQuote, csvRow, exportRows,
  exportEvidenceCsv, exportDecisionJson, exportChangeCsv,
  exportInventory, exportBilingualStatus, exportAuditSummary,
  safeJsonLines, publishedDateRange, publicSummary,
} from "./export.mjs";
import { AT, cache, clone, french, pair, pairedRecord, record, source } from "./fixtures.node.mjs";

const options = { asOf: AT };

test("CSV column order is stable", () => {
  assert.equal(HEADERS[0], "record_id");
  assert.equal(HEADERS[HEADERS.length - 1], "readiness");
});
test("CSV headers include source attribution", () => {
  assert.ok(HEADERS.includes("licence"));
  assert.ok(HEADERS.includes("collected_on"));
  assert.ok(HEADERS.includes("tier"));
});
test("CSV headers include offline capture details", () => {
  assert.ok(HEADERS.includes("offline_path"));
  assert.ok(HEADERS.includes("captured_on"));
  assert.ok(HEADERS.includes("bytes"));
});
for (const unsafe of ["=1+1", "+SUM(A1)", "-2+2", "@cmd", " =42", " +calc", "\t=3", "\r@4"]) {
  test(`spreadsheet-formula-like value is neutralised: ${JSON.stringify(unsafe)}`, () => {
    assert.ok(spreadsheetCell(unsafe).startsWith("'"));
  });
}
for (const safe of ["A sentence", "Entrée accessible", "https://example.org/a", "CC BY 4.0", "2026-11-19"]) {
  test(`plain spreadsheet value is preserved: ${safe}`, () => {
    assert.equal(spreadsheetCell(safe), safe);
  });
}
test("empty values become empty CSV cells", () => {
  assert.equal(spreadsheetCell(null), "");
  assert.equal(spreadsheetCell(undefined), "");
});
test("control characters are removed from exported cells", () => {
  const value = `abc${String.fromCharCode(0)}def`;
  assert.equal(spreadsheetCell(value), "abcdef");
});
test("quotes are doubled for CSV safety", () => {
  assert.equal(csvQuote('A "quoted" item'), '"A ""quoted"" item"');
});
test("CSV row encloses each cell in double quotes", () => {
  assert.equal(csvRow(["a", "b"]), '"a","b"');
});
test("CSV row remains robust for commas", () => {
  assert.equal(csvRow(["a,b"]), '"a,b"');
});
test("CSV row never outputs raw formula start", () => {
  assert.equal(csvRow(["=1+1"]), '"\'=1+1"');
});
test("complete bilingual records produce two export rows", () => {
  assert.equal(exportRows(pair(), options).rows.length, 2);
});
test("each source contributes a separate attributed row", () => {
  const item = record({ sources: [source(), source({ id: "other-source" })] });
  assert.equal(exportRows([item, french()], options).rows.length, 3);
});
test("bilingual export requires both languages", () => {
  assert.equal(exportRows([record()], options).decision, "HOLD");
});
test("invalid records cannot enter the CSV", () => {
  const result = exportEvidenceCsv([record({ title: { en: "TODO", fr: "À venir" } }), french()], options);
  assert.equal(result.csv, "");
  assert.ok(result.findings.length > 0);
});
test("complete records produce a header and CRLF rows", () => {
  const result = exportEvidenceCsv(pair(), options);
  assert.equal(result.csv.split("\r\n").length, 4);
  assert.ok(result.csv.startsWith('"record_id"'));
});
test("CSV excludes summary and title copy by design", () => {
  const result = exportEvidenceCsv(pair(), options);
  assert.equal(result.csv.includes("An entrance is described."), false);
});
test("CSV preserves source licence value", () => {
  const result = exportEvidenceCsv(pair(), options);
  assert.ok(result.csv.includes("CC BY 4.0"));
});
test("CSV preserves evidence tier", () => {
  const result = exportEvidenceCsv(pair(), options);
  assert.ok(result.csv.includes("PRIMARY"));
});
test("CSV does not claim unknown evidence as ready", () => {
  const data = [record({ state: "UNKNOWN" }), french()];
  assert.ok(exportEvidenceCsv(data, options).csv.includes("UNKNOWN"));
});
test("decision JSON is valid JSON with no record copy", () => {
  const result = JSON.parse(exportDecisionJson(pair(), options));
  assert.equal(result.summary.decision, "READY");
  assert.equal(JSON.stringify(result).includes("An entrance is described."), false);
});
test("decision JSON states assessment date", () => {
  assert.equal(JSON.parse(exportDecisionJson(pair(), options)).asOf, AT);
});
test("decision JSON includes explicit bilingual pair", () => {
  const result = JSON.parse(exportDecisionJson(pair(), options));
  assert.equal(result.decisions[0].translationKey, "example");
});
test("decision JSON never transforms UNKNOWN to READY", () => {
  const result = JSON.parse(exportDecisionJson([record({ state: "UNKNOWN" }), french()], options));
  assert.equal(result.summary.decision, "UNKNOWN");
});
test("change CSV has a stable header", () => {
  assert.ok(exportChangeCsv(pair(), pair(), options).csv.startsWith('"record_key","action"'));
});
test("change CSV lists additions", () => {
  assert.ok(exportChangeCsv([], pair(), options).csv.includes("ADD"));
});
test("change CSV lists retirements", () => {
  assert.ok(exportChangeCsv(pair(), [], options).csv.includes("RETIRE"));
});
test("change CSV blocks inconsistent records", () => {
  const result = exportChangeCsv(pair(), [record()], options);
  assert.equal(result.csv, "");
});
test("inventory counts source URLs", () => {
  assert.equal(exportInventory(pair(), options).sourceUrls, 1);
});
test("inventory counts cached paths", () => {
  assert.equal(exportInventory(pair(), options).cachedPaths, 2);
});
test("inventory totals unique bytes", () => {
  assert.equal(exportInventory(pair(), options).totalBytes, 2048);
});
test("inventory counts one translation pair", () => {
  assert.equal(exportInventory(pair(), options).translationPairs, 1);
});
test("inventory does not pretend absent records exist", () => {
  assert.equal(exportInventory(null, options).records, 0);
});
test("inventory reports unknown readiness", () => {
  const result = exportInventory([record({ state: "UNKNOWN" }), french()], options);
  assert.equal(result.decision, "UNKNOWN");
});
test("bilingual status identifies both languages", () => {
  assert.deepEqual(exportBilingualStatus(pair(), options).map((entry) => [entry.en, entry.fr]), [[true, true]]);
});
test("bilingual status reports missing French", () => {
  const result = exportBilingualStatus([record()], options);
  assert.equal(result[0].fr, false);
});
test("audit summary reports clean data with no errors", () => {
  assert.equal(exportAuditSummary(pair(), options).errorCount, 0);
});
test("audit summary reports missing-language error", () => {
  assert.ok(exportAuditSummary([record()], options).errorCount > 0);
});
test("JSONL has one line per attributed source", () => {
  const lines = safeJsonLines(pair(), options).content.trim().split("\n");
  assert.equal(lines.length, 2);
});
test("JSONL keys match the CSV header vocabulary", () => {
  const first = JSON.parse(safeJsonLines(pair(), options).content.split("\n")[0]);
  assert.deepEqual(Object.keys(first), HEADERS);
});
test("JSONL excludes incomplete collections", () => {
  assert.equal(safeJsonLines([record()], options).content, "");
});
test("date range identifies the first collection record date", () => {
  assert.equal(publishedDateRange(pair()).first, "2026-11-18");
});
test("date range identifies last record date", () => {
  const entries = [record(), french({ recordedOn: "2026-11-19" })];
  assert.equal(publishedDateRange(entries).last, "2026-11-19");
});
test("invalid recordedOn is excluded from date range", () => {
  assert.equal(publishedDateRange([record({ recordedOn: "invalid" })]).count, 0);
});
test("empty date range is null", () => {
  assert.deepEqual(publishedDateRange([]), { first: null, last: null, count: 0 });
});
test("public summary contains counts, not raw descriptions", () => {
  const result = publicSummary(pair(), options);
  assert.equal(result.bilingualPairs, 1);
  assert.equal(JSON.stringify(result).includes("An entrance is described."), false);
});
test("public summary keeps uncertainty when applicable", () => {
  const result = publicSummary([record({ state: "UNKNOWN" }), french()], options);
  assert.equal(result.status, "UNKNOWN");
});
test("exports do not mutate supplied record objects", () => {
  const original = pair();
  const snapshot = clone(original);
  exportEvidenceCsv(original, options);
  exportDecisionJson(original, options);
  exportInventory(original, options);
  assert.deepEqual(original, snapshot);
});
