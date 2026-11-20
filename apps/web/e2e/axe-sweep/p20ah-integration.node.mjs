import test from "node:test";
import assert from "node:assert/strict";
import { canonical, handoffDiagnostics, provenanceKey, transferDiagnostics } from "./p20ah-handoff-policy.ts";
import { initialReplay, replay, replayCompleteness, replayStatistics } from "./p20ah-replay.ts";
import { packetCsv, packetPlainText, packetSummary, frenchPunctuationIssues } from "./p20ah-bilingual-report.ts";
import { safeResourceUrl, entryFindings, budgetSummary, resourceMatrix, matrixCoverage } from "./p20ah-resource-gate.ts";
import { browserFrameFindings, stateTransitionFindings } from "./p20ah-browser.ts";

const evidence = (changes = {}) => ({
  id: "record-1", label: "Synthetic station", value: "Observed on mock fixture", state: "KNOWN",
  provenance: { source: "Synthetic data", licence: "Synthetic licence", retrievedOn: "2026-11-20", tier: "E" },
  ...changes,
});
const packet = (changes = {}) => ({
  id: "packet-1", schema: 1, locale: "en", originRoute: "/journey",
  createdOn: "2026-11-20", connection: "offline", sourceOfCopy: "saved",
  records: [evidence()], purpose: "take-along", redacted: true, ...changes,
});
const browser = (changes = {}) => ({
  route: "/journey", language: "en", title: "Journey", heading: "Journey",
  mainCount: 1, activeId: "next", scrollWidth: 320, viewportWidth: 320,
  controls: [{ id: "next", role: "button", name: "Next", visible: true, disabled: false,
    inert: false, tabIndex: 0, width: 44, height: 44, focusOutline: true }],
  statuses: ["Results are ready."], online: true, capturedOn: 100, ...changes,
});
const resource = (changes = {}) => ({
  url: "/assets/app.js", kind: "script", cached: "present", bytes: 1024, outcome: "success",
  revision: "v1", required: true, external: false, ...changes,
});
const resourceSnapshot = (changes = {}) => ({
  route: "/journey", locale: "en", offline: true, entries: [resource()],
  cacheName: "app", serviceWorker: "active", requestedAt: 100, ...changes,
});
const codes = (items) => items.map((item) => item.code);

