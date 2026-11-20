import test from "node:test";
import assert from "node:assert/strict";
import {
  HEADINGS, DIAGNOSTIC_COPY, heading, diagnosticLabel, frenchPunctuationIssues,
  completeCopyIssues, safeCsvCell, itemRows, packetCsv, packetPlainText,
  packetSummary, recordSummary,
} from "./p20ah-bilingual-report.ts";
const evidence = (changes = {}) => ({
  id: "example", label: "Example", value: "Synthetic observation", state: "KNOWN",
  provenance: { source: "Synthetic source", licence: "Synthetic licence", retrievedOn: "2026-11-20", tier: "E" }, ...changes,
});
const packet = (changes = {}) => ({
  id: "packet", schema: 1, locale: "en", originRoute: "/journey", createdOn: "2026-11-20",
  connection: "offline", sourceOfCopy: "saved", purpose: "take-along", redacted: true,
  records: [evidence()], ...changes,
});
const issue = (code, field = "example") => ({ code, severity: "block", field, detail: "Synthetic issue" });

test("all headings have complete English and French dictionaries", () => {
  assert.deepEqual(Object.keys(HEADINGS.en).sort(), Object.keys(HEADINGS.fr).sort());
});
test("all diagnostic labels have paired translations", () => {
  assert.deepEqual(Object.keys(DIAGNOSTIC_COPY.en).sort(), Object.keys(DIAGNOSTIC_COPY.fr).sort());
});
test("current French text passes typography conventions", () => {
  assert.deepEqual(completeCopyIssues(), []);
});
for (const [key, en, fr] of [
  ["handoff", "Take-along evidence", "Dossier à emporter"],
  ["source", "Source", "Source"],
  ["licence", "Licence", "Licence"],
  ["retrieved", "Retrieved on", "Date de consultation"],
  ["tier", "Evidence tier", "Niveau de preuve"],
  ["value", "Value", "Valeur"],
  ["unknown", "UNKNOWN", "UNKNOWN"],
  ["warnings", "Issues to review", "Points à examiner"],
  ["items", "Records", "Fiches"],
  ["connection", "Connection", "Connexion"],
  ["review", "Review before using", "À examiner avant utilisation"],
  ["reason", "Reason", "Motif"],
  ["none", "No records", "Aucune fiche"],
  ["status", "Status", "État"],
  ["continue", "Continue offline", "Continuer hors ligne"],
]) {
  test(`heading ${key} keeps its intended language-specific text`, () => {
    assert.equal(heading("en", key), en);
    assert.equal(heading("fr", key), fr);
  });
}
for (const [code, english, french] of [
  ["evidence-source-unknown", "Source UNKNOWN", "Source UNKNOWN"],
  ["evidence-date-unknown", "Retrieval date UNKNOWN", "Date de consultation UNKNOWN"],
  ["evidence-tier-unknown", "Evidence tier UNKNOWN", "Niveau de preuve UNKNOWN"],
  ["record-lost", "A record was lost", "Une fiche a disparu"],
  ["focus-not-preserved", "Keyboard focus changed", "Le focus du clavier a changé"],
  ["handoff-empty", "No records in this packet", "Aucune fiche dans ce dossier"],
]) {
  test(`diagnostic ${code} exposes the right EN/FR copy`, () => {
    assert.equal(diagnosticLabel("en", issue(code)), english);
    assert.equal(diagnosticLabel("fr", issue(code)), french);
  });
}
test("unknown diagnostic code never creates a made-up translated status", () => {
  assert.equal(diagnosticLabel("fr", issue("future-code")), "UNKNOWN");
  assert.equal(diagnosticLabel("en", issue("future-code")), "UNKNOWN");
});
for (const [text, code] of [
  ["l'option", "apostrophe@1"], ["Valeur: inconnue", "colon@6"],
  ["Une option!", "thin-space@10"], ["Pourquoi?", "thin-space@8"],
  ["Un; deux", "thin-space@2"], ["«Bonjour »", "open-quote@0"],
  ["« Bonjour»", "close-quote@9"],
]) {
  test(`French punctuation audit finds ${JSON.stringify(text)}`, () => {
    assert.ok(frenchPunctuationIssues(text).includes(code));
  });
}
for (const text of [
  "L’option", "Valeur\u00a0: inconnue", "Une option\u202f!", "Pourquoi\u202f?",
  "Un\u202f; deux", "«\u202fBonjour\u202f»", "Cette fiche n’a aucune source",
]) {
  test(`French punctuation audit accepts ${JSON.stringify(text)}`, () => {
    assert.deepEqual(frenchPunctuationIssues(text), []);
  });
}
test("CSV field escapes quotes", () => {
  assert.equal(safeCsvCell('example "label"'), '"example ""label"""');
});
test("CSV field treats missing values as literal UNKNOWN", () => {
  assert.equal(safeCsvCell("inconnu"), '"UNKNOWN"');
  assert.equal(safeCsvCell(""), '"UNKNOWN"');
});
for (const unsafe of ["=1+1", "+SUM(A1)", "@cmd", "-1+1", "\t=1", "\r+1"]) {
  test(`CSV formula prefix ${JSON.stringify(unsafe)} is data, never formula execution`, () => {
    assert.ok(safeCsvCell(unsafe).startsWith('"\''));
  });
}
test("CSV headers are language-specific", () => {
  assert.ok(packetCsv(packet({ locale: "fr" })).includes('"Niveau de preuve"'));
  assert.ok(packetCsv(packet()).includes('"Evidence tier"'));
});
test("CSV export starts with BOM for Excel French text", () => {
  assert.ok(packetCsv(packet({ locale: "fr" })).startsWith("\uFEFF"));
});
test("CSV export ends in CRLF", () => {
  assert.ok(packetCsv(packet()).endsWith("\r\n"));
});
test("CSV export contains synthetic source provenance", () => {
  const csv = packetCsv(packet());
  assert.ok(csv.includes('"Synthetic source"'));
  assert.ok(csv.includes('"Synthetic licence"'));
  assert.ok(csv.includes('"2026-11-20"'));
});
test("CSV export never upgrades an unknown value to a measurement", () => {
  const csv = packetCsv(packet({ records: [evidence({ value: null, state: "UNKNOWN" })] }));
  assert.ok(csv.includes('"UNKNOWN"'));
  assert.equal(csv.includes('"null"'), false);
});
test("CSV export unknown retrieval date stays UNKNOWN", () => {
  const csv = packetCsv(packet({ records: [evidence({ provenance: { ...evidence().provenance, retrievedOn: null } })] }));
  assert.ok(csv.includes('"UNKNOWN"'));
});
test("CSV export missing records contains only the header", () => {
  assert.equal(packetCsv(packet({ records: [] })).trim().split("\r\n").length, 1);
});
test("CSV export retains every distinct supplied record", () => {
  const records = [evidence(), evidence({ id: "second" }), evidence({ id: "third" })];
  assert.equal(packetCsv(packet({ records })).split("\r\n").filter(Boolean).length, 4);
});
test("item detail exposes all provenance fields", () => {
  const rows = itemRows(evidence(), "en");
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((row) => row[0]), ["Records", "Value", "Source", "Licence", "Retrieved on", "Evidence tier"]);
});
test("item detail French labels remain French", () => {
  const rows = itemRows(evidence(), "fr");
  assert.deepEqual(rows.map((row) => row[0]), ["Fiches", "Valeur", "Source", "Licence", "Date de consultation", "Niveau de preuve"]);
});
test("plain-text export contains a source and the retrieval date", () => {
  const text = packetPlainText(packet());
  assert.ok(text.includes("Synthetic source"));
  assert.ok(text.includes("2026-11-20"));
});
test("French plain-text export uses non-breaking space before colons", () => {
  const text = packetPlainText(packet({ locale: "fr" }));
  assert.ok(text.includes("Connexion\u00a0:"));
  assert.equal(frenchPunctuationIssues(text).length, 0);
});
test("English plain-text export uses ordinary punctuation", () => {
  assert.ok(packetPlainText(packet()).includes("Connection: offline"));
});
test("plain-text export mentions warnings when provenance is incomplete", () => {
  const unknown = evidence({ state: "UNKNOWN", value: "UNKNOWN", provenance: { ...evidence().provenance, source: null } });
  assert.ok(packetPlainText(packet({ locale: "fr", records: [unknown] })).includes("Points à examiner"));
});
test("a complete packet has no blocking diagnostics", () => {
  assert.equal(packetSummary(packet()).blocking, 0);
});
test("packet summary counts known records", () => {
  assert.deepEqual(packetSummary(packet()), { count: 1, unknown: 0, blocking: 0, warnings: 0 });
});
test("packet summary counts unknown values as unknown", () => {
  const result = packetSummary(packet({ records: [evidence({ state: "UNKNOWN", value: null })] }));
  assert.equal(result.unknown, 1);
});
test("packet summary identifies unsafe schema", () => {
  assert.equal(packetSummary(packet({ schema: 99 })).blocking, 1);
});
test("packet summary identifies redaction warning", () => {
  assert.equal(packetSummary(packet({ redacted: false })).warnings, 1);
});
test("summary of complete evidence contains observed synthetic value", () => {
  assert.ok(recordSummary(evidence(), "en").includes("Synthetic observation"));
});
test("summary of unknown evidence never invents its value", () => {
  const result = recordSummary(evidence({ state: "UNKNOWN", value: null }), "fr");
  assert.ok(result.includes("UNKNOWN"));
  assert.equal(result.includes("null"), false);
});
test("French summary keeps punctuation spacing", () => {
  const result = recordSummary(evidence({ state: "UNKNOWN", value: null }), "fr");
  assert.deepEqual(frenchPunctuationIssues(result), []);
});
