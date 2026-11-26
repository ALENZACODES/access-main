import test from "node:test";
import assert from "node:assert/strict";
import {
  LABELS, controlLabel, localeName, frenchSpacing, controlFindings, groupFindings,
  tabbables, tabOrder, nextTab, strokeFindings, dialogFindings, controlsMatrix,
  translationMatrix, localizedSummary,
} from "./p20af-localized-controls.ts";

const control = (changes = {}) => ({ id: "first", kind: "button", name: "Continue", visible: true,
  disabled: false, inert: false, width: 44, height: 44, tabindex: 0, active: false,
  expanded: null, selected: null, controls: [], language: "en", ...changes });
const stroke = (changes = {}) => ({ key: "Tab", beforeId: "first", afterId: "second", scrolled: false, ...changes });
const dialog = (changes = {}) => ({ id: "panel", trigger: "first", open: true,
  focusId: "second", descendants: ["second"], backgroundTabbable: [], ...changes });
const group = () => [control(), control({ id: "second", name: "Go back" })];
const codes = (items) => items.map((item) => item.code);

test("bilingual label dictionary is complete", () => {
  assert.deepEqual(Object.keys(LABELS.en), Object.keys(LABELS.fr));
});
test("missing value is literally UNKNOWN in both locales", () => {
  assert.equal(LABELS.en.unknown, "UNKNOWN");
  assert.equal(LABELS.fr.unknown, "UNKNOWN");
});
test("English and French buttons have distinct labels", () => assert.notEqual(LABELS.en.retry, LABELS.fr.retry));
test("label getter returns English message", () => assert.equal(controlLabel("en", "back"), "Go back"));
test("label getter returns French message", () => assert.equal(controlLabel("fr", "back"), "Retour"));
for (const [raw, expected] of [["en", "en"], ["en-CA", "en"], ["fr", "fr"], ["fr-CA", "fr"], ["EN-us", "en"], ["FR-ca", "fr"], ["und", null], ["français", null], [null, null], ["", null], ["english", null], ["fr_CA", null]]) {
  test(`language tag ${String(raw)} maps to ${String(expected)}`, () => assert.equal(localeName(raw), expected));
}
for (const [raw, expected] of [
  ["C’est prêt.", []], ["Détails\u00a0: source", []], ["Continuer\u202f!", []],
  ["Pourquoi\u202f?", []], ["Oui\u202f; non", []], ["«\u202fBonjour\u202f»", []],
]) {
  test(`French typography permits ${JSON.stringify(raw)}`, () => assert.deepEqual(frenchSpacing(raw), expected));
}
for (const [raw, expected] of [
  ["C'est prêt.", "straight-apostrophe"], ["Source: inconnue", "colon-space"],
  ["Source : inconnue", "colon-space"], ["Pourquoi?", "thin-space"],
  ["Pourquoi ?", "thin-space"], ["Attention!", "thin-space"], ["Oui; non", "thin-space"],
  ["«Bonjour\u202f»", "guillemet-open"], ["«\u202fBonjour»", "guillemet-close"],
]) {
  test(`French typography rejects ${JSON.stringify(raw)}`, () => assert.ok(frenchSpacing(raw).some((part) => part.startsWith(expected))));
}

