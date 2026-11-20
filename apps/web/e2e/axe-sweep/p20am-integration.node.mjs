import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleScreen, sampleAction, sampleRecord, sampleControl, sampleAnnouncement,
  textOrUnknown, known, recordIdentity, reportFindings,
} from "./p20am-model.ts";
import {
  screenFindings, traceFindings, traceOutcome, replaySequence,
  compareTraceFindings, transitionFindings,
} from "./p20am-policy.ts";
import {
  formatEnvelope, exportJson, exportCsv, exportText, importJson, compareExports,
  artifact, traceCoverage, coverageFromTraceCells, requiredCoverage, coverageFindings,
} from "./p20am-custody.ts";
import { copy, accessibleName, statusMatches, frenchTypographyFindings } from "./p20am-copy.ts";
const rules = (items) => items.map((item) => item.rule);

function tracedVisit() {
  const record = sampleRecord();
  const initial = sampleScreen({ records: [record] });
  const offline = sampleScreen({ connection: "offline", records: [record] });
  const translated = sampleScreen({ connection: "offline", language: "fr",
    records: [{ ...record, label: "Exemple" }] });
  const restored = sampleScreen({ connection: "online", language: "fr",
    records: [{ ...record, label: "Exemple" }] });
  const actions = [
    sampleAction({ before: initial, after: offline }),
    sampleAction({ kind: "language", before: offline, after: translated }),
    sampleAction({ kind: "reconnect", before: translated, after: restored }),
  ];
  return replaySequence(initial, actions, "offline-language-recovery");
}
test("a connected three-action offline recovery path has no blocking failures", () => {
  const trace = tracedVisit();
  assert.equal(trace.actions.length, 3);
  assert.deepEqual(traceFindings(trace).filter((item) => item.severity === "error"), []);
});
test("language transition changes visible label without changing provenance", () => {
  const trace = tracedVisit();
  const before = trace.actions[1].before.records[0];
  const after = trace.actions[1].after.records[0];
  assert.equal(recordIdentity(before), recordIdentity(after));
});
test("offline transition records the actual connection state", () => {
  const trace = tracedVisit();
  assert.equal(trace.actions[0].after.connection, "offline");
  assert.equal(trace.actions[2].after.connection, "online");
});
test("source custody remains the same when locale changes", () => {
  const trace = tracedVisit();
  const before = formatEnvelope("en", "/journey", trace.actions[0].after.records, "json");
  const after = formatEnvelope("fr", "/journey", trace.actions[1].after.records, "json");
  assert.deepEqual(compareExports(before, after), []);
});
test("exporting an incomplete record keeps UNKNOWN in both languages", () => {
  const trace = tracedVisit();
  for (const language of ["en", "fr"]) {
    const env = formatEnvelope(language, "/journey", trace.initial.records, "json");
    const result = importJson(exportJson(env));
    assert.equal(result?.records[0]?.value, "UNKNOWN");
    assert.equal(result?.records[0]?.declared, "UNKNOWN");
  }
});
test("French CSV export keeps locally correct source headings", () => {
  const env = formatEnvelope("fr", "/journey", tracedVisit().initial.records, "csv");
  assert.match(exportCsv(env), /Date de consultation/);
  assert.match(exportCsv(env), /Niveau de preuve/);
});
test("English text and French text are different without losing record identity", () => {
  const trace = tracedVisit();
  const english = exportText(formatEnvelope("en", "/journey", trace.initial.records, "text"));
  const french = exportText(formatEnvelope("fr", "/journey", trace.initial.records, "text"));
  assert.notEqual(english, french);
  assert.match(english, /example/);
  assert.match(french, /example/);
});
test("corrupted source after reconnect is reported by the trace", () => {
  const trace = tracedVisit();
  const actions = [...trace.actions];
  const last = actions[2];
  actions[2] = { ...last, after: { ...last.after,
    records: [sampleRecord({ source: "Other dataset" })] } };
  assert.ok(rules(traceFindings(replaySequence(trace.initial, actions))).includes("record-provenance-or-value-changed"));
});
test("missing source after reconnect remains UNKNOWN and fails preserving transition", () => {
  const trace = tracedVisit();
  const last = trace.actions[2];
  const changed = { ...last, after: { ...last.after,
    records: [sampleRecord({ source: null })] } };
  assert.ok(rules(transitionFindings(changed)).includes("record-provenance-or-value-changed"));
});
test("an error is not silent if a visible status announcement is present", () => {
  const s = sampleScreen({ outcome: "error", announcements: [sampleAnnouncement({
    text: copy("en", "error"), politeness: "assertive" })] });
  assert.ok(!rules(screenFindings(s)).includes("outcome-silent"));
});
test("a silent offline fallback produces a distinct audit failure", () => {
  const s = sampleScreen({ outcome: "fallback", connection: "offline" });
  assert.ok(rules(screenFindings(s)).includes("outcome-silent"));
});
test("a loading fallback announces busy before completion", () => {
  const s = sampleScreen({ outcome: "loading", announcements: [sampleAnnouncement({
    text: copy("en", "loading"), busy: true })] });
  assert.ok(!rules(screenFindings(s)).includes("loading-not-busy"));
});
test("French error announcement does not use English copy", () => {
  const french = copy("fr", "error");
  assert.equal(statusMatches("fr", "error", french), true);
  assert.equal(statusMatches("fr", "error", copy("en", "error")), false);
});
test("French retry control uses a localized accessible name", () => {
  assert.equal(accessibleName("fr", "retry").test("Réessayer"), true);
  assert.equal(accessibleName("fr", "retry").test("Try again"), false);
});
test("unsupported French punctuation is caught before export", () => {
  assert.ok(frenchTypographyFindings("Source: valeur").length > 0);
  assert.deepEqual(frenchTypographyFindings("Source\u00a0: valeur"), []);
});
test("keyboard control must stay at least 44px during offline fallback", () => {
  const s = sampleScreen({ connection: "offline", controls: [sampleControl({ width: 43 })] });
  assert.ok(rules(screenFindings(s)).includes("control-width"));
});
test("focus outside a modal cannot pass because the page is offline", () => {
  const s = sampleScreen({ connection: "offline", activeDialog: "modal" });
  assert.ok(rules(screenFindings(s)).includes("dialog-focus-outside"));
});
test("route matrix distinguishes online and offline observations", () => {
  const trace = tracedVisit();
  const cells = traceCoverage(trace, 320);
  assert.equal(cells.length, 4);
  assert.equal(new Set(cells.map((item) => item.offline)).size, 2);
});
test("one replay cannot claim entire route-language-width coverage", () => {
  const trace = tracedVisit();
  const required = requiredCoverage(["/journey"]);
  const actual = coverageFromTraceCells(traceCoverage(trace, 320));
  assert.ok(rules(coverageFindings(required, actual)).includes("coverage-missing"));
});
test("a changed record label does not imply a new source", () => {
  assert.equal(recordIdentity(sampleRecord({ label: "Example" })),
    recordIdentity(sampleRecord({ label: "Exemple" })));
});
test("known values remain known and sentinel values remain UNKNOWN", () => {
  assert.equal(known("0"), true);
  assert.equal(textOrUnknown("Inconnu"), "UNKNOWN");
});
test("export artifact flags UNKNOWN without claiming no data exists", () => {
  const env = formatEnvelope("en", "/journey", tracedVisit().initial.records, "json");
  assert.equal(artifact(env).hasUnknown, true);
});
test("fixing a focus failure creates a resolved regression finding", () => {
  const failed = screenFindings(sampleScreen({ controls: [sampleControl({ width: 20 })] }));
  const passing = screenFindings(sampleScreen());
  const diff = compareTraceFindings(failed, passing);
  assert.ok(diff.resolved.some((item) => item.rule === "control-width"));
});
test("new hidden focus ring is an introduced regression finding", () => {
  const prior = screenFindings(sampleScreen());
  const current = screenFindings(sampleScreen({ controls: [sampleControl({ focusVisible: false })] }));
  const diff = compareTraceFindings(prior, current);
  assert.ok(diff.introduced.some((item) => item.rule === "focus-ring-hidden"));
});
test("trace report names the exact step of a failing transition", () => {
  const trace = tracedVisit();
  const invalid = { ...trace.actions[1], after: { ...trace.actions[1].after, route: "/help" } };
  const issues = traceFindings(replaySequence(trace.initial, [trace.actions[0], invalid]));
  assert.match(reportFindings(issues), /2 language-lost-route/);
});
test("trace outcome is determined by errors, not informational UNKNOWN", () => {
  const result = traceOutcome(tracedVisit());
  assert.equal(result.outcome, "pass");
  assert.equal(result.blocking, 0);
});
