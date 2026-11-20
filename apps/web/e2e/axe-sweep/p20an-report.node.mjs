import test from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_COPY, reportEntry, evidenceReport, csvEscape, reportCsv, reportText, reportJson,
  serializeReport, recordFromReport, reportRoundTripProblems, frenchTypographyProblems,
  reportCopyProblems, sequenceText, reportLimit,
} from "./p20an-report.ts";
import { exampleEvidence, exampleInventory, exampleProvenance, exampleScreen, exampleStep } from "./p20an-fixtures.ts";
import { finding, UNKNOWN, provenanceIdentity } from "./p20an-evidence.ts";

const inventory = () => exampleInventory();
test("report includes an explicit schema identifier", () => {
  assert.equal(evidenceReport(inventory(), []).schema, "p20an-evidence-1");
});
test("report does not change inventory route", () => {
  assert.equal(evidenceReport(inventory(), []).route, "/places");
});
test("report copies the selected language", () => {
  assert.equal(evidenceReport(exampleInventory({ locale: "fr" }), []).locale, "fr");
});
test("report does not mutate original record objects", () => {
  const original = inventory();
  const before = JSON.stringify(original);
  evidenceReport(original, [finding("test", "/places", "Sample")]);
  assert.equal(JSON.stringify(original), before);
});
test("complete report entry has full provenance", () => {
  const entry = reportEntry(exampleEvidence());
  assert.equal(entry.source, "Example dataset");
  assert.equal(entry.licence, "Example licence");
  assert.equal(entry.retrievedOn, "2026-11-20");
  assert.equal(entry.tier, "E");
  assert.equal(entry.complete, true);
});
for (const field of ["source", "licence", "retrievedOn"]) {
  test(`missing ${field} remains UNKNOWN in report`, () => {
    const record = exampleEvidence({ provenance: exampleProvenance({ [field]: null }) });
    const entry = reportEntry(record);
    assert.equal(entry[field], UNKNOWN);
    assert.equal(entry.complete, false);
  });
}
test("missing observed value stays UNKNOWN rather than empty", () => {
  assert.equal(reportEntry(exampleEvidence({ value: null })).value, UNKNOWN);
});
test("reported source identity is independent of translated label", () => {
  assert.equal(reportEntry(exampleEvidence()).sourceIdentity, reportEntry(exampleEvidence({ label: "Description illustrative" })).sourceIdentity);
});
test("report source identity matches original provenance", () => {
  assert.equal(reportEntry(exampleEvidence()).sourceIdentity, provenanceIdentity(exampleEvidence()));
});
test("CSV quotes plain values", () => {
  assert.equal(csvEscape("Example"), '"Example"');
});
test("CSV escapes embedded double quotes", () => {
  assert.equal(csvEscape('A "quote"'), '"A ""quote"""');
});
test("CSV preserves commas without splitting cells", () => {
  assert.equal(csvEscape("One, two"), '"One, two"');
});
for (const value of ["=SUM(1,2)", "+2", "@name", "-3", " =cmd"]) {
  test(`CSV defangs spreadsheet formula prefix ${JSON.stringify(value)}`, () => {
    assert.ok(csvEscape(value).startsWith('"\''));
  });
}
test("CSV reports have UTF-8 BOM and CRLF rows", () => {
  const csv = reportCsv(evidenceReport(inventory(), []));
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("\r\n"));
  assert.ok(csv.endsWith("\r\n"));
});
test("CSV headers use English copy", () => {
  const csv = reportCsv(evidenceReport(inventory(), []));
  assert.ok(csv.includes('"Evidence tier"'));
});
test("CSV headers use French copy", () => {
  const csv = reportCsv(evidenceReport(exampleInventory({ locale: "fr" }), []));
  assert.ok(csv.includes('"Niveau de preuve"'));
});
test("French text report includes a localized title", () => {
  const report = evidenceReport(exampleInventory({ locale: "fr" }), []);
  assert.ok(reportText(report).includes("Examen des renseignements sur l’accessibilité"));
});
test("English text report includes a meaningful warning", () => {
  const report = evidenceReport(inventory(), []);
  assert.ok(reportText(report).includes("Missing information remains UNKNOWN"));
});
test("French report includes an explicit UNKNOWN footer", () => {
  const report = evidenceReport(exampleInventory({ locale: "fr" }), []);
  assert.ok(reportText(report).includes("UNKNOWN"));
});
test("a report lists each item source, date and tier", () => {
  const text = reportText(evidenceReport(inventory(), []));
  assert.match(text, /Example dataset/);
  assert.match(text, /2026-11-20/);
  assert.match(text, /Evidence tier/);
});
test("report findings are retained for readers", () => {
  const text = reportText(evidenceReport(inventory(), [finding("missing-source", "/places", "One") ]));
  assert.ok(text.includes("missing-source"));
});
test("JSON serialization is deterministic and parseable", () => {
  const report = evidenceReport(inventory(), []);
  assert.deepEqual(JSON.parse(reportJson(report)), report);
});
test("JSON includes a terminal newline", () => {
  assert.ok(reportJson(evidenceReport(inventory(), [])).endsWith("\n"));
});
for (const format of ["text", "csv", "json"]) {
  test(`format dispatcher supports ${format}`, () => {
    assert.ok(serializeReport(evidenceReport(inventory(), []), format).length > 20);
  });
}
test("roundtrip keeps full source identity", () => {
  const original = inventory();
  assert.deepEqual(reportRoundTripProblems(original, evidenceReport(original, [])), []);
});
test("roundtrip catches missing entries", () => {
  const original = inventory();
  const result = { ...evidenceReport(original, []), entries: [] };
  assert.ok(reportRoundTripProblems(original, result).includes("roundtrip-missing:example-1"));
});
test("roundtrip catches changed record value", () => {
  const original = inventory(), result = evidenceReport(original, []);
  const modified = { ...result, entries: [{ ...result.entries[0], value: "Altered" }] };
  assert.ok(reportRoundTripProblems(original, modified).includes("roundtrip-value:example-1"));
});
test("roundtrip catches changed provenance fingerprint", () => {
  const original = inventory(), result = evidenceReport(original, []);
  const modified = { ...result, entries: [{ ...result.entries[0], sourceIdentity: "other" }] };
  assert.ok(reportRoundTripProblems(original, modified).includes("roundtrip-provenance:example-1"));
});
test("roundtrip catches changed completion flag", () => {
  const original = inventory(), result = evidenceReport(original, []);
  const modified = { ...result, entries: [{ ...result.entries[0], complete: false }] };
  assert.ok(reportRoundTripProblems(original, modified).includes("roundtrip-status:example-1"));
});
test("roundtrip catches route drift", () => {
  const original = inventory(), result = evidenceReport(original, []);
  assert.ok(reportRoundTripProblems(original, { ...result, route: "/help" }).includes("roundtrip-route"));
});
test("roundtrip catches language drift", () => {
  const original = inventory(), result = evidenceReport(original, []);
  assert.ok(reportRoundTripProblems(original, { ...result, locale: "fr" }).includes("roundtrip-locale"));
});
test("restored UNKNOWN value is null in the in-memory model", () => {
  const record = recordFromReport(reportEntry(exampleEvidence({ value: null })));
  assert.equal(record.value, null);
  assert.equal(record.unknownReason, "UNKNOWN");
});
test("restored source and licence remain null if UNKNOWN", () => {
  const entry = reportEntry(exampleEvidence({ provenance: exampleProvenance({ source: null, licence: null }) }));
  const restored = recordFromReport(entry);
  assert.equal(restored.provenance.source, null);
  assert.equal(restored.provenance.licence, null);
});
test("French copy table contains no typography issues", () => {
  assert.deepEqual(reportCopyProblems(), []);
});
for (const [text, expected] of [
  ["C'est", "apostrophe"],
  ["Valeur: donnée", "colon"],
  ["Attention!", "thin-space"],
  ["«Texte\u202F»", "guillemet-open"],
  ["«\u202FTexte»", "guillemet-close"],
]) {
  test(`French typography detects ${expected}`, () => {
    assert.ok(frenchTypographyProblems(text).some((finding) => finding.startsWith(expected)));
  });
}
test("French guillemets with narrow no-break space pass", () => {
  assert.deepEqual(frenchTypographyProblems("«\u202FExemple\u202F»"), []);
});
test("French colon with nonbreaking space passes", () => {
  assert.deepEqual(frenchTypographyProblems("Source\u00A0: Exemple"), []);
});
test("English and French key sets stay aligned", () => {
  assert.deepEqual(Object.keys(REPORT_COPY.en).sort(), Object.keys(REPORT_COPY.fr).sort());
});
test("sequence text records actions with their outcomes", () => {
  const step = exampleStep();
  const text = sequenceText({ id: "sample", initial: exampleScreen(), steps: [step] });
  assert.ok(text.includes("disconnect"));
  assert.ok(text.includes("ready"));
  assert.ok(text.includes("/places"));
});
test("report limit keeps first-seen findings and deduplicates", () => {
  const first = finding("a", "/", "one"), second = finding("b", "/", "two");
  assert.deepEqual(reportLimit([first, first, second], 1), [first]);
});
for (const n of [0, -1, 1.5, Number.NaN]) {
  test(`report limiter rejects ${n}`, () => assert.throws(() => reportLimit([], n), RangeError));
}
test("French text report puts U+00A0 before every rendered metadata colon", () => {
  const text = reportText(evidenceReport(exampleInventory({ locale: "fr" }), []));
  assert.ok(text.includes("Source\u00A0: Example dataset"));
  assert.ok(text.includes("Date de consultation\u00A0: 2026-11-20"));
  assert.equal(frenchTypographyProblems(text).length, 0);
});
test("French sequence report follows the same nonbreaking colon rule", () => {
  const step = exampleStep({ before: exampleScreen({ locale: "fr" }), after: exampleScreen({ locale: "fr", connection: "offline" }) });
  const text = sequenceText({ id: "exemple", initial: exampleScreen({ locale: "fr" }), steps: [step] });
  assert.ok(text.includes("Action 1\u00A0: disconnect"));
  assert.deepEqual(frenchTypographyProblems(text), []);
});
