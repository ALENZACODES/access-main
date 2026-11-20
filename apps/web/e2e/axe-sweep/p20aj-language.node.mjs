import test from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGES, message, localeFromTag, frenchTypographyFindings, copyFindings,
  accessibleName, labelMatches, bilingualPairs,
} from "./p20aj-copy.ts";
import { stableFocusId, visibleStatus, targetFromDimensions, browserFindingCodes } from "./p20aj-browser.ts";
import { sampleSnapshot, sampleTarget, finding, codes, uniqueFindings, findingReport, hasBlockingFindings } from "./p20aj-types.ts";
const labels = Object.keys(MESSAGES.en);
for (const key of labels) {
  test(`English message ${key} is present`, () => {
    assert.ok(message("en", key).trim());
  });
  test(`French message ${key} is present`, () => {
    assert.ok(message("fr", key).trim());
  });
  test(`English accessible name ${key} is localized`, () => {
    assert.equal(labelMatches("en", key, message("en", key)), true);
  });
  test(`French accessible name ${key} is localized`, () => {
    assert.equal(labelMatches("fr", key, message("fr", key)), true);
  });
}
test("literal UNKNOWN is retained in both languages", () => {
  assert.equal(message("en", "unknown"), "UNKNOWN");
  assert.equal(message("fr", "unknown"), "UNKNOWN");
});
test("English search does not match French accessible name", () => {
  assert.equal(labelMatches("fr", "search", "Search"), false);
});
test("French search does not match English accessible name", () => {
  assert.equal(labelMatches("en", "search", "Rechercher"), false);
});
test("name matching is anchored", () => {
  assert.equal(accessibleName("en", "retry").test("Try again later"), false);
});
test("case-insensitive localized name is supported", () => {
  assert.equal(accessibleName("fr", "retry").test("RÉESSAYER"), true);
});
for (const [tag, expected] of [
  ["en", "en"], ["EN", "en"], ["en-CA", "en"], ["fr", "fr"],
  ["FR", "fr"], ["fr-CA", "fr"], ["fr-ca", "fr"],
  ["und", "UNKNOWN"], ["es", "UNKNOWN"], ["french", "UNKNOWN"],
  [null, "UNKNOWN"], ["", "UNKNOWN"],
]) {
  test(`language tag ${String(tag)} resolves ${expected}`, () => {
    assert.equal(localeFromTag(tag), expected);
  });
}
for (const [value, expected] of [
  ["C’est bien.", []], ["Aucun problème\u00a0: continuez.", []],
  ["«\u202fBonjour\u202f»", []], ["Pourquoi\u202f?", []],
  ["Où aller\u202f!", []], ["Premier\u202f; deuxième", []],
  ["C'est bien.", ["fr-apostrophe"]], ["Question?", ["fr-thin-space"]],
  ["Bonjour!", ["fr-thin-space"]], ["Explication: chose", ["fr-colon"]],
  ["«Bonjour\u202f»", ["fr-guillemet-open"]], ["«\u202fBonjour»", ["fr-guillemet-close"]],
]) {
  test(`French typography diagnoses ${JSON.stringify(value)}`, () => {
    assert.deepEqual(codes(frenchTypographyFindings(value)), expected);
  });
}
test("all shipped bilingual copy passes typography", () => {
  assert.deepEqual(copyFindings(), []);
});
test("bilingual pairs enumerate every message", () => {
  assert.equal(bilingualPairs().length, labels.length);
});
test("bilingual pairs retain the same key across languages", () => {
  assert.equal(bilingualPairs().every((pair) => pair.en === message("en", pair.key) && pair.fr === message("fr", pair.key)), true);
});
test("unnamed stable focus uses a deterministic index", () => {
  assert.equal(stableFocusId({ id: null, tag: "button", name: null, index: 2 }), "button:index-2");
});
test("stable focus retains explicit identifier", () => {
  assert.equal(stableFocusId({ id: "search", tag: "button", name: null, index: 4 }), "search");
});
test("stable focus falls back to native control name", () => {
  assert.equal(stableFocusId({ id: null, tag: "input", name: "query", index: 1 }), "input:query");
});
test("observed visible status normalizes whitespace", () => {
  assert.equal(visibleStatus("  Chargement   des résultats ", true, "fr", "loading").text, "Chargement des résultats");
});
test("status keeps its locale", () => {
  assert.equal(visibleStatus("Ready", true, "en", "status").locale, "en");
});
test("target adapter retains unknown naming", () => {
  const item = targetFromDimensions({ id: "button", name: null, role: "button", disabled: false, visible: true,
    inert: false, tabIndex: 0, width: 44, height: 44, modalId: null });
  assert.equal(item.name, null);
  assert.equal(item.focusIndicator, null);
});
test("target adapter interprets disabled state", () => {
  const item = targetFromDimensions({ id: "button", name: "Search", role: "button", disabled: true, visible: true,
    inert: false, tabIndex: -1, width: 44, height: 44, modalId: null });
  assert.equal(item.enabled, false);
});
const observation = (change = {}) => ({ snapshot: sampleSnapshot(), documentLanguage: "en", horizontalOverflow: 0,
  headings: 1, capturedAt: 10, ...change });
test("clean browser observation has no findings", () => {
  assert.deepEqual(browserFindingCodes(observation(), "en"), []);
});
test("browser locale mismatch is reported", () => {
  assert.ok(browserFindingCodes(observation(), "fr").includes("browser-locale"));
});
test("browser heading count is reported", () => {
  assert.ok(browserFindingCodes(observation({ headings: 0 }), "en").includes("browser-heading-count"));
});
test("browser main count is reported", () => {
  const changed = observation({ snapshot: sampleSnapshot({ mainCount: 2 }) });
  assert.ok(browserFindingCodes(changed, "en").includes("browser-main-count"));
});
test("browser title is required", () => {
  const changed = observation({ snapshot: sampleSnapshot({ title: "" }) });
  assert.ok(browserFindingCodes(changed, "en").includes("browser-title"));
});
test("browser reflow overflow is reported", () => {
  assert.ok(browserFindingCodes(observation({ horizontalOverflow: 5 }), "en").includes("browser-reflow"));
});
test("finding reporter keeps substantive error text", () => {
  assert.ok(findingReport([finding("focus-test", "focus", 2, "missing")]).includes("missing"));
});
test("duplicate findings are deduplicated", () => {
  const entry = finding("focus-test", "focus", 2, "missing");
  assert.equal(uniqueFindings([entry, entry]).length, 1);
});
test("informational reports do not block", () => {
  assert.equal(hasBlockingFindings([finding("UNKNOWN", "resource", 0, "not measured", "information")]), false);
});
test("error reports block", () => {
  assert.equal(hasBlockingFindings([finding("target-width", "focus", 0, "short")]), true);
});
test("finding reporter rejects zero limit", () => {
  assert.throws(() => findingReport([], 0), RangeError);
});
test("finding reporter includes truncation count", () => {
  const entries = [finding("a", "focus", 0, "x"), finding("b", "focus", 1, "y")];
  assert.ok(findingReport(entries, 1).includes("further findings"));
});
test("sample target has 44px or larger dimensions", () => {
  const item = sampleTarget();
  assert.ok(item.width >= 44 && item.height >= 44);
});
