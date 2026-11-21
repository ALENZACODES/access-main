import test from "node:test";
import assert from "node:assert/strict";
import {
  handoffFromScreen, handoffFromReplay, handoffProblems, reviewHandoff,
  toHandoffText, toHandoffCsv, toHandoffJson, compareHandoffs,
  handedOffDataIsUnknown, reportTitle, importHandoffJson, handoffRoundtripFindings,
  sortedHandoffRecords, redactUnnecessaryRecordFields, minimalHandoff, HANDOFF_COLUMNS,
} from "./p20al-handoff.ts";

const record = (change = {}) => ({ id: "r1", title: "Illustrative record", value: "Ramp information",
  source: "Test source", licence: "Test licence", retrievedOn: "2026-11-20", tier: "E", state: "KNOWN", ...change });
const screen = (change = {}) => ({
  route: "/places", locale: "en", network: "offline", cache: "present",
  outcome: "ready", title: "Places", heading: "Places", mainCount: 1,
  historyIndex: 1, scrollY: 0, focus: { key: null, name: null, role: null, visible: null, inert: null, withinDialog: null, bounds: null },
  dialogOpen: false, records: [record()], resources: [], announcements: [], ...change,
});
const handoff = (change = {}) => ({ version: "p20al-1", locale: "en", route: "/places", records: [record()],
  findings: [], offline: true, createdAt: "2026-11-20", ...change });
const codes = (rows) => rows.map((row) => row.code);

test("handoff snapshots are not mutable aliases of a screen record array", () => {
  const initial = screen();
  const packet = handoffFromScreen(initial);
  assert.notStrictEqual(packet.records, initial.records);
  assert.deepEqual(packet.records, initial.records);
});
test("offline flag is true only after an observed offline state", () => {
  assert.equal(handoffFromScreen(screen()).offline, true);
  assert.equal(handoffFromScreen(screen({ network: "online" })).offline, false);
  assert.equal(handoffFromScreen(screen({ network: "UNKNOWN" })).offline, null);
});
test("handoff from an empty replay uses its initial screen", () => {
  const packet = handoffFromReplay({ start: screen(), steps: [] });
  assert.equal(packet.route, "/places");
  assert.deepEqual(packet.records, [record()]);
});
test("handoff from replay uses last observed after screen", () => {
  const after = screen({ route: "/help", records: [record({ id: "r2" })] });
  const packet = handoffFromReplay({ start: screen(), steps: [{ after }] });
  assert.equal(packet.route, "/help");
  assert.equal(packet.records[0].id, "r2");
});
test("healthy record and metadata create a healthy handoff", () => {
  assert.deepEqual(handoffProblems(handoff()), []);
  assert.equal(reviewHandoff(handoff()).knownRecords, 1);
});
for (const [change, code] of [
  [{ route: "//other" }, "handoff-path-invalid"],
  [{ createdAt: "yesterday" }, "handoff-date-invalid"],
  [{ records: [record(), record()] }, "handoff-duplicate-id"],
  [{ records: [record({ id: "" })] }, "handoff-empty-id"],
  [{ records: [record({ source: null })] }, "handoff-overclaim"],
  [{ findings: [{ code: "", scope: "a", detail: "d", severity: "error" }] }, "handoff-finding-code-empty"],
  [{ findings: [{ code: "a", scope: "", detail: "d", severity: "error" }] }, "handoff-finding-scope-empty"],
]) {
  test(`handoff review finds ${code}`, () => {
    const findingCodes = codes(handoffProblems(handoff(change)));
    assert.ok(findingCodes.includes(code), `${code} not present in ${findingCodes.join(",")}`);
  });
}

test("handoff review counts unknown and known independently", () => {
  const packet = handoff({ records: [record(), record({ id: "r2", value: null, state: "UNKNOWN" })] });
  const review = reviewHandoff(packet);
  assert.equal(review.knownRecords, 1);
  assert.equal(review.unknownRecords, 1);
});
test("review preserves the error severity of a supplied finding", () => {
  const packet = handoff({ findings: [{ code: "test-error", scope: "/places", detail: "Example", severity: "error" }] });
  assert.ok(codes(reviewHandoff(packet).errors).includes("test-error"));
});
test("review preserves the warning severity of a supplied finding", () => {
  const packet = handoff({ findings: [{ code: "test-warning", scope: "/places", detail: "Example", severity: "warning" }] });
  assert.ok(codes(reviewHandoff(packet).warnings).includes("test-warning"));
});
test("review preserves the information severity of a supplied finding", () => {
  const packet = handoff({ findings: [{ code: "test-info", scope: "/places", detail: "Example", severity: "information" }] });
  assert.ok(codes(reviewHandoff(packet).information).includes("test-info"));
});

