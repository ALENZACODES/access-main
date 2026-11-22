import test from "node:test";
import assert from "node:assert/strict";
import { matrix, matrixFindings, stateFindings, blocking, knownFact, stepFindings } from "./p20af-transition-ledger.ts";
import { budgetFindings, essentialOfflineFindings, cacheClaim, graphSummary } from "./p20af-resource-audit.ts";
import { groupFindings, nextTab, strokeFindings, frenchSpacing } from "./p20af-localized-controls.ts";
import { decide, reviewItems, knownReview, trailFindings } from "./p20af-fallback-decisions.ts";
import { initialHistory, replayHistory, timelineSnapshot } from "./p20af-history-replay.ts";

const record = (changes = {}) => ({ id: "sample", value: "Example observation", provenance: {
  source: "Example source", licence: "Example licence", retrievedOn: "2026-11-19", tier: "E",
}, ...changes });
const focus = (changes = {}) => ({ id: "search", visible: true, inert: false, withinDialog: null, width: 44, height: 44, ...changes });
const state = (changes = {}) => ({ route: "/offline", locale: "en", connection: "online", cache: "available", result: "ready", heading: "Offline", title: "Offline", mains: 1,
  focus: focus(), facts: [record()], messages: [], dialog: null, history: 0, scrollY: 0, clock: 100, ...changes });
const resource = (changes = {}) => ({ id: "pack", url: "/packs/sample.json", purpose: "data", method: "GET", requestState: "fulfilled", status: 200, cache: "present",
  bytes: 524288, started: 1, finished: 2, sensitive: "public", source: "Example source", licence: "Example licence", retrievedOn: "2026-11-19", ...changes });
const requirement = (changes = {}) => ({ id: "pack-required", resourceId: "pack", essential: true, operation: "read", ...changes });
const experience = (changes = {}) => ({ route: "/offline", locale: "en", connection: "online", requested: "read", resources: [resource()], requirements: [requirement()], ...changes });
const control = (changes = {}) => ({ id: "search", kind: "button", name: "Search", visible: true, disabled: false, inert: false, width: 44, height: 44,
  tabindex: 0, active: true, expanded: null, selected: null, controls: [], language: "en", ...changes });
const review = (changes = {}) => ({ id: "sample", locale: "en", route: "/offline", source: "Example source", licence: "Example licence", retrievedOn: "2026-11-19", tier: "E", status: "KNOWN", ...changes });
const codes = (items) => items.map((entry) => entry.code);

