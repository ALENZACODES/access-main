import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INPUT_METHODS, NAVIGATION_KEYS, ACTIVATION_KEYS, COMPOSITES, RESTORE_STATES,
  walkEntry, auditForwardWalk, auditReverseWalk, auditFocusGeometry,
  auditSwitchPath, auditComposite, expectedCompositeTarget,
  auditCompositeTransitions, auditDialogLifecycle, auditKeyboardCommands,
  summarizeFocusFindings,
} from "./focus.mjs";

const codes = (items) => items.map((item) => item.code);
const has = (items, code) => assert.ok(codes(items).includes(code), `${code} missing: ${JSON.stringify(codes(items))}`);
const step = (id, index, changes = {}) => ({ id, step: index, key: "Tab", visible: true, inside: true, ...changes });
const forward = () => [step("one", 0), step("two", 1), step("three", 2)];
const reverse = () => [step("two", 1, { key: "Shift+Tab" }), step("one", 2, { key: "Shift+Tab" })];
const geometry = (changes = {}) => ({ width: 44, height: 44, left: 10, top: 10, right: 54, viewportWidth: 1280, occluded: false, clipped: false, focusIndicator: true, inlineException: false, ...changes });
const switchStop = (changes = {}) => ({ id: "start", label: "Activate", disabled: false, hidden: false, requiresDrag: false, requiresMotion: false, requiresMultiPointer: false, alternative: false, action: "activate", interactive: true, timeoutOnly: false, ...changes });
const compositeItem = (id, tab = -1, selected = false, changes = {}) => ({ id, label: id, tabindex: tab, selected, disabled: false, hidden: false, ...changes });
const composite = (changes = {}) => ({ role: "tablist", model: "roving", items: [compositeItem("a", 0, true), compositeItem("b")], ...changes });
const dialog = (changes = {}) => ({ declared: true, opened: true, named: true, focusInside: true, tabContained: true, escapeClosed: true, focusReturned: true, interactiveCount: 2, modal: true, backgroundReachable: false, nestedModalCount: 1, ...changes });
const command = (changes = {}) => ({ key: "Enter", targetId: "button", focusedBefore: true, activated: true, destructive: false, confirmed: true, navigation: false, localTarget: true, ...changes });

