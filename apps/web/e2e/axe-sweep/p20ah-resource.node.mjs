import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PRECACHE_ENTRY_BYTES, safeResourceUrl, cachedState, entryFindings,
  snapshotResourceFindings, snapshotCompare, budgetSummary, resourceMatrix, matrixCoverage,
} from "./p20ah-resource-gate.ts";
const resource = (change = {}) => ({
  url: "/assets/app.js", kind: "script", cached: "present", bytes: 1000,
  outcome: "success", revision: "v1", required: true, external: false, ...change,
});
const snapshot = (change = {}) => ({
  route: "/journey", locale: "en", offline: true, entries: [resource()],
  cacheName: "app-shell", serviceWorker: "active", requestedAt: 0, ...change,
});
const codes = (items) => items.map((item) => item.code);

test("current precache entry cap is 524288 bytes", () => {
  assert.equal(MAX_PRECACHE_ENTRY_BYTES, 524288);
});
for (const url of ["/", "/app.js", "/nested/a.css", "https://example.test/a.js", "http://example.test/a.png", "./local.json", "../other.css"]) {
  test(`resource URL accepts normal document/resource reference ${url}`, () => {
    assert.equal(safeResourceUrl(url), true);
  });
}
for (const url of ["", "  ", "//remote", "data:text/plain,a", "javascript:alert(1)", "file:///tmp/data", "/path\\bad", "/x\u0001", "/x\u007f"]) {
  test(`resource URL rejects unsafe location ${JSON.stringify(url)}`, () => {
    assert.equal(safeResourceUrl(url), false);
  });
}
for (const [cached, outcome, expected] of [
  ["present", "success", "ready"], ["missing", "success", "unavailable"],
  ["present", "error", "unavailable"], ["present", "pending", "UNKNOWN"],
  ["present", "UNKNOWN", "UNKNOWN"], ["UNKNOWN", "success", "UNKNOWN"],
  ["UNKNOWN", "error", "UNKNOWN"], ["missing", "UNKNOWN", "UNKNOWN"],
]) {
  test(`cache state ${cached}/${outcome} stays ${expected}`, () => {
    assert.equal(cachedState(resource({ cached, outcome })), expected);
  });
}
for (const [change, code] of [
  [{ url: "javascript:alert(1)" }, "resource-url-unsafe"],
  [{ external: true, cached: "missing" }, "offline-external-required"],
  [{ bytes: null }, "resource-bytes-unknown"],
  [{ bytes: -1 }, "resource-bytes-invalid"],
  [{ bytes: 1.5 }, "resource-bytes-invalid"],
  [{ bytes: Number.NaN }, "resource-bytes-invalid"],
  [{ bytes: 524289 }, "precache-entry-too-large"],
  [{ cached: "missing" }, "required-resource-missing"],
  [{ cached: "UNKNOWN" }, "required-cache-unknown"],
  [{ outcome: "error" }, "required-request-failed"],
  [{ outcome: "UNKNOWN" }, "required-outcome-unknown"],
  [{ revision: "a b" }, "resource-revision-invalid"],
  [{ revision: "../bad" }, "resource-revision-invalid"],
]) {
  test(`resource contract reports ${code} for ${JSON.stringify(change)}`, () => {
    assert.ok(codes(entryFindings(resource(change))).includes(code));
  });
}
test("resource exactly at per-entry budget is allowed", () => {
  assert.deepEqual(entryFindings(resource({ bytes: 524288 })), []);
});
test("resource at zero bytes may be valid metadata", () => {
  assert.deepEqual(entryFindings(resource({ bytes: 0 })), []);
});
test("unobserved byte count is informational not a passing measurement", () => {
  const issue = entryFindings(resource({ bytes: null }))[0];
  assert.equal(issue?.code, "resource-bytes-unknown");
  assert.equal(issue?.blocking, false);
});
for (const value of [0, -1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`nonpositive/noninteger budget ${String(value)} fails`, () => {
    assert.throws(() => entryFindings(resource(), value), RangeError);
  });
}
test("default snapshot has no findings", () => {
  assert.deepEqual(snapshotResourceFindings(snapshot()), []);
});
for (const [change, code] of [
  [{ serviceWorker: "absent" }, "offline-worker-absent"],
  [{ serviceWorker: "UNKNOWN" }, "offline-worker-unknown"],
  [{ cacheName: null }, "offline-cache-unknown"],
  [{ requestedAt: -1 }, "request-time-invalid"],
  [{ entries: [resource(), resource()] }, "resource-duplicate"],
  [{ entries: [resource({ cached: "missing" })] }, "offline-required-unavailable"],
]) {
  test(`offline snapshot reports ${code}`, () => {
    assert.ok(codes(snapshotResourceFindings(snapshot(change))).includes(code));
  });
}
test("online snapshot does not falsely require an offline worker", () => {
  assert.equal(codes(snapshotResourceFindings(snapshot({ offline: false, serviceWorker: "absent" }))).includes("offline-worker-absent"), false);
});
test("cache comparison reports a required resource lost", () => {
  assert.ok(codes(snapshotCompare(snapshot(), snapshot({ entries: [] }))).includes("required-resource-lost"));
});
test("cache comparison reports an observed eviction", () => {
  assert.ok(codes(snapshotCompare(snapshot(), snapshot({ entries: [resource({ cached: "missing" })] }))).includes("resource-evicted"));
});
test("cache comparison reports a revision drift", () => {
  assert.ok(codes(snapshotCompare(snapshot(), snapshot({ entries: [resource({ revision: "v2" })] }))).includes("resource-revision-drift"));
});
test("cache comparison accepts a stable resource identity", () => {
  assert.deepEqual(snapshotCompare(snapshot(), snapshot()), []);
});
test("cache comparison requires locale resources after a locale switch", () => {
  assert.ok(codes(snapshotCompare(snapshot(), snapshot({ locale: "fr", entries: [] }))).includes("locale-resources-empty"));
});
test("budget accounting sums known byte values without guessing unknowns", () => {
  const resources = [resource({ bytes: 100 }), resource({ url: "/unknown", bytes: null })];
  assert.deepEqual(budgetSummary(snapshot({ entries: resources })), {
    knownBytes: 100, unknownCount: 1, overBudgetCount: 0, requiredUnavailable: 0,
  });
});
test("budget accounting counts oversized entries", () => {
  assert.equal(budgetSummary(snapshot({ entries: [resource({ bytes: 600000 })] })).overBudgetCount, 1);
});
test("budget accounting flags unavailable required resources", () => {
  assert.equal(budgetSummary(snapshot({ entries: [resource({ cached: "missing" })] })).requiredUnavailable, 1);
});
test("resource matrix creates 4 states per route", () => {
  assert.equal(resourceMatrix(["/", "/help"], ["en", "fr"]).length, 8);
});
test("resource matrix never pins route count", () => {
  const routes = ["/", "/journey", "/new-screen"];
  assert.deepEqual(matrixCoverage(routes, resourceMatrix(routes, ["en", "fr"])), []);
});
test("resource coverage detects absent cells", () => {
  const routes = ["/", "/help"];
  assert.ok(codes(matrixCoverage(routes, resourceMatrix(routes, ["en", "fr"]).slice(1))).includes("matrix-missing"));
});
test("resource coverage detects repeated cells", () => {
  const routes = ["/"];
  const matrix = resourceMatrix(routes, ["en", "fr"]);
  assert.ok(codes(matrixCoverage(routes, [...matrix, matrix[0]])).includes("matrix-duplicate"));
});
test("resource coverage detects an unregistered route", () => {
  const routes = ["/"];
  const matrix = [...resourceMatrix(routes, ["en", "fr"]), { route: "/unknown", locale: "en", offline: false }];
  assert.ok(codes(matrixCoverage(routes, matrix)).includes("matrix-unexpected"));
});
