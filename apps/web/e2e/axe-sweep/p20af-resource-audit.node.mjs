import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BUDGET, resourceKey, allowedMethod, observedCompletion, cacheClaim,
  resourceFindings, budgetFindings, graphFindings, reachable,
  essentialOfflineFindings, changedResource, bundleDrift, graphSummary,
} from "./p20af-resource-audit.ts";

const resource = (changes = {}) => ({
  id: "document", url: "/offline", purpose: "document", method: "GET",
  requestState: "fulfilled", status: 200, cache: "present", bytes: 1000,
  started: 10, finished: 20, sensitive: "public", licence: "Example licence",
  source: "Example source", retrievedOn: "2026-11-19", ...changes,
});
const bundle = (resources = [resource()]) => ({ name: "sample", locale: "en", resources, version: "1" });
const graph = (changes = {}) => ({
  bundle: bundle([resource(), resource({ id: "script", url: "/assets/script.js", purpose: "script", bytes: 500 })]),
  edges: [{ fromId: "document", toId: "script", reason: "Application script", mandatory: true }],
  entryId: "document", ...changes,
});
const codes = (items) => items.map((item) => item.code);

test("default entry budget is exactly 524288 bytes", () => assert.equal(DEFAULT_BUDGET.maxEntryBytes, 524288));
test("complete request has observed success", () => assert.equal(observedCompletion(resource()), true));
test("complete cached resource can be used offline", () => assert.equal(cacheClaim(resource()), "usable"));
test("baseline resource has no errors", () => assert.deepEqual(resourceFindings(resource(), 0).filter((item) => item.severity === "error"), []));
test("baseline bundle has no findings", () => assert.deepEqual(budgetFindings(bundle()), []));
test("baseline graph passes all constraints", () => assert.deepEqual(graphFindings(graph()), []));

for (const path of ["/", "/offline", "/assets/app.js", "/assets/style.css", "/packs/example.json", "https://example.test/app.js", "http://localhost:4173/app.js"]) {
  test(`safe resource URL ${path}`, () => assert.notEqual(resourceKey(path), null));
}
for (const path of ["", "//remote.test/a", "javascript:alert(1)", "data:text/plain,123", "blob:local", "file:///tmp/secret", "ftp://test/a", "/path?token=secret", "/a#frag", "/a/../b", "https://user:pass@example.test/a", "https://example.test/a#frag"]) {
  test(`invalid resource URL ${path}`, () => assert.equal(resourceKey(path), null));
}
test("resource identity strips external query parameters", () => {
  assert.equal(resourceKey("https://example.test/a?x=1"), "https://example.test/a");
});
test("relative path is not mistaken for a local document", () => assert.equal(resourceKey("app.js"), null));

for (const method of ["GET", "HEAD", "get", "head"]) {
  test(`read-only method ${method} is accepted`, () => assert.equal(allowedMethod(method), true));
}
for (const method of ["POST", "PATCH", "PUT", "DELETE", "OPTIONS", "TRACE"]) {
  test(`state-changing method ${method} is rejected`, () => assert.equal(allowedMethod(method), false));
}
for (const [changes, code] of [
  [{ id: "" }, "resource-id-empty"],
  [{ url: "javascript:alert(1)" }, "resource-url-invalid"],
  [{ method: "POST" }, "resource-method-unsafe"],
  [{ requestState: "fulfilled", status: null }, "resource-status-unknown"],
  [{ status: 99 }, "resource-status-invalid"],
  [{ status: 600 }, "resource-status-invalid"],
  [{ status: 404 }, "resource-http-failed"],
  [{ status: 500 }, "resource-http-failed"],
  [{ requestState: "pending", finished: 20 }, "resource-pending-finished"],
  [{ started: -1 }, "resource-start-invalid"],
  [{ started: NaN }, "resource-start-invalid"],
  [{ finished: -1 }, "resource-finish-invalid"],
  [{ finished: Infinity }, "resource-finish-invalid"],
  [{ started: 30, finished: 20 }, "resource-time-reversed"],
  [{ bytes: null }, "resource-bytes-unknown"],
  [{ bytes: -1 }, "resource-size-invalid"],
  [{ bytes: 1.5 }, "resource-size-invalid"],
  [{ bytes: 524289 }, "resource-entry-budget"],
  [{ sensitive: "private" }, "resource-private-cached"],
  [{ sensitive: "unknown" }, "resource-cache-sensitivity-unknown"],
  [{ requestState: "failed" }, "resource-stale-response"],
  [{ source: null }, "resource-source-unknown"],
  [{ licence: null }, "resource-licence-unknown"],
  [{ retrievedOn: null }, "resource-date-unknown"],
]) {
  test(`resource contract ${JSON.stringify(changes)} reports ${code}`, () => {
    assert.ok(codes(resourceFindings(resource(changes), 1)).includes(code));
  });
}

