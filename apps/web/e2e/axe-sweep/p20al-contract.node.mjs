import test from "node:test";
import assert from "node:assert/strict";
import {
  UNKNOWN, valueOrUnknown, isUnknown, calendarDate, safePath, sourceKnown,
  sourceIdentity, recordFindings, provenanceDrift, cacheFindings, focusFindings,
  announcementFindings, screenFindings, stepFindings, screenSignature,
  replayFindings, distinctFindings, reportFindings, blockingFindings,
} from "./p20al-contract.ts";

const record = (change = {}) => ({
  id: "sample", title: "Illustrative record", value: "Entrance note",
  source: "Illustrative source", licence: "Illustrative licence",
  retrievedOn: "2026-11-20", tier: "E", state: "KNOWN", ...change,
});
const focus = (change = {}) => ({
  key: "search", role: "button", name: "Search", visible: true,
  inert: false, withinDialog: false,
  bounds: { x: 0, y: 0, width: 44, height: 44 }, ...change,
});
const resource = (change = {}) => ({
  key: "/saved/page.html", state: "present", byteLength: 2048,
  observedAt: 150, source: "Local observation", licence: "Test licence", ...change,
});
const announcement = (change = {}) => ({
  key: "status", text: "Results are ready.", language: "en",
  kind: "polite", busy: false, at: 125, ...change,
});
const screen = (change = {}) => ({
  route: "/journey", locale: "en", network: "online", cache: "UNKNOWN",
  outcome: "ready", title: "Journey", heading: "Journey", mainCount: 1,
  historyIndex: 0, scrollY: 0, focus: focus(), dialogOpen: false,
  records: [], resources: [], announcements: [], ...change,
});
const step = (change = {}) => ({
  id: "step-1", intent: "language", before: screen(),
  after: screen({ locale: "fr" }), expectedRoute: null,
  preservesRecords: true, preservesFocus: true, actionAt: 100, ...change,
});
const codes = (rows) => rows.map((row) => row.code);

for (const value of [null, undefined, "", " ", "UNKNOWN", "unknown", "Inconnu", "Inconnue", "N/A", "—", "-", "null", "undefined"]) {
  test(`P20AL unknown normalization ${String(value)}`, () => {
    assert.equal(valueOrUnknown(value), UNKNOWN);
    assert.equal(isUnknown(value), true);
  });
}
for (const value of ["0", "False", "known", "unknown values", "somewhat unknown", "Source: UNKNOWN", "Measured"]) {
  test(`P20AL preserve non-sentinel ${value}`, () => {
    assert.equal(valueOrUnknown(value), value);
    assert.equal(isUnknown(value), false);
  });
}
for (const date of ["2024-02-29", "2000-02-29", "2026-02-28", "2026-11-20", "1999-12-31", "2026-04-30", "2026-09-30"]) {
  test(`P20AL accepts calendar date ${date}`, () => assert.equal(calendarDate(date), true));
}
for (const date of [null, "", "2026-02-29", "1900-02-29", "2026-11-31", "2026-13-01", "0000-01-01", "2026/11/20", "2026-00-05", "2026-01-00", "today"]) {
  test(`P20AL rejects calendar date ${String(date)}`, () => assert.equal(calendarDate(date), false));
}
for (const route of ["/", "/help", "/journey", "/settings/language", "/more/auditors", "/a-b", "/a%20b"]) {
  test(`P20AL accepts route ${route}`, () => assert.equal(safePath(route), true));
}
for (const route of ["", "help", "//host", "/a/../b", "/a/./b", "/a?query=x", "/a#fragment", "/a\\b", "/a:b", "/a*b", "/a\x01b", "/a\x7fb"]) {
  test(`P20AL rejects route ${JSON.stringify(route)}`, () => assert.equal(safePath(route), false));
}

test("a complete record can be known", () => {
  assert.equal(sourceKnown(record()), true);
  assert.deepEqual(recordFindings([record()], "/journey"), []);
});
test("state UNKNOWN is retained even when metadata exists", () => {
  assert.equal(sourceKnown(record({ state: "UNKNOWN" })), true);
  assert.ok(codes(recordFindings([record({ state: "UNKNOWN" })], "/journey")).includes("record-explicit-unknown"));
});
for (const [field, value, expected] of [
  ["title", null, "record-title-unknown"],
  ["value", null, "record-unsupported-known"],
  ["source", null, "record-source-unknown"],
  ["licence", "inconnu", "record-licence-unknown"],
  ["retrievedOn", "2026-02-30", "record-date-unknown"],
  ["tier", "UNKNOWN", "record-tier-unknown"],
]) {
  test(`P20AL incomplete provenance ${field}`, () => {
    const bad = record({ [field]: value });
    assert.equal(sourceKnown(bad), false);
    const result = recordFindings([bad], "/journey");
    assert.ok(codes(result).includes(expected));
    assert.ok(codes(result).includes("record-unsupported-known"));
  });
}

