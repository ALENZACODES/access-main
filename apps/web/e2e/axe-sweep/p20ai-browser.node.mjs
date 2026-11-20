import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDomText, readableRole, computedName, observerProblems } from "./p20ai-browser.ts";
const state = (changes = {}) => ({
  route: "/", locale: "en", connection: "UNKNOWN", cache: "UNKNOWN", outcome: "UNKNOWN",
  at: 1, historyIndex: null, scrollY: 0, query: "", evidence: [], statuses: [],
  a11y: { focusId: null, focusVisible: null, focusInDialog: false, focusInsideInert: false,
    targetWidth: null, targetHeight: null, dialogId: null, mainCount: 1,
    title: "The App", heading: "Home", horizontalOverflow: 0 }, ...changes,
});
const focus = (changes = {}) => ({ id: "button", name: "Search", role: "button",
  visible: true, disabled: false, inert: false, tabIndex: 0, width: 44, height: 44,
  insideDialog: false, ...changes });
const observation = (changes = {}) => ({ route: "/", language: "en-CA", snapshot: state(),
  focusables: [focus()], activeName: null, resourceNames: [], capturedAt: 10, ...changes });

test("reference browser observation passes", () => assert.deepEqual(observerProblems(observation(), "en"), []));
for (const [input, expected] of [
  [null, ""], ["", ""], [" ", ""], ["one\n two", "one two"],
  ["  A   B  ", "A B"], ["Texte français", "Texte français"], ["UNKNOWN", "UNKNOWN"],
]) {
  test(`DOM text normalization of ${JSON.stringify(input)}`, () => {
    assert.equal(normalizeDomText(input), expected);
  });
}
for (const [tag, type, role] of [
  ["BUTTON", null, "button"], ["A", null, "link"], ["INPUT", null, "textbox"],
  ["INPUT", "checkbox", "checkbox"], ["INPUT", "radio", "radio"],
  ["SELECT", null, "combobox"], ["TEXTAREA", null, "textbox"], ["SUMMARY", null, "summary"],
]) {
  test(`DOM ${tag} ${type ?? ""} maps to ${role}`, () => {
    assert.equal(readableRole(tag, null, type), role);
  });
}
test("explicit ARIA role wins when present", () => assert.equal(readableRole("div", "dialog", null), "dialog"));
test("empty explicit role falls back to element", () => assert.equal(readableRole("BUTTON", "", null), "button"));
const names = { ariaLabel: null, labelledBy: null, label: null, alt: null, text: null, title: null };
test("absent accessible name stays UNKNOWN", () => assert.equal(computedName(names), "UNKNOWN"));
for (const field of ["ariaLabel", "labelledBy", "label", "alt", "text", "title"]) {
  test(`accessible name can come from ${field}`, () => {
    assert.equal(computedName({ ...names, [field]: "Bonjour" }), "Bonjour");
  });
}
test("ARIA name takes precedence over visible text", () => {
  assert.equal(computedName({ ...names, ariaLabel: "Rechercher", text: "Search" }), "Rechercher");
});
test("labelledby name takes precedence over title", () => {
  assert.equal(computedName({ ...names, labelledBy: "Accès", title: "Other" }), "Accès");
});
test("native label names an input without an ARIA label", () => {
  assert.equal(computedName({ ...names, label: "Adresse" }), "Adresse");
});
test("empty primary ARIA label falls back to visible text", () => {
  assert.equal(computedName({ ...names, ariaLabel: "   ", text: "Texte" }), "Texte");
});
test("observer detects wrong document language", () => {
  assert.ok(observerProblems(observation({ language: "fr-CA" }), "en").includes("document-language"));
});
test("observer accepts French language", () => {
  assert.deepEqual(observerProblems(observation({ language: "fr-CA", snapshot: state({ locale: "fr" }) }), "fr"), []);
});
for (const [a11y, expected] of [
  [{ mainCount: 0 }, "main-count"], [{ mainCount: 2 }, "main-count"],
  [{ title: "" }, "title-UNKNOWN"], [{ heading: " " }, "heading-UNKNOWN"],
  [{ horizontalOverflow: 1 }, "horizontal-overflow"],
]) {
  test(`DOM screen detects ${expected}`, () => {
    const altered = observation({ snapshot: state({ a11y: { ...state().a11y, ...a11y } }) });
    assert.ok(observerProblems(altered, "en").includes(expected));
  });
}
test("unnamed visible focusable is detected", () => {
  const changed = observation({ focusables: [focus({ name: "" })] });
  assert.ok(observerProblems(changed, "en").includes("unnamed:button"));
});
test("disabled unnamed focusable is not claimed interactive", () => {
  const changed = observation({ focusables: [focus({ name: "", disabled: true })] });
  assert.deepEqual(observerProblems(changed, "en"), []);
});
test("hidden unnamed focusable is not claimed interactive", () => {
  const changed = observation({ focusables: [focus({ name: "", visible: false })] });
  assert.deepEqual(observerProblems(changed, "en"), []);
});
test("inert unnamed focusable is not claimed interactive", () => {
  const changed = observation({ focusables: [focus({ name: "", inert: true })] });
  assert.deepEqual(observerProblems(changed, "en"), []);
});
test("multiple unnamed controls receive separate diagnostics", () => {
  const changed = observation({ focusables: [focus({ name: "", id: "a" }), focus({ name: "", id: "b" })] });
  assert.deepEqual(observerProblems(changed, "en"), ["unnamed:a", "unnamed:b"]);
});
test("unknown connection is not recast as online", () => {
  assert.equal(observation().snapshot.connection, "UNKNOWN");
});
test("unknown cache is not recast as populated", () => {
  assert.equal(observation().snapshot.cache, "UNKNOWN");
});
test("empty evidence is an observed empty collection, not place data", () => {
  assert.deepEqual(observation().snapshot.evidence, []);
});
