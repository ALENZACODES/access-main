import test from "node:test";
import assert from "node:assert/strict";
import {
  canonical, dateIsValid, routeIsSafe, provenanceComplete, valueKnown,
  provenanceKey, stableValueKey, evidenceDiagnostics, handoffDiagnostics,
  screenDiagnostics, transferDiagnostics, traceDiagnostics, blockingDiagnostics,
  summarizeDiagnostics,
} from "./p20ah-handoff-policy.ts";

const provenance = (change = {}) => ({
  source: "Synthetic source", licence: "Synthetic licence", retrievedOn: "2026-11-20", tier: "E", ...change,
});
const evidence = (change = {}) => ({
  id: "synthetic-1", label: "Example", value: "Observed statement", state: "KNOWN",
  provenance: provenance(), ...change,
});
const packet = (change = {}) => ({
  id: "packet-1", schema: 1, locale: "en", originRoute: "/journey",
  createdOn: "2026-11-20", connection: "offline", sourceOfCopy: "saved",
  records: [evidence()], purpose: "take-along", redacted: true, ...change,
});
const screen = (change = {}) => ({
  route: "/journey", locale: "en", connection: "offline", activeId: "next",
  heading: "Example journey", status: "ready", records: [evidence()], ...change,
});
const transfer = (change = {}) => ({
  kind: "export", before: screen(), after: screen(), handoff: packet(),
  focusShouldRemain: true, recordsShouldRemain: true, ...change,
});
const codes = (issues) => issues.map((issue) => issue.code);