test("size at exact limit does not exceed entry budget", () => {
  assert.equal(codes(resourceFindings(resource({ bytes: 524288 }), 0)).includes("resource-entry-budget"), false);
});
test("unknown byte count remains informational", () => {
  const findings = resourceFindings(resource({ bytes: null }), 0);
  assert.equal(findings.find((item) => item.code === "resource-bytes-unknown")?.severity, "information");
});
test("unknown cache cannot become a usable claim", () => assert.equal(cacheClaim(resource({ cache: "unknown" })), "unknown"));
test("unobserved status cannot become usable", () => assert.equal(cacheClaim(resource({ status: null })), "unknown"));
test("unfulfilled request cannot become usable", () => assert.equal(cacheClaim(resource({ requestState: "pending" })), "unknown"));
test("failed request is not usable", () => assert.equal(cacheClaim(resource({ requestState: "failed" })), "not-usable"));
test("absent resource is not usable", () => assert.equal(cacheClaim(resource({ cache: "absent" })), "not-usable"));
test("stale resource is not usable", () => assert.equal(cacheClaim(resource({ cache: "stale" })), "not-usable"));
test("observed 304 response has completed outcome", () => assert.equal(observedCompletion(resource({ status: 304 })), true));
test("observed 404 response is not completed success", () => assert.equal(observedCompletion(resource({ status: 404 })), false));
test("status 200 with unknown outcome is not success", () => assert.equal(observedCompletion(resource({ requestState: "unknown" })), false));

test("duplicate bundle identifiers are surfaced", () => {
  assert.ok(codes(budgetFindings(bundle([resource(), resource()]))).includes("bundle-duplicate-id"));
});
test("total bundle size over limit is surfaced", () => {
  const items = Array.from({ length: 11 }, (_, i) => resource({ id: `r${i}`, url: `/r${i}`, bytes: 524288 }));
  assert.ok(codes(budgetFindings(bundle(items))).includes("bundle-total-budget"));
});
test("total bundle size at exact limit is accepted", () => {
  const items = Array.from({ length: 10 }, (_, i) => resource({ id: `r${i}`, url: `/r${i}`, bytes: 524288 }));
  assert.equal(codes(budgetFindings(bundle(items))).includes("bundle-total-budget"), false);
});
test("bundle count above maximum is diagnosed", () => {
  const items = Array.from({ length: 201 }, (_, i) => resource({ id: `r${i}`, url: `/r${i}`, bytes: 0 }));
  assert.ok(codes(budgetFindings(bundle(items))).includes("bundle-count-budget"));
});
test("unknown bundle size stays unresolved", () => assert.ok(codes(budgetFindings(bundle([resource({ bytes: null })]))).includes("bundle-size-unknown")));
test("known portion over budget still fails with unknown entry", () => {
  const items = Array.from({ length: 11 }, (_, i) => resource({ id: `r${i}`, url: `/r${i}`, bytes: i === 0 ? null : 524288 }));
  assert.ok(codes(budgetFindings(bundle(items))).includes("bundle-size-unknown"));
});

