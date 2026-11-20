import test from "node:test";
import assert from "node:assert/strict";
import {
  eligible, named, tabStops, targetFindings, activeTarget, focusFindings,
  nextTabTarget, tabSequenceFindings, compositeTarget, compositeFindings,
  arrowFindings, dialogFindings, escapeFindings, focusRestoreFindings,
} from "./p20aj-focus.ts";
import { sampleTarget, sampleSnapshot } from "./p20aj-types.ts";
const target = (change = {}) => sampleTarget(change);
const codes = (findings) => findings.map((finding) => finding.code);
const collection = () => [target({ id: "one" }), target({ id: "two" }), target({ id: "three" })];
const composite = (change = {}) => ({ id: "tabs", kind: "tabs", orientation: "horizontal", activeId: "one",
  children: [target({ id: "one", tabIndex: 0 }), target({ id: "two", tabIndex: -1 }), target({ id: "three", tabIndex: -1 })], wrap: true, ...change });
const dialog = (change = {}) => ({ id: "modal", activeId: "close", triggerId: "open", descendants: ["close", "confirm"],
  backgroundFocusable: [], modal: true, open: true, ...change });

for (const change of [
  { visible: false }, { enabled: false }, { inert: true }, { tabIndex: -1 }, { tabIndex: -2 },
]) {
  test(`ineligible target ${JSON.stringify(change)}`, () => {
    assert.equal(eligible(target(change)), false);
  });
}
for (const change of [{ visible: true }, { enabled: true }, { inert: false }, { tabIndex: 0 }, { tabIndex: 1 }]) {
  test(`eligible target ${JSON.stringify(change)}`, () => {
    assert.equal(eligible(target(change)), true);
  });
}
for (const name of [null, "", " ", "  "]) {
  test(`blank target name ${JSON.stringify(name)}`, () => {
    assert.equal(named(target({ name })), false);
  });
}
for (const name of ["Search", "Rechercher", "Retour", "UNKNOWN", "Name with spaces"]) {
  test(`present target name ${JSON.stringify(name)}`, () => {
    assert.equal(named(target({ name })), true);
  });
}
for (const [change, code] of [
  [{ id: "" }, "target-id-empty"],
  [{ name: null }, "control-unnamed"],
  [{ width: 43 }, "target-width"],
  [{ height: 43 }, "target-height"],
  [{ width: null }, "width-UNKNOWN"],
  [{ height: null }, "height-UNKNOWN"],
  [{ width: Number.NaN }, "width-UNKNOWN"],
  [{ height: Infinity }, "height-UNKNOWN"],
  [{ focusIndicator: false }, "focus-indicator"],
  [{ focusIndicator: null }, "focus-indicator-UNKNOWN"],
  [{ tabIndex: -2 }, "tabindex-invalid"],
  [{ tabIndex: 1.5 }, "tabindex-invalid"],
  [{ tabIndex: 1 }, "positive-tabindex"],
]) {
  test(`target contract catches ${code} for ${JSON.stringify(change)}`, () => {
    assert.ok(codes(targetFindings([target(change)], 2)).includes(code));
  });
}
test("44px dimensions meet the floor", () => {
  assert.ok(!codes(targetFindings([target({ width: 44, height: 44 })], 0)).includes("target-width"));
});
test("disabled target does not have active geometry requirements", () => {
  assert.ok(!codes(targetFindings([target({ enabled: false, width: 1, height: 1 })], 0)).includes("target-width"));
});
test("inert focusable target is reported", () => {
  assert.ok(codes(targetFindings([target({ inert: true })], 0)).includes("inert-in-tab-order"));
});
test("duplicate identifiers are reported", () => {
  assert.ok(codes(targetFindings([target(), target()], 0)).includes("target-id-duplicate"));
});
test("positive tab stops precede zero stops", () => {
  const items = [target({ id: "zero" }), target({ id: "second", tabIndex: 2 }), target({ id: "first", tabIndex: 1 })];
  assert.deepEqual(tabStops(items).map((entry) => entry.id), ["first", "second", "zero"]);
});
test("tab order excludes disabled items", () => {
  assert.deepEqual(tabStops([target({ id: "one" }), target({ id: "two", enabled: false })]).map((entry) => entry.id), ["one"]);
});
test("active target is found by identifier", () => {
  assert.equal(activeTarget(sampleSnapshot()).id, "search");
});
test("missing active target remains unknown", () => {
  assert.equal(activeTarget(sampleSnapshot({ activeId: "not-here" })), null);
});
test("no active target yields informational result", () => {
  assert.ok(codes(focusFindings(sampleSnapshot({ activeId: null }), 0)).includes("active-UNKNOWN"));
});
test("missing active target yields failure", () => {
  assert.ok(codes(focusFindings(sampleSnapshot({ activeId: "missing" }), 0)).includes("active-missing"));
});
test("inert active target yields failure", () => {
  const snapshot = sampleSnapshot({ targets: [target({ inert: true })] });
  assert.ok(codes(focusFindings(snapshot, 0)).includes("active-ineligible"));
});
test("focus outside an open modal yields failure", () => {
  const snapshot = sampleSnapshot({ dialogId: "modal", targets: [target({ modalId: null })] });
  assert.ok(codes(focusFindings(snapshot, 0)).includes("modal-focus-outside"));
});
test("focus inside open modal is accepted", () => {
  const snapshot = sampleSnapshot({ dialogId: "modal", targets: [target({ modalId: "modal" })] });
  assert.ok(!codes(focusFindings(snapshot, 0)).includes("modal-focus-outside"));
});
for (const [before, reverse, expected] of [
  ["one", false, "two"], ["one", true, "three"],
  ["two", false, "three"], ["two", true, "one"],
  ["three", false, "one"], ["three", true, "two"],
  [null, false, "one"], [null, true, "three"],
]) {
  test(`tab next from ${String(before)} reverse=${reverse}`, () => {
    assert.equal(nextTabTarget(collection(), before, reverse), expected);
  });
}
test("empty tab order has no target", () => {
  assert.equal(nextTabTarget([], null, false), null);
});
test("correct forward tab travel passes", () => {
  assert.deepEqual(tabSequenceFindings(collection(), [{ key: "Tab", beforeId: "one", afterId: "two" }], 0), []);
});
test("incorrect forward tab is diagnosed", () => {
  assert.ok(codes(tabSequenceFindings(collection(), [{ key: "Tab", beforeId: "one", afterId: "three" }], 0)).includes("tab-order"));
});
test("stuck keyboard movement is diagnosed", () => {
  assert.ok(codes(tabSequenceFindings(collection(), [{ key: "Tab", beforeId: "one", afterId: "one" }], 0)).includes("tab-stuck"));
});
test("non-tab events do not trigger sequential findings", () => {
  assert.deepEqual(tabSequenceFindings(collection(), [{ key: "Enter", beforeId: "one", afterId: "one" }], 0), []);
});
for (const [direction, expected] of [
  ["next", "two"], ["previous", "three"], ["first", "one"], ["last", "three"],
]) {
  test(`composite navigation ${direction} resolves ${expected}`, () => {
    assert.equal(compositeTarget(composite(), direction), expected);
  });
}
test("composite without choices has no target", () => {
  assert.equal(compositeTarget(composite({ children: [] }), "next"), null);
});
test("composite without wrap respects endpoint", () => {
  assert.equal(compositeTarget(composite({ wrap: false }), "previous"), "one");
});
test("composite with unknown active choice starts at first", () => {
  assert.equal(compositeTarget(composite({ activeId: "missing" }), "next"), "one");
});
test("single roving target passes", () => {
  assert.deepEqual(compositeFindings(composite(), 0), []);
});
test("no roving target fails", () => {
  const changed = composite({ children: composite().children.map((t) => target({ ...t, tabIndex: -1 })) });
  assert.ok(codes(compositeFindings(changed, 0)).includes("roving-count"));
});
test("two roving targets fail", () => {
  const changed = composite({ children: [target({ id: "one" }), target({ id: "two" })] });
  assert.ok(codes(compositeFindings(changed, 0)).includes("roving-count"));
});
test("active element absent from composite fails", () => {
  assert.ok(codes(compositeFindings(composite({ activeId: "absent" }), 0)).includes("composite-active-missing"));
});
test("roving target must be current", () => {
  assert.ok(codes(compositeFindings(composite({ activeId: "two" }), 0)).includes("roving-mismatch"));
});
test("duplicate composite ID fails", () => {
  assert.ok(codes(compositeFindings(composite({ children: [target(), target()] }), 0)).includes("composite-id-duplicate"));
});
for (const [key, after] of [["ArrowRight", "two"], ["ArrowLeft", "three"], ["Home", "one"], ["End", "three"]]) {
  test(`${key} resolves correct composite destination`, () => {
    assert.deepEqual(arrowFindings(composite(), [{ key, beforeId: "one", afterId: after, prevented: true, scrollBefore: 0, scrollAfter: 0 }], 0), []);
  });
}
test("arrow action without preventDefault is detected", () => {
  const items = arrowFindings(composite(), [{ key: "ArrowRight", beforeId: "one", afterId: "two", prevented: false, scrollBefore: 0, scrollAfter: 0 }], 0);
  assert.ok(codes(items).includes("arrow-default"));
});
test("arrow action that scrolls is detected", () => {
  const items = arrowFindings(composite(), [{ key: "ArrowRight", beforeId: "one", afterId: "two", prevented: true, scrollBefore: 0, scrollAfter: 20 }], 0);
  assert.ok(codes(items).includes("arrow-scrolled"));
});
test("wrong arrow destination is detected", () => {
  const items = arrowFindings(composite(), [{ key: "ArrowRight", beforeId: "one", afterId: "three", prevented: true, scrollBefore: 0, scrollAfter: 0 }], 0);
  assert.ok(codes(items).includes("arrow-destination"));
});
test("safe modal passes", () => {
  assert.deepEqual(dialogFindings(dialog(), 0), []);
});
test("missing dialog identifier is diagnosed", () => {
  assert.ok(codes(dialogFindings(dialog({ id: "" }), 0)).includes("dialog-id"));
});
test("outside modal focus is diagnosed", () => {
  assert.ok(codes(dialogFindings(dialog({ activeId: "outside" }), 0)).includes("dialog-escaped"));
});
test("modal background tab stop is diagnosed", () => {
  assert.ok(codes(dialogFindings(dialog({ backgroundFocusable: ["outside"] }), 0)).includes("dialog-background"));
});
test("unknown dialog trigger stays informational", () => {
  assert.ok(codes(dialogFindings(dialog({ triggerId: null }), 0)).includes("dialog-trigger-UNKNOWN"));
});
test("closed dialog has no modal findings", () => {
  assert.deepEqual(dialogFindings(dialog({ open: false }), 0), []);
});
test("escape closes modal and restores trigger", () => {
  assert.deepEqual(escapeFindings(dialog(), dialog({ open: false, activeId: "open" }), 0), []);
});
test("escape without closing modal fails", () => {
  assert.ok(codes(escapeFindings(dialog(), dialog({ open: true, activeId: "open" }), 0)).includes("escape-still-open"));
});
test("escape losing focus fails", () => {
  assert.ok(codes(escapeFindings(dialog(), dialog({ open: false, activeId: null }), 0)).includes("escape-focus-lost"));
});
test("focus restoration accepts unchanged control", () => {
  assert.deepEqual(focusRestoreFindings(sampleSnapshot(), sampleSnapshot(), true, 0), []);
});
test("focus restoration checks changed control", () => {
  assert.ok(codes(focusRestoreFindings(sampleSnapshot(), sampleSnapshot({ activeId: null }), true, 0)).includes("focus-not-restored"));
});
test("nonpreserving navigation can change focus", () => {
  assert.deepEqual(focusRestoreFindings(sampleSnapshot(), sampleSnapshot({ activeId: null }), false, 0), []);
});