test("canonical never silently converts absent evidence into an observed fact", () => {
  assert.equal(canonical(null), "UNKNOWN");
  assert.equal(canonical(undefined), "UNKNOWN");
  assert.equal(canonical("UNKNOWN"), "UNKNOWN");
});
for (const value of ["", " ", "unknown", "Unknown", "inconnu", "Inconnue", "n/a", "N/A", "none", "null", "undefined", "—", "-"]) {
  test(`canonical missing token ${JSON.stringify(value)} stays UNKNOWN`, () => {
    assert.equal(canonical(value), "UNKNOWN");
  });
}
for (const [input, expected] of [
  [" zero ", "zero"], ["0", "0"], ["False", "False"], ["No reported step", "No reported step"],
  ["Inconnu mais mesuré", "Inconnu mais mesuré"], ["UNKNOWN values", "UNKNOWN values"],
  [" Source  date ", "Source date"], ["Test\n synthetic", "Test synthetic"],
  ["  A\tB  ", "A B"], ["— described as text", "— described as text"],
] ) {
  test(`canonical preserves explicit phrase ${JSON.stringify(input)}`, () => {
    assert.equal(canonical(input), expected);
  });
}
for (const valid of [
  "2000-02-29", "2024-02-29", "2026-02-28", "2026-11-20", "2026-12-31",
  "1999-01-01", "2026-04-30", "2026-06-30", "2026-09-30", "2026-11-30",
]) {
  test(`date parser accepts actual calendar date ${valid}`, () => assert.equal(dateIsValid(valid), true));
}
for (const invalid of [
  null, "", "tomorrow", "2025-02-29", "1900-02-29", "2026-02-30", "2026-11-31",
  "2026-00-10", "2026-13-01", "2026-01-00", "0000-01-01", "2026/11/20",
  "2026-1-1", "2026-01-1", "2026-1-01", "2026- 1-01", "2026-04-31",
]) {
  test(`date parser rejects invalid calendar date ${JSON.stringify(invalid)}`, () => {
    assert.equal(dateIsValid(invalid), false);
  });
}
for (const route of ["/", "/journey", "/places", "/help", "/more/diary", "/settings/language", "/a_b", "/some/path", "/a%20b"]) {
  test(`safe path accepts ${route}`, () => assert.equal(routeIsSafe(route), true));
}
for (const route of ["", "places", "//host", "/a/../b", "/a/./b", "/x?y", "/x#id", "/x\\y", "/x:y", "/x*y", "/x\u0001", "/x\u007f"]) {
  test(`safe path rejects ${JSON.stringify(route)}`, () => assert.equal(routeIsSafe(route), false));
}
for (const [field, value] of [
  ["source", null], ["source", ""], ["source", "UNKNOWN"], ["source", "Inconnu"],
  ["licence", null], ["licence", ""], ["licence", "UNKNOWN"], ["licence", "—"],
  ["retrievedOn", null], ["retrievedOn", ""], ["retrievedOn", "2026-11-31"],
  ["tier", "UNKNOWN"],
]) {
  test(`source provenance missing ${field} ${JSON.stringify(value)} is incomplete`, () => {
    assert.equal(provenanceComplete(provenance({ [field]: value })), false);
  });
}
test("valid provenance is complete without implying a measured accessibility outcome", () => {
  assert.equal(provenanceComplete(provenance()), true);
  assert.equal(provenanceComplete(provenance({ source: "Another synthetic dataset" })), true);
});
for (const [field, value] of [
  ["id", ""], ["label", ""], ["label", "UNKNOWN"], ["value", null],
  ["value", "unknown"], ["value", "Inconnu"], ["state", "UNKNOWN"],
]) {
  test(`known evidence predicate fails for ${field} ${JSON.stringify(value)}`, () => {
    assert.equal(valueKnown(evidence({ [field]: value })), false);
  });
}
test("an evidence record can be known only with its complete observed fields", () => {
  assert.equal(valueKnown(evidence()), true);
});
test("a translated label must not affect provenance identity", () => {
  assert.equal(provenanceKey(evidence()), provenanceKey(evidence({ label: "Exemple" })));
});
test("changing the value does not change the source provenance key", () => {
  assert.equal(provenanceKey(evidence()), provenanceKey(evidence({ value: "Another synthetic statement" })));
});
test("changing the observed value does change the stable value key", () => {
  assert.notEqual(stableValueKey(evidence()), stableValueKey(evidence({ value: "Other" })));
});
for (const [field, value] of [
  ["source", "Another source"], ["licence", "Another licence"],
  ["retrievedOn", "2026-11-19"], ["tier", "B"],
]) {
  test(`metadata identity detects a changed ${field}`, () => {
    const changed = evidence({ provenance: provenance({ [field]: value }) });
    assert.notEqual(provenanceKey(evidence()), provenanceKey(changed));
  });
}
for (const [changes, code] of [
  [{ id: "" }, "evidence-id-empty"],
  [{ label: "UNKNOWN" }, "evidence-label-unknown"],
  [{ value: "UNKNOWN" }, "evidence-known-without-value"],
  [{ provenance: provenance({ source: null }) }, "evidence-known-without-provenance"],
  [{ provenance: provenance({ source: null }) }, "evidence-source-unknown"],
  [{ provenance: provenance({ licence: null }) }, "evidence-licence-unknown"],
  [{ provenance: provenance({ retrievedOn: "2026-02-30" }) }, "evidence-date-unknown"],
  [{ provenance: provenance({ tier: "UNKNOWN" }) }, "evidence-tier-unknown"],
]) {
  test(`evidence contract flags ${code}`, () => {
    assert.ok(codes(evidenceDiagnostics(evidence(changes))).includes(code));
  });
}
test("unknown value declared UNKNOWN does not assert it is known", () => {
  assert.equal(codes(evidenceDiagnostics(evidence({ value: null, state: "UNKNOWN" }))).includes("evidence-known-without-value"), false);
});
test("complete evidence record has no missing-field findings", () => {
  assert.deepEqual(evidenceDiagnostics(evidence()), []);
});
for (const [changes, code] of [
  [{ id: "" }, "handoff-id-empty"],
  [{ schema: 2 }, "handoff-schema"],
  [{ originRoute: "//remote" }, "handoff-route"],
  [{ createdOn: null }, "handoff-created-unknown"],
  [{ sourceOfCopy: "UNKNOWN" }, "handoff-origin-unknown"],
  [{ purpose: "UNKNOWN" }, "handoff-purpose-unknown"],
  [{ redacted: false }, "handoff-redaction-unconfirmed"],
  [{ records: [] }, "handoff-empty"],
  [{ records: [evidence(), evidence()] }, "handoff-duplicate-record"],
  [{ records: [evidence({ state: "UNKNOWN", value: null })] }, "evidence-label-unknown"],
]) {
  test(`handoff contract reports ${code} with ${JSON.stringify(changes)}`, () => {
    if (code === "evidence-label-unknown") {
      assert.equal(codes(handoffDiagnostics(packet(changes))).includes(code), false);
      return;
    }
    assert.ok(codes(handoffDiagnostics(packet(changes))).includes(code));
  });
}
test("valid synthetic handoff has no diagnostics", () => {
  assert.deepEqual(handoffDiagnostics(packet()), []);
});
test("empty handoff is not interpreted as a negative accessibility finding", () => {
  const findings = handoffDiagnostics(packet({ records: [] }));
  assert.equal(findings.find((f) => f.code === "handoff-empty")?.severity, "information");
});
for (const [changes, code] of [
  [{ route: "//host" }, "screen-route-unsafe"],
  [{ heading: null }, "screen-heading-missing"],
  [{ status: "loading" }, "screen-loading-offline"],
  [{ status: "ready", records: [] }, "screen-ready-without-records"],
  [{ records: [evidence(), evidence()] }, "screen-duplicate-evidence"],
]) {
  test(`screen contract reports ${code}`, () => {
    assert.ok(codes(screenDiagnostics(screen(changes))).includes(code));
  });
}
for (const [changes, code] of [
  [{ kind: "locale", after: screen() }, "locale-did-not-change"],
  [{ kind: "locale", after: screen({ locale: "fr", route: "/help" }) }, "locale-lost-route"],
  [{ kind: "disconnect", after: screen({ connection: "UNKNOWN" }) }, "disconnect-not-observed"],
  [{ kind: "reconnect", after: screen({ connection: "UNKNOWN" }) }, "reconnect-not-observed"],
  [{ kind: "retry" }, "retry-without-error"],
  [{ after: screen({ activeId: "lost" }) }, "focus-not-preserved"],
  [{ after: screen({ records: [] }) }, "record-lost"],
  [{ after: screen({ records: [evidence({ value: "Changed" })] }) }, "record-value-drift"],
  [{ after: screen({ records: [evidence({ provenance: provenance({ source: "Changed" }) })] }) }, "record-source-drift"],
  [{ handoff: null }, "export-missing-packet"],
  [{ handoff: packet({ locale: "fr" }) }, "export-locale-mismatch"],
  [{ handoff: packet({ originRoute: "/help" }) }, "export-route-mismatch"],
]) {
  test(`transfer audit flags ${code}`, () => {
    assert.ok(codes(transferDiagnostics(transfer(changes))).includes(code));
  });
}
test("well-formed export transition passes", () => {
  assert.deepEqual(transferDiagnostics(transfer()), []);
});
test("a bilingual switch with preserved provenance passes", () => {
  const from = screen();
  const to = screen({ locale: "fr", records: [evidence({ label: "Exemple" })] });
  assert.deepEqual(transferDiagnostics(transfer({ kind: "locale", before: from, after: to, handoff: null })), []);
});
test("successful disconnect records the offline state", () => {
  const to = screen({ connection: "offline" });
  assert.deepEqual(transferDiagnostics(transfer({ kind: "disconnect", before: screen({ connection: "online" }), after: to, handoff: null })), []);
});
test("trace starts with first screen and checks sequence continuity", () => {
  const from = screen();
  const changed = screen({ locale: "fr" });
  const steps = [transfer({ kind: "locale", before: from, after: changed, handoff: null })];
  assert.deepEqual(traceDiagnostics(from, steps), []);
});
test("trace reports discontinuous before snapshot", () => {
  const steps = [transfer({ kind: "locale", before: screen({ route: "/help" }), after: screen({ locale: "fr" }), handoff: null })];
  assert.ok(codes(traceDiagnostics(screen(), steps)).includes("trace-disconnected"));
});
test("blocking findings remove nonblocking observations", () => {
  const findings = handoffDiagnostics(packet({ createdOn: null, schema: 2, redacted: false }));
  assert.deepEqual(blockingDiagnostics(findings).map((f) => f.code), ["handoff-schema"]);
});
for (const max of [0, -1, 1.5, NaN, Infinity]) {
  test(`diagnostic report refuses nonpositive/noninteger limit ${String(max)}`, () => {
    assert.throws(() => summarizeDiagnostics([], max), RangeError);
  });
}
test("diagnostic summary truncates without inventing findings", () => {
  const findings = handoffDiagnostics(packet({ id: "", schema: 2, records: [] }));
  assert.match(summarizeDiagnostics(findings, 1), /additional findings/);
  assert.ok(summarizeDiagnostics(findings, 100).includes("handoff-id-empty"));
});
