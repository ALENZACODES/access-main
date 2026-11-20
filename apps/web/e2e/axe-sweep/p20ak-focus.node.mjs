import test from "node:test";
import assert from "node:assert/strict";
import {
  focusEligible, orderedTargets, nextKeyboardStop, targetFindings, dialogFindings,
  keyboardTransitionFindings, focusEventFindings, focusContrastRisk, focusCoverage,
  dialogFocusBoundary, targetById, activeTargetStatus, skippedFocusIds, stableFocusableNames,
} from "./p20ak-focus.ts";
import { sampleTarget, sampleEvent, sampleSnapshot } from "./p20ak-types.ts";
const target = (patch = {}) => sampleTarget(patch);
const codes = (findings) => findings.map((finding) => finding.code);
const targets = () => [target(), target({ id: "help", name: "Help", order: 1 })];
const dialog = (patch = {}) => ({ id: "details", open: true, modal: true, triggerId: "continue",
  activeId: "close", descendants: ["close"], backgroundFocusableIds: [], ...patch });

test("visible enabled target is eligible", () => {
  assert.equal(focusEligible(target()), true);
});
for (const patch of [{ visible: false }, { disabled: true }, { inert: true }, { tabIndex: -1 }]) {
  test(`ineligible target ${JSON.stringify(patch)} is excluded`, () => {
    assert.equal(focusEligible(target(patch)), false);
  });
}
test("keyboard order retains sequential DOM order", () => {
  assert.deepEqual(orderedTargets(targets()).map((item) => item.id), ["continue", "help"]);
});
test("positive tabindex comes before natural order", () => {
  const listed = [target(), target({ id: "special", order: 1, tabIndex: 1 })];
  assert.equal(orderedTargets(listed)[0].id, "special");
});
test("disabled target is removed from navigation order", () => {
  assert.deepEqual(orderedTargets([target(), target({ id: "disabled", order: 1, disabled: true })]).map((item) => item.id), ["continue"]);
});
test("next stop advances to subsequent control", () => {
  assert.equal(nextKeyboardStop(targets(), "continue"), "help");
});
test("next stop wraps to first control", () => {
  assert.equal(nextKeyboardStop(targets(), "help"), "continue");
});
test("reverse stop wraps to last control", () => {
  assert.equal(nextKeyboardStop(targets(), "continue", true), "help");
});
test("unknown start defaults to first target", () => {
  assert.equal(nextKeyboardStop(targets(), null), "continue");
});
test("empty inventory does not invent keyboard target", () => {
  assert.equal(nextKeyboardStop([], null), null);
});
test("valid sample target has no findings", () => {
  assert.deepEqual(targetFindings([target()]), []);
});
for (const [patch, expected] of [
  [{ id: "" }, "focus-id-empty"],
  [{ name: "" }, "focus-name-missing"],
  [{ order: -1 }, "focus-order-invalid"],
  [{ tabIndex: 2 }, "focus-tabindex-positive"],
  [{ width: 43 }, "focus-target-width"],
  [{ height: 43 }, "focus-target-height"],
  [{ width: null }, "focus-width-unknown"],
  [{ height: null }, "focus-height-unknown"],
  [{ focusIndicator: false }, "focus-indicator-absent"],
  [{ focusIndicator: null }, "focus-indicator-unknown"],
]) {
  test(`target finding ${expected} is generated`, () => {
    assert.ok(codes(targetFindings([target(patch)])).includes(expected));
  });
}
test("repeated target IDs are diagnosed", () => {
  assert.ok(codes(targetFindings([target(), target()])).includes("focus-id-duplicate"));
});
test("repeated keyboard order is diagnosed", () => {
  assert.ok(codes(targetFindings([target(), target({ id: "other" })])).includes("focus-order-duplicate"));
});
test("inactive modal does not create focus failure", () => {
  assert.deepEqual(dialogFindings([dialog({ open: false })], []), []);
});
test("modal detects escaped focus", () => {
  assert.ok(codes(dialogFindings([dialog({ activeId: "background" })], [target({ id: "close" })])).includes("dialog-focus-escaped"));
});
test("modal detects active background targets", () => {
  assert.ok(codes(dialogFindings([dialog({ backgroundFocusableIds: ["outside"] })], [target({ id: "close" })])).includes("dialog-background-active"));
});
test("modal detects unknown focus", () => {
  assert.ok(codes(dialogFindings([dialog({ activeId: null })], [target({ id: "close" })])).includes("dialog-focus-unknown"));
});
test("modal detects absence of eligible controls", () => {
  assert.ok(codes(dialogFindings([dialog()], [])).includes("dialog-no-keyboard-controls"));
});
test("modal detects absent trigger", () => {
  assert.ok(codes(dialogFindings([dialog()], [target({ id: "close" })])).includes("dialog-trigger-missing"));
});
test("two active modals are a conflict", () => {
  assert.ok(codes(dialogFindings([dialog(), dialog({ id: "second" })], [target({ id: "close" })])).includes("dialog-multiple-modals"));
});
test("tab key uses expected stop", () => {
  const before = sampleSnapshot({ targets: targets(), activeId: "continue" });
  const after = sampleSnapshot({ targets: targets(), activeId: "help" });
  assert.deepEqual(keyboardTransitionFindings(before, after, "Tab"), []);
});
test("tab key detects wrong stop", () => {
  const before = sampleSnapshot({ targets: targets(), activeId: "continue" });
  const after = sampleSnapshot({ targets: targets(), activeId: "continue" });
  assert.ok(codes(keyboardTransitionFindings(before, after, "Tab")).includes("keyboard-tab-order"));
});
test("reverse tab is measured against reverse sequence", () => {
  const before = sampleSnapshot({ targets: targets(), activeId: "continue" });
  const after = sampleSnapshot({ targets: targets(), activeId: "help" });
  assert.deepEqual(keyboardTransitionFindings(before, after, "Shift+Tab"), []);
});
test("focus disappearing after keypress is detected", () => {
  const before = sampleSnapshot({ targets: targets(), activeId: "continue" });
  const after = sampleSnapshot({ targets: targets(), activeId: null });
  assert.ok(codes(keyboardTransitionFindings(before, after, "Enter")).includes("keyboard-focus-lost"));
});
test("Escape requires modal to close", () => {
  const before = sampleSnapshot({ dialogs: [dialog()] });
  const after = sampleSnapshot({ dialogs: [dialog()] });
  assert.ok(codes(keyboardTransitionFindings(before, after, "Escape")).includes("keyboard-escape-not-closed"));
});
test("Escape focus returns to trigger", () => {
  const before = sampleSnapshot({ dialogs: [dialog()] });
  const after = sampleSnapshot({ dialogs: [], activeId: null });
  assert.ok(codes(keyboardTransitionFindings(before, after, "Escape")).includes("keyboard-escape-focus-not-returned"));
});
test("focus event checks intended target", () => {
  const event = sampleEvent({ intendedFocusId: "search" });
  assert.ok(codes(focusEventFindings(event)).includes("focus-action-mismatch"));
});
test("open event requires a new dialog", () => {
  assert.ok(codes(focusEventFindings(sampleEvent({ action: "open" }))).includes("dialog-open-unobserved"));
});
test("close event requires dialog to close", () => {
  const before = sampleSnapshot({ dialogs: [dialog()] });
  const after = sampleSnapshot({ dialogs: [dialog()] });
  assert.ok(codes(focusEventFindings(sampleEvent({ action: "close", before, after }))).includes("dialog-close-unobserved"));
});
test("missing focus indicator is a risk", () => {
  assert.equal(focusContrastRisk(target({ focusIndicator: null })), true);
});
test("coverage counts named sized indicated targets", () => {
  assert.deepEqual(focusCoverage([target(), target({ id: "other", name: null, width: 20 })]),
    { eligible: 2, named: 1, sized: 1, indicated: 2 });
});
test("dialog boundary distinguishes inside", () => {
  assert.equal(dialogFocusBoundary(dialog(), "close"), "inside");
});
test("dialog boundary distinguishes outside", () => {
  assert.equal(dialogFocusBoundary(dialog(), "other"), "outside");
});
test("dialog boundary retains UNKNOWN", () => {
  assert.equal(dialogFocusBoundary(dialog(), null), "UNKNOWN");
});
test("target lookup does not invent missing target", () => {
  assert.equal(targetById(targets(), "missing"), null);
});
test("active target status is eligible", () => {
  assert.equal(activeTargetStatus(sampleSnapshot({ targets: targets(), activeId: "continue" })), "eligible");
});
test("active target status retains UNKNOWN for absent target", () => {
  assert.equal(activeTargetStatus(sampleSnapshot()), "UNKNOWN");
});
test("missing stops are exposed after change", () => {
  assert.deepEqual(skippedFocusIds(targets(), [target()]), ["help"]);
});
test("translated control can preserve a name", () => {
  assert.deepEqual(stableFocusableNames([target()], [target({ name: "Continuer" })]), []);
});
test("lost accessible name is diagnosed", () => {
  assert.ok(codes(stableFocusableNames([target()], [target({ name: null })])).includes("focus-name-lost"));
});
