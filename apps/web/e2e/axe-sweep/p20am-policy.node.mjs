import test from "node:test";
import assert from "node:assert/strict";
import {
  controlFindings, dialogFindings, announcementFindings, resourceFindings,
  screenFindings, transitionFindings, traceFindings, traceOutcome,
  replaySequence, replayFromKinds, compareTraceFindings,
} from "./p20am-policy.ts";
import {
  MAX_PRECACHE_FILE_BYTES, sampleControl, sampleAnnouncement, sampleResource,
  sampleScreen, sampleRecord, sampleAction, finding,
} from "./p20am-model.ts";
const rules = (items) => items.map((item) => item.rule);
const controls = (changes = {}) => [sampleControl(changes)];
const action = (changes = {}) => sampleAction(changes);

test("single 44px named and visible button is acceptable", () => {
  assert.deepEqual(controlFindings(controls(), "search"), []);
});
for (const [changes, expected] of [
  [{ id: "" }, "control-id-empty"],
  [{ name: "" }, "control-name-UNKNOWN"],
  [{ name: "Inconnu" }, "control-name-UNKNOWN"],
  [{ tabIndex: -2 }, "control-tabindex-invalid"],
  [{ tabIndex: 1.5 }, "control-tabindex-invalid"],
  [{ tabIndex: 1 }, "control-positive-tabindex"],
  [{ width: 43 }, "control-width"],
  [{ width: -1 }, "control-width"],
  [{ width: NaN }, "control-width"],
  [{ height: 43 }, "control-height"],
  [{ height: Infinity }, "control-height"],
  [{ width: null }, "control-size-UNKNOWN"],
  [{ height: null }, "control-size-UNKNOWN"],
  [{ focusVisible: false }, "focus-ring-hidden"],
  [{ inert: true }, "focus-unavailable"],
  [{ disabled: true }, "focus-unavailable"],
  [{ visible: false }, "focus-unavailable"],
]) {
  test(`control finding ${expected} for ${JSON.stringify(changes)}`, () => {
    assert.ok(rules(controlFindings(controls(changes), "search", 4)).includes(expected));
  });
}
test("duplicate control identifiers are not silently merged", () => {
  assert.ok(rules(controlFindings([sampleControl(), sampleControl()], "search"))
    .includes("control-id-duplicate"));
});
test("missing focus is a failure rather than a guessed target", () => {
  assert.ok(rules(controlFindings(controls(), "missing")).includes("focus-target-missing"));
});
test("unfocused disabled controls do not make keyboard claims", () => {
  assert.deepEqual(controlFindings(controls({ disabled: true }), null), []);
});
test("control with unknown measured dimensions is explicitly informational", () => {
  const issue = controlFindings(controls({ width: null }), null)
    .find((entry) => entry.rule === "control-size-UNKNOWN");
  assert.equal(issue?.severity, "information");
});
test("screen without dialog has no dialog findings", () => {
  assert.deepEqual(dialogFindings(sampleScreen()), []);
});
test("modal with a focused in-dialog control is valid", () => {
  const s = sampleScreen({ activeDialog: "dialog", focusId: "close",
    controls: [sampleControl({ id: "close", name: "Close", parentDialog: "dialog" })] });
  assert.deepEqual(dialogFindings(s), []);
});
test("dialog focus outside is detected", () => {
  const s = sampleScreen({ activeDialog: "dialog" });
  assert.ok(rules(dialogFindings(s)).includes("dialog-focus-outside"));
});
test("dialog background controls must not remain in tab sequence", () => {
  const s = sampleScreen({ activeDialog: "dialog", focusId: "close", controls: [
    sampleControl({ id: "close", parentDialog: "dialog" }), sampleControl({ id: "outside" }),
  ] });
  assert.ok(rules(dialogFindings(s)).includes("dialog-background-focusable"));
});
test("dialog requires an operable control", () => {
  const s = sampleScreen({ activeDialog: "dialog", controls: [] });
  assert.ok(rules(dialogFindings(s)).includes("dialog-no-operable-control"));
});
test("inert background control is not an active dialog leak", () => {
  const s = sampleScreen({ activeDialog: "dialog", focusId: "close", controls: [
    sampleControl({ id: "close", parentDialog: "dialog" }), sampleControl({ id: "outside", inert: true }),
  ] });
  assert.deepEqual(dialogFindings(s), []);
});
test("a single relevant live message is acceptable", () => {
  assert.deepEqual(announcementFindings([sampleAnnouncement()], "ready", "en"), []);
});
for (const [change, expected] of [
  [{ id: "status", text: "" }, "live-region-empty"],
  [{ language: "fr" }, "live-region-language"],
  [{ eventAt: -1 }, "live-region-time-UNKNOWN"],
  [{ eventAt: NaN }, "live-region-time-UNKNOWN"],
]) {
  test(`announcement issue ${expected} is reported`, () => {
    assert.ok(rules(announcementFindings([sampleAnnouncement(change)], "ready", "en"))
      .includes(expected));
  });
}
test("two regions with same identifier are detected", () => {
  assert.ok(rules(announcementFindings([sampleAnnouncement(), sampleAnnouncement()], "ready", "en"))
    .includes("live-region-id-duplicate"));
});
test("duplicate spoken content under different IDs remains a warning", () => {
  const items = [sampleAnnouncement(), sampleAnnouncement({ id: "other" })];
  assert.ok(rules(announcementFindings(items, "ready", "en")).includes("live-region-duplicate-message"));
});
test("loading phase without a busy announcement is diagnosed", () => {
  assert.ok(rules(announcementFindings([], "loading", "en")).includes("loading-not-busy"));
});
test("loading phase with busy status is diagnosed independently of text", () => {
  assert.deepEqual(announcementFindings([sampleAnnouncement({ busy: true })], "loading", "en"), []);
});
for (const phase of ["empty", "error", "fallback"]) {
  test(`${phase} outcome must not be silent`, () => {
    assert.ok(rules(announcementFindings([], phase, "en")).includes("outcome-silent"));
  });
}
test("off live region does not count as accessible outcome feedback", () => {
  const s = [sampleAnnouncement({ politeness: "off" })];
  assert.ok(rules(announcementFindings(s, "error", "en")).includes("outcome-silent"));
});
test("a fresh cached required asset supports an offline route", () => {
  assert.deepEqual(resourceFindings([sampleResource()], "offline"), []);
});
for (const [change, rule] of [
  [{ path: "//host" }, "resource-path-unsafe"],
  [{ cached: "present", bytes: MAX_PRECACHE_FILE_BYTES + 1 }, "resource-file-budget"],
  [{ bytes: null }, "resource-bytes-UNKNOWN"],
  [{ bytes: NaN }, "resource-bytes-UNKNOWN"],
  [{ bytes: -2 }, "resource-bytes-UNKNOWN"],
  [{ fallback: "https://outside.test" }, "resource-fallback-unsafe"],
  [{ cached: "absent" }, "resource-offline-unavailable"],
  [{ cached: "UNKNOWN" }, "resource-offline-UNKNOWN"],
  [{ cached: "stale" }, "resource-stale"],
  [{ network: "succeeded" }, "resource-network-contradiction"],
]) {
  test(`offline resource issue ${rule} for ${JSON.stringify(change)}`, () => {
    assert.ok(rules(resourceFindings([sampleResource(change)], "offline")).includes(rule));
  });
}
test("a safe fallback satisfies the availability requirement", () => {
  const r = sampleResource({ cached: "absent", fallback: "/offline" });
  assert.ok(!rules(resourceFindings([r], "offline")).includes("resource-offline-unavailable"));
});
test("optional asset absence does not block an offline route", () => {
  const r = sampleResource({ required: false, cached: "absent" });
  assert.deepEqual(resourceFindings([r], "offline"), []);
});
test("duplicate resource paths are detected", () => {
  assert.ok(rules(resourceFindings([sampleResource(), sampleResource()], "online"))
    .includes("resource-duplicate"));
});
test("oversized total cached payload is flagged", () => {
  const resources = Array.from({ length: 17 }, (_, index) =>
    sampleResource({ path: `/asset-${index}`, bytes: MAX_PRECACHE_FILE_BYTES }));
  assert.ok(rules(resourceFindings(resources, "online")).includes("resource-total-budget"));
});
test("offline screen baseline does not depend on external resources", () => {
  assert.deepEqual(screenFindings(sampleScreen({ connection: "offline" })), []);
});
for (const [change, rule] of [
  [{ route: "//host" }, "screen-route-invalid"],
  [{ title: "" }, "screen-title-empty"],
  [{ heading: "" }, "screen-heading-empty"],
  [{ mainCount: 0 }, "screen-main-count"],
  [{ mainCount: 2 }, "screen-main-count"],
  [{ historyIndex: -1 }, "screen-history-invalid"],
  [{ historyIndex: 1.5 }, "screen-history-invalid"],
  [{ scrollY: -1 }, "screen-scroll-invalid"],
  [{ capturedAt: NaN }, "screen-time-invalid"],
]) {
  test(`screen-level finding ${rule} has stable code`, () => {
    assert.ok(rules(screenFindings(sampleScreen(change))).includes(rule));
  });
}
test("record findings are included in full-screen policy", () => {
  const s = sampleScreen({ records: [sampleRecord({ declared: "KNOWN" })] });
  assert.ok(rules(screenFindings(s)).includes("record-known-overclaim"));
});
test("screen-level reporting also includes resource findings", () => {
  const s = sampleScreen({ resources: [sampleResource({ path: "//outside" })] });
  assert.ok(rules(screenFindings(s)).includes("resource-path-unsafe"));
});
for (const [change, rule] of [
  [{ after: sampleScreen() }, "disconnect-unobserved"],
  [{ kind: "reconnect", after: sampleScreen({ connection: "UNKNOWN" }) }, "reconnect-unobserved"],
  [{ kind: "language" }, "language-unchanged"],
  [{ kind: "search", after: sampleScreen({ outcome: "idle" }) }, "search-no-state"],
  [{ kind: "clear", after: sampleScreen({ outcome: "loading" }) }, "clear-triggered-load"],
  [{ kind: "retry" }, "retry-without-failure"],
  [{ kind: "open" }, "dialog-not-opened"],
  [{ kind: "close", after: sampleScreen({ activeDialog: "dialog" }) }, "dialog-not-closed"],
  [{ kind: "navigate", targetRoute: "/help" }, "navigation-wrong-route"],
  [{ preserveFocus: true, after: sampleScreen({ connection: "offline", focusId: null }) }, "action-focus-lost"],
]) {
  test(`action policy flags ${rule}`, () => {
    assert.ok(rules(transitionFindings(action(change))).includes(rule));
  });
}
test("valid disconnection changes online to offline", () => {
  assert.deepEqual(transitionFindings(action()), []);
});
test("valid language transition preserves route and changes locale", () => {
  assert.deepEqual(transitionFindings(action({ kind: "language",
    after: sampleScreen({ language: "fr" }) })), []);
});
test("preserving action detects lost source record", () => {
  const before = sampleScreen({ records: [sampleRecord()] });
  const after = sampleScreen({ connection: "offline", records: [] });
  assert.ok(rules(transitionFindings(action({ before, after }))).includes("record-lost"));
});
test("non-preserving search may replace the result set", () => {
  const before = sampleScreen({ records: [sampleRecord()] });
  const after = sampleScreen({ outcome: "empty", records: [] });
  const issues = transitionFindings(action({ kind: "search", before, after, preserveRecords: false }));
  assert.ok(!rules(issues).includes("record-lost"));
});
test("a valid two-step trace retains history continuity", () => {
  const initial = sampleScreen();
  const after = sampleScreen({ connection: "offline" });
  const trace = replaySequence(initial, [action({ before: initial, after })]);
  assert.deepEqual(traceFindings(trace), []);
  assert.equal(traceOutcome(trace).outcome, "pass");
});
test("disconnected replay chain is an explicit finding", () => {
  const trace = replaySequence(sampleScreen(), [action({ before: sampleScreen({ route: "/help" }) })]);
  assert.ok(rules(traceFindings(trace)).includes("trace-chain-broken"));
});
test("trace with no identifier fails", () => {
  assert.ok(rules(traceFindings(replaySequence(sampleScreen(), [], ""))).includes("trace-id-empty"));
});
test("constructed offline then reconnect returns to online", () => {
  const trace = replayFromKinds(["disconnect", "reconnect"]);
  assert.equal(trace.actions[0]?.after.connection, "offline");
  assert.equal(trace.actions[1]?.after.connection, "online");
});
test("diff reports introduced and resolved problems", () => {
  const before = [finding("a", 1, "one"), finding("b", 1, "two")];
  const after = [finding("b", 1, "two"), finding("c", 2, "three")];
  const diff = compareTraceFindings(before, after);
  assert.deepEqual(diff.introduced, [after[1]]);
  assert.deepEqual(diff.resolved, [before[0]]);
  assert.deepEqual(diff.retained, [after[0]]);
});
