import test from "node:test";
import assert from "node:assert/strict";
import {
  COPY, localeCopy, localeLabelPattern, languageTag, typographyProblems,
  copyProblems, eligible, focusableFindings, orderedFocus, nextFocus,
  strokeFindings, focusJourneyFindings, announcementFindings, localizedStatus,
} from "./p20ai-locale-input.ts";
const target = (changes = {}) => ({ id: "one", name: "Search", role: "button", tabIndex: 0,
  visible: true, disabled: false, inert: false, width: 44, height: 44, insideDialog: false, ...changes });
const key = (changes = {}) => ({ key: "Tab", beforeId: "one", afterId: "two",
  defaultPrevented: null, focusVisible: true, scrollBefore: 0, scrollAfter: 0, ...changes });
const message = (changes = {}) => ({ text: "Results are ready.", locale: "en", priority: "polite",
  busy: false, actionAt: 100, announcedAt: 130, outcome: "ready", ...changes });
const codes = (items) => items.map((item) => item.code);
const targets = [target(), target({ id: "two", name: "Retry" })];

test("bilingual copy table is complete and typographically clean", () => assert.deepEqual(copyProblems(), []));
test("UNKNOWN is the same sentinel in both languages", () => {
  assert.equal(COPY.en.UNKNOWN, "UNKNOWN");
  assert.equal(COPY.fr.UNKNOWN, "UNKNOWN");
});
test("French search differs from English search", () => assert.notEqual(COPY.en.search, COPY.fr.search));
for (const locale of ["en", "fr"]) {
  for (const intent of ["search", "clear", "retry", "back", "forward", "close", "open",
    "offline", "online", "UNKNOWN", "loading", "ready", "empty", "error", "source",
    "licence", "date", "tier", "download", "focus", "cache"]) {
    test(`copy ${locale}/${intent} is readable and has matching exact role pattern`, () => {
      const value = localeCopy(locale, intent);
      assert.ok(value.trim().length > 0);
      assert.equal(localeLabelPattern(locale, intent).test(value), true);
      assert.equal(localeLabelPattern(locale, intent).test(value + " extra"), false);
    });
  }
}
test("French role name is not English-only", () => {
  assert.equal(localeLabelPattern("fr", "search").test("Rechercher"), true);
  assert.equal(localeLabelPattern("fr", "search").test("Search"), false);
});
for (const [language, expected] of [
  ["en", "en"], ["en-CA", "en"], ["EN-us", "en"],
  ["fr", "fr"], ["fr-CA", "fr"], ["FR-ca", "fr"],
  ["und", null], ["es", null], ["english", null], ["french", null], ["", null], [null, null],
]) {
  test(`language tag ${JSON.stringify(language)} is ${expected ?? "UNKNOWN"}`, () => {
    assert.equal(languageTag(language), expected);
  });
}
for (const [text, expected] of [
  ["L'état est prêt.", "apostrophe"], ["Nom: valeur", "colon-space"],
  ["Une question ?", "thin-space"], ["Attention !", "thin-space"],
  ["Un; deux", "thin-space"], ["«bonjour\u202f»", "opening-guillemet"],
  ["«\u202fbonjour»", "closing-guillemet"],
]) {
  test(`French typography detects ${expected} in ${JSON.stringify(text)}`, () => {
    assert.ok(typographyProblems(text).includes(expected));
  });
}
for (const text of ["L’état est prêt.", "Nom\u00a0: valeur", "Une question\u202f?",
  "Attention\u202f!", "Un\u202f; deux", "«\u202fbonjour\u202f»", "UNKNOWN"]) {
  test(`correct French typography accepts ${text}`, () => assert.deepEqual(typographyProblems(text), []));
}
for (const [change, expected] of [
  [{ id: "" }, "control-id-UNKNOWN"], [{ name: "" }, "control-name-UNKNOWN"],
  [{ name: "UNKNOWN" }, "control-name-UNKNOWN"],
  [{ tabIndex: -2 }, "control-tabindex"], [{ tabIndex: 1.5 }, "control-tabindex"],
  [{ width: 43 }, "control-width"], [{ width: Number.NaN }, "control-width"],
  [{ height: 43 }, "control-height"], [{ height: Infinity }, "control-height"],
  [{ inert: true }, "inert-tab-stop"],
]) {
  test(`target policy catches ${expected}`, () => {
    assert.ok(codes(focusableFindings(target(change), 0)).includes(expected));
  });
}
test("44px control is eligible", () => assert.equal(eligible(target()), true));
test("43px control is still eligible but fails size audit", () => {
  assert.equal(eligible(target({ width: 43 })), true);
  assert.ok(codes(focusableFindings(target({ width: 43 }), 0)).includes("control-width"));
});
for (const change of [{ disabled: true }, { visible: false }, { inert: true }, { tabIndex: -1 }]) {
  test(`ineligible control stays out of tab path: ${JSON.stringify(change)}`, () => {
    assert.equal(eligible(target(change)), false);
  });
}
test("positive tab indices precede DOM-order zero indices", () => {
  const choices = [target(), target({ id: "two", tabIndex: 2 }), target({ id: "three", tabIndex: 1 })];
  assert.deepEqual(orderedFocus(choices).map((item) => item.id), ["three", "two", "one"]);
});
test("disabled nodes do not enter keyboard order", () => {
  assert.deepEqual(orderedFocus([target(), target({ id: "two", disabled: true })]).map((item) => item.id), ["one"]);
});
test("next forward chooses next target", () => assert.equal(nextFocus(targets, "one", "forward"), "two"));
test("previous target wraps", () => assert.equal(nextFocus(targets, "one", "backward"), "two"));
test("unknown focus starts at first forward target", () => assert.equal(nextFocus(targets, null, "forward"), "one"));
test("unknown focus starts at last backward target", () => assert.equal(nextFocus(targets, null, "backward"), "two"));
test("empty control inventory yields no target", () => assert.equal(nextFocus([], null, "forward"), null));
test("inconsistent tab target is detected", () => {
  assert.ok(codes(strokeFindings(targets, key({ afterId: "one" }), 1)).includes("tab-sequence"));
});
test("valid forward tab passes", () => assert.deepEqual(strokeFindings(targets, key(), 1), []));
test("valid backward tab passes", () => {
  assert.deepEqual(strokeFindings(targets, key({ key: "Shift+Tab", beforeId: "two", afterId: "one" }), 1), []);
});
test("hidden focus indicator is diagnosed", () => {
  assert.ok(codes(strokeFindings(targets, key({ focusVisible: false }), 1)).includes("focus-indicator-invisible"));
});
test("escape cannot erase focus without reporting", () => {
  assert.ok(codes(strokeFindings(targets, key({ key: "Escape", afterId: null }), 1)).includes("escape-focus-lost"));
});
test("moving arrow focus cannot scroll simultaneously", () => {
  assert.ok(codes(strokeFindings(targets, key({ key: "ArrowRight", scrollAfter: 4 }), 1)).includes("arrow-scroll-leak"));
});
test("arrow that does not move focus may scroll", () => {
  assert.deepEqual(strokeFindings(targets, key({ key: "ArrowRight", afterId: "one", scrollAfter: 4 }), 1), []);
});
test("full keyboard sequence passes", () => {
  const journey = { locale: "en", items: targets, strokes: [key()], openDialogId: null, startingId: "one" };
  assert.deepEqual(focusJourneyFindings(journey), []);
});
test("broken keyboard chain is reported", () => {
  const journey = { locale: "en", items: targets, strokes: [key({ beforeId: "wrong" })],
    openDialogId: null, startingId: "one" };
  assert.ok(codes(focusJourneyFindings(journey)).includes("keyboard-trace-disconnected"));
});
test("active modal cannot leave background tabbable", () => {
  const journey = { locale: "en", items: targets, strokes: [], openDialogId: "dialog", startingId: null };
  assert.ok(codes(focusJourneyFindings(journey)).includes("dialog-background-focusable"));
});
test("duplicate target IDs are reported", () => {
  const journey = { locale: "en", items: [target(), target()], strokes: [], openDialogId: null, startingId: null };
  assert.ok(codes(focusJourneyFindings(journey)).includes("duplicate-control-id"));
});
for (const [changed, expected] of [
  [{ text: "UNKNOWN" }, "announcement-UNKNOWN"],
  [{ actionAt: Number.NaN }, "announcement-invalid-time"],
  [{ announcedAt: 50 }, "announcement-too-early"],
  [{ announcedAt: 2000 }, "announcement-too-late"],
  [{ outcome: "error", priority: "off" }, "error-silenced"],
  [{ outcome: "loading", busy: false }, "loading-not-busy"],
  [{ text: "Erreur !", locale: "fr" }, "fr-thin-space"],
]) {
  test(`announcement checks ${expected}`, () => {
    assert.ok(codes(announcementFindings([message(changed)])).includes(expected));
  });
}
test("properly announced change passes", () => assert.deepEqual(announcementFindings([message()]), []));
test("announcement delay bounds reject zero", () => assert.throws(() => announcementFindings([], 0), RangeError));
test("French offline status returns localized copy", () => {
  assert.equal(localizedStatus("fr", "offline"), COPY.fr.offline);
});
