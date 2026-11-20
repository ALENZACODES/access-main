import test from "node:test";
import assert from "node:assert/strict";
import {
  UNKNOWN, textOrUnknown, known, calendarDate, safeRoute, canonicalRoute,
  finding, sampleRecord, sampleControl, sampleAnnouncement, sampleResource,
  sampleScreen, sampleAction, recordKnown, recordIdentity, recordFindings,
  continuityFindings, screenIdentity, sameScreen, sortedUniqueFindings,
  reportFindings, blockingFindings,
} from "./p20am-model.ts";

const codes = (items) => items.map((item) => item.rule);

test("UNKNOWN is a literal stable sentinel", () => assert.equal(UNKNOWN, "UNKNOWN"));
for (const value of [null, undefined, "", " ", "unknown", "UNKNOWN", "Inconnu", "Inconnue", "N/A", "—", "-", "null", "undefined"]) {
  test(`missing value ${String(value)} remains UNKNOWN`, () => {
    assert.equal(textOrUnknown(value), UNKNOWN);
    assert.equal(known(value), false);
  });
}
for (const value of ["0", "false", "unknown detail", "Inconnu mais mesuré", "recorded", "UNKNOWN access", "  observed  "]) {
  test(`non-sentinel text ${value} survives normalization`, () => {
    assert.notEqual(textOrUnknown(value), UNKNOWN);
    assert.equal(known(value), true);
  });
}
test("whitespace collapses without changing meaningful words", () => {
  assert.equal(textOrUnknown("  Some\n source   detail\t"), "Some source detail");
});
for (const date of ["2024-02-29", "2000-02-29", "2026-11-20", "2026-02-28", "2026-12-31", "1999-04-30"]) {
  test(`real calendar date ${date} is accepted`, () => assert.equal(calendarDate(date), true));
}
for (const date of [null, undefined, "", "2026-02-29", "1900-02-29", "2026-11-31", "2026-04-31", "2026-00-01", "2026-13-01", "0000-01-01", "2026-1-1", "tomorrow"]) {
  test(`invalid calendar date ${String(date)} is rejected`, () => assert.equal(calendarDate(date), false));
}
for (const route of ["/", "/help", "/journey", "/more/auditors", "/settings/language", "/a_b", "/a%20b", "/places/123"]) {
  test(`safe local route ${route} is accepted`, () => assert.equal(safeRoute(route), true));
}
for (const route of ["", "help", "//outside", "/a?b", "/a#fragment", "/a\\b", "/a:slug", "/a*b", "/a/../b", "/a/./b", "/a\u0001b", "/a\u007fb"]) {
  test(`unsafe route ${JSON.stringify(route)} is rejected`, () => assert.equal(safeRoute(route), false));
}
test("canonicalization preserves root", () => assert.equal(canonicalRoute("/"), "/"));
test("canonicalization removes one trailing slash", () => assert.equal(canonicalRoute("/help/"), "/help"));
test("unsafe path never becomes a canonical route", () => assert.equal(canonicalRoute("//host"), null));
test("known record needs all provenance and a real value", () => {
  assert.equal(recordKnown(sampleRecord({ value: "Observed", declared: "KNOWN" })), true);
  assert.equal(recordKnown(sampleRecord()), false);
});
for (const [change, rule] of [
  [{ id: "" }, "record-id-empty"],
  [{ label: null }, "record-label-UNKNOWN"],
  [{ value: null }, "record-value-UNKNOWN"],
  [{ source: "UNKNOWN" }, "record-source-UNKNOWN"],
  [{ licence: null }, "record-licence-UNKNOWN"],
  [{ retrievedOn: "2026-02-30" }, "record-date-UNKNOWN"],
  [{ tier: "Inconnu" }, "record-tier-UNKNOWN"],
  [{ declared: "KNOWN" }, "record-known-overclaim"],
]) {
  test(`record issue ${rule} is observable`, () => {
    const issues = recordFindings([sampleRecord(change)], 3);
    assert.ok(codes(issues).includes(rule));
    assert.ok(issues.every((entry) => entry.step === 3));
  });
}
test("two records with the same ID are diagnosed", () => {
  assert.ok(codes(recordFindings([sampleRecord(), sampleRecord()])).includes("record-id-duplicate"));
});
test("changing only a translated label preserves evidence identity", () => {
  assert.equal(recordIdentity(sampleRecord()), recordIdentity(sampleRecord({ label: "Exemple" })));
});
test("changing source changes the stable evidence identity", () => {
  assert.notEqual(recordIdentity(sampleRecord()), recordIdentity(sampleRecord({ source: "Other source" })));
});
for (const field of ["value", "source", "licence", "retrievedOn", "tier"]) {
  test(`preserving transition detects changed ${field}`, () => {
    const current = sampleRecord({ [field]: "Changed" });
    assert.ok(codes(continuityFindings([sampleRecord()], [current], 1))
      .includes("record-provenance-or-value-changed"));
  });
}
test("removing an evidence record during a preserving action is diagnosed", () => {
  assert.ok(codes(continuityFindings([sampleRecord()], [], 1)).includes("record-lost"));
});
test("a translation may change the label without replacing the source", () => {
  assert.deepEqual(continuityFindings([sampleRecord()], [sampleRecord({ label: "Exemple" })], 1), []);
});
test("promoting an incomplete record to KNOWN fails", () => {
  assert.ok(codes(continuityFindings([sampleRecord()], [sampleRecord({ declared: "KNOWN" })], 2))
    .includes("record-UNKNOWN-promoted"));
});
test("screen identity excludes focus location", () => {
  assert.equal(screenIdentity(sampleScreen()), screenIdentity(sampleScreen({ focusId: null })));
});
test("screen identity includes the route", () => {
  assert.equal(sameScreen(sampleScreen(), sampleScreen({ route: "/help" })), false);
});
test("screen identity includes locale", () => {
  assert.equal(sameScreen(sampleScreen(), sampleScreen({ language: "fr" })), false);
});
test("screen identity includes connection state", () => {
  assert.equal(sameScreen(sampleScreen(), sampleScreen({ connection: "offline" })), false);
});
test("sample constructors preserve useful non-default observations", () => {
  assert.equal(sampleControl({ width: 45 }).width, 45);
  assert.equal(sampleAnnouncement({ language: "fr" }).language, "fr");
  assert.equal(sampleResource({ cached: "UNKNOWN" }).cached, "UNKNOWN");
  assert.equal(sampleAction({ kind: "retry" }).kind, "retry");
});
test("finding helper respects explicit severity", () => {
  assert.deepEqual(finding("missing", 2, "detail", "information"),
    { rule: "missing", step: 2, detail: "detail", severity: "information" });
});
test("finding deduplication respects code, step and detail", () => {
  const a = finding("one", 1, "a");
  const b = finding("two", 2, "b");
  assert.deepEqual(sortedUniqueFindings([b, a, a, b]), [a, b]);
});
test("report order is deterministic and bounded", () => {
  const rows = [finding("b", 2, "b"), finding("a", 1, "a")];
  assert.match(reportFindings(rows, 1), /1 a/);
  assert.match(reportFindings(rows, 1), /1 additional findings/);
});
for (const limit of [0, -2, 1.5, NaN, Infinity]) {
  test(`invalid report limit ${String(limit)} fails`, () => {
    assert.throws(() => reportFindings([], limit), RangeError);
  });
}
test("blocking filter keeps errors and excludes information", () => {
  const rows = [finding("a", 0, "one"), finding("b", 0, "two", "warning"),
    finding("c", 0, "three", "information")];
  assert.deepEqual(blockingFindings(rows), [rows[0]]);
});