test("graph entry must exist", () => assert.ok(codes(graphFindings(graph({ entryId: "missing" }))).includes("graph-entry-missing")));
test("graph edges require known source", () => {
  assert.ok(codes(graphFindings(graph({ edges: [{ fromId: "missing", toId: "script", reason: "R", mandatory: true }] }))).includes("graph-from-missing"));
});
test("graph edges require known destination", () => {
  assert.ok(codes(graphFindings(graph({ edges: [{ fromId: "document", toId: "missing", reason: "R", mandatory: true }] }))).includes("graph-to-missing"));
});
test("graph repeated edge is rejected", () => {
  const baseline = graph();
  assert.ok(codes(graphFindings({ ...baseline, edges: [...baseline.edges, ...baseline.edges] })).includes("graph-edge-duplicate"));
});
test("unexplained graph edge remains informational", () => {
  assert.ok(codes(graphFindings(graph({ edges: [{ fromId: "document", toId: "script", reason: "", mandatory: true }] }))).includes("graph-reason-unknown"));
});
test("reachable graph includes required script", () => assert.deepEqual(reachable(graph()), ["document", "script"]));
test("missing graph root has no reachable resources", () => assert.deepEqual(reachable(graph({ entryId: "missing" })), []));
test("graph without edge has only its entry", () => assert.deepEqual(reachable(graph({ edges: [] })), ["document"]));
test("graph cycles terminate", () => {
  const baseline = graph();
  assert.deepEqual(reachable({ ...baseline, edges: [...baseline.edges, { fromId: "script", toId: "document", reason: "cycle", mandatory: false }] }), ["document", "script"]);
});

test("mandatory unavailable script is reported", () => {
  const baseline = graph();
  const script = baseline.bundle.resources[1];
  const changed = graph({ bundle: bundle([resource(), { ...script, cache: "absent" }]) });
  assert.ok(codes(essentialOfflineFindings(changed)).includes("essential-offline-unavailable"));
});
test("mandatory unknown script is not guessed to be available", () => {
  const baseline = graph();
  const script = baseline.bundle.resources[1];
  const changed = graph({ bundle: bundle([resource(), { ...script, cache: "unknown" }]) });
  assert.ok(codes(essentialOfflineFindings(changed)).includes("essential-offline-unknown"));
});
test("optional missing asset does not fail mandatory dependencies", () => {
  const baseline = graph();
  assert.deepEqual(essentialOfflineFindings({ ...baseline, edges: [{ ...baseline.edges[0], mandatory: false }] }), []);
});
test("healthy mandatory edge has no offline finding", () => assert.deepEqual(essentialOfflineFindings(graph()), []));

for (const [changed, expected] of [
  [{ url: "/new" }, "url"], [{ cache: "missing" }, "cache"],
  [{ status: 201 }, "status"], [{ bytes: 500 }, "bytes"],
  [{ source: "Another" }, "source"], [{ licence: "Another" }, "licence"],
  [{ retrievedOn: "2026-11-18" }, "retrievedOn"], [{ sensitive: "unknown" }, "sensitive"],
]) {
  test(`resource drift identifies ${expected}`, () => assert.ok(changedResource(resource(), resource(changed)).includes(expected)));
}
test("identical resources have no diff", () => assert.deepEqual(changedResource(resource(), resource()), []));
test("lost bundle entry is reported", () => assert.ok(codes(bundleDrift(bundle([resource()]), bundle([]))).includes("bundle-resource-lost")));
test("new bundle entry is reported", () => assert.ok(codes(bundleDrift(bundle([]), bundle([resource()]))).includes("bundle-resource-added")));
test("changed bundle provenance is reported", () => assert.ok(codes(bundleDrift(bundle(), bundle([resource({ source: "Other" })]))).includes("bundle-field-changed")));
test("unmodified bundle has no drift", () => assert.deepEqual(bundleDrift(bundle(), bundle()), []));
test("graph summary counts reachable nodes", () => assert.equal(graphSummary(graph()).reachable, 2));
test("graph summary lists disconnected nodes", () => assert.deepEqual(graphSummary(graph({ edges: [] })).unreachable, ["script"]));
test("graph summary identifies unknown cache", () => {
  const baseline = graph();
  const script = baseline.bundle.resources[1];
  assert.deepEqual(graphSummary(graph({ bundle: bundle([resource(), { ...script, cache: "unknown" }]) })).unknown, ["script"]);
});
test("graph summary identifies stale resources", () => {
  const baseline = graph();
  const script = baseline.bundle.resources[1];
  assert.deepEqual(graphSummary(graph({ bundle: bundle([resource(), { ...script, cache: "stale" }]) })).unusable, ["script"]);
});
