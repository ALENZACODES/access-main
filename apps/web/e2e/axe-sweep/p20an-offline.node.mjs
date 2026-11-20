import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ENTRY_CAP, DEFAULT_TOTAL_CAP, resourceSafe, resourceFindings, resourceBudgetFindings,
  offlineFindings, recoveryFindings, expectedOfflineMatrix, coverageMissing,
  unknownCount, recoverySequenceSummary,
} from "./p20an-offline.ts";
import { exampleBudget, exampleOffline, exampleResource, exampleScreen, exampleStep } from "./p20an-fixtures.ts";
const codes = (findings) => findings.map((finding) => finding.code);

test("entry and total caps remain explicit", () => {
  assert.equal(DEFAULT_ENTRY_CAP, 524288);
  assert.equal(DEFAULT_TOTAL_CAP, 8388608);
});
for (const url of ["/", "/index.html", "/assets/app.js", "/packs/example.json", "/icons/logo.svg"]) {
  test(`safe relative resource path ${url}`, () => assert.equal(resourceSafe(url), true));
}
for (const url of ["", "https://outside.test", "//outside.test", "../secret", "/a/../b", "/a/./b", "/javascript:run", "/data:text/html", "/blob:unsafe", "/path\\escape"]) {
  test(`unsafe resource reference ${JSON.stringify(url)}`, () => assert.equal(resourceSafe(url), false));
}
test("known cached resource under budget passes", () => {
  assert.deepEqual(resourceFindings(exampleResource(), "/places", exampleBudget()), []);
});
for (const [change, expected] of [
  [{ url: "//outside" }, "resource-path-unsafe"],
  [{ bytes: null }, "resource-size-UNKNOWN"],
  [{ bytes: Number.NaN }, "resource-size-UNKNOWN"],
  [{ bytes: -1 }, "resource-size-UNKNOWN"],
  [{ bytes: 524289 }, "resource-entry-over-budget"],
  [{ cached: "absent" }, "required-resource-absent"],
  [{ cached: "UNKNOWN" }, "required-resource-UNKNOWN"],
  [{ responseOk: false }, "resource-response-invalid"],
  [{ contentType: null }, "resource-content-type-UNKNOWN"],
]) {
  test(`resource contract detects ${expected}`, () => {
    assert.ok(codes(resourceFindings(exampleResource(change), "/places", exampleBudget())).includes(expected));
  });
}
test("optional absent resource is not a required-cache failure", () => {
  const issues = resourceFindings(exampleResource({ required: false, cached: "absent" }), "/places", exampleBudget());
  assert.equal(codes(issues).includes("required-resource-absent"), false);
});
test("exact per-entry budget is permitted", () => {
  const issues = resourceFindings(exampleResource({ bytes: 524288 }), "/places", exampleBudget());
  assert.equal(codes(issues).includes("resource-entry-over-budget"), false);
});
test("exact total budget is permitted", () => {
  const issues = resourceBudgetFindings([exampleResource({ bytes: 8388608, required: false })], exampleBudget({ maximumEntryBytes: 8388608, totalBytes: 8388608 }), "/");
  assert.equal(codes(issues).includes("budget-total-exceeded"), false);
});
test("total above budget fails", () => {
  const issues = resourceBudgetFindings([exampleResource()], exampleBudget({ totalBytes: 8388609 }), "/");
  assert.ok(codes(issues).includes("budget-total-exceeded"));
});
test("unknown total remains UNKNOWN and does not pass silently", () => {
  const issues = resourceBudgetFindings([exampleResource()], exampleBudget({ totalBytes: null }), "/");
  assert.ok(codes(issues).includes("budget-total-UNKNOWN"));
});
for (const change of [{ maximumEntryBytes: 0 }, { maximumTotalBytes: -1 }, { maximumTotalBytes: 1.5 }]) {
  test(`invalid budget ${JSON.stringify(change)} fails`, () => {
    assert.ok(codes(resourceBudgetFindings([], exampleBudget(change), "/")).includes("budget-invalid"));
  });
}
test("observed resource sizes may not exceed claimed total", () => {
  const issues = resourceBudgetFindings([exampleResource({ bytes: 4000 })], exampleBudget({ totalBytes: 2048 }), "/");
  assert.ok(codes(issues).includes("budget-inconsistent"));
});
test("unknown entry size cannot be silently summed", () => {
  const issues = resourceBudgetFindings([exampleResource({ bytes: null })], exampleBudget(), "/");
  assert.ok(codes(issues).includes("resource-size-UNKNOWN"));
  assert.equal(codes(issues).includes("budget-inconsistent"), false);
});
test("complete synthetic offline observation passes", () => {
  assert.deepEqual(offlineFindings(exampleOffline(), exampleBudget()), []);
});
test("unknown worker state is visible", () => {
  assert.ok(codes(offlineFindings(exampleOffline({ serviceWorker: "UNKNOWN" }), exampleBudget()))
    .includes("worker-state-UNKNOWN"));
});
test("missing cache inventory remains explicitly UNKNOWN", () => {
  assert.ok(codes(offlineFindings(exampleOffline({ cacheNames: null }), exampleBudget()))
    .includes("cache-inventory-UNKNOWN"));
});
test("duplicated cache names produce a finding", () => {
  assert.ok(codes(offlineFindings(exampleOffline({ cacheNames: ["a", "a"] }), exampleBudget()))
    .includes("cache-name-duplicate"));
});
test("missing required offline resource demands an observed fallback", () => {
  const observation = exampleOffline({ resources: [exampleResource({ cached: "absent" })], fallbackVisible: false });
  assert.ok(codes(offlineFindings(observation, exampleBudget())).includes("offline-fallback-not-observed"));
});
test("missing fallback observation stays UNKNOWN", () => {
  assert.ok(codes(offlineFindings(exampleOffline({ fallbackVisible: null }), exampleBudget()))
    .includes("offline-fallback-UNKNOWN"));
});
test("online observations do not fabricate offline fallback findings", () => {
  const observation = exampleOffline({ connection: "online", fallbackVisible: false, resources: [exampleResource()] });
  assert.equal(codes(offlineFindings(observation, exampleBudget())).includes("offline-fallback-not-observed"), false);
});
test("valid disconnect recovery preserves page and locale", () => {
  const recovery = {
    before: exampleOffline({ connection: "online" }), after: exampleOffline(),
    beforeScreen: exampleScreen(), afterScreen: exampleScreen({ connection: "offline" }), action: "disconnect",
  };
  assert.deepEqual(recoveryFindings(recovery), []);
});
test("disconnect not observed fails", () => {
  const recovery = { before: exampleOffline({ connection: "online" }), after: exampleOffline({ connection: "online" }),
    beforeScreen: exampleScreen(), afterScreen: exampleScreen(), action: "disconnect" };
  assert.ok(codes(recoveryFindings(recovery)).includes("recovery-disconnect-not-observed"));
});
test("reconnect not observed fails", () => {
  const recovery = { before: exampleOffline(), after: exampleOffline({ connection: "UNKNOWN" }),
    beforeScreen: exampleScreen({ connection: "offline" }), afterScreen: exampleScreen({ connection: "UNKNOWN" }), action: "reconnect" };
  assert.ok(codes(recoveryFindings(recovery)).includes("recovery-reconnect-not-observed"));
});
test("retry action requires an actual retry affordance", () => {
  const recovery = { before: exampleOffline({ retryAvailable: false }), after: exampleOffline(),
    beforeScreen: exampleScreen(), afterScreen: exampleScreen(), action: "retry" };
  assert.ok(codes(recoveryFindings(recovery)).includes("recovery-retry-not-available"));
});
test("recovery may not silently switch document language", () => {
  const recovery = { before: exampleOffline(), after: exampleOffline(),
    beforeScreen: exampleScreen(), afterScreen: exampleScreen({ locale: "fr" }), action: "retry" };
  assert.ok(codes(recoveryFindings(recovery)).includes("recovery-language-changed"));
});
test("recovery may not lose original route", () => {
  const recovery = { before: exampleOffline(), after: exampleOffline(),
    beforeScreen: exampleScreen(), afterScreen: exampleScreen({ route: "/help" }), action: "retry" };
  assert.ok(codes(recoveryFindings(recovery)).includes("recovery-page-lost"));
});
test("recovery may not drop observed focus", () => {
  const recovery = { before: exampleOffline(), after: exampleOffline(),
    beforeScreen: exampleScreen(), afterScreen: exampleScreen({ focusId: null }), action: "retry" };
  assert.ok(codes(recoveryFindings(recovery)).includes("recovery-focus-lost"));
});
test("offline matrix lists online offline and UNKNOWN separately", () => {
  const matrix = expectedOfflineMatrix(["/", "/help"]);
  assert.equal(matrix.length, 6);
  assert.ok(matrix.some((cell) => cell.connection === "UNKNOWN"));
});
test("a complete offline matrix has no coverage gaps", () => {
  const matrix = expectedOfflineMatrix(["/"]);
  assert.deepEqual(coverageMissing(matrix, matrix), []);
});
test("missing offline cell has a concrete coverage key", () => {
  const matrix = expectedOfflineMatrix(["/"]);
  assert.ok(coverageMissing(matrix, matrix.filter((cell) => cell.connection !== "offline")).includes("/|offline"));
});
test("unknownCount counts each unobserved field", () => {
  const observation = exampleOffline({ connection: "UNKNOWN", serviceWorker: "UNKNOWN", cacheNames: null,
    fallbackVisible: null, resources: [exampleResource({ cached: "UNKNOWN", bytes: null })] });
  assert.equal(unknownCount(observation), 5);
});
test("known offline state has zero unknown measurements", () => {
  assert.equal(unknownCount(exampleOffline()), 0);
});
test("replay summary accounts for each connection outcome", () => {
  const one = exampleStep();
  const second = exampleStep({ kind: "reconnect", before: one.after, after: exampleScreen() });
  const third = exampleStep({ kind: "search", before: second.after, after: exampleScreen({ connection: "UNKNOWN" }) });
  assert.deepEqual(recoverySequenceSummary({ id: "sample", initial: one.before, steps: [one, second, third] }),
    { steps: 3, offline: 1, online: 1, unknown: 1 });
});
