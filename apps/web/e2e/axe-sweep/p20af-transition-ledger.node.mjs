import test from "node:test";
import assert from "node:assert/strict";
import {
  normalized, dateIsValid, safeRoute, knownFact, factFindings, focusFindings,
  announcementFindings, stateFindings, preservationFindings, stepFindings,
  sameBoundary, traceFindings, blocking, summarize, matrix, cellKey, matrixFindings,
} from "./p20af-transition-ledger.ts";

const provenance = (changes = {}) => ({ source: "Example source", licence: "Example licence", retrievedOn: "2026-11-19", tier: "E", ...changes });
const fact = (changes = {}) => ({ id: "record", value: "Example observation", provenance: provenance(), ...changes });
const focus = (changes = {}) => ({ id: "action", visible: true, inert: false, withinDialog: null, width: 44, height: 44, ...changes });
const message = (changes = {}) => ({ id: "status", text: "Results ready", locale: "en", live: "polite", busy: false, ...changes });
const state = (changes = {}) => ({ route: "/journey", locale: "en", connection: "online", cache: "available", result: "ready", heading: "Journey", title: "Journey", mains: 1, focus: focus(), facts: [], messages: [], dialog: null, history: 1, scrollY: 0, clock: 100, ...changes });
const step = (changes = {}) => ({ action: "locale", before: state(), after: state({ locale: "fr" }), preserveFacts: true, ...changes });
const codes = (issues) => issues.map((entry) => entry.code);

test("baseline state yields no errors", () => assert.deepEqual(blocking(stateFindings(state(), 0)), []));
test("baseline locale step yields no errors", () => assert.deepEqual(stepFindings(step(), 1), []));
test("baseline connected trace yields no errors", () => {
  const event = step();
  assert.deepEqual(blocking(traceFindings({ initial: event.before, steps: [event] })), []);
});

for (const raw of [null, undefined, "", " ", "UNKNOWN", "unknown", "Inconnu", "Inconnue", "—", "-", "N/A", "null", "undefined"]) {
  test(`unknown value stays UNKNOWN: ${String(raw)}`, () => assert.equal(normalized(raw), "UNKNOWN"));
}
for (const raw of ["0", "false", "observed", "Unknown access", "Inconnu mais mesuré", "none reported", "step-free", "source: unknown"]) {
  test(`observed text is retained: ${raw}`, () => assert.equal(normalized(raw), raw));
}
test("whitespace in observed value is collapsed", () => assert.equal(normalized("  An\n observation  "), "An observation"));

for (const raw of ["2026-11-19", "2000-02-29", "2024-02-29", "2026-02-28", "1999-12-31", "2026-04-30", "2026-06-30", "2026-09-30"]) {
  test(`calendar accepts ${raw}`, () => assert.equal(dateIsValid(raw), true));
}
for (const raw of [null, "", "1900-02-29", "2026-02-29", "2026-11-31", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "0000-01-01", "2026/11/19", "yesterday", "2026-1-1"]) {
  test(`calendar rejects ${String(raw)}`, () => assert.equal(dateIsValid(raw), false));
}
for (const route of ["/", "/help", "/journey", "/places/a-b", "/more/diary", "/settings/language", "/a_b", "/a%20b"]) {
  test(`route accepts ${route}`, () => assert.equal(safeRoute(route), true));
}
for (const route of ["", "help", "//remote", "/a/../b", "/a/./b", "/a?x=1", "/a#id", "/a\\b", "/a:b", "/a*b", "/a\x00b", "/a\x1fb", "/a\x7fb"]) {
  test(`route rejects ${JSON.stringify(route)}`, () => assert.equal(safeRoute(route), false));
}

for (const [field, value, code] of [
  ["source", null, "fact-source-unknown"],
  ["source", "UNKNOWN", "fact-source-unknown"],
  ["licence", null, "fact-licence-unknown"],
  ["licence", "Inconnu", "fact-licence-unknown"],
  ["tier", null, "fact-tier-unknown"],
  ["tier", "—", "fact-tier-unknown"],
  ["retrievedOn", null, "fact-date-unknown"],
  ["retrievedOn", "2026-11-31", "fact-date-unknown"],
]) {
  test(`provenance ${field}=${String(value)} is not silently known`, () => {
    const record = fact({ provenance: provenance({ [field]: value }) });
    assert.equal(knownFact(record), false);
    assert.ok(codes(factFindings([record], 2)).includes(code));
  });
}
test("known evidence has complete metadata", () => assert.equal(knownFact(fact()), true));
test("UNKNOWN value is not promoted", () => assert.equal(knownFact(fact({ value: "UNKNOWN" })), false));
test("blank fact identifier cannot become known", () => assert.equal(knownFact(fact({ id: " " })), false));
test("known value with partial metadata is diagnosed", () => {
  const findings = factFindings([fact({ provenance: provenance({ source: null }) })], 1);
  assert.ok(codes(findings).includes("fact-unsupported-known"));
});
test("unknown value is information, not an error", () => {
  const findings = factFindings([fact({ value: null })], 1);
  assert.equal(blocking(findings).length, 0);
  assert.ok(codes(findings).includes("fact-value-unknown"));
});
test("repeated identifiers do not collapse silently", () => assert.ok(codes(factFindings([fact(), fact()], 0)).includes("fact-id-duplicate")));
test("empty identifiers have an independent error", () => assert.ok(codes(factFindings([fact({ id: "" })], 0)).includes("fact-id-empty")));