test("English text export contains all evidence metadata", () => {
  const file = toHandoffText(handoff());
  assert.equal(file.mime, "text/plain;charset=utf-8");
  assert.match(file.content, /Retrieved on/);
  assert.match(file.content, /Test licence/);
  assert.match(file.content, /Test source/);
  assert.match(file.content, /Evidence tier/);
});
test("French text export uses French labels", () => {
  const file = toHandoffText(handoff({ locale: "fr" }));
  assert.match(file.content, /Date de consultation/);
  assert.match(file.content, /Niveau de preuve/);
  assert.match(file.content, /Dossier/);
});
test("French text export preserves literal UNKNOWN data", () => {
  const file = toHandoffText(handoff({ locale: "fr", records: [record({ source: null, state: "UNKNOWN" })] }));
  assert.match(file.content, /Source : UNKNOWN/);
  assert.doesNotMatch(file.content, /Source : Inconnu/);
});
test("text export shows UNKNOWN when date is absent", () => {
  const file = toHandoffText(handoff({ createdAt: null }));
  assert.match(file.content, /Date : UNKNOWN/);
});
test("text export includes findings without dropping their codes", () => {
  const packet = handoff({ findings: [{ code: "test-issue", scope: "record", detail: "Details", severity: "error" }] });
  assert.match(toHandoffText(packet).content, /test-issue/);
});

test("CSV has BOM and CRLF for spreadsheet import", () => {
  const content = toHandoffCsv(handoff()).content;
  assert.equal(content.charCodeAt(0), 0xfeff);
  assert.ok(content.includes("\r\n"));
  assert.ok(content.endsWith("\r\n"));
});
test("CSV displays French headers without English replacements", () => {
  const content = toHandoffCsv(handoff({ locale: "fr" })).content;
  assert.match(content, /Date de consultation/);
  assert.match(content, /État/);
});
for (const unsafe of ["=1+1", "+SUM(A1)", "@cmd", "-1+2", "\t=cmd", "\r=cmd"]) {
  test(`CSV neutralizes spreadsheet formula prefix ${JSON.stringify(unsafe)}`, () => {
    const content = toHandoffCsv(handoff({ records: [record({ title: unsafe })] })).content;
    assert.ok(content.includes(`"'${unsafe}"`));
  });
}
test("CSV escapes embedded double quotes", () => {
  const content = toHandoffCsv(handoff({ records: [record({ title: '"Hello"' })] })).content;
  assert.ok(content.includes('"""Hello"""'));
});
test("CSV escapes commas and newlines within fields", () => {
  const content = toHandoffCsv(handoff({ records: [record({ title: "A,B\nC" })] })).content;
  assert.ok(content.includes('"A,B\nC"'));
});
test("CSV exports UNKNOWN unchanged for missing source", () => {
  const content = toHandoffCsv(handoff({ records: [record({ source: null, state: "UNKNOWN" })] })).content;
  assert.ok(content.includes('"UNKNOWN"'));
});
test("CSV header names match the contract field count", () => {
  assert.equal(HANDOFF_COLUMNS.length, 8);
  assert.ok(HANDOFF_COLUMNS.includes("retrievedOn"));
});