test("input methods include keyboard", () => assert.ok(INPUT_METHODS.includes("keyboard")));
test("input methods include switch", () => assert.ok(INPUT_METHODS.includes("switch")));
test("navigation keys include reverse Tab", () => assert.ok(NAVIGATION_KEYS.includes("Shift+Tab")));
test("navigation keys include Home and End", () => assert.ok(NAVIGATION_KEYS.includes("Home") && NAVIGATION_KEYS.includes("End")));
test("activation keys include Enter and Space", () => assert.deepEqual(ACTIVATION_KEYS, ["Enter", "Space"]));
test("composite vocabulary includes tablist", () => assert.ok(COMPOSITES.includes("tablist")));
test("dialog restore states include unknown", () => assert.ok(RESTORE_STATES.includes("unknown")));
test("valid focus observation is normalised", () => assert.deepEqual(walkEntry(step("one", 0)), step("one", 0)));
for (const raw of [null, undefined, [], {}, { id: "", step: 0, key: "Tab", visible: true, inside: true }, { ...step("one", -1) }, { ...step("one", 0), key: "Enter" }, { ...step("one", 0), visible: "yes" }, { ...step("one", 0), inside: null }]) {
  test(`invalid focus observation rejected ${JSON.stringify(raw)}`, () => assert.equal(walkEntry(raw), null));
}
test("clean forward focus traversal passes", () => assert.deepEqual(auditForwardWalk(forward()), []));
test("clean reverse focus traversal passes", () => assert.deepEqual(auditReverseWalk(forward(), reverse()), []));
test("non-array walk fails closed", () => has(auditForwardWalk(null), "focus.walk-array"));
test("empty walk reports unavailable traversal", () => has(auditForwardWalk([]), "focus.walk-empty"));
test("maximum argument rejects negative", () => assert.throws(() => auditForwardWalk(forward(), { maximum: -1 }), TypeError));
test("maximum argument rejects excessive", () => assert.throws(() => auditForwardWalk(forward(), { maximum: 501 }), TypeError));
test("maximum argument rejects fractional", () => assert.throws(() => auditForwardWalk(forward(), { maximum: 1.5 }), TypeError));
test("bounded walk reports overflow", () => has(auditForwardWalk(forward(), { maximum: 2 }), "focus.walk-overflow"));
const forwardDefects = [
  ["out of order", [step("one", 1), step("two", 0)], "focus.step-order"],
  ["reverse key", [step("one", 0, { key: "Shift+Tab" })], "focus.forward-key"],
  ["hidden target", [step("one", 0, { visible: false })], "focus.hidden-target"],
  ["outside scope", [step("one", 0, { inside: false })], "focus.outside-scope"],
  ["repeat target", [step("one", 0), step("one", 1)], "focus.repeated-target"],
  ["invalid entry", [step("one", 0), null], "focus.walk-entry"],
];
for (const [name, observations, code] of forwardDefects) {
  test(`forward focus ${name} fails with ${code}`, () => has(auditForwardWalk(observations), code));
}
test("reverse input requires two arrays", () => has(auditReverseWalk(null, []), "focus.reverse-input"));
test("reverse input requires valid observation array", () => has(auditReverseWalk([], null), "focus.reverse-input"));
test("wrong reverse length is detected", () => has(auditReverseWalk(forward(), reverse().slice(0, 1)), "focus.reverse-length"));
test("wrong reverse order is detected", () => has(auditReverseWalk(forward(), [...reverse()].reverse()), "focus.reverse-order"));
test("reverse key must be Shift+Tab", () => has(auditReverseWalk(forward(), reverse().map((x) => ({ ...x, key: "Tab" }))), "focus.reverse-key"));
test("single focus target requires empty reverse observations", () => assert.deepEqual(auditReverseWalk([step("one", 0)], []), []));
test("clean 44 CSS pixel target passes", () => assert.deepEqual(auditFocusGeometry([geometry()]), []));
test("geometry requires an array", () => has(auditFocusGeometry(null), "geometry.array"));
const geometryDefects = [
  ["null record", null, "geometry.object"],
  ["NaN width", geometry({ width: NaN }), "geometry.dimensions"],
  ["infinite height", geometry({ height: Infinity }), "geometry.dimensions"],
  ["zero width", geometry({ width: 0 }), "geometry.empty-target"],
  ["zero height", geometry({ height: 0 }), "geometry.empty-target"],
  ["occluded", geometry({ occluded: true }), "geometry.occluded"],
  ["clipped", geometry({ clipped: true }), "geometry.clipped"],
  ["missing outline", geometry({ focusIndicator: false }), "geometry.no-indicator"],
  ["small target", geometry({ width: 20, height: 20 }), "geometry.small-target"],
  ["right overflow", geometry({ right: 1300 }), "geometry.horizontal-overflow"],
  ["negative x", geometry({ left: -5 }), "geometry.negative-location"],
  ["negative y", geometry({ top: -5 }), "geometry.negative-location"],
];
for (const [name, observation, code] of geometryDefects) {
  test(`geometry ${name} reports ${code}`, () => has(auditFocusGeometry([observation]), code));
}
test("small inline text link can use the inline exception", () => assert.equal(codes(auditFocusGeometry([geometry({ width: 18, height: 18, inlineException: true })])).includes("geometry.small-target"), false));
test("clean switch route passes", () => assert.deepEqual(auditSwitchPath({ stops: [switchStop()] }), []));
test("switch route requires an object", () => has(auditSwitchPath(null), "switch.object"));
test("switch route requires stops", () => has(auditSwitchPath({}), "switch.stops"));
test("empty switch route is detectable", () => has(auditSwitchPath({ stops: [] }), "switch.empty"));
test("too many stops is bounded", () => has(auditSwitchPath({ stops: Array.from({ length: 201 }, (_, i) => switchStop({ id: `s-${i}` })) }), "switch.too-many-stops"));
const switchDefects = [
  ["duplicate", [switchStop(), switchStop()], "switch.duplicate-stop"],
  ["invalid", [switchStop(), null], "switch.invalid-stop"],
  ["disabled", [switchStop({ disabled: true })], "switch.disabled-stop"],
  ["hidden", [switchStop({ hidden: true })], "switch.hidden-stop"],
  ["drag without alternative", [switchStop({ requiresDrag: true })], "switch.no-drag-alternative"],
  ["motion without alternative", [switchStop({ requiresMotion: true })], "switch.no-motion-alternative"],
  ["multi pointer without alternative", [switchStop({ requiresMultiPointer: true })], "switch.no-single-pointer"],
  ["no activation", [switchStop({ action: "none" })], "switch.no-activation"],
  ["unusable", [switchStop({ action: "none" })], "switch.unusable-control"],
  ["timeout", [switchStop({ timeoutOnly: true })], "switch.time-limited"],
  ["unnamed", [switchStop({ label: "" })], "switch.unnamed-stop"],
];
for (const [name, stops, code] of switchDefects) {
  test(`switch ${name} reports ${code}`, () => has(auditSwitchPath({ stops }), code));
}
test("drag operation with alternative is not marked unavailable", () => assert.equal(codes(auditSwitchPath({ stops: [switchStop({ requiresDrag: true, alternative: true })] })).includes("switch.no-drag-alternative"), false));
test("clean tablist passes", () => assert.deepEqual(auditComposite(composite()), []));
test("composite requires object", () => has(auditComposite(null), "composite.object"));
test("composite requires item array", () => has(auditComposite({ role: "tablist" }), "composite.items"));
const compositeDefects = [
  ["role", { role: "unknown" }, "composite.role"],
  ["empty", { items: [] }, "composite.empty"],
  ["missing ID", { items: [compositeItem("", 0, true)] }, "composite.item-id"],
  ["duplicate ID", { items: [compositeItem("a", 0, true), compositeItem("a")] }, "composite.duplicate-id"],
  ["missing name", { items: [compositeItem("a", 0, true, { label: "" })] }, "composite.unnamed-item"],
  ["bad tabindex", { items: [compositeItem("a", 2, true)] }, "composite.invalid-tabindex"],
  ["two roving stops", { items: [compositeItem("a", 0, true), compositeItem("b", 0)] }, "composite.roving-count"],
  ["missing roving stop", { items: [compositeItem("a", -1, true), compositeItem("b")] }, "composite.roving-count"],
  ["disabled stop", { items: [compositeItem("a", 0, true, { disabled: true })] }, "composite.disabled-tabstop"],
  ["hidden stop", { items: [compositeItem("a", 0, true, { hidden: true })] }, "composite.hidden-tabstop"],
  ["selected count", { items: [compositeItem("a", 0), compositeItem("b")] }, "composite.selection-count"],
  ["orientation", { orientation: "diagonal" }, "composite.orientation"],
  ["missing active", { model: "active-descendant", activeId: "missing", items: [compositeItem("a", -1, true)] }, "composite.active-id"],
  ["unfocusable owner", { model: "active-descendant", activeId: "a", ownerFocusable: false, items: [compositeItem("a", -1, true)] }, "composite.owner-unfocusable"],
  ["descendant tab stop", { model: "active-descendant", activeId: "a", ownerFocusable: true }, "composite.descendant-tabstop"],
  ["tree level", { role: "tree", items: [compositeItem("a", 0, true, { level: 0 })] }, "composite.tree-level"],
  ["position", { role: "tree", items: [compositeItem("a", 0, true, { posinset: -1 })] }, "composite.position"],
];
for (const [name, changes, code] of compositeDefects) {
  test(`composite ${name} reports ${code}`, () => has(auditComposite(composite(changes)), code));
}
test("active descendant with focusable owner passes", () => assert.deepEqual(auditComposite(composite({ model: "active-descendant", ownerFocusable: true, activeId: "a", items: [compositeItem("a", -1, true), compositeItem("b")] })), []));
const state = { items: [compositeItem("a"), compositeItem("b"), compositeItem("c")], activeId: "a" };
const expectedTargets = [["Home", "a"], ["End", "c"], ["ArrowDown", "b"], ["ArrowRight", "b"], ["ArrowUp", "c"], ["ArrowLeft", "c"]];
for (const [key, target] of expectedTargets) {
  test(`${key} resolves to correct composite target`, () => assert.equal(expectedCompositeTarget(state, key), target));
}
test("unknown composite key has no proposed target", () => assert.equal(expectedCompositeTarget(state, "PageUp"), null));
test("disabled item is skipped by arrows", () => assert.equal(expectedCompositeTarget({ ...state, items: [compositeItem("a"), compositeItem("b", -1, false, { disabled: true }), compositeItem("c")] }, "ArrowRight"), "c"));
test("hidden item is skipped by arrows", () => assert.equal(expectedCompositeTarget({ ...state, items: [compositeItem("a"), compositeItem("b", -1, false, { hidden: true }), compositeItem("c")] }, "ArrowRight"), "c"));
test("composite transition observes target", () => assert.deepEqual(auditCompositeTransitions([{ key: "ArrowRight", to: "b" }], state), []));
test("wrong arrow target fails", () => has(auditCompositeTransitions([{ key: "ArrowRight", to: "c" }], state), "composite.wrong-target"));
test("unknown target fails", () => has(auditCompositeTransitions([{ key: "ArrowRight", to: "missing" }], state), "composite.target-absent"));
test("unsupported event fails", () => has(auditCompositeTransitions([{ key: "Tab", to: "b" }], state), "composite.unsupported-key"));
test("invalid event fails", () => has(auditCompositeTransitions([null], state), "composite.invalid-event"));
test("invalid transition input fails", () => has(auditCompositeTransitions(null, state), "composite.transitions"));
test("valid dialog lifecycle passes", () => assert.deepEqual(auditDialogLifecycle(dialog()), []));
const dialogDefects = [
  ["opener", { declared: false }, "dialog.undeclared-opener"],
  ["not opened", { opened: false }, "dialog.not-opened"],
  ["no name", { named: false }, "dialog.unnamed"],
  ["outside focus", { focusInside: false }, "dialog.focus-outside"],
  ["escaped tab", { tabContained: false }, "dialog.tab-escaped"],
  ["escape not closed", { escapeClosed: false }, "dialog.escape-failed"],
  ["focus not restored", { focusReturned: false }, "dialog.focus-not-restored"],
  ["no controls", { interactiveCount: 0 }, "dialog.no-controls"],
  ["background reachable", { backgroundReachable: true }, "dialog.background-reachable"],
  ["multiple modals", { nestedModalCount: 2 }, "dialog.multiple-modal"],
];
for (const [name, changes, code] of dialogDefects) {
  test(`dialog ${name} reports ${code}`, () => has(auditDialogLifecycle(dialog(changes)), code));
}
test("valid Enter command passes", () => assert.deepEqual(auditKeyboardCommands([command()]), []));
test("valid Space command passes", () => assert.deepEqual(auditKeyboardCommands([command({ key: "Space" })]), []));
const commandDefects = [
  ["unknown key", { key: "Escape" }, "command.invalid"],
  ["missing target", { targetId: "" }, "command.target"],
  ["unfocused", { focusedBefore: false }, "command.not-focused"],
  ["no activation", { activated: false }, "command.did-not-activate"],
  ["unsafe destructive", { destructive: true, confirmed: false }, "command.unsafe-activation"],
  ["unexpected navigation", { navigation: true, localTarget: false }, "command.unexpected-navigation"],
];
for (const [name, changes, code] of commandDefects) {
  test(`command ${name} reports ${code}`, () => has(auditKeyboardCommands([command(changes)]), code));
}
test("invalid keyboard commands input fails", () => has(auditKeyboardCommands(null), "command.array"));
test("focus summary counts severity", () => assert.deepEqual(summarizeFocusFindings([{ code: "a", severity: "error" }, { code: "b", severity: "review" }]), { error: 1, review: 1, codes: [["a", 1], ["b", 1]] }));
test("focus audits do not mutate observations", () => { const records = forward(); const copy = JSON.parse(JSON.stringify(records)); auditForwardWalk(records); assert.deepEqual(records, copy); });
