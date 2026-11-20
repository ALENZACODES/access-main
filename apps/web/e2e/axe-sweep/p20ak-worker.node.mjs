import test from "node:test";
import assert from "node:assert/strict";
import {
  localResourceUrl, resourceFindings, workerFindings, offlineFallbackFindings,
  resourceTransitionFindings, resourceBudgetSummary, cacheConfidence,
  safePrecacheList, workerStateSummary, requestStatusClass, missingOfflineResources,
} from "./p20ak-worker.ts";
import { BUDGET_BYTES, sampleSnapshot, sampleWorker } from "./p20ak-types.ts";
const resource = (patch = {}) => ({ url: "/index.html", cacheKey: "cache-v1", phase: "success",
  measuredBytes: 200, contentType: "text/html", responseStatus: 200, observedAt: 100,
  source: "Response observation", ...patch });
const codes = (items) => items.map((item) => item.code);
const offline = (patch = {}) => sampleSnapshot({ connectivity: "offline", worker: sampleWorker({ supported: true, controlling: true }),
  resources: [resource()], ...patch });

test("local URL remains a local path", () => {
  assert.equal(localResourceUrl("/index.html"), "/index.html");
});
for (const url of ["https://outside.example/x", "//outside.example/x", "javascript:alert(1)", "data:text/plain,test", "file:///tmp/x", "/a/../b?x=1", "/a#fragment", "/a?token=1", "http://outside.example/x", "blob:local", "mailto:test@example.test"]) {
  test(`unsafe resource ${url} cannot enter precache`, () => {
    assert.equal(localResourceUrl(url), null);
  });
}
for (const url of ["/", "/app.js", "/assets/page.css", "./index.html", "https://example.test/assets/app.js"]) {
  test(`local resource ${url} can be normalized`, () => {
    assert.ok(localResourceUrl(url)?.startsWith("/"));
  });
}
test("valid measured resource has no policy findings", () => {
  assert.deepEqual(resourceFindings([resource()]), []);
});
test("repeated resource observation is diagnosed", () => {
  assert.ok(codes(resourceFindings([resource(), resource()])).includes("resource-duplicate"));
});
test("successful response cannot have unknown HTTP status", () => {
  assert.ok(codes(resourceFindings([resource({ responseStatus: null })])).includes("resource-unmeasured-status"));
});
test("failed response conflicts with HTTP success", () => {
  assert.ok(codes(resourceFindings([resource({ phase: "failure" })])).includes("resource-failure-conflict"));
});
test("reported success conflicts with server error", () => {
  assert.ok(codes(resourceFindings([resource({ responseStatus: 500 })])).includes("resource-status-conflict"));
});
for (const measuredBytes of [-1, Number.NaN, Infinity, 1.5]) {
  test(`invalid measuredBytes ${String(measuredBytes)} is diagnosed`, () => {
    assert.ok(codes(resourceFindings([resource({ measuredBytes })])).includes("resource-size-invalid"));
  });
}
for (const size of [BUDGET_BYTES + 1, BUDGET_BYTES * 2, 2_000_000]) {
  test(`over-budget size ${size} is rejected`, () => {
    assert.ok(codes(resourceFindings([resource({ measuredBytes: size })])).includes("resource-precache-budget"));
  });
}
for (const size of [0, 1, BUDGET_BYTES - 1, BUDGET_BYTES]) {
  test(`size ${size} stays in budget`, () => {
    assert.ok(!codes(resourceFindings([resource({ measuredBytes: size })])).includes("resource-precache-budget"));
  });
}
test("unknown measurement does not pass as measured", () => {
  assert.ok(codes(resourceFindings([resource({ measuredBytes: null })])).includes("resource-size-unknown"));
});
test("future observation cannot precede its measured resource", () => {
  assert.ok(codes(resourceFindings([resource({ observedAt: 200 })], 100)).includes("resource-from-future"));
});
test("unknown cache state cannot claim a cache key", () => {
  assert.ok(codes(resourceFindings([resource({ phase: "UNKNOWN" })])).includes("resource-cache-assumption"));
});
test("content type cannot contain line breaks", () => {
  assert.ok(codes(resourceFindings([resource({ contentType: "text/html\nX: 1" })])).includes("resource-content-type-invalid"));
});
test("worker reported controller cannot be unsupported", () => {
  assert.ok(codes(workerFindings(sampleWorker({ supported: false, controlling: true }), "online")).includes("worker-unsupported-controller"));
});
test("worker unknown controller is information, not a confirmed failure", () => {
  assert.ok(codes(workerFindings(sampleWorker(), "offline")).includes("worker-offline-unknown"));
});
test("worker controller without script remains UNKNOWN", () => {
  assert.ok(codes(workerFindings(sampleWorker({ supported: true, controlling: true }), "online")).includes("worker-script-unknown"));
});
test("duplicate cache names are diagnosed", () => {
  assert.ok(codes(workerFindings(sampleWorker({ cacheNames: ["v1", "v1"] }), "online")).includes("worker-cache-duplicate"));
});
test("blank cache name is diagnosed", () => {
  assert.ok(codes(workerFindings(sampleWorker({ cacheNames: [""] }), "online")).includes("worker-cache-blank"));
});
test("unsupported worker cannot have update pending", () => {
  assert.ok(codes(workerFindings(sampleWorker({ supported: false, updatePending: true }), "online")).includes("worker-update-impossible"));
});
test("unsafe controller script is rejected", () => {
  assert.ok(codes(workerFindings(sampleWorker({ controllerScript: "https://elsewhere.test/sw.js" }), "online")).includes("worker-script-url"));
});
test("online screen has no offline fallback findings", () => {
  assert.deepEqual(offlineFallbackFindings(sampleSnapshot()), []);
});
test("offline error without announcement is diagnosed", () => {
  assert.ok(codes(offlineFallbackFindings(offline({ phase: "error" }))).includes("offline-error-silent"));
});
test("offline state requires an announcement", () => {
  assert.ok(codes(offlineFallbackFindings(offline({ phase: "offline" }))).includes("offline-state-silent"));
});
test("offline ready without resource evidence is diagnosed", () => {
  const state = offline({ resources: [resource({ phase: "UNKNOWN" })] });
  assert.ok(codes(offlineFallbackFindings(state)).includes("offline-ready-without-evidence"));
});
test("known cache is considered ready", () => {
  assert.equal(cacheConfidence(offline()), "ready");
});
test("unknown controller makes cache confidence UNKNOWN", () => {
  assert.equal(cacheConfidence(offline({ worker: sampleWorker() })), "UNKNOWN");
});
test("resource failure makes cache not ready", () => {
  assert.equal(cacheConfidence(offline({ resources: [resource({ phase: "failure" })] })), "not-ready");
});
test("online connection is not proof of offline cache readiness", () => {
  assert.equal(cacheConfidence(sampleSnapshot()), "UNKNOWN");
});
test("preserving cache transition diagnoses lost resource", () => {
  assert.ok(codes(resourceTransitionFindings([resource()], [], "preserve")).includes("resource-lost"));
});
test("preserving cache transition diagnoses changed key", () => {
  assert.ok(codes(resourceTransitionFindings([resource()], [resource({ cacheKey: "other" })], "preserve")).includes("resource-cache-key-drift"));
});
test("clear transition diagnoses remaining key", () => {
  assert.ok(codes(resourceTransitionFindings([resource()], [resource()], "clear")).includes("resource-clear-failed"));
});
test("refresh transition diagnoses time reversal", () => {
  assert.ok(codes(resourceTransitionFindings([resource()], [resource({ observedAt: 50 })], "refresh")).includes("resource-time-reversed"));
});
test("UNKNOWN cannot upgrade without a new observation", () => {
  assert.ok(codes(resourceTransitionFindings([resource({ phase: "UNKNOWN" })], [resource()], "preserve")).includes("resource-unexplained-upgrade"));
});
test("budget summary counts known and unknown separately", () => {
  assert.deepEqual(resourceBudgetSummary([resource(), resource({ url: "/b", measuredBytes: null })]),
    { bytes: 200, unknown: 1, overBudget: 0, count: 2 });
});
test("over-budget entry remains counted", () => {
  assert.equal(resourceBudgetSummary([resource({ measuredBytes: BUDGET_BYTES + 1 })]).overBudget, 1);
});
test("precache list contains only measured successful cached URLs", () => {
  assert.deepEqual(safePrecacheList([resource(), resource({ url: "/bad", measuredBytes: null }),
    resource({ url: "/fail", phase: "failure" })]), ["/index.html"]);
});
test("worker summary preserves UNKNOWN", () => {
  assert.equal(workerStateSummary(sampleWorker()), "UNKNOWN");
});
test("unsupported worker is not called controlling", () => {
  assert.equal(workerStateSummary(sampleWorker({ supported: false })), "unsupported");
});
test("worker update has a distinct label", () => {
  assert.equal(workerStateSummary(sampleWorker({ supported: true, controlling: true, updatePending: true })), "updating");
});
for (const [status, expected] of [[null, "UNKNOWN"], [200, "success"], [201, "success"], [302, "redirect"], [404, "failure"], [503, "failure"], [0, "UNKNOWN"], [999, "UNKNOWN"]]) {
  test(`status ${String(status)} has category ${expected}`, () => {
    assert.equal(requestStatusClass(status), expected);
  });
}
test("offline missing-resource policy checks cache-key evidence", () => {
  assert.deepEqual(missingOfflineResources(["/index.html", "/app.js"], [resource()]), ["/app.js"]);
});