for (const [changes, code] of [
  [{ visible: false }, "focus-hidden"],
  [{ inert: true }, "focus-inert"],
  [{ width: 43 }, "focus-width-small"],
  [{ height: 43 }, "focus-height-small"],
  [{ width: NaN }, "focus-width-small"],
  [{ height: Infinity }, "focus-height-small"],
  [{ width: null }, "focus-width-unknown"],
  [{ height: null }, "focus-height-unknown"],
  [{ visible: null }, "focus-visibility-unknown"],
]) {
  test(`focus observation ${JSON.stringify(changes)} reports ${code}`, () => {
    assert.ok(codes(focusFindings(focus(changes), 0)).includes(code));
  });
}
test("unfocused page does not claim a sized focus target", () => assert.deepEqual(focusFindings(focus({ id: null, width: null }), 0), []));
test("exact 44px target passes", () => assert.deepEqual(focusFindings(focus(), 0), []));

for (const [changes, code] of [
  [{ locale: "fr" }, "message-language"],
  [{ locale: "unknown" }, "message-language"],
  [{ live: "polite", text: "" }, "message-blank"],
  [{ live: "assertive", text: " " }, "message-blank"],
  [{ id: "" }, "message-id-empty"],
  [{ live: "unknown" }, "message-live-unknown"],
]) {
  test(`live announcement ${JSON.stringify(changes)} reports ${code}`, () => {
    assert.ok(codes(announcementFindings([message(changes)], "en", 0)).includes(code));
  });
}
test("identical live message ids are diagnosed", () => assert.ok(codes(announcementFindings([message(), message()], "en", 0)).includes("message-id-duplicate")));
test("live off may be empty", () => assert.deepEqual(announcementFindings([message({ live: "off", text: "" })], "en", 0), []));
test("French live message is accepted in French", () => assert.deepEqual(announcementFindings([message({ locale: "fr", text: "Résultats prêts" })], "fr", 0), []));

for (const [changes, code] of [
  [{ route: "//other" }, "route-invalid"],
  [{ heading: "" }, "heading-empty"],
  [{ title: "" }, "title-empty"],
  [{ mains: 0 }, "main-count"],
  [{ mains: 2 }, "main-count"],
  [{ history: -1 }, "history-invalid"],
  [{ history: 1.5 }, "history-invalid"],
  [{ scrollY: -2 }, "scroll-invalid"],
  [{ scrollY: Infinity }, "scroll-invalid"],
  [{ clock: -1 }, "time-invalid"],
  [{ clock: NaN }, "time-invalid"],
  [{ dialog: "modal", focus: focus({ withinDialog: false }) }, "dialog-focus-outside"],
  [{ result: "loading" }, "loading-not-busy"],
  [{ result: "empty" }, "outcome-silent"],
  [{ result: "error" }, "outcome-silent"],
  [{ connection: "offline", cache: "unknown" }, "offline-cache-unknown"],
]) {
  test(`state ${JSON.stringify(changes)} reports ${code}`, () => {
    assert.ok(codes(stateFindings(state(changes), 0)).includes(code));
  });
}
test("loading status with busy=true resolves progress state", () => {
  const changed = state({ result: "loading", messages: [message({ busy: true })] });
  assert.equal(codes(stateFindings(changed, 0)).includes("loading-not-busy"), false);
});
test("empty state with live announcement is not silent", () => {
  const changed = state({ result: "empty", messages: [message({ text: "No results" })] });
  assert.equal(codes(stateFindings(changed, 0)).includes("outcome-silent"), false);
});
test("unknown cache remains information severity", () => {
  const findings = stateFindings(state({ connection: "offline", cache: "unknown" }), 0);
  assert.equal(findings.find((item) => item.code === "offline-cache-unknown")?.severity, "information");
});