test("visible named control meets baseline", () => assert.deepEqual(controlFindings(control(), "en"), []));
test("hidden control is excluded from interactive findings", () => assert.deepEqual(controlFindings(control({ visible: false, width: 1 }), "en"), []));
test("disabled control is excluded from interactive findings", () => assert.deepEqual(controlFindings(control({ disabled: true, width: 1 }), "en"), []));
test("exact 44x44px target meets the minimum", () => assert.deepEqual(controlFindings(control({ width: 44, height: 44 }), "en"), []));
for (const [changes, code] of [
  [{ id: "" }, "control-id-missing"],
  [{ name: "" }, "control-name-unknown"],
  [{ name: "UNKNOWN" }, "control-name-unknown"],
  [{ inert: true }, "control-inert"],
  [{ width: 43 }, "control-width-small"],
  [{ height: 43 }, "control-height-small"],
  [{ width: NaN }, "control-width-small"],
  [{ height: Infinity }, "control-height-small"],
  [{ width: null }, "control-width-unknown"],
  [{ height: null }, "control-height-unknown"],
  [{ tabindex: -2 }, "control-tabindex-invalid"],
  [{ tabindex: 2 }, "control-positive-tabindex"],
  [{ kind: "link", expanded: true }, "control-expanded-role"],
  [{ expanded: false }, "control-expanded-target-missing"],
  [{ kind: "button", selected: true }, "control-selected-role"],
]) {
  test(`control ${JSON.stringify(changes)} reports ${code}`, () => {
    assert.ok(codes(controlFindings(control(changes), "en")).includes(code));
  });
}
test("French control name accepts native text without English label", () => {
  assert.deepEqual(controlFindings(control({ name: "Réessayer", language: "fr" }), "fr"), []);
});
test("French accessibility label with apostrophe detects typography", () => {
  const found = controlFindings(control({ name: "C'est prêt", language: "fr" }), "fr");
  assert.ok(codes(found).includes("control-french-typography"));
});
test("French control can contain a nonbreaking colon", () => {
  assert.deepEqual(controlFindings(control({ name: "Source\u00a0: détails", language: "fr" }), "fr"), []);
});
test("explicit wrong locale on control is reported", () => {
  assert.ok(codes(controlFindings(control({ language: "en" }), "fr")).includes("control-locale-mismatch"));
});
test("unknown language stays unresolved rather than being guessed", () => {
  assert.equal(codes(controlFindings(control({ language: "unknown" }), "fr")).includes("control-locale-mismatch"), false);
});
test("tab role supports selected state", () => assert.deepEqual(controlFindings(control({ kind: "tab", selected: true }), "en"), []));
test("explicit expanded state with linked panel is allowed", () => {
  assert.deepEqual(controlFindings(control({ expanded: true, controls: ["panel"] }), "en"), []);
});

test("duplicate DOM identifiers are surfaced", () => {
  assert.ok(codes(groupFindings([control(), control()], "en")).includes("control-duplicate-id"));
});
test("aria-controls targets must exist", () => {
  assert.ok(codes(groupFindings([control({ expanded: true, controls: ["panel"] })], "en")).includes("control-target-absent"));
});
test("linked target without keyboard focus still fulfills reference", () => {
  const all = [control({ expanded: true, controls: ["panel"] }), control({ id: "panel", visible: false })];
  assert.equal(codes(groupFindings(all, "en")).includes("control-target-absent"), false);
});
test("multiple focused elements are diagnosed", () => {
  assert.ok(codes(groupFindings([control({ active: true }), control({ id: "second", active: true })], "en")).includes("control-multiple-focus"));
});
test("single active element is not a duplicate", () => {
  assert.equal(codes(groupFindings([control({ active: true }), control({ id: "second" })], "en")).includes("control-multiple-focus"), false);
});

test("two visible controls are tabbable", () => assert.equal(tabbables(group()).length, 2));
test("hidden controls are not tabbable", () => assert.equal(tabbables([control({ visible: false })]).length, 0));
test("disabled controls are not tabbable", () => assert.equal(tabbables([control({ disabled: true })]).length, 0));
test("inert controls are not tabbable", () => assert.equal(tabbables([control({ inert: true })]).length, 0));
test("negative tabindex controls are not tabbable", () => assert.equal(tabbables([control({ tabindex: -1 })]).length, 0));
test("null tabindex follows native sequential order", () => assert.equal(tabbables([control({ tabindex: null })]).length, 1));
test("positive tabindex is placed before natural order", () => {
  const changed = [control(), control({ id: "priority", tabindex: 1 })];
  assert.equal(tabOrder(changed)[0]?.id, "priority");
});
test("tab order is stable for equal positive tabindex", () => {
  const changed = [control({ tabindex: 1 }), control({ id: "second", tabindex: 1 })];
  assert.deepEqual(tabOrder(changed).map((item) => item.id), ["first", "second"]);
});
test("tab forward moves to next control", () => assert.equal(nextTab(group(), "first"), "second"));
test("shift-tab moves to previous control", () => assert.equal(nextTab(group(), "second", true), "first"));
test("tab wraps from last control", () => assert.equal(nextTab(group(), "second"), "first"));
test("reverse tab wraps from first control", () => assert.equal(nextTab(group(), "first", true), "second"));
test("unknown current focus chooses first tabbable", () => assert.equal(nextTab(group(), "missing"), "first"));
test("unknown current focus chooses last on reverse tab", () => assert.equal(nextTab(group(), "missing", true), "second"));
test("empty sequence has no invented next focus", () => assert.equal(nextTab([], "first"), null));