test("JSON export is readable and includes all columns", () => {
  const file = toHandoffJson(handoff());
  const parsed = JSON.parse(file.content);
  assert.equal(parsed.version, "p20al-1");
  assert.equal(parsed.records[0].source, "Test source");
  assert.equal(parsed.records[0].licence, "Test licence");
});
test("JSON export refuses unsupported known status", () => {
  const file = toHandoffJson(handoff({ records: [record({ source: null })] }));
  const parsed = JSON.parse(file.content);
  assert.equal(parsed.records[0].state, "UNKNOWN");
  assert.equal(parsed.records[0].source, "UNKNOWN");
});
test("JSON export round-trips a complete record", () => {
  const packet = handoff();
  assert.deepEqual(handoffRoundtripFindings(packet), []);
  assert.deepEqual(importHandoffJson(toHandoffJson(packet).content).records, packet.records);
});
test("JSON export preserves unknown record status", () => {
  const packet = handoff({ records: [record({ state: "UNKNOWN", value: null })] });
  const loaded = importHandoffJson(toHandoffJson(packet).content);
  assert.equal(loaded.records[0].state, "UNKNOWN");
  assert.equal(loaded.records[0].value, "UNKNOWN");
});
for (const invalid of ["", "not-json", "null", "[]", "{}", '{"version":"bad"}', '{"version":"p20al-1","locale":"es","route":"/"}']) {
  test(`JSON importer rejects invalid structure ${invalid}`, () => {
    assert.equal(importHandoffJson(invalid), null);
  });
}
test("JSON importer rejects a record lacking an identifier", () => {
  const value = { ...handoff(), records: [{ title: "No ID", state: "UNKNOWN" }] };
  assert.equal(importHandoffJson(JSON.stringify(value)), null);
});
test("JSON importer rejects unsafe routes", () => {
  const value = { ...handoff(), route: "//host" };
  assert.equal(importHandoffJson(JSON.stringify(value)), null);
});
test("JSON importer rejects unsupported finding severities", () => {
  const value = { ...handoff(), findings: [{ code: "a", severity: "critical", scope: "a", detail: "a" }] };
  assert.equal(importHandoffJson(JSON.stringify(value)), null);
});
test("JSON importer rejects primitive records", () => {
  const value = { ...handoff(), records: [42] };
  assert.equal(importHandoffJson(JSON.stringify(value)), null);
});

test("handoff comparison identifies added and removed records", () => {
  const diff = compareHandoffs(handoff(), handoff({ records: [record({ id: "r2" })] }));
  assert.deepEqual(diff.added, ["r2"]);
  assert.deepEqual(diff.removed, ["r1"]);
});
for (const field of ["source", "licence", "retrievedOn", "tier"]) {
  test(`handoff comparison identifies ${field} metadata drift`, () => {
    const diff = compareHandoffs(handoff(), handoff({ records: [record({ [field]: "Changed" })] }));
    assert.deepEqual(diff.metadataChanged, ["r1"]);
  });
}
test("handoff comparison tracks changed values", () => {
  const diff = compareHandoffs(handoff(), handoff({ records: [record({ value: "Different" })] }));
  assert.deepEqual(diff.valueChanged, ["r1"]);
});
test("handoff comparison tracks status changes", () => {
  const diff = compareHandoffs(handoff(), handoff({ records: [record({ state: "UNKNOWN" })] }));
  assert.deepEqual(diff.statusChanged, ["r1"]);
});
test("handoff comparison ignores translated titles", () => {
  const diff = compareHandoffs(handoff(), handoff({ records: [record({ title: "Exemple" })] }));
  assert.deepEqual(diff.metadataChanged, []);
  assert.deepEqual(diff.valueChanged, []);
});
test("UNKNOWN classification rejects absent values", () => {
  assert.equal(handedOffDataIsUnknown(record({ value: null })), true);
  assert.equal(handedOffDataIsUnknown(record()), false);
});
test("report title is localized", () => {
  assert.notEqual(reportTitle("en"), reportTitle("fr"));
});
test("record ordering is deterministic", () => {
  const ordered = sortedHandoffRecords([record({ id: "z" }), record({ id: "a" })]);
  assert.deepEqual(ordered.map((r) => r.id), ["a", "z"]);
});
test("minimal handoff does not leak unrelated fields", () => {
  const unexpected = { ...record(), hiddenToken: "do-not-export" };
  const plain = redactUnnecessaryRecordFields(unexpected);
  assert.equal("hiddenToken" in plain, false);
  const file = toHandoffJson(minimalHandoff(handoff({ records: [unexpected] })));
  assert.equal(file.content.includes("hiddenToken"), false);
});
