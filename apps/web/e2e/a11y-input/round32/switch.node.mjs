import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SWITCH_ACTIONS, SWITCH_STATES, SWITCH_MODES, SWITCH_KEYS,
  objectRecord, safeIdentifier, hasControlCode, safeCopy,
  normalizeControl, auditControls, eligibleControls, groupControls,
  validateConfig, normalizeConfig, createScan, currentControl,
  currentGroup, applySwitch, replaySwitch, scanSummary,
  scanAnnouncement, auditScanState, explicitDecision,
} from "./switch-model.mjs";
import { copy, control, controls, codes, deepCopy } from "./fixtures.node.mjs";

const baseline = () => controls();
const next = (actions) => replaySwitch(baseline(), actions);
const codeSet = (values) => new Set(codes(values));

test("switch actions include every supported explicit input", () => {
  assert.deepEqual(SWITCH_ACTIONS, ["ADVANCE", "SELECT", "BACK", "CANCEL", "RESET"]);
});
test("switch state vocabulary includes unknown", () => {
  assert.deepEqual(SWITCH_STATES, ["IDLE", "SCANNING", "SELECTED", "UNKNOWN"]);
});
test("switch scan modes remain explicit", () => {
  assert.deepEqual(SWITCH_MODES, ["linear", "grouped", "row-column"]);
});
test("keyboard fallback keys are represented", () => {
  assert.deepEqual(SWITCH_KEYS, ["Enter", "Space", "ArrowRight", "ArrowLeft", "Escape"]);
});
test("switch action vocabulary is frozen", () => {
  assert.equal(Object.isFrozen(SWITCH_ACTIONS), true);
});
test("scan state vocabulary is frozen", () => {
  assert.equal(Object.isFrozen(SWITCH_STATES), true);
});
test("ordinary objects are accepted", () => {
  assert.equal(objectRecord({ ok: true }), true);
});
test("objects without a prototype are accepted", () => {
  assert.equal(objectRecord(Object.create(null)), true);
});
for (const value of [null, undefined, 3, "text", [], false]) {
  test(`non-records are rejected: ${String(value)}`, () => {
    assert.equal(objectRecord(value), false);
  });
}
for (const id of ["one", "one-two", "a23", "a", "entry-button"]) {
  test(`canonical identifier accepted: ${id}`, () => {
    assert.equal(safeIdentifier(id), true);
  });
}
for (const id of ["", "Invalid", "two words", "a_b", "a.b", "1first", "x".repeat(97)]) {
  test(`bad identifier rejected: ${id.slice(0, 10)}`, () => {
    assert.equal(safeIdentifier(id), false);
  });
}
test("control-code scanner rejects ASCII null", () => {
  assert.equal(hasControlCode("a\u0000b"), true);
});
test("control-code scanner rejects ASCII DEL", () => {
  assert.equal(hasControlCode("a\u007fb"), true);
});
test("control-code scanner accepts ordinary French copy", () => {
  assert.equal(hasControlCode("Entrée sans marches"), false);
});
test("control-code scanner rejects non-string", () => {
  assert.equal(hasControlCode(null), true);
});
test("safe copy trims only for validation", () => {
  assert.equal(safeCopy("  Label  "), true);
});
test("safe copy rejects whitespace", () => {
  assert.equal(safeCopy("   "), false);
});
test("safe copy rejects over limit", () => {
  assert.equal(safeCopy("a".repeat(241)), false);
});
test("safe copy allows exact length limit", () => {
  assert.equal(safeCopy("a".repeat(240)), true);
});
test("normal control retains language labels", () => {
  assert.deepEqual(normalizeControl(control()).label, copy());
});
test("normal control is immutable", () => {
  assert.equal(Object.isFrozen(normalizeControl(control())), true);
});
test("normal control label is immutable", () => {
  assert.equal(Object.isFrozen(normalizeControl(control()).label), true);
});
test("invalid identifier fails normalization", () => {
  assert.equal(normalizeControl(control({ id: "bad id" })), null);
});
test("unknown role fails normalization", () => {
  assert.equal(normalizeControl(control({ role: "random" })), null);
});
test("invalid tab index fails normalization", () => {
  assert.equal(normalizeControl(control({ tabIndex: "zero" })), null);
});
test("invalid bilingual text fails normalization", () => {
  assert.equal(normalizeControl(control({ label: { en: "Ready" } })), null);
});
test("missing group fails normalization", () => {
  assert.equal(normalizeControl(control({ group: null })), null);
});
test("empty control set has no findings", () => {
  assert.deepEqual(auditControls([]), []);
});
test("valid controls have no findings", () => {
  assert.deepEqual(auditControls(baseline()), []);
});
test("non-array controls fail closed", () => {
  assert.ok(codeSet(auditControls(null)).has("controls.array"));
});
test("invalid element is reported", () => {
  assert.ok(codeSet(auditControls([null])).has("control.object"));
});
test("duplicate identifier is reported", () => {
  assert.ok(codeSet(auditControls([control(), control()])).has("control.duplicate"));
});
test("missing language is reported", () => {
  assert.ok(codeSet(auditControls([control({ label: { en: "Hello" } })])).has("control.label-fr"));
});
test("invalid group is reported", () => {
  assert.ok(codeSet(auditControls([control({ group: "bad group" })])).has("control.group"));
});
test("unknown role is reported", () => {
  assert.ok(codeSet(auditControls([control({ role: "unknown" })])).has("control.role"));
});
test("positive tabindex is rejected", () => {
  assert.ok(codeSet(auditControls([control({ tabIndex: 1 })])).has("control.tab-index"));
});
test("disabled controls cannot be in the Tab sequence", () => {
  assert.ok(codeSet(auditControls([control({ disabled: true })])).has("control.disabled-focus"));
});
test("inert controls cannot be in the Tab sequence", () => {
  assert.ok(codeSet(auditControls([control({ inert: true })])).has("control.inactive-focus"));
});
test("hidden controls cannot be in the Tab sequence", () => {
  assert.ok(codeSet(auditControls([control({ hidden: true })])).has("control.inactive-focus"));
});
test("disabled controls are filtered from candidates", () => {
  assert.equal(eligibleControls([control({ disabled: true })]).length, 0);
});
test("inert controls are filtered from candidates", () => {
  assert.equal(eligibleControls([control({ inert: true })]).length, 0);
});
test("hidden controls are filtered from candidates", () => {
  assert.equal(eligibleControls([control({ hidden: true })]).length, 0);
});
test("three valid controls remain eligible", () => {
  assert.equal(eligibleControls(baseline()).length, 3);
});
test("grouping preserves first-seen order", () => {
  assert.deepEqual(groupControls(baseline()).map((group) => group.id), ["main", "footer"]);
});
test("grouping includes two controls in the main group", () => {
  assert.equal(groupControls(baseline())[0].controls.length, 2);
});
test("grouping omits inactive controls", () => {
  assert.deepEqual(groupControls([control({ hidden: true, tabIndex: -1 })]), []);
});
test("default configuration is valid", () => {
  assert.deepEqual(validateConfig(normalizeConfig()), []);
});
test("configuration exposes linear mode by default", () => {
  assert.equal(normalizeConfig().mode, "linear");
});
test("configuration enables wrapping by default", () => {
  assert.equal(normalizeConfig().wrap, true);
});
test("configuration has finite action bound", () => {
  assert.equal(normalizeConfig().maxActions, 512);
});
test("configuration is immutable", () => {
  assert.equal(Object.isFrozen(normalizeConfig()), true);
});
for (const field of ["mode", "wrap", "maxActions", "announce"]) {
  test(`invalid configuration property is rejected: ${field}`, () => {
    assert.ok(validateConfig({ ...normalizeConfig(), [field]: null }).length > 0);
  });
}
test("invalid config throws", () => {
  assert.throws(() => normalizeConfig({ mode: "automatic" }), TypeError);
});
test("invalid inputs generate UNKNOWN scan", () => {
  assert.equal(createScan([control(), control()]).status, "UNKNOWN");
});
test("empty controls generate UNKNOWN scan", () => {
  assert.equal(createScan([]).status, "UNKNOWN");
});
test("valid controls begin idle", () => {
  assert.equal(createScan(baseline()).status, "IDLE");
});
test("idle scan has no selection", () => {
  assert.equal(createScan(baseline()).selected, null);
});
test("idle scan has no focused control", () => {
  assert.equal(currentControl(createScan(baseline())), null);
});
test("idle scan has no active group", () => {
  assert.equal(currentGroup(createScan(baseline())), null);
});
test("one advance focuses first control", () => {
  assert.equal(currentControl(next(["ADVANCE"]))?.id, "first");
});
test("two advances focus second control", () => {
  assert.equal(currentControl(next(["ADVANCE", "ADVANCE"]))?.id, "second");
});
test("three advances focus third control", () => {
  assert.equal(currentControl(next(["ADVANCE", "ADVANCE", "ADVANCE"]))?.id, "third");
});
test("wrapped advance returns first control", () => {
  assert.equal(currentControl(next(["ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE"]))?.id, "first");
});
test("advance enters scanning state", () => {
  assert.equal(next(["ADVANCE"]).status, "SCANNING");
});
test("back moves to previous control", () => {
  assert.equal(currentControl(next(["ADVANCE", "ADVANCE", "BACK"]))?.id, "first");
});
test("back wraps to final control", () => {
  assert.equal(currentControl(next(["BACK"]))?.id, "third");
});
test("disabled wrapping holds at final control", () => {
  assert.equal(currentControl(replaySwitch(baseline(), ["ADVANCE", "ADVANCE", "ADVANCE", "ADVANCE"], { wrap: false }))?.id, "third");
});
test("disabled wrapping holds at first control going back", () => {
  assert.equal(currentControl(replaySwitch(baseline(), ["ADVANCE", "BACK"], { wrap: false }))?.id, "first");
});
test("select records the target", () => {
  assert.equal(next(["ADVANCE", "SELECT"]).selected, "first");
});
test("select enters selected state", () => {
  assert.equal(next(["ADVANCE", "SELECT"]).status, "SELECTED");
});
test("select before advance does nothing", () => {
  assert.equal(next(["SELECT"]).status, "IDLE");
});
test("cancel returns to idle state", () => {
  assert.equal(next(["ADVANCE", "CANCEL"]).status, "IDLE");
});
test("cancel clears active cursor", () => {
  assert.equal(next(["ADVANCE", "CANCEL"]).cursor, -1);
});
test("cancel clears selection", () => {
  assert.equal(next(["ADVANCE", "SELECT", "CANCEL"]).selected, null);
});
test("reset returns initial state", () => {
  assert.equal(next(["ADVANCE", "SELECT", "RESET"]).actions, 0);
});
test("unknown action is ignored", () => {
  const first = createScan(baseline());
  assert.equal(applySwitch(first, "PRESS"), first);
});
test("state tracks explicit action count", () => {
  assert.equal(next(["ADVANCE", "ADVANCE", "BACK"]).actions, 3);
});
test("action cap transitions to unknown", () => {
  const state = replaySwitch(baseline(), ["ADVANCE", "ADVANCE"], { maxActions: 1 });
  assert.equal(state.status, "UNKNOWN");
});
test("unknown state cannot return ready via select", () => {
  const state = replaySwitch([control(), control()], ["ADVANCE", "SELECT"]);
  assert.equal(state.status, "UNKNOWN");
});
test("group cursor tracks main", () => {
  assert.equal(currentGroup(next(["ADVANCE"]))?.id, "main");
});
test("group cursor tracks footer", () => {
  assert.equal(currentGroup(next(["ADVANCE", "ADVANCE", "ADVANCE"]))?.id, "footer");
});
test("state remains immutable across events", () => {
  const first = createScan(baseline());
  applySwitch(first, "ADVANCE");
  assert.equal(first.cursor, -1);
});
test("event replay preserves supplied controls", () => {
  const items = baseline();
  const saved = deepCopy(items);
  replaySwitch(items, ["ADVANCE", "SELECT"]);
  assert.deepEqual(items, saved);
});
test("event history contains actual actions", () => {
  assert.deepEqual(next(["ADVANCE", "SELECT"]).history.map((entry) => entry.action), ["ADVANCE", "SELECT"]);
});
test("scan summary reports selection", () => {
  assert.equal(scanSummary(next(["ADVANCE", "SELECT"])).selected, "first");
});
test("scan summary reports unknown", () => {
  assert.equal(scanSummary(null).status, "UNKNOWN");
});
test("English announcement uses English label", () => {
  assert.equal(scanAnnouncement(next(["ADVANCE"]), "en"), "First");
});
test("French announcement uses French label", () => {
  assert.equal(scanAnnouncement(next(["ADVANCE"]), "fr"), "Premier");
});
test("unsupported language remains UNKNOWN", () => {
  assert.equal(scanAnnouncement(next(["ADVANCE"]), "de"), "UNKNOWN");
});
test("unavailable scan remains UNKNOWN", () => {
  assert.equal(scanAnnouncement(createScan([]), "en"), "UNKNOWN");
});
test("valid state has no findings", () => {
  assert.deepEqual(auditScanState(next(["ADVANCE", "SELECT"])), []);
});
test("invalid state is reported", () => {
  assert.ok(codeSet(auditScanState(null)).has("state.object"));
});
test("invalid cursor is reported", () => {
  assert.ok(codeSet(auditScanState({ ...next(["ADVANCE"]), cursor: 99 })).has("state.cursor"));
});
test("selected state without target is rejected", () => {
  assert.ok(codeSet(auditScanState({ ...next(["ADVANCE", "SELECT"]), selected: null })).has("state.selection"));
});
test("ready decision requires selected target", () => {
  assert.equal(explicitDecision(next(["ADVANCE", "SELECT"])).decision, "READY");
});
test("idle state is held", () => {
  assert.equal(explicitDecision(createScan(baseline())).decision, "HOLD");
});
test("unknown scan remains UNKNOWN", () => {
  assert.equal(explicitDecision(createScan([])).decision, "UNKNOWN");
});
test("invalid state is held", () => {
  assert.equal(explicitDecision(null).decision, "HOLD");
});
test("event list must be bounded", () => {
  assert.throws(() => replaySwitch(baseline(), Array(4097).fill("ADVANCE")), TypeError);
});
test("event list must be an array", () => {
  assert.throws(() => replaySwitch(baseline(), null), TypeError);
});