test("record identity includes source metadata", () => {
  assert.notEqual(sourceIdentity(record()), sourceIdentity(record({ source: "Different" })));
});
test("translated title does not alter source identity", () => {
  assert.equal(sourceIdentity(record()), sourceIdentity(record({ title: "Exemple" })));
});
test("duplicate IDs are identified", () => {
  assert.ok(codes(recordFindings([record(), record()], "/journey")).includes("record-id-duplicate"));
});
test("empty record IDs are identified", () => {
  assert.ok(codes(recordFindings([record({ id: "" })], "/journey")).includes("record-id-missing"));
});
test("record preservation permits translated labels", () => {
  assert.deepEqual(provenanceDrift([record()], [record({ title: "Exemple" })], "translate"), []);
});
test("record preservation diagnoses deletion", () => {
  assert.ok(codes(provenanceDrift([record()], [], "translate")).includes("record-lost"));
});
for (const field of ["source", "licence", "retrievedOn", "tier"]) {
  test(`record preservation diagnoses ${field} drift`, () => {
    const next = record({ [field]: "Changed" });
    assert.ok(codes(provenanceDrift([record()], [next], "translate")).includes("provenance-changed"));
  });
}

test("an observed cache entry within budget passes", () => {
  assert.deepEqual(cacheFindings([resource()], "/journey"), []);
});
for (const [change, code] of [
  [{ key: "" }, "cache-key-empty"],
  [{ byteLength: -1 }, "cache-bytes-invalid"],
  [{ byteLength: Number.NaN }, "cache-bytes-invalid"],
  [{ byteLength: 524289 }, "cache-entry-budget"],
  [{ byteLength: null }, "cache-present-unmeasured"],
  [{ observedAt: null }, "cache-present-unobserved"],
  [{ observedAt: -1 }, "cache-time-invalid"],
  [{ source: null }, "cache-source-unknown"],
  [{ licence: null }, "cache-licence-unknown"],
]) {
  test(`P20AL cache regression ${code}`, () => {
    assert.ok(codes(cacheFindings([resource(change)], "/journey")).includes(code));
  });
}

test("duplicate cache keys report an error", () => {
  assert.ok(codes(cacheFindings([resource(), resource()], "/journey")).includes("cache-key-duplicate"));
});
test("uncertain cache remains unknown, not present", () => {
  assert.deepEqual(cacheFindings([resource({ state: "UNKNOWN", byteLength: null, observedAt: null })], "/journey"), []);
});

test("focus with 44px target passes", () => {
  assert.deepEqual(focusFindings(focus(), "/journey"), []);
});
for (const [change, code] of [
  [{ visible: false }, "focus-hidden"],
  [{ inert: true }, "focus-inert"],
  [{ name: null }, "focus-name-unknown"],
  [{ bounds: null }, "focus-bounds-unknown"],
  [{ bounds: { x: 0, y: 0, width: 43, height: 44 } }, "focus-width"],
  [{ bounds: { x: 0, y: 0, width: 44, height: 43 } }, "focus-height"],
  [{ bounds: { x: 0, y: 0, width: Infinity, height: 44 } }, "focus-bounds-invalid"],
]) {
  test(`P20AL focus regression ${code}`, () => {
    assert.ok(codes(focusFindings(focus(change), "/journey")).includes(code));
  });
}

test("missing active element is not a false focus failure", () => {
  assert.deepEqual(focusFindings(focus({ key: null }), "/journey"), []);
});
test("a polite status announcement passes", () => {
  assert.deepEqual(announcementFindings([announcement()], "en", "/journey"), []);
});
for (const [change, code] of [
  [{ text: "UNKNOWN" }, "announcement-blank"],
  [{ language: "fr" }, "announcement-language"],
  [{ at: -1 }, "announcement-time-invalid"],
  [{ at: Infinity }, "announcement-time-invalid"],
]) {
  test(`P20AL announcement regression ${code}`, () => {
    assert.ok(codes(announcementFindings([announcement(change)], "en", "/journey")).includes(code));
  });
}

