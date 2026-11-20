import test from "node:test";
import assert from "node:assert/strict";
import {
  custodyLabels, custodyFindings, safeCsvCell, csvPacket, textPacket, jsonPacket,
  exportPacket, sourceLineage, exportedIntegrity,
} from "./p20ai-custody.ts";
const item = (change = {}) => ({ id: "stop-1", value: "Example value", source: "Example dataset",
  licence: "Example licence", retrievedOn: "2026-11-20", tier: "E", ...change });
const packet = (change = {}) => ({ route: "/places", locale: "en", exportedAt: "2026-11-20T08:00:00Z",
  records: [item()], notes: "Example only", consentToExport: true, ...change });
const codes = (items) => items.map((entry) => entry.code);

test("reference evidence packet is complete", () => assert.deepEqual(custodyFindings(packet()), []));
test("text export has expected content", () => assert.match(textPacket(packet()), /Example dataset/));
test("CSV export has expected content", () => assert.match(csvPacket(packet()), /Example licence/));
test("JSON export is valid JSON", () => assert.equal(JSON.parse(jsonPacket(packet())).schema, "the-app-offline-evidence-v1"));
test("French labels include typographic apostrophe", () => assert.match(custodyLabels("fr").time, /’/));
test("English labels are English", () => assert.equal(custodyLabels("en").heading, "Evidence notes"));
test("French labels are French", () => assert.equal(custodyLabels("fr").heading, "Notes sur les sources"));
test("text export keeps route", () => assert.match(textPacket(packet()), /\/places/));
test("text export keeps full retrieval date", () => assert.match(textPacket(packet()), /2026-11-20/));
test("text export does not erase source tier", () => assert.match(textPacket(packet()), /Evidence tier: E/));
test("French text export localizes headings", () => assert.match(textPacket(packet({ locale: "fr" })), /Niveau de preuve/));
test("text export marks missing metadata UNKNOWN", () => {
  assert.match(textPacket(packet({ records: [item({ source: null })] })), /UNKNOWN/);
});
test("JSON export marks missing metadata UNKNOWN", () => {
  const result = JSON.parse(jsonPacket(packet({ records: [item({ source: null })] })));
  assert.equal(result.records[0].source, "UNKNOWN");
});
test("CSV export marks missing metadata UNKNOWN", () => {
  assert.match(csvPacket(packet({ records: [item({ source: null })] })), /"UNKNOWN"/);
});
test("CSV export includes BOM for spreadsheet compatibility", () => assert.equal(csvPacket(packet())[0], "\uFEFF"));
test("CSV export uses CRLF", () => assert.match(csvPacket(packet()), /\r\n/));
test("CSV export uses quoted headers", () => assert.match(csvPacket(packet()), /"ID","Value"/));
test("French CSV export localizes headers", () => assert.match(csvPacket(packet({ locale: "fr" })), /"Valeur"/));
test("CSV serializes embedded quotes safely", () => assert.equal(safeCsvCell('a"b'), '"a""b"'));
test("CSV serializes line breaks as spaces", () => assert.equal(safeCsvCell("a\nb"), '"a b"'));
for (const dangerous of ["=SUM(1,1)", "+cmd", "@evil", "-1+2", "\t=bad"]) {
  test(`CSV spreadsheet formula prefix is neutralized ${JSON.stringify(dangerous)}`, () => {
    assert.ok(safeCsvCell(dangerous).startsWith('"\''));
  });
}
for (const missing of [null, "", "unknown", "inconnu", "UNKNOWN", "N/A", "—"]) {
  test(`CSV keeps ${JSON.stringify(missing)} unresolved`, () => assert.equal(safeCsvCell(missing), '"UNKNOWN"'));
}
for (const [change, expected] of [
  [{ consentToExport: false }, "export-not-selected"],
  [{ route: "//outside" }, "export-route-invalid"],
  [{ exportedAt: "yesterday" }, "export-time-invalid"],
  [{ records: [item({ source: null })] }, "evidence-source-unknown"],
  [{ records: [item({ licence: null })] }, "evidence-licence-unknown"],
  [{ records: [item({ retrievedOn: "bad" })] }, "evidence-date-unknown"],
  [{ records: [item({ tier: null })] }, "evidence-tier-unknown"],
  [{ records: [item({ value: null })] }, "evidence-value-unknown"],
  [{ locale: "fr", notes: "L'etat" }, "fr-note-apostrophe"],
]) {
  test(`custody detects ${expected}`, () => {
    assert.ok(codes(custodyFindings(packet(change))).includes(expected));
  });
}
test("denied export returns empty content", () => {
  const result = exportPacket(packet({ consentToExport: false }), "json");
  assert.equal(result.content, "");
  assert.equal(result.complete, false);
});
for (const format of ["text", "csv", "json"]) {
  test(`approved ${format} export contains source metadata`, () => {
    const result = exportPacket(packet(), format);
    assert.equal(result.complete, true);
    assert.ok(result.content.includes("Example dataset"));
    assert.equal(result.format, format);
    assert.ok(result.filename.startsWith("evidence-en."));
  });
}
test("incomplete record is not called complete", () => {
  assert.equal(exportPacket(packet({ records: [item({ source: null })] }), "text").complete, false);
});
test("integrity audit accepts complete export", () => {
  const source = packet();
  assert.deepEqual(exportedIntegrity(source, exportPacket(source, "json")), []);
});
test("integrity audit rejects data exported without consent", () => {
  const source = packet({ consentToExport: false });
  const exported = { ...exportPacket(source, "text"), content: "leaked" };
  assert.ok(codes(exportedIntegrity(source, exported)).includes("unselected-data-export"));
});
test("integrity audit rejects empty approved export", () => {
  const source = packet();
  const exported = { ...exportPacket(source, "text"), content: "" };
  assert.ok(codes(exportedIntegrity(source, exported)).includes("empty-export"));
});
test("integrity audit rejects claims about incomplete records", () => {
  const source = packet({ records: [item({ source: null })] });
  const exported = { ...exportPacket(source, "text"), complete: true };
  assert.ok(codes(exportedIntegrity(source, exported)).includes("incomplete-called-complete"));
});
test("integrity audit rejects malformed JSON", () => {
  const source = packet();
  const exported = { ...exportPacket(source, "json"), content: "{bad" };
  assert.ok(codes(exportedIntegrity(source, exported)).includes("json-export-invalid"));
});
test("integrity audit rejects missing records JSON shape", () => {
  const source = packet();
  const exported = { ...exportPacket(source, "json"), content: "{}" };
  assert.ok(codes(exportedIntegrity(source, exported)).includes("json-export-shape"));
});
test("source lineage tolerates translated values", () => {
  assert.deepEqual(sourceLineage(packet(), packet({ locale: "fr", records: [item({ value: "Exemple" })] })), []);
});
test("source lineage catches lost record", () => {
  assert.ok(codes(sourceLineage(packet(), packet({ records: [] }))).includes("handoff-record-lost"));
});
for (const field of ["source", "licence", "retrievedOn", "tier"]) {
  test(`source lineage catches ${field} drift`, () => {
    assert.ok(codes(sourceLineage(packet(), packet({ records: [item({ [field]: "different" })] })))
      .includes("handoff-source-modified"));
  });
}
test("source lineage catches value loss", () => {
  assert.ok(codes(sourceLineage(packet(), packet({ records: [item({ value: null })] })))
    .includes("handoff-value-lost"));
});
test("locale switch with route change is diagnosed", () => {
  assert.ok(codes(sourceLineage(packet(), packet({ locale: "fr", route: "/help" })))
    .includes("handoff-route-lost"));
});
test("empty packet retains zero count", () => {
  assert.match(textPacket(packet({ records: [] })), /Records: 0/);
});
test("multiple records export in source order", () => {
  const result = jsonPacket(packet({ records: [item({ id: "a" }), item({ id: "b" })] }));
  assert.deepEqual(JSON.parse(result).records.map((entry) => entry.id), ["a", "b"]);
});

test("French text export uses nonbreaking spaces before every colon", () => {
  const lines = textPacket(packet({ locale: "fr" })).split("\n");
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon !== -1) assert.equal(line[colon - 1], "\u00a0", line);
  }
});