function runRoundtrip(locale) {
  const selected = packet({ locale });
  const result = replay(initialReplay("/journey", locale), [
    { kind: "save", items: [evidence()] },
    { kind: "disconnect" },
    { kind: "focus", target: "next" },
    { kind: "export", packet: selected },
    { kind: "navigate", route: "/help" },
    { kind: "back" },
    { kind: "reconnect" },
  ]);
  return { selected, result };
}
for (const locale of ["en", "fr"]) {
  test(`end-to-end synthetic replay stays on journey after back in ${locale}`, () => {
    const { result } = runRoundtrip(locale);
    assert.equal(result.final.screen.route, "/journey");
    assert.equal(result.final.screen.locale, locale);
    assert.equal(result.final.screen.connection, "online");
  });
  test(`end-to-end evidence source survives locale-specific export in ${locale}`, () => {
    const { result } = runRoundtrip(locale);
    assert.equal(result.final.lastPacket?.records[0]?.provenance.source, "Synthetic data");
  });
  test(`end-to-end offline export has no blocking findings in ${locale}`, () => {
    const { result } = runRoundtrip(locale);
    assert.deepEqual(result.diagnostics, []);
  });
  test(`end-to-end replay chain is coherent in ${locale}`, () => {
    const { result } = runRoundtrip(locale);
    assert.deepEqual(replayCompleteness(result), []);
  });
  test(`end-to-end exports one record with its source in ${locale}`, () => {
    const { selected } = runRoundtrip(locale);
    assert.ok(packetCsv(selected).includes('"Synthetic data"'));
    assert.ok(packetCsv(selected).includes('"Synthetic licence"'));
  });
  test(`end-to-end export plain text uses correct locale ${locale}`, () => {
    const { selected } = runRoundtrip(locale);
    const text = packetPlainText(selected);
    assert.ok(text.includes(locale === "fr" ? "Dossier à emporter" : "Take-along evidence"));
  });
  test(`end-to-end summary keeps unknown count zero for complete synthetic evidence ${locale}`, () => {
    const { selected } = runRoundtrip(locale);
    assert.equal(packetSummary(selected).unknown, 0);
  });
  test(`end-to-end replay contains the actual seven actions in ${locale}`, () => {
    const { result } = runRoundtrip(locale);
    const stats = replayStatistics(result);
    assert.equal(Object.values(stats).reduce((a, b) => a + b, 0), 7);
  });
}
test("offline export does not assert an unknown record as known", () => {
  const unknown = evidence({ state: "UNKNOWN", value: null });
  const handoff = packet({ records: [unknown] });
  assert.equal(packetSummary(handoff).unknown, 1);
  assert.ok(packetCsv(handoff).includes('"UNKNOWN"'));
  assert.equal(packetCsv(handoff).includes('"null"'), false);
});
test("missing source remains UNKNOWN across replay and CSV", () => {
  const unknown = evidence({ state: "UNKNOWN", provenance: { ...evidence().provenance, source: null } });
  const handoff = packet({ records: [unknown] });
  const result = replay(initialReplay("/journey"), [{ kind: "save", items: [unknown] }, { kind: "export", packet: handoff }]);
  assert.equal(result.final.lastPacket?.records[0]?.provenance.source, null);
  assert.ok(packetCsv(handoff).includes('"UNKNOWN"'));
});
test("export of missing source does not silently rewrite the source provenance", () => {
  const original = evidence({ state: "UNKNOWN", provenance: { ...evidence().provenance, source: null } });
  const after = evidence({ state: "UNKNOWN", provenance: { ...evidence().provenance, source: "New source" } });
  assert.notEqual(provenanceKey(original), provenanceKey(after));
});
test("a false-known record is flagged before the export reaches the user", () => {
  const incorrect = evidence({ value: "UNKNOWN", state: "KNOWN" });
  const findings = handoffDiagnostics(packet({ records: [incorrect] }));
  assert.ok(codes(findings).includes("evidence-known-without-value"));
});
test("missing licence is not a negative accessibility observation", () => {
  const unknown = evidence({ state: "UNKNOWN", provenance: { ...evidence().provenance, licence: null } });
  const findings = handoffDiagnostics(packet({ records: [unknown] }));
  assert.equal(findings.find((f) => f.code === "evidence-licence-unknown")?.severity, "information");
});
test("French report punctuation retains NBSP and narrow NBSP", () => {
  const handoff = packet({ locale: "fr" });
  assert.deepEqual(frenchPunctuationIssues(packetPlainText(handoff)), []);
});
test("French report may include apostrophe in observed data without altering it", () => {
  const text = "L’option d’accès";
  assert.equal(canonical(text), text);
});
test("French export uses local labels without English-only aria-label assertion", () => {
  assert.deepEqual(browserFrameFindings(browser({ language: "fr", controls: [{ ...browser().controls[0], name: "Suivant" }] }), "fr"), []);
});
test("offline observation requires a false online bit", () => {
  assert.deepEqual(stateTransitionFindings(browser(), browser({ online: false }), "offline"), []);
});
test("offline observation cannot treat UNKNOWN connectivity as offline", () => {
  assert.ok(codes(stateTransitionFindings(browser(), browser({ online: null }), "offline")).includes("offline-not-observed"));
});
test("offline export resource URL policy rejects an external data scheme", () => {
  assert.equal(safeResourceUrl("data:text/html,example"), false);
});
test("precache resource exactly at the policy limit stays allowable", () => {
  assert.deepEqual(entryFindings(resource({ bytes: 524288 })), []);
});
test("precache entry larger than the budget is reported", () => {
  assert.ok(codes(entryFindings(resource({ bytes: 524289 }))).includes("precache-entry-too-large"));
});
test("unknown precache bytes cannot be counted as zero", () => {
  const summary = budgetSummary(resourceSnapshot({ entries: [resource({ bytes: null })] }));
  assert.equal(summary.unknownCount, 1);
});
test("bilingual matrix includes connectivity modes for every route", () => {
  const routes = ["/", "/journey", "/help"];
  assert.deepEqual(matrixCoverage(routes, resourceMatrix(routes, ["en", "fr"])), []);
});
test("bilingual matrix reports missing French offline route coverage", () => {
  const routes = ["/", "/journey"];
  const cells = resourceMatrix(routes, ["en", "fr"]).filter((cell) => !(cell.route === "/journey" && cell.locale === "fr" && cell.offline));
  assert.ok(codes(matrixCoverage(routes, cells)).includes("matrix-missing"));
});
test("explicit offline transition keeps route, records and focus", () => {
  const before = { route: "/journey", locale: "en", connection: "online", activeId: "next", heading: "Journey", status: "ready", records: [evidence()] };
  const after = { ...before, connection: "offline" };
  assert.deepEqual(transferDiagnostics({ kind: "disconnect", before, after, handoff: null, focusShouldRemain: true, recordsShouldRemain: true }), []);
});
test("offline transfer does not overwrite UNKNOWN source with a guess", () => {
  const unknown = evidence({ state: "UNKNOWN", provenance: { ...evidence().provenance, source: null } });
  const before = { route: "/journey", locale: "fr", connection: "online", activeId: "next", heading: "Journey", status: "ready", records: [unknown] };
  const after = { ...before, connection: "offline" };
  assert.deepEqual(transferDiagnostics({ kind: "disconnect", before, after, handoff: null, focusShouldRemain: true, recordsShouldRemain: true }), []);
});
