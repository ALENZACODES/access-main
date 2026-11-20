import test from "node:test";
import assert from "node:assert/strict";
import {
  unknownOrText, known, isoCalendarDate, localRoute, evidenceComplete, evidenceKey,
  evidenceFindings, provenanceContinuity, accessibilityFindings, statusFindings,
  snapshotFindings, sameSnapshot, interactionFindings, traceFindings, summarizeFindings,
  blockingFindings, issueCodes, distinctFindings,
} from "./p20ai-trace-model.ts";

const evidence = (changes = {}) => ({
  id: "one", value: "Accessible text supplied by example", source: "Example data",
  licence: "Example licence", retrievedOn: "2026-11-20", tier: "E", ...changes,
});
const a11y = (changes = {}) => ({
  focusId: "search", focusVisible: true, focusInDialog: false, focusInsideInert: false,
  targetWidth: 44, targetHeight: 44, dialogId: null, mainCount: 1,
  title: "Journey", heading: "Journey", horizontalOverflow: 0, ...changes,
});
const message = (changes = {}) => ({
  id: "results", text: "Results are ready.", locale: "en", priority: "polite",
  busy: false, issuedAt: 10, ...changes,
});
const state = (changes = {}) => ({
  route: "/journey", locale: "en", connection: "online", cache: "available",
  outcome: "ready", at: 10, historyIndex: 1, scrollY: 0, query: "",
  a11y: a11y(), evidence: [], statuses: [], ...changes,
});
const action = (changes = {}) => ({
  id: "lang", kind: "language", before: state(), after: state({ locale: "fr", at: 11 }), ...changes,
});
const codes = (items) => issueCodes(items);

test("reference screen is a complete synthetic state", () => assert.deepEqual(snapshotFindings(state(), 0), []));
test("reference language transition passes", () => assert.deepEqual(interactionFindings(action(), 1), []));
test("reference trace passes", () => assert.deepEqual(traceFindings({ initial: state(), events: [action()] }), []));