// Cross-domain scenarios assert multiple independent invariants from one journey event.
test("loaded resource, complete source and sized control form a clean read-only baseline", () => {
  assert.equal(knownFact(record()), true);
  assert.equal(cacheClaim(resource()), "usable");
  assert.equal(decide(experience()).allowLocalRead, true);
  assert.deepEqual(blocking(stateFindings(state(), 0)), []);
  assert.deepEqual(groupFindings([control()], "en"), []);
});
test("unknown cache never authorizes export even when source fields exist", () => {
  const changed = experience({ requested: "export", requirements: [requirement({ operation: "export" })], resources: [resource({ cache: "unknown" })] });
  assert.equal(decide(changed).allowExport, false);
  assert.equal(decide(changed).view, "unknown");
  assert.equal(cacheClaim(changed.resources[0]), "unknown");
});
test("small target remains an error even when route and cache are healthy", () => {
  const found = groupFindings([control({ width: 43 })], "en");
  assert.ok(codes(found).includes("control-width-small"));
  assert.equal(decide(experience()).view, "available");
});
test("a complete source cannot compensate for a missing offline asset", () => {
  assert.equal(knownFact(record()), true);
  assert.equal(decide(experience({ resources: [] })).view, "unavailable");
});
test("French recovery does not require English ARIA names", () => {
  assert.deepEqual(groupFindings([control({ name: "Réessayer", language: "fr" })], "fr"), []);
  assert.equal(frenchSpacing("L’action est prête." ).length, 0);
});
test("language switch must not rewrite evidence provenance", () => {
  const before = state({ facts: [record()] });
  const after = state({ locale: "fr", facts: [record({ provenance: { ...record().provenance, source: "Other source" } })] });
  assert.ok(codes(stepFindings({ action: "locale", before, after, preserveFacts: true }, 1)).includes("fact-provenance-changed"));
});
test("language switch preserving facts accepts translated title", () => {
  const before = state();
  const after = state({ locale: "fr", title: "Hors ligne", heading: "Hors ligne" });
  assert.deepEqual(stepFindings({ action: "locale", before, after, preserveFacts: true }, 1), []);
});
test("offline transition reports unknown cache informationally", () => {
  const after = state({ connection: "offline", cache: "unknown" });
  const issues = stateFindings(after, 1);
  assert.equal(issues.find((entry) => entry.code === "offline-cache-unknown")?.severity, "information");
});
test("an offline transition cannot claim an observed network result", () => {
  const after = state({ connection: "offline", cache: "unknown" });
  assert.equal(after.connection, "offline");
  assert.notEqual(after.cache, "available");
});
test("history focus restoration keeps a specific recorded target", () => {
  const trace = replayHistory(initialHistory("/offline", "fr"), [
    { type: "focus", key: "focus-search", focus: "search" },
    { type: "push", key: "visit-help", route: "/help" },
    { type: "back", key: "return-offline" },
  ]);
  assert.equal(timelineSnapshot(trace.timeline)?.focus, "search");
  assert.equal(timelineSnapshot(trace.timeline)?.locale, "fr");
});
test("back navigation does not fabricate a cached response", () => {
  const trace = replayHistory(initialHistory("/offline", "en"), [
    { type: "push", key: "visit-help", route: "/help" },
    { type: "disconnect", key: "disconnect" },
    { type: "back", key: "return-offline" },
  ]);
  assert.equal(timelineSnapshot(trace.timeline)?.route, "/offline");
  assert.equal(cacheClaim(resource({ cache: "unknown" })), "unknown");
});
test("resource above cap is diagnosed even when marked present", () => {
  const changed = experience({ resources: [resource({ bytes: 524289 })] });
  assert.ok(codes(budgetFindings({ name: "sample", locale: "en", version: "1", resources: changed.resources })).includes("resource-entry-budget"));
});
test("resource exact cap is accepted by budget checker", () => {
  const issues = budgetFindings({ name: "sample", locale: "en", version: "1", resources: [resource()] });
  assert.equal(codes(issues).includes("resource-entry-budget"), false);
});
test("pending request with present cache remains unknown", () => {
  assert.equal(cacheClaim(resource({ requestState: "pending" })), "unknown");
  assert.equal(decide(experience({ resources: [resource({ requestState: "pending" })] })).view, "unknown");
});
test("stale essential dependency is not treated as an offline hit", () => {
  const entry = resource({ id: "entry", url: "/" });
  const asset = resource({ id: "script", url: "/script.js", cache: "stale" });
  const graph = { bundle: { name: "sample", locale: "en", version: "1", resources: [entry, asset] },
    entryId: "entry", edges: [{ fromId: "entry", toId: "script", reason: "bootstrap", mandatory: true }] };
  assert.ok(codes(essentialOfflineFindings(graph)).includes("essential-offline-unavailable"));
  assert.deepEqual(graphSummary(graph).unusable, ["script"]);
});
test("unknown essential dependency remains informational", () => {
  const entry = resource({ id: "entry", url: "/" });
  const asset = resource({ id: "style", url: "/style.css", cache: "unknown" });
  const graph = { bundle: { name: "sample", locale: "fr", version: "1", resources: [entry, asset] },
    entryId: "entry", edges: [{ fromId: "entry", toId: "style", reason: "styles", mandatory: true }] };
  const issues = essentialOfflineFindings(graph);
  assert.equal(issues.find((item) => item.code === "essential-offline-unknown")?.severity, "information");
});
test("unknown provenance cannot become a known review", () => {
  assert.equal(knownReview(review({ source: null, status: "UNKNOWN" })), false);
  assert.equal(knownFact(record({ provenance: { ...record().provenance, source: null } })), false);
});
test("review lineage persists across a French language switch", () => {
  const before = review();
  const after = review({ locale: "fr" });
  assert.equal(codes(trailFindings({ before: [before], after: [after], action: "locale", preserve: true })).includes("review-provenance-drift"), false);
});
test("unknown records are not silently promoted during history return", () => {
  const before = review({ status: "UNKNOWN" });
  const after = review();
  assert.ok(codes(trailFindings({ before: [before], after: [after], action: "back", preserve: true })).includes("review-unknown-promoted"));
});
test("search changing evidence is distinct from a preserving locale switch", () => {
  const before = state({ facts: [record()] });
  const after = state({ facts: [] });
  assert.equal(codes(stepFindings({ action: "search", before, after, preserveFacts: false }, 1)).includes("fact-lost"), false);
  assert.ok(codes(stepFindings({ action: "locale", before, after: state({ locale: "fr", facts: [] }), preserveFacts: true }, 1)).includes("fact-lost"));
});
test("retry action after error still requires an observed result", () => {
  const before = state({ result: "error", messages: [{ id: "status", text: "Error", locale: "en", live: "assertive", busy: false }] });
  const after = state({ result: "unknown" });
  assert.equal(codes(stepFindings({ action: "retry", before, after }, 1)).includes("retry-without-error"), false);
  assert.equal(after.result, "unknown");
});
test("required route matrix does not assume a fixed number of routes", () => {
  const routes = ["/", "/offline", "/help", "/new-page"];
  const cells = matrix(routes);
  assert.deepEqual(matrixFindings(cells, cells), []);
  assert.equal(cells.length, routes.length * 8);
});
test("focus order can be evaluated in French without translating DOM ids", () => {
  const controls = [control({ language: "fr", name: "Rechercher" }), control({ id: "next", name: "Suivant", language: "fr", active: false })];
  assert.equal(nextTab(controls, "search"), "next");
  assert.deepEqual(strokeFindings({ key: "Tab", beforeId: "search", afterId: "next", scrolled: false }, controls), []);
});
test("offline fallback review text is French while resource identities remain stable", () => {
  const changed = experience({ locale: "fr", connection: "offline", resources: [resource({ cache: "unknown" })] });
  const items = reviewItems(changed);
  assert.ok(items.some((item) => item.title === "Hors ligne"));
  assert.deepEqual(decide(changed).unresolvedIds, ["pack-required"]);
});
