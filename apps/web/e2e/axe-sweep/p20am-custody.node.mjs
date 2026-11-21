import test from "node:test";
import assert from "node:assert/strict";
import {
  csvCell, csvRow, normalizedRecord, exportHeaders, exportText, exportCsv,
  exportJson, artifact, exportFindings, importJson, compareExports,
  requiredCoverage, coverageKey, coverageFindings, traceCoverage,
  coverageFromTraceCells, custodySummary, recordNames, hasUnknownValues,
  formatEnvelope,
} from "./p20am-custody.ts";
import { sampleRecord, sampleScreen, sampleAction, finding, UNKNOWN } from "./p20am-model.ts";
const codes = (items) => items.map((item) => item.rule);
const envelope = () => formatEnvelope("en", "/journey", [sampleRecord()], "json");
const specified = (changes = {}) => ({ ...envelope(), ...changes });
const recorded = () => sampleRecord({ value: "Observed detail", declared: "KNOWN" });

test("CSV always quotes a normal cell", () => {
  assert.equal(csvCell("hello"), '"hello"');
});
test("CSV doubles embedded quotes", () => {
  assert.equal(csvCell('The "A" room'), '"The ""A"" room"');
});
test("CSV surrounds commas instead of removing them", () => {
  assert.equal(csvCell("one,two"), '"one,two"');
});
test("CSV keeps embedded newlines inside quotes", () => {
  assert.equal(csvCell("one\ntwo"), '"one\ntwo"');
});
for (const value of ["=1+1", "+SUM(A1)", "-5+8", "@IMPORT", "\t=1", "\r=1"]) {
  test(`CSV shields formula-like cell ${JSON.stringify(value)}`, () => {
    assert.ok(csvCell(value).startsWith('"\''));
  });
}
test("CSV row preserves field count and order", () => {
  assert.equal(csvRow(["a", "b", "c"]), '"a","b","c"');
});
test("normalizing a missing value does not invent a measured value", () => {
  const item = normalizedRecord(sampleRecord());
  assert.equal(item.value, UNKNOWN);
  assert.equal(item.status, UNKNOWN);
});
test("normalizing a complete known record retains its declared status", () => {
  const item = normalizedRecord(recorded());
  assert.equal(item.status, "KNOWN");
  assert.equal(item.value, "Observed detail");
});
test("an invalid retrieved-on date cannot enter a known export", () => {
  const item = normalizedRecord(sampleRecord({ retrievedOn: "2026-02-30", declared: "KNOWN" }));
  assert.equal(item.retrievedOn, UNKNOWN);
  assert.equal(item.status, UNKNOWN);
});
test("English column names distinguish licence and tier", () => {
  assert.deepEqual(exportHeaders("en"), ["ID", "Label", "Value", "Source", "Licence",
    "Retrieved on", "Evidence tier", "Status"]);
});
test("French column names use bilingual copy", () => {
  assert.deepEqual(exportHeaders("fr"), ["ID", "Libellé", "Valeur", "Source", "Licence",
    "Date de consultation", "Niveau de preuve", "État"]);
});
test("plain-text export displays UNKNOWN instead of a claimed fact", () => {
  assert.match(exportText(specified({ format: "text" })), /UNKNOWN/);
});
test("text export contains provenance fields", () => {
  const output = exportText(specified({ format: "text" }));
  for (const label of ["Source", "Licence", "Retrieved on", "Evidence tier"]) {
    assert.ok(output.includes(label));
  }
});
test("French text export uses the translated retrieval label", () => {
  const output = exportText(specified({ language: "fr", format: "text" }));
  assert.match(output, /Date de consultation/);
});
test("text output terminates with one newline", () => {
  const output = exportText(specified({ format: "text" }));
  assert.ok(output.endsWith("\n"));
  assert.equal(output.endsWith("\n\n"), false);
});
test("CSV export has a BOM and CRLF records", () => {
  const output = exportCsv(specified({ format: "csv" }));
  assert.ok(output.startsWith("\uFEFF"));
  assert.match(output, /\r\n/);
});
test("CSV export retains source text across fields", () => {
  const output = exportCsv(specified({ format: "csv" }));
  assert.match(output, /Example source/);
  assert.match(output, /Example licence/);
});
test("French CSV headings do not fall back to English", () => {
  const output = exportCsv(specified({ language: "fr", format: "csv" }));
  assert.match(output, /Libellé/);
  assert.match(output, /Valeur/);
});
test("JSON export carries a named format version", () => {
  const value = JSON.parse(exportJson(envelope()));
  assert.equal(value.format, "offline-evidence-v1");
});
test("JSON export declares the selected locale", () => {
  const value = JSON.parse(exportJson(specified({ language: "fr" })));
  assert.equal(value.language, "fr");
});
test("JSON export carries the requested route", () => {
  const value = JSON.parse(exportJson(envelope()));
  assert.equal(value.route, "/journey");
});
test("JSON export is stable for identical input", () => {
  assert.equal(exportJson(envelope()), exportJson(envelope()));
});
test("artifact MIME depends on format", () => {
  assert.match(artifact(specified({ format: "json" })).mime, /application\/json/);
  assert.match(artifact(specified({ format: "csv" })).mime, /text\/csv/);
  assert.match(artifact(specified({ format: "text" })).mime, /text\/plain/);
});
test("artifact identifies its record IDs", () => {
  assert.deepEqual(artifact(envelope()).recordIds, ["example"]);
});
test("artifact reports incomplete source data", () => {
  assert.equal(artifact(envelope()).hasUnknown, true);
  assert.equal(artifact(specified({ records: [recorded()] })).hasUnknown, false);
});
for (const [change, expected] of [
  [{ route: "//host" }, "export-route-unsafe"],
  [{ heading: "" }, "export-heading-empty"],
  [{ retrievedAt: "yesterday" }, "export-date-UNKNOWN"],
  [{ records: [sampleRecord(), sampleRecord()] }, "export-record-duplicate"],
  [{ records: [sampleRecord({ id: "" })] }, "export-record-id-empty"],
  [{ records: [sampleRecord({ declared: "KNOWN" })] }, "export-record-overclaim"],
]) {
  test(`export detects ${expected}`, () => {
    assert.ok(codes(exportFindings(specified(change))).includes(expected));
  });
}
test("valid exported JSON can be read back as an evidence envelope", () => {
  const from = specified({ records: [recorded()] });
  const restored = importJson(exportJson(from));
  assert.equal(restored?.route, from.route);
  assert.equal(restored?.records[0]?.value, "Observed detail");
});
test("JSON readback retains UNKNOWN, never upconverts it", () => {
  const restored = importJson(exportJson(envelope()));
  assert.equal(restored?.records[0]?.value, UNKNOWN);
  assert.equal(restored?.records[0]?.declared, UNKNOWN);
});
for (const malformed of ["", "invalid", "[]", "null", "{}", '{"format":"other"}',
  '{"format":"offline-evidence-v1","language":"es"}']) {
  test(`JSON import fails closed for ${malformed || "empty"}`, () => {
    assert.equal(importJson(malformed), null);
  });
}
test("JSON import rejects an unsafe external route", () => {
  const value = JSON.parse(exportJson(envelope()));
  value.route = "//external";
  assert.equal(importJson(JSON.stringify(value)), null);
});
test("JSON import rejects a missing record field", () => {
  const value = JSON.parse(exportJson(envelope()));
  delete value.records[0].source;
  assert.equal(importJson(JSON.stringify(value)), null);
});
test("JSON import rejects a record with no identifier", () => {
  const value = JSON.parse(exportJson(envelope()));
  value.records[0].id = "";
  assert.equal(importJson(JSON.stringify(value)), null);
});
test("translated labels do not change export provenance", () => {
  const first = envelope();
  const after = specified({ language: "fr", records: [sampleRecord({ label: "Exemple" })] });
  assert.deepEqual(compareExports(first, after), []);
});
for (const field of ["source", "licence", "retrievedOn", "tier", "value"]) {
  test(`handoff comparison finds ${field} drift`, () => {
    const after = specified({ records: [sampleRecord({ [field]: "Changed" })] });
    assert.ok(codes(compareExports(envelope(), after)).includes("export-provenance-drift"));
  });
}
test("missing record is a failure even when export format changes", () => {
  const next = specified({ records: [], format: "csv" });
  assert.ok(codes(compareExports(envelope(), next)).includes("export-lost-record"));
});
test("route drift is independent of translated heading", () => {
  const next = specified({ route: "/help", language: "fr" });
  assert.ok(codes(compareExports(envelope(), next)).includes("export-route-drift"));
});
test("required coverage has both languages and widths", () => {
  const cells = requiredCoverage(["/help"]);
  assert.equal(cells.length, 8);
  assert.equal(new Set(cells.map(coverageKey)).size, 8);
});
test("online-only matrix has four cases per route", () => {
  assert.equal(requiredCoverage(["/help", "/journey"], false).length, 8);
});
test("complete matrix reports no missing cell", () => {
  const required = requiredCoverage(["/"]);
  assert.deepEqual(coverageFindings(required, required), []);
});
test("omitted offline language/width combination is diagnosed", () => {
  const required = requiredCoverage(["/"]);
  assert.ok(codes(coverageFindings(required, required.slice(1))).includes("coverage-missing"));
});
test("repeated matrix cell is independently diagnosed", () => {
  const required = requiredCoverage(["/"]);
  assert.ok(codes(coverageFindings(required, [...required, required[0]])).includes("coverage-duplicate"));
});
test("unrequested matrix route is not silently accepted", () => {
  const required = requiredCoverage(["/"]);
  const extra = requiredCoverage(["/help"]);
  assert.ok(codes(coverageFindings(required, [...required, ...extra])).includes("coverage-unexpected"));
});
test("trace coverage records both observed online and offline states", () => {
  const initial = sampleScreen();
  const trace = { id: "one", initial, actions: [sampleAction({ before: initial })] };
  const cells = traceCoverage(trace, 320);
  assert.equal(cells.length, 2);
  assert.deepEqual(new Set(cells.map((cell) => cell.offline)), new Set([true, false]));
});
test("trace coverage converts into the route matrix shape", () => {
  const trace = { id: "one", initial: sampleScreen(), actions: [] };
  assert.equal(coverageFromTraceCells(traceCoverage(trace, 1280))[0]?.connection, "online");
});
test("custody reporter keeps the finding code", () => {
  assert.match(custodySummary([finding("missing", 0, "source")]), /missing/);
});
test("record names retain the literal UNKNOWN", () => {
  assert.deepEqual(recordNames(specified({ records: [sampleRecord({ label: null })] })), [UNKNOWN]);
});
test("unknown source data is recognized without inferring absence", () => {
  assert.equal(hasUnknownValues(envelope()), true);
  assert.equal(hasUnknownValues(specified({ records: [recorded()] })), false);
});