test("valid forward tab stroke passes", () => assert.deepEqual(strokeFindings(stroke(), group()), []));
test("wrong tab destination is a finding", () => {
  assert.ok(codes(strokeFindings(stroke({ afterId: "first" }), group())).includes("stroke-tab-order"));
});
test("reverse tab must use reverse sequence", () => {
  assert.deepEqual(strokeFindings(stroke({ key: "Shift+Tab", beforeId: "second", afterId: "first" }), group()), []);
});
test("missing starting focus is a finding", () => {
  assert.ok(codes(strokeFindings(stroke({ beforeId: "unknown" }), group())).includes("stroke-before-missing"));
});
test("missing destination focus is a finding", () => {
  assert.ok(codes(strokeFindings(stroke({ afterId: null }), group())).includes("stroke-focus-missing"));
});
test("unrecognized destination control is surfaced", () => {
  assert.ok(codes(strokeFindings(stroke({ afterId: "missing" }), group())).includes("stroke-after-missing"));
});
test("arrow scroll is recorded as a warning", () => {
  assert.ok(codes(strokeFindings(stroke({ key: "ArrowDown", scrolled: true }), group())).includes("stroke-page-scrolled"));
});
test("arrow without scroll does not assert an error", () => {
  assert.equal(codes(strokeFindings(stroke({ key: "ArrowDown", scrolled: false }), group())).includes("stroke-page-scrolled"), false);
});

test("valid modal focus remains inside", () => assert.deepEqual(dialogFindings(dialog(), group()), []));
test("closed modal is not audited as open", () => assert.deepEqual(dialogFindings(dialog({ open: false }), group()), []));
test("missing dialog trigger is surfaced", () => {
  assert.ok(codes(dialogFindings(dialog({ trigger: "missing" }), group())).includes("dialog-trigger-missing"));
});
test("focus outside dialog is surfaced", () => {
  assert.ok(codes(dialogFindings(dialog({ focusId: "first" }), group())).includes("dialog-focus-outside"));
});
test("background tabbable controls break modal containment", () => {
  assert.ok(codes(dialogFindings(dialog({ backgroundTabbable: ["first"] }), group())).includes("dialog-background-tabbable"));
});
test("modal with no controls is surfaced", () => {
  assert.ok(codes(dialogFindings(dialog({ descendants: [], focusId: null }), group())).includes("dialog-no-controls"));
});
test("modal references must exist in DOM", () => {
  assert.ok(codes(dialogFindings(dialog({ descendants: ["missing"], focusId: "missing" }), group())).includes("dialog-child-missing"));
});
test("summary counts two actionable controls", () => assert.equal(controlsMatrix(group(), "en").actionable, 2));
test("summary counts unknown names", () => assert.equal(controlsMatrix([control({ name: "UNKNOWN" })], "en").unnamed, 1));
test("summary counts undersized controls", () => assert.equal(controlsMatrix([control({ width: 30 })], "en").undersized, 1));
test("summary counts unknown sizes", () => assert.equal(controlsMatrix([control({ width: null })], "en").unknownSize, 1));
test("translation matrix has all keys", () => assert.equal(translationMatrix().length, Object.keys(LABELS.en).length));
test("translation matrix flags same UNKNOWN token as shared", () => assert.equal(translationMatrix().find((part) => part.key === "unknown")?.differs, false));
test("French summary has French header", () => assert.match(localizedSummary([], "fr"), /^Éléments à examiner/));
test("English summary has English header", () => assert.match(localizedSummary([], "en"), /^Items to review/));
test("summary deduplicates identical findings", () => {
  const item = controlFindings(control({ width: 30 }), "en");
  assert.equal(localizedSummary([...item, ...item], "en"), localizedSummary(item, "en"));
});
test("summary rejects zero maximum", () => assert.throws(() => localizedSummary([], "fr", 0), RangeError));
test("summary rejects fractional maximum", () => assert.throws(() => localizedSummary([], "fr", 1.5), RangeError));
