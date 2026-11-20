import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PRECACHE_FILE_BYTES, safeRoute, normalizeRoute,
  resourceFindings, statusFindings, snapshotFindings, actionFindings,
  sameIdentity, traceFindings, coverageMatrix, coverageKey,
  coverageFindings, inventoryFindings,
} from "./p20aj-offline.ts";
import { sampleSnapshot, sampleStep, sampleEvidence, sampleTarget } from "./p20aj-types.ts";
const codes = (items) => items.map((item) => item.code);
const resource = (changes = {}) => ({ path: "/assets/app.js", cache: "present", bytes: 1024,
  networkAttempted: false, networkSucceeded: false, fallbackPath: null, contentType: "application/javascript", ...changes });
const status = (changes = {}) => ({ id: "status", text: "Ready", locale: "en", politeness: "polite",
  emittedAt: 100, busy: false, visible: true, ...changes });
const screen = (changes = {}) => sampleSnapshot(changes);
const step = (changes = {}) => sampleStep(changes);
for (const route of ["/", "/help", "/journey", "/more/diary", "/settings/language", "/places/one", "/a_b", "/a%20b"]) {
  test(`accepts local route ${route}`, () => assert.equal(safeRoute(route), true));
}
for (const route of ["", "help", "//host", "/a/../b", "/a/./b", "/a?x=1", "/a#id", "/a\\b", "/a:b", "/a*b", "/a\u0001b", "/a\u007fb"]) {
  test(`rejects unsafe route ${JSON.stringify(route)}`, () => assert.equal(safeRoute(route), false));
}
test("normalizes only safe trailing slash", () => {
  assert.equal(normalizeRoute("/help/"), "/help");
  assert.equal(normalizeRoute("/"), "/");
  assert.equal(normalizeRoute("//host/"), null);
});
for (const [change, expected] of [
  [{ path: "//host" }, "resource-unsafe-path"],
  [{ bytes: MAX_PRECACHE_FILE_BYTES + 1 }, "precache-file-budget"],
  [{ bytes: null }, "resource-size-UNKNOWN"],
  [{ bytes: -1 }, "resource-size-UNKNOWN"],
  [{ bytes: Infinity }, "resource-size-UNKNOWN"],
  [{ cache: "UNKNOWN", networkSucceeded: false }, "resource-availability-UNKNOWN"],
  [{ fallbackPath: "https://external.test" }, "fallback-unsafe"],
  [{ cache: "stale", contentType: null }, "stale-type-UNKNOWN"],
]) {
  test(`resource contract detects ${expected}: ${JSON.stringify(change)}`, () => {
    assert.ok(codes(resourceFindings([resource(change)], false, 1)).includes(expected));
  });
}
test("known size at file budget is accepted", () => {
  assert.ok(!codes(resourceFindings([resource({ bytes: MAX_PRECACHE_FILE_BYTES })], false, 0)).includes("precache-file-budget"));
});
test("total precache budget is enforced", () => {
  const entries = Array.from({ length: 9 }, (_, i) => resource({ path: `/asset-${i}`, bytes: MAX_PRECACHE_FILE_BYTES }));
  assert.ok(codes(resourceFindings(entries, false, 0)).includes("precache-total-budget"));
});
test("total budget remains UNKNOWN for missing sizes", () => {
  assert.ok(codes(resourceFindings([resource({ bytes: null })], false, 0)).includes("precache-total-UNKNOWN"));
});
test("duplicate resources fail", () => {
  assert.ok(codes(resourceFindings([resource(), resource()], false, 0)).includes("resource-duplicate"));
});
test("offline resource without cache or fallback fails", () => {
  assert.ok(codes(resourceFindings([resource({ cache: "absent" })], true, 0)).includes("offline-without-fallback"));
});
test("offline resource with fallback avoids that failure", () => {
  assert.ok(!codes(resourceFindings([resource({ cache: "absent", fallbackPath: "/offline" })], true, 0)).includes("offline-without-fallback"));
});
test("offline request cannot claim network success", () => {
  assert.ok(codes(resourceFindings([resource({ networkSucceeded: true })], true, 0)).includes("offline-network-success"));
});
test("online resource may be served by network", () => {
  assert.ok(!codes(resourceFindings([resource({ networkSucceeded: true })], false, 0)).includes("offline-network-success"));
});
test("empty resources do not imply a size failure", () => {
  assert.deepEqual(resourceFindings([], false, 0), []);
});
for (const [change, expected] of [
  [{ locale: "fr" }, "status-locale"],
  [{ text: "" }, "status-blank"],
  [{ politeness: "UNKNOWN" }, "status-urgency-UNKNOWN"],
  [{ busy: null }, "status-busy-UNKNOWN"],
  [{ emittedAt: null }, "status-time-UNKNOWN"],
  [{ emittedAt: 90 }, "status-before-action"],
]) {
  test(`status contract catches ${expected}`, () => {
    assert.ok(codes(statusFindings(screen({ statuses: [status(change)] }), 2)).includes(expected));
  });
}
test("repeated status identifiers fail", () => {
  assert.ok(codes(statusFindings(screen({ statuses: [status(), status()] }), 0)).includes("status-duplicate"));
});
test("hidden empty status is ignored", () => {
  assert.ok(!codes(statusFindings(screen({ statuses: [status({ visible: false, text: "" })] }), 0)).includes("status-blank"));
});
test("loading phase requires busy announcement", () => {
  assert.ok(codes(statusFindings(screen({ phase: "loading" }), 0)).includes("loading-unannounced"));
});
test("loading busy status passes", () => {
  const item = screen({ phase: "loading", statuses: [status({ busy: true })] });
  assert.ok(!codes(statusFindings(item, 0)).includes("loading-unannounced"));
});
for (const phase of ["empty", "error", "offline"]) {
  test(`${phase} outcome requires announcement`, () => {
    assert.ok(codes(statusFindings(screen({ phase }), 0)).includes("outcome-silent"));
  });
  test(`${phase} with polite status avoids silence`, () => {
    assert.ok(!codes(statusFindings(screen({ phase, statuses: [status()] }), 0)).includes("outcome-silent"));
  });
}
for (const [change, expected] of [
  [{ route: "//host" }, "route-invalid"],
  [{ mainCount: 0 }, "main-count"],
  [{ mainCount: 2 }, "main-count"],
  [{ heading: "" }, "heading-empty"],
  [{ title: "" }, "title-empty"],
  [{ locale: "UNKNOWN" }, "locale-UNKNOWN"],
  [{ connectivity: "UNKNOWN" }, "connectivity-UNKNOWN"],
  [{ historyIndex: -1 }, "history-invalid"],
  [{ historyIndex: 1.5 }, "history-invalid"],
  [{ scrollY: -1 }, "scroll-invalid"],
  [{ scrollY: Infinity }, "scroll-invalid"],
  [{ time: -1 }, "time-invalid"],
]) {
  test(`snapshot reports ${expected} for ${JSON.stringify(change)}`, () => {
    assert.ok(codes(snapshotFindings(screen(change), 0)).includes(expected));
  });
}
test("baseline snapshot has no blocking findings", () => {
  assert.ok(!snapshotFindings(screen(), 0).some((finding) => finding.severity === "error"));
});
test("snapshot combines focus findings", () => {
  const findings = snapshotFindings(screen({ targets: [sampleTarget({ width: 10 })] }), 0);
  assert.ok(codes(findings).includes("target-width"));
});
test("snapshot combines evidence findings", () => {
  const findings = snapshotFindings(screen({ evidence: [sampleEvidence({ recordedUnknown: false })] }), 0);
  assert.ok(codes(findings).includes("unsupported-known"));
});
test("snapshot combines resource findings", () => {
  const findings = snapshotFindings(screen({ resources: [resource({ bytes: null })] }), 0);
  assert.ok(codes(findings).includes("resource-size-UNKNOWN"));
});
for (const [change, expected] of [
  [{ after: screen({ connectivity: "online" }) }, "disconnect-not-observed"],
  [{ action: "reconnect", after: screen({ connectivity: "UNKNOWN" }) }, "reconnect-not-observed"],
  [{ action: "language", after: screen({ locale: "en" }) }, "language-unchanged"],
  [{ action: "retry" }, "retry-without-failure"],
  [{ action: "clear", after: screen({ phase: "loading" }) }, "clear-started-request"],
  [{ action: "search", after: screen({ phase: "idle" }) }, "search-no-outcome"],
  [{ action: "navigate", targetRoute: "/help" }, "navigation-target"],
  [{ action: "navigate", after: screen({ route: "/help" }) }, "navigation-history"],
  [{ action: "back", before: screen({ historyIndex: 1 }), after: screen({ historyIndex: 2 }) }, "back-history"],
  [{ action: "forward", before: screen({ historyIndex: 1 }), after: screen({ historyIndex: 0 }) }, "forward-history"],
  [{ expectedStatus: "error" }, "outcome-mismatch"],
  [{ after: screen({ time: 99 }) }, "time-reversed"],
]) {
  test(`action policy detects ${expected} with ${JSON.stringify(change)}`, () => {
    assert.ok(codes(actionFindings(step(change), 1)).includes(expected));
  });
}
test("disconnect transition with explicit offline status passes", () => {
  const after = screen({ connectivity: "offline", phase: "offline", statuses: [status()] });
  assert.ok(!actionFindings(step({ after }), 0).some((finding) => finding.severity === "error"));
});
test("route-changing actions may change path", () => {
  const changed = step({ action: "navigate", targetRoute: "/help", after: screen({ route: "/help", historyIndex: 1 }) });
  assert.ok(!codes(actionFindings(changed, 1)).includes("unexpected-route"));
});
test("language transition cannot change route", () => {
  const changed = step({ action: "language", after: screen({ route: "/help", locale: "fr" }) });
  assert.ok(codes(actionFindings(changed, 1)).includes("unexpected-route"));
});
test("nonnavigation action cannot change locale", () => {
  const changed = step({ action: "clear", after: screen({ locale: "fr" }) });
  assert.ok(codes(actionFindings(changed, 1)).includes("unexpected-locale"));
});
test("identity ignores active focus", () => {
  assert.equal(sameIdentity(screen(), screen({ activeId: null })), true);
});
test("identity includes locale", () => {
  assert.equal(sameIdentity(screen(), screen({ locale: "fr" })), false);
});
test("identity includes connectivity", () => {
  assert.equal(sameIdentity(screen(), screen({ connectivity: "offline" })), false);
});
test("trace catches disconnected step", () => {
  const items = traceFindings({ name: "One", initial: screen(), steps: [step({ before: screen({ route: "/help" }) })] });
  assert.ok(codes(items).includes("trace-disconnected"));
});
test("trace includes its final state findings", () => {
  const items = traceFindings({ name: "One", initial: screen(), steps: [step({ after: screen({ heading: "" }) })] });
  assert.ok(codes(items).includes("heading-empty"));
});
for (const routes of [["/"], ["/", "/help"], ["/", "/help", "/places"]]) {
  test(`matrix expands ${routes.length} routes to eight cells each`, () => {
    assert.equal(coverageMatrix(routes).length, routes.length * 8);
  });
  test(`complete matrix for ${routes.length} routes passes`, () => {
    const matrix = coverageMatrix(routes);
    assert.deepEqual(coverageFindings(matrix, matrix), []);
  });
  test(`missing matrix cell for ${routes.length} routes fails`, () => {
    const matrix = coverageMatrix(routes);
    assert.ok(codes(coverageFindings(matrix, matrix.slice(1))).includes("matrix-missing"));
  });
}
test("coverage keys distinguish locale", () => {
  assert.notEqual(coverageKey(coverageMatrix(["/"])[0]), coverageKey(coverageMatrix(["/"])[4]));
});
test("coverage duplicate is diagnosed", () => {
  const matrix = coverageMatrix(["/"]);
  assert.ok(codes(coverageFindings(matrix, [...matrix, matrix[0]])).includes("matrix-duplicate"));
});
test("unexpected coverage cell is diagnosed", () => {
  const matrix = coverageMatrix(["/"]);
  assert.ok(codes(coverageFindings(matrix, [...matrix, { ...matrix[0], route: "/else" }])).includes("matrix-unexpected"));
});
test("route inventory rejects duplicate", () => {
  assert.ok(codes(inventoryFindings(["/", "/"])).includes("inventory-duplicate"));
});
test("route inventory rejects unsafe entry", () => {
  assert.ok(codes(inventoryFindings(["//host"])).includes("inventory-invalid"));
});
test("route inventory diagnoses noncanonical path", () => {
  assert.ok(codes(inventoryFindings(["/help/"])).includes("inventory-noncanonical"));
});
test("route inventory handles no entries", () => {
  assert.ok(codes(inventoryFindings([])).includes("inventory-empty"));
});