test("two status nodes sharing a key are reported", () => {
  assert.ok(codes(announcementFindings([announcement(), announcement()], "en", "/journey")).includes("announcement-key-duplicate"));
});
test("a complete synthetic screen has no findings", () => {
  assert.deepEqual(screenFindings(screen()), []);
});
for (const [change, code] of [
  [{ route: "//other" }, "route-invalid"],
  [{ title: "" }, "title-missing"],
  [{ heading: "" }, "heading-missing"],
  [{ mainCount: 0 }, "main-count"],
  [{ mainCount: 2 }, "main-count"],
  [{ scrollY: -1 }, "scroll-invalid"],
  [{ historyIndex: -1 }, "history-invalid"],
  [{ historyIndex: 1.5 }, "history-invalid"],
  [{ dialogOpen: true }, "dialog-focus-escaped"],
  [{ network: "offline", outcome: "ready", cache: "UNKNOWN" }, "offline-ready-without-cache"],
  [{ outcome: "loading" }, "loading-not-busy"],
  [{ outcome: "error" }, "error-silent"],
]) {
  test(`P20AL screen regression ${code}`, () => {
    assert.ok(codes(screenFindings(screen(change))).includes(code));
  });
}

test("screen with observed offline cache can be ready", () => {
  assert.deepEqual(screenFindings(screen({ network: "offline", cache: "present", outcome: "ready" })), []);
});
test("screen loading with busy status passes", () => {
  assert.deepEqual(screenFindings(screen({ outcome: "loading", announcements: [announcement({ busy: true })] })), []);
});
test("screen error with assertive status passes", () => {
  assert.deepEqual(screenFindings(screen({ outcome: "error", announcements: [announcement({ kind: "assertive", text: "Error" })] })), []);
});

test("language switch on the same route passes", () => {
  assert.deepEqual(stepFindings(step()), []);
});
for (const [change, code] of [
  [{ after: screen() }, "language-not-changed"],
  [{ after: screen({ locale: "fr", route: "/help" }) }, "language-route-reset"],
  [{ intent: "disconnect", after: screen() }, "disconnect-not-observed"],
  [{ intent: "reconnect", after: screen({ network: "UNKNOWN" }) }, "reconnect-not-observed"],
  [{ intent: "retry" }, "retry-without-error"],
  [{ intent: "navigate", expectedRoute: "/help" }, "destination-mismatch"],
  [{ intent: "search", after: screen({ outcome: "UNKNOWN" }) }, "search-outcome-unknown"],
  [{ after: screen({ locale: "fr", focus: focus({ key: null }) }) }, "focus-not-restored"],
  [{ actionAt: -1 }, "action-time-invalid"],
]) {
  test(`P20AL step regression ${code}`, () => {
    assert.ok(codes(stepFindings(step(change))).includes(code));
  });
}

test("consistent replay chain passes", () => {
  assert.deepEqual(replayFindings({ start: screen(), steps: [step()] }), []);
});
test("replay detects a mismatched prior state", () => {
  assert.ok(codes(replayFindings({ start: screen({ route: "/help" }), steps: [step()] })).includes("replay-chain-broken"));
});
test("replay detects duplicate step identifiers", () => {
  const one = step();
  const two = step({ before: one.after, after: screen({ locale: "en" }) });
  assert.ok(codes(replayFindings({ start: screen(), steps: [one, two] })).includes("step-id-duplicate"));
});
test("screen signature ignores focus but includes state", () => {
  assert.equal(screenSignature(screen()), screenSignature(screen({ focus: focus({ key: null }) })));
  assert.notEqual(screenSignature(screen()), screenSignature(screen({ network: "offline" })));
});
test("duplicate findings are collapsed for reports", () => {
  const problems = screenFindings(screen({ mainCount: 0 }));
  assert.equal(distinctFindings([...problems, ...problems]).length, problems.length);
  assert.match(reportFindings([...problems, ...problems]), /main-count/);
});
test("report limits are validated", () => {
  assert.throws(() => reportFindings([], 0), RangeError);
  assert.throws(() => reportFindings([], 1.5), RangeError);
});
test("blocking filter excludes information only", () => {
  assert.equal(blockingFindings(recordFindings([record({ state: "UNKNOWN" })], "/journey")).length, 0);
});
