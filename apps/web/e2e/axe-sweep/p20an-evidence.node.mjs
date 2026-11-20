import test from "node:test";
import assert from "node:assert/strict";
import {
  UNKNOWN, valueOrUnknown, isKnown, calendarDate, safeRoute, normalizedRoute,
  evidenceKnown, evidenceKey, provenanceIdentity, provenanceFindings, inventoryFindings,
  compareInventories, mergeObservations, sourceSummary, sortedInventory, boundedReport,
} from "./p20an-evidence.ts";
import { exampleEvidence, exampleInventory, exampleProvenance } from "./p20an-fixtures.ts";
const codes = (values) => values.map((item) => item.code);

test("valueOrUnknown preserves the literal UNKNOWN sentinel", () => {
  assert.equal(valueOrUnknown(null), UNKNOWN);
  assert.equal(valueOrUnknown(undefined), UNKNOWN);
});
for (const input of ["", "  ", "unknown", "UNKNOWN", "Inconnu", "Inconnue", "N/A", "—", "-", "null", "undefined"]) {
  test(`missing value ${JSON.stringify(input)} remains UNKNOWN`, () => {
    assert.equal(valueOrUnknown(input), UNKNOWN);
    assert.equal(isKnown(input), false);
  });
}
for (const input of ["0", "false", "Step-free", "Inconnu mais documenté", "unknown details reported"]) {
  test(`literal text ${input} is not discarded`, () => {
    assert.equal(valueOrUnknown(input), input);
    assert.equal(isKnown(input), true);
  });
}
test("line breaks and repeated spaces normalize without inventing content", () => {
  assert.equal(valueOrUnknown("  Access\n  details  "), "Access details");
});
for (const date of ["2026-11-20", "2024-02-29", "2000-02-29", "2026-12-31", "2026-04-30"]) {
  test(`calendar accepts actual date ${date}`, () => assert.equal(calendarDate(date), true));
}
for (const date of [null, "", "yesterday", "2026/11/20", "1900-02-29", "2026-02-29", "2026-11-31", "0000-01-01", "2026-00-12", "2026-13-01", "2026-01-00"]) {
  test(`calendar rejects invalid date ${date}`, () => assert.equal(calendarDate(date), false));
}
for (const route of ["/", "/help", "/more/diary", "/places/a-b", "/a%20b"]) {
  test(`safe local route ${route}`, () => assert.equal(safeRoute(route), true));
}
for (const route of ["", "help", "//outside", "/a/../b", "/a/./b", "/help?x=1", "/help#main", "/a\\b", "/a:b", "/a*b", "/a\u0001b", "/a\u007fb"]) {
  test(`unsafe route ${JSON.stringify(route)} is rejected`, () => assert.equal(safeRoute(route), false));
}
test("normalization removes only a safe trailing slash", () => {
  assert.equal(normalizedRoute("/help/"), "/help");
  assert.equal(normalizedRoute("/"), "/");
  assert.equal(normalizedRoute("//host"), null);
});
test("complete synthetic record is known", () => {
  assert.equal(evidenceKnown(exampleEvidence()), true);
  assert.deepEqual(provenanceFindings(exampleEvidence(), "/places"), []);
});
for (const [change, code] of [
  [{ id: "" }, "record-id-empty"],
  [{ label: "UNKNOWN" }, "record-label-UNKNOWN"],
  [{ value: null }, "record-value-UNKNOWN"],
  [{ provenance: exampleProvenance({ source: null }) }, "record-source-UNKNOWN"],
  [{ provenance: exampleProvenance({ licence: "UNKNOWN" }) }, "record-licence-UNKNOWN"],
  [{ provenance: exampleProvenance({ retrievedOn: "2026-02-30" }) }, "record-date-UNKNOWN"],
  [{ provenance: exampleProvenance({ tier: "UNKNOWN" }) }, "record-tier-UNKNOWN"],
]) {
  test(`evidence issue ${code} is reported`, () => {
    assert.ok(codes(provenanceFindings(exampleEvidence(change), "/places")).includes(code));
  });
}
test("known value without source triggers a blocking finding", () => {
  const issues = provenanceFindings(exampleEvidence({ provenance: exampleProvenance({ source: null }) }), "/places");
  assert.ok(codes(issues).includes("record-known-with-incomplete-provenance"));
});
test("known record with unknown reason is flagged", () => {
  assert.ok(codes(provenanceFindings(exampleEvidence({ unknownReason: "No source" }), "/places"))
    .includes("record-unknown-reason-conflict"));
});
test("record key preserves the exact stable id", () => {
  assert.equal(evidenceKey(exampleEvidence()), "example-1");
});
test("translated labels do not change source identity", () => {
  assert.equal(provenanceIdentity(exampleEvidence()), provenanceIdentity(exampleEvidence({ label: "Exemple" })));
});
test("source changes modify provenance identity", () => {
  const altered = exampleEvidence({ provenance: exampleProvenance({ source: "Other sample" }) });
  assert.notEqual(provenanceIdentity(exampleEvidence()), provenanceIdentity(altered));
});
test("inventory catches duplicate identifiers", () => {
  assert.ok(codes(inventoryFindings(exampleInventory({ records: [exampleEvidence(), exampleEvidence()] })))
    .includes("record-duplicate-id"));
});
test("inventory catches invalid observation dates", () => {
  assert.ok(codes(inventoryFindings(exampleInventory({ observedAt: "tomorrow" })))
    .includes("inventory-observation-date-invalid"));
});
test("inventory accepts unavailable observation date as unknown", () => {
  assert.deepEqual(inventoryFindings(exampleInventory({ observedAt: null })), []);
});
test("inventory catches unsafe routes", () => {
  assert.ok(codes(inventoryFindings(exampleInventory({ route: "//host" }))).includes("inventory-route-unsafe"));
});
test("bilingual label changes preserve record identity", () => {
  const oldInventory = exampleInventory();
  const newInventory = exampleInventory({ locale: "fr", records: [exampleEvidence({ label: "Exemple" })] });
  assert.deepEqual(compareInventories({ oldInventory, newInventory, preserveIdentity: true, allowRemoval: false }), []);
});
test("source changes during language transition are flagged", () => {
  const newInventory = exampleInventory({ locale: "fr", records: [exampleEvidence({ provenance: exampleProvenance({ source: "Other" }) })] });
  assert.ok(codes(compareInventories({ oldInventory: exampleInventory(), newInventory, preserveIdentity: true, allowRemoval: false }))
    .includes("record-provenance-drift"));
});
test("a lost record during preservation is flagged", () => {
  const newer = exampleInventory({ records: [] });
  assert.ok(codes(compareInventories({ oldInventory: exampleInventory(), newInventory: newer, preserveIdentity: true, allowRemoval: false }))
    .includes("inventory-record-lost"));
});
test("search replacement may intentionally remove old records", () => {
  assert.deepEqual(compareInventories({ oldInventory: exampleInventory(), newInventory: exampleInventory({ records: [] }), preserveIdentity: false, allowRemoval: true }), []);
});
test("UNKNOWN cannot become known during preserving transition", () => {
  const before = exampleInventory({ records: [exampleEvidence({ value: null })] });
  const after = exampleInventory();
  assert.ok(codes(compareInventories({ oldInventory: before, newInventory: after, preserveIdentity: true, allowRemoval: false }))
    .includes("record-UNKNOWN-promoted"));
});
test("inventory merge retains original observed metadata", () => {
  const first = exampleInventory();
  const merged = mergeObservations(first, exampleInventory({ records: [exampleEvidence({ label: "Translated" })] }));
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].label, "Translated");
});
test("conflicting metadata cannot be silently merged", () => {
  const different = exampleInventory({ records: [exampleEvidence({ provenance: exampleProvenance({ licence: "Other" }) })] });
  assert.throws(() => mergeObservations(exampleInventory(), different), /Conflicting/);
});
test("UNKNOWN promotion cannot occur via merge", () => {
  const first = exampleInventory({ records: [exampleEvidence({ value: null })] });
  assert.throws(() => mergeObservations(first, exampleInventory()), /UNKNOWN/);
});
test("incompatible routes cannot be merged", () => {
  assert.throws(() => mergeObservations(exampleInventory(), exampleInventory({ route: "/help" })), /Incompatible/);
});
test("source summary distinguishes known records from missing fields", () => {
  const inventory = exampleInventory({ records: [exampleEvidence(), exampleEvidence({ id: "two", value: null, provenance: exampleProvenance({ source: null, retrievedOn: null }) })] });
  assert.deepEqual(sourceSummary(inventory), { known: 1, unknown: 1, missingSource: 1, missingDate: 1 });
});
test("sorting keeps source metadata unchanged", () => {
  const inventory = exampleInventory({ records: [exampleEvidence({ id: "z" }), exampleEvidence({ id: "a" })] });
  assert.deepEqual(sortedInventory(inventory).records.map((entry) => entry.id), ["a", "z"]);
  assert.deepEqual(inventory.records.map((entry) => entry.id), ["z", "a"]);
});
test("bounded reporter deduplicates and truncates", () => {
  const issues = inventoryFindings(exampleInventory({ records: [exampleEvidence({ id: "" }), exampleEvidence({ id: "" })] }));
  assert.match(boundedReport(issues, 1), /additional findings/);
});
for (const limit of [0, -1, 0.5, NaN]) {
  test(`report rejects invalid limit ${limit}`, () => assert.throws(() => boundedReport([], limit), RangeError));
}