for (const value of [null, undefined, "", " ", "UNKNOWN", "unknown", "inconnu", "Inconnue", "N/A", "—", "-", "null", "undefined"]) {
  test(`UNKNOWN values stay UNKNOWN: ${JSON.stringify(value)}`, () => {
    assert.equal(known(value), false);
    assert.equal(unknownOrText(value), "UNKNOWN");
  });
}
for (const value of ["0", "False", "known", "Source: unknown", "Inconnu mais documenté", "Measured", "Step-free"]) {
  test(`known text is not erased: ${value}`, () => {
    assert.equal(known(value), true);
    assert.equal(unknownOrText(value), value);
  });
}
for (const date of ["2000-02-29", "2024-02-29", "2026-11-20", "2026-04-30", "2026-12-31", "1904-02-29"]) {
  test(`calendar accepts ${date}`, () => assert.equal(isoCalendarDate(date), true));
}
for (const date of [null, "", "0000-01-01", "1900-02-29", "2026-02-29", "2026-11-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026/11/20", "tomorrow"]) {
  test(`calendar rejects ${JSON.stringify(date)}`, () => assert.equal(isoCalendarDate(date), false));
}
for (const path of ["/", "/places", "/more/housing", "/settings/language", "/finders", "/a%20b"]) {
  test(`safe local route ${path}`, () => assert.equal(localRoute(path), true));
}
for (const path of ["", "help", "//other", "/a/../b", "/a/./b", "/a?x=1", "/a#top", "/a\\b", "/a:b", "/a*b", "/a\x01b", "/a\x7fb"]) {
  test(`reject unsafe route ${JSON.stringify(path)}`, () => assert.equal(localRoute(path), false));
}
for (const [field, value, code] of [
  ["id", "", "evidence-id-unknown"], ["value", "UNKNOWN", "evidence-value-unknown"],
  ["source", null, "evidence-source-unknown"], ["licence", "inconnu", "evidence-licence-unknown"],
  ["retrievedOn", null, "evidence-date-unknown"], ["retrievedOn", "2026-02-30", "evidence-date-unknown"],
  ["tier", "", "evidence-tier-unknown"],
]) {
  test(`missing evidence ${field} becomes finding ${code}`, () => {
    const entry = evidence({ [field]: value });
    assert.equal(evidenceComplete(entry), false);
    assert.ok(codes(evidenceFindings([entry], 2)).includes(code));
  });
}
test("synthetic evidence is complete", () => assert.equal(evidenceComplete(evidence()), true));
test("evidence key ignores translated values", () => {
  assert.equal(evidenceKey(evidence()), evidenceKey(evidence({ value: "Exemple" })));
});
test("evidence keys include source metadata", () => {
  assert.notEqual(evidenceKey(evidence()), evidenceKey(evidence({ source: "Other" })));
});
test("duplicate evidence identifiers are diagnosed", () => {
  assert.ok(codes(evidenceFindings([evidence(), evidence()], 2)).includes("evidence-id-duplicate"));
});
for (const field of ["source", "licence", "retrievedOn", "tier"]) {
  test(`preserved record detects ${field} drift`, () => {
    assert.ok(codes(provenanceContinuity([evidence()], [evidence({ [field]: "changed" })], 2))
      .includes("evidence-source-drift"));
  });
}
test("translated evidence value does not alter provenance", () => {
  assert.deepEqual(provenanceContinuity([evidence()], [evidence({ value: "Texte exemple" })], 2), []);
});
test("lost evidence is reported", () => {
  assert.ok(codes(provenanceContinuity([evidence()], [], 2)).includes("evidence-lost"));
});
test("known value dropping to UNKNOWN is reported", () => {
  assert.ok(codes(provenanceContinuity([evidence()], [evidence({ value: null })], 2)).includes("evidence-value-lost"));
});
test("UNKNOWN cannot be promoted with incomplete source", () => {
  const before = evidence({ value: null, source: null });
  const after = evidence({ value: "present", source: null });
  assert.ok(codes(provenanceContinuity([before], [after], 2)).includes("evidence-unknown-promoted"));
});
for (const [changed, expected] of [
  [{ mainCount: 0 }, "main-count"], [{ mainCount: 2 }, "main-count"],
  [{ title: "UNKNOWN" }, "title-unknown"], [{ heading: "" }, "heading-unknown"],
  [{ focusVisible: false }, "focus-invisible"], [{ focusInsideInert: true }, "focus-inert"],
  [{ targetWidth: 43 }, "target-width"], [{ targetHeight: 43 }, "target-height"],
  [{ targetWidth: Number.NaN }, "target-width"], [{ targetHeight: Infinity }, "target-height"],
  [{ dialogId: "modal", focusInDialog: false }, "dialog-focus-outside"],
  [{ horizontalOverflow: 3 }, "horizontal-overflow"],
]) {
  test(`accessibility state catches ${expected} in ${JSON.stringify(changed)}`, () => {
    assert.ok(codes(accessibilityFindings(a11y(changed), 1)).includes(expected));
  });
}
for (const [changed, expected] of [
  [{ route: "//foreign" }, "route-unsafe"], [{ at: -1 }, "snapshot-time"],
  [{ historyIndex: -1 }, "history-position"], [{ historyIndex: 1.5 }, "history-position"],
  [{ scrollY: -1 }, "scroll-position"],
  [{ connection: "offline", cache: "UNKNOWN", outcome: "ready" }, "offline-readiness-unsupported"],
]) {
  test(`snapshot detects ${expected}`, () => assert.ok(codes(snapshotFindings(state(changed), 1)).includes(expected)));
}
test("unknown focus measurements do not get guessed", () => {
  assert.deepEqual(accessibilityFindings(a11y({ focusId: null, targetWidth: null, targetHeight: null }), 1), []);
});
test("loading must expose busy status", () => {
  assert.ok(codes(statusFindings(state({ outcome: "pending" }), 0)).includes("pending-no-busy-status"));
});
test("loading with busy status passes", () => {
  assert.deepEqual(statusFindings(state({ outcome: "pending", statuses: [message({ busy: true })] }), 0), []);
});
for (const outcome of ["error", "empty"]) {
  test(`${outcome} outcomes require live announcement`, () => {
    assert.ok(codes(statusFindings(state({ outcome }), 1)).includes("outcome-not-announced"));
  });
}
test("duplicate live status keys are rejected", () => {
  assert.ok(codes(statusFindings(state({ statuses: [message(), message()] }), 0)).includes("status-id-duplicate"));
});
test("live status in wrong language is rejected", () => {
  assert.ok(codes(statusFindings(state({ locale: "fr", statuses: [message()] }), 0)).includes("status-locale"));
});
test("empty announced text is rejected", () => {
  assert.ok(codes(statusFindings(state({ statuses: [message({ text: "" })] }), 0)).includes("status-empty"));
});
test("bad status timestamp is rejected", () => {
  assert.ok(codes(statusFindings(state({ statuses: [message({ issuedAt: -1 })] }), 0)).includes("status-time"));
});
test("status with matching locale and text passes", () => assert.deepEqual(statusFindings(state({ statuses: [message()] }), 0), []));
for (const [changed, expected] of [
  [{ after: state({ locale: "en" }) }, "language-unchanged"],
  [{ after: state({ locale: "fr", route: "/help" }) }, "language-route-lost"],
  [{ after: state({ locale: "fr", at: 1 }) }, "time-reversed"],
  [{ expectedRoute: "/help" }, "route-unexpected"],
  [{ expectedFocus: "other" }, "focus-not-restored"],
  [{ expectedOutcome: "empty" }, "outcome-unexpected"],
  [{ preserveQuery: true, after: state({ locale: "fr", query: "new" }) }, "query-lost"],
]) {
  test(`action contract finds ${expected}`, () => assert.ok(codes(interactionFindings(action(changed), 1)).includes(expected)));
}
test("disconnect requires offline connectivity", () => {
  assert.ok(codes(interactionFindings(action({ kind: "disconnect" }), 1)).includes("disconnect-not-observed"));
});
test("reconnect requires observed online state", () => {
  assert.ok(codes(interactionFindings(action({ kind: "reconnect", after: state({ connection: "UNKNOWN" }) }), 1))
    .includes("reconnect-not-observed"));
});
test("retry requires prior failure", () => {
  assert.ok(codes(interactionFindings(action({ kind: "retry" }), 1)).includes("retry-without-failure"));
});
test("clear requires cleared search query", () => {
  assert.ok(codes(interactionFindings(action({ kind: "clear", after: state({ query: "remains" }) }), 1))
    .includes("clear-query-remains"));
});
test("open-dialog must create dialog", () => {
  assert.ok(codes(interactionFindings(action({ kind: "open-dialog" }), 1)).includes("dialog-did-not-open"));
});
test("close-dialog must close dialog", () => {
  assert.ok(codes(interactionFindings(action({ kind: "close-dialog", after: state({ a11y: a11y({ dialogId: "open" }) }) }), 1))
    .includes("dialog-did-not-close"));
});
test("back must decrement history", () => {
  assert.ok(codes(interactionFindings(action({ kind: "back" }), 1)).includes("back-history-order"));
});
test("forward must increment history", () => {
  assert.ok(codes(interactionFindings(action({ kind: "forward" }), 1)).includes("forward-history-order"));
});
test("trace catches a broken chain", () => {
  const changed = action({ before: state({ route: "/help" }) });
  assert.ok(codes(traceFindings({ initial: state(), events: [changed] })).includes("trace-disconnected"));
});
test("trace catches duplicate event ids", () => {
  const first = action();
  const second = action({ before: first.after, after: state({ locale: "en", at: 12 }) });
  assert.ok(codes(traceFindings({ initial: state(), events: [first, second] })).includes("action-id-duplicate"));
});
test("same snapshot ignores incidental focus position", () => {
  assert.equal(sameSnapshot(state(), state({ a11y: a11y({ focusId: null }) })), true);
});
test("same snapshot compares evidence values", () => {
  assert.equal(sameSnapshot(state({ evidence: [evidence()] }), state({ evidence: [evidence({ value: "Other" })] })), false);
});
test("findings reporter deduplicates", () => {
  const issue = accessibilityFindings(a11y({ targetWidth: 2 }), 1);
  assert.equal(distinctFindings([...issue, ...issue]).length, 1);
  assert.equal(blockingFindings(issue).length, 1);
  assert.ok(summarizeFindings([...issue, ...issue, ...accessibilityFindings(a11y({ targetHeight: 2 }), 1)], 1).includes("additional findings"));
});
test("invalid report limit throws", () => assert.throws(() => summarizeFindings([], 0), RangeError));