for (const [field, value] of [
  ["source", "Different source"], ["licence", "Different licence"],
  ["retrievedOn", "2026-11-18"], ["tier", "B"],
]) {
  test(`preservation finds changed ${field}`, () => {
    const after = fact({ provenance: provenance({ [field]: value }) });
    assert.ok(codes(preservationFindings([fact()], [after], 1)).includes("fact-provenance-changed"));
  });
}
test("translated labels are outside provenance identity", () => assert.deepEqual(preservationFindings([fact()], [fact()], 1), []));
test("missing fact is detected during preserving action", () => assert.ok(codes(preservationFindings([fact()], [], 1)).includes("fact-lost")));
test("UNKNOWN cannot be silently upgraded", () => assert.ok(codes(preservationFindings([fact({ value: "UNKNOWN" })], [fact()], 1)).includes("fact-unknown-promoted")));

for (const [changes, code] of [
  [{ after: state() }, "locale-not-changed"],
  [{ after: state({ locale: "fr", route: "/help" }) }, "locale-route-reset"],
  [{ action: "disconnect", after: state({ connection: "online" }) }, "disconnect-unobserved"],
  [{ action: "reconnect", after: state({ connection: "unknown" }) }, "reconnect-unobserved"],
  [{ action: "retry" }, "retry-without-error"],
  [{ action: "clear", after: state({ result: "loading" }) }, "clear-triggered-load"],
  [{ action: "close", after: state({ dialog: "modal", locale: "fr" }) }, "dialog-did-not-close"],
  [{ action: "open" }, "dialog-did-not-open"],
  [{ expectedRoute: "/help" }, "route-target-mismatch"],
  [{ requireFocus: true, after: state({ locale: "fr", focus: focus({ id: "elsewhere" }) }) }, "focus-not-preserved"],
  [{ after: state({ locale: "fr", clock: 90 }) }, "time-reversed"],
  [{ action: "back", before: state({ history: 1 }), after: state({ history: 1 }) }, "back-history"],
  [{ action: "forward", before: state({ history: 1 }), after: state({ history: 1 }) }, "forward-history"],
]) {
  test(`transition ${JSON.stringify(changes)} reports ${code}`, () => {
    assert.ok(codes(stepFindings(step(changes), 1)).includes(code));
  });
}
test("preserving step surfaces lost facts", () => {
  const changed = step({ before: state({ facts: [fact()] }), after: state({ locale: "fr" }) });
  assert.ok(codes(stepFindings(changed, 1)).includes("fact-lost"));
});
test("disconnected trace is an explicit finding", () => {
  const event = step({ before: state({ route: "/help" }) });
  assert.ok(codes(traceFindings({ initial: state(), steps: [event] })).includes("trace-disconnected"));
});
test("same boundary ignores unimportant focus change", () => assert.equal(sameBoundary(state(), state({ focus: focus({ id: "next" }) })), true));
test("same boundary detects change in connection", () => assert.equal(sameBoundary(state(), state({ connection: "offline" })), false));
test("same boundary detects change in route", () => assert.equal(sameBoundary(state(), state({ route: "/help" })), false));
test("blocking filter excludes information", () => {
  const findings = stateFindings(state({ connection: "offline", cache: "unknown" }), 0);
  assert.deepEqual(blocking(findings), []);
});
test("summary deduplicates repeated findings", () => {
  const issue = stateFindings(state({ mains: 0 }), 0);
  assert.equal(summarize([...issue, ...issue]), summarize(issue));
});
test("summary truncation identifies remaining findings", () => {
  const findings = stateFindings(state({ title: "", heading: "", mains: 0 }), 0);
  assert.match(summarize(findings, 1), /further findings/);
});
test("summary rejects zero limit", () => assert.throws(() => summarize([], 0), RangeError));
test("summary rejects fractional limit", () => assert.throws(() => summarize([], 1.5), RangeError));

test("route matrix has eight cells for each route", () => assert.equal(matrix(["/", "/help"]).length, 16));
test("matrix cells distinguish connection, locale and width", () => assert.equal(new Set(matrix(["/"]).map(cellKey)).size, 8));
test("complete matrix passes", () => assert.deepEqual(matrixFindings(matrix(["/", "/help"]), matrix(["/", "/help"])), []));
test("missing matrix cell fails", () => {
  const cells = matrix(["/"]);
  assert.ok(codes(matrixFindings(cells, cells.slice(1))).includes("matrix-missing"));
});
test("extra matrix cell fails", () => {
  const expected = matrix(["/"]);
  assert.ok(codes(matrixFindings(expected, [...expected, ...matrix(["/help"]).slice(0, 1)])).includes("matrix-unexpected"));
});
test("duplicate matrix cell fails", () => {
  const expected = matrix(["/"]);
  assert.ok(codes(matrixFindings(expected, [...expected, expected[0]])).includes("matrix-duplicate"));
});
