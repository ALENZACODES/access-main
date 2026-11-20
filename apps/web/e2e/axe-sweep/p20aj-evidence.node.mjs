import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeValue, validCalendarDate, provenanceKnown, evidenceKnown,
  provenanceKey, evidenceFindings, evidenceContinuity, packetFindings,
  safeCsvCell, exportCsv, exportText, exportJson, serializePacket, packetRoundTrip,
} from "./p20aj-evidence.ts";
import { sampleEvidence } from "./p20aj-types.ts";

const record = (change = {}) => sampleEvidence({ ...change });
const packet = (change = {}) => ({ format: "json", locale: "en", title: "Evidence export",
  createdOn: "2026-11-20", records: [record()], ...change });
const codes = (results) => results.map((result) => result.code);

for (const value of [null, undefined, "", "  ", "UNKNOWN", "unknown", "Inconnu", "Inconnue", "N/A", "—", "-", "null", "undefined"]) {
  test(`unknown token ${String(value)} is not promoted`, () => {
    assert.equal(normalizeValue(value), "UNKNOWN");
  });
}
for (const [input, expected] of [
  [" Recorded measurement ", "Recorded measurement"],
  ["0", "0"], ["false", "false"], ["UNKNOWN details", "UNKNOWN details"],
  [" Inconnu mais mesuré ", "Inconnu mais mesuré"],
  ["Source: unknown", "Source: unknown"],
  ["Door\n  present", "Door present"],
  [" two \t words ", "two words"],
]) {
  test(`normalizes observed value ${JSON.stringify(input)}`, () => {
    assert.equal(normalizeValue(input), expected);
  });
}
for (const date of ["2026-11-20", "2024-02-29", "2000-02-29", "2026-02-28", "1999-12-31", "2026-04-30", "2026-06-30", "2026-09-30", "2026-11-30"]) {
  test(`calendar accepts valid date ${date}`, () => assert.equal(validCalendarDate(date), true));
}
for (const date of [null, "", "2026/11/20", "0000-01-01", "1900-02-29", "2026-02-29", "2026-02-30", "2026-04-31", "2026-11-31", "2026-00-01", "2026-13-01", "2026-01-00", "tomorrow", "2026-1-1"]) {
  test(`calendar rejects invalid date ${String(date)}`, () => assert.equal(validCalendarDate(date), false));
}
for (const field of ["source", "licence", "retrievedOn", "tier"]) {
  test(`missing ${field} keeps provenance incomplete`, () => {
    const source = { ...record().provenance, [field]: null };
    assert.equal(provenanceKnown(source), false);
  });
  test(`sentinel ${field} keeps provenance incomplete`, () => {
    const source = { ...record().provenance, [field]: "UNKNOWN" };
    assert.equal(provenanceKnown(source), false);
  });
  test(`change to ${field} changes provenance identity`, () => {
    const baseline = record();
    const changed = record({ provenance: { ...baseline.provenance, [field]: "different" } });
    assert.notEqual(provenanceKey(baseline), provenanceKey(changed));
  });
  test(`preserving ${field} change is reported`, () => {
    const baseline = record();
    const changed = record({ provenance: { ...baseline.provenance, [field]: "different" } });
    assert.ok(codes(evidenceContinuity([baseline], [changed], 3, true)).includes("provenance-drift"));
  });
}
test("synthetic known value with provenance is known", () => {
  assert.equal(evidenceKnown(record({ value: "Recorded", recordedUnknown: false })), true);
});
test("synthetic unknown example remains unknown", () => {
  assert.equal(evidenceKnown(record()), false);
});
test("unknown flag prevents promoting a nonempty value", () => {
  assert.equal(evidenceKnown(record({ value: "Recorded", recordedUnknown: true })), false);
  assert.ok(codes(evidenceFindings([record({ value: "Recorded" })], 1)).includes("unknown-promoted"));
});
test("empty known value creates unsupported known finding", () => {
  assert.ok(codes(evidenceFindings([record({ recordedUnknown: false })], 2)).includes("unsupported-known"));
});
test("duplicate IDs are reported", () => {
  assert.ok(codes(evidenceFindings([record(), record()], 2)).includes("id-duplicate"));
});
test("empty ID is reported", () => {
  assert.ok(codes(evidenceFindings([record({ id: " " })], 0)).includes("id-empty"));
});
test("unknown label is informational", () => {
  const result = evidenceFindings([record({ label: null })], 4);
  assert.ok(result.some((finding) => finding.code === "label-unknown" && finding.severity === "information"));
});
test("oversized evidence value is reported", () => {
  assert.ok(codes(evidenceFindings([record({ value: "a".repeat(2001) })], 0)).includes("value-oversized"));
});
test("translated label does not change provenance identity", () => {
  assert.equal(provenanceKey(record()), provenanceKey(record({ label: "Exemple" })));
});
test("preserving transition retains localized label", () => {
  assert.deepEqual(evidenceContinuity([record()], [record({ label: "Exemple" })], 1, true), []);
});
test("nonpreserving search may replace result set", () => {
  assert.deepEqual(evidenceContinuity([record()], [], 1, false), []);
});
test("preserving transition cannot lose evidence", () => {
  assert.ok(codes(evidenceContinuity([record()], [], 1, true)).includes("record-lost"));
});
test("preserving transition cannot upgrade certainty", () => {
  assert.ok(codes(evidenceContinuity([record()], [record({ recordedUnknown: false })], 1, true)).includes("certainty-drift"));
});
test("preserving transition cannot change measured value", () => {
  assert.ok(codes(evidenceContinuity([record()], [record({ value: "Changed" })], 1, true)).includes("value-drift"));
});
for (const value of ["=2+2", "+SUM(A1)", "-1+2", "@SUM(A1)", "  =A1", "\t+cmd"]) {
  test(`CSV neutralizes formula ${JSON.stringify(value)}`, () => {
    assert.ok(safeCsvCell(value).startsWith('"\''));
  });
}
for (const value of ["Literal", "0", "UNKNOWN", "No formula", "Inconnu mais mesuré"]) {
  test(`CSV preserves ordinary text ${JSON.stringify(value)}`, () => {
    assert.equal(safeCsvCell(value), `"${value}"`);
  });
}
test("CSV escapes embedded quotation marks", () => {
  assert.equal(safeCsvCell('A "quote"'), '"A ""quote"""');
});
test("CSV uses BOM and CRLF for spreadsheet interoperability", () => {
  const text = exportCsv(packet({ format: "csv" }));
  assert.ok(text.startsWith("\ufeff"));
  assert.ok(text.includes("\r\n"));
});
test("CSV retains an UNKNOWN value", () => {
  assert.ok(exportCsv(packet({ format: "csv" })).includes('"UNKNOWN"'));
});
test("French CSV uses French headings", () => {
  assert.ok(exportCsv(packet({ format: "csv", locale: "fr" })).includes("Consulté le"));
});
test("English CSV uses English headings", () => {
  assert.ok(exportCsv(packet({ format: "csv", locale: "en" })).includes("Retrieved on"));
});
test("text export includes all provenance fields", () => {
  const text = exportText(packet());
  for (const field of ["Source", "Licence", "Retrieved on", "Tier"]) assert.ok(text.includes(field));
});
test("French text includes locale fields", () => {
  const text = exportText(packet({ locale: "fr" }));
  assert.ok(text.includes("Consulté le"));
  assert.ok(text.includes("Niveau"));
});
test("JSON export retains recordedUnknown flag", () => {
  assert.equal(JSON.parse(exportJson(packet())).records[0].recordedUnknown, true);
});
test("JSON export retains source metadata", () => {
  assert.equal(JSON.parse(exportJson(packet())).records[0].provenance.source, "Example source");
});
test("JSON export does not promote UNKNOWN", () => {
  assert.equal(JSON.parse(exportJson(packet())).records[0].value, "UNKNOWN");
});
for (const format of ["csv", "text", "json"]) {
  test(`serialized ${format} packet is not empty`, () => {
    assert.ok(serializePacket(packet({ format })).length > 10);
  });
  test(`packet ${format} has no baseline errors`, () => {
    assert.ok(!packetFindings(packet({ format }), 0).some((entry) => entry.severity === "error"));
  });
}
test("packet title is required", () => {
  assert.ok(codes(packetFindings(packet({ title: "" }), 0)).includes("packet-title"));
});
test("invalid packet creation date is reported", () => {
  assert.ok(codes(packetFindings(packet({ createdOn: "2026-02-30" }), 0)).includes("packet-date"));
});
test("missing creation date may remain unknown", () => {
  assert.ok(!codes(packetFindings(packet({ createdOn: null }), 0)).includes("packet-date"));
});
test("JSON round trip preserves provenance", () => {
  assert.ok(!codes(packetRoundTrip(packet())).includes("roundtrip-source"));
});
test("JSON round trip preserves record identifiers", () => {
  assert.ok(!codes(packetRoundTrip(packet())).includes("roundtrip-record"));
});
