import test from "node:test";
import assert from "node:assert/strict";
import {
  COPY, copy, copyPairs, normalizeLanguage, escapeRegex, accessibleName,
  frenchTypographyFindings, copyFindings, libraryFindings, outcomeCopy,
  unknownCopy, labelsMatch, statusMatches, allNames, localesHaveSameKeys,
  copyFindingReport,
} from "./p20am-copy.ts";
import { UNKNOWN, finding } from "./p20am-model.ts";
const rules = (items) => items.map((item) => item.rule);

test("both languages have the same complete copy keys", () => {
  assert.equal(localesHaveSameKeys(), true);
  assert.equal(Object.keys(COPY.en).length, Object.keys(COPY.fr).length);
});
test("all user-facing copy entries are nonempty", () => {
  for (const pair of copyPairs()) {
    assert.ok(pair.en.trim(), `${pair.key} EN`);
    assert.ok(pair.fr.trim(), `${pair.key} FR`);
  }
});
test("unknown must be the exact shared literal", () => {
  assert.equal(copy("en", "unknown"), UNKNOWN);
  assert.equal(copy("fr", "unknown"), UNKNOWN);
});
test("the bilingual library passes its typographic rules", () => {
  assert.deepEqual(libraryFindings(), []);
});
for (const key of ["offline", "online", "cacheUnknown", "cacheAbsent", "loading", "ready",
  "empty", "error", "fallback", "retry", "close", "back", "forward", "search", "clear",
  "export", "copy", "focusLost", "evidenceLost"]) {
  test(`locale-specific ${key} message has translations`, () => {
    assert.ok(copy("en", key));
    assert.ok(copy("fr", key));
    assert.notEqual(copy("en", key), copy("fr", key));
  });
}
test("localized search control matches French accessible name", () => {
  assert.equal(accessibleName("fr", "search").test("Rechercher"), true);
  assert.equal(accessibleName("fr", "search").test("Search"), false);
});
test("accessible name is anchored to the full control name", () => {
  assert.equal(accessibleName("en", "retry").test("Try again"), true);
  assert.equal(accessibleName("en", "retry").test("Try again later"), false);
});
test("regex metacharacters are escaped for role selectors", () => {
  const escaped = escapeRegex("a.b+(c)");
  assert.equal(new RegExp(`^${escaped}$`).test("a.b+(c)"), true);
  assert.equal(new RegExp(`^${escaped}$`).test("axb+(c)"), false);
});
for (const [value, expected] of [
  ["en", "en"], ["en-CA", "en"], ["EN-us", "en"], ["fr", "fr"],
  ["fr-CA", "fr"], ["FR-ca", "fr"], ["und", null], ["es", null],
  ["français", null], ["", null], [null, null],
]) {
  test(`document language ${String(value)} normalizes explicitly`, () => {
    assert.equal(normalizeLanguage(value), expected);
  });
}
for (const [text, rule] of [
  ["l'autre", "fr-apostrophe"], ["Source: document", "fr-colon-space"],
  ["Bonjour!", "fr-thin-space"], ["Pourquoi?", "fr-thin-space"],
  ["A; B", "fr-thin-space"], ["«Bonjour »", "fr-opening-guillemet"],
  ["« Bonjour»", "fr-closing-guillemet"],
]) {
  test(`French typography identifies ${rule} in ${text}`, () => {
    assert.ok(rules(frenchTypographyFindings(text)).includes(rule));
  });
}
for (const text of ["L’utilisateur", "Source\u00a0: texte", "Bonjour\u202f!", "Pourquoi\u202f?",
  "A\u202f; B", "«\u202fBonjour\u202f»", "UNKNOWN"]) {
  test(`correct French typography ${text} passes`, () => {
    assert.deepEqual(frenchTypographyFindings(text), []);
  });
}
test("empty English text yields copy-empty", () => {
  assert.ok(rules(copyFindings("en", " ")).includes("copy-empty"));
});
test("missing French punctuation is not ignored", () => {
  assert.ok(rules(copyFindings("fr", "Erreur!" )).includes("fr-thin-space"));
});
for (const word of ["verified", "real-time", "partnership", "guarantee"]) {
  test(`unsupported wording ${word} is rejected`, () => {
    assert.ok(rules(copyFindings("en", `This is ${word}`)).includes("copy-overclaim"));
  });
}
test("the status copy for an error is not a success message", () => {
  assert.notEqual(outcomeCopy("en", "error"), outcomeCopy("en", "ready"));
});
test("French empty-result status differs from English", () => {
  assert.notEqual(outcomeCopy("fr", "empty"), outcomeCopy("en", "empty"));
});
test("UNKNOWN normalization preserves observed nonmissing content", () => {
  assert.equal(unknownCopy("Measured"), "Measured");
  assert.equal(unknownCopy("Inconnu"), UNKNOWN);
});
test("labelsMatch rejects the wrong language", () => {
  assert.equal(labelsMatch("fr", "retry", "Try again"), false);
  assert.equal(labelsMatch("fr", "retry", "Réessayer"), true);
});
test("outcome message matching is exact, not substring matching", () => {
  assert.equal(statusMatches("en", "loading", "Loading…"), true);
  assert.equal(statusMatches("en", "loading", "Loading… almost done"), false);
});
test("allNames preserves input sequence", () => {
  assert.deepEqual(allNames("en", ["back", "search", "retry"]),
    ["Go back", "Search", "Try again"]);
});
test("copy-pair enumeration includes provenance labels", () => {
  const keys = copyPairs().map((pair) => pair.key);
  for (const key of ["source", "licence", "retrievedOn", "tier"]) assert.ok(keys.includes(key));
});
test("diagnostic report deduplicates identical findings", () => {
  const item = finding("fr-thin-space", 1, "7");
  assert.equal(copyFindingReport([item, item]).split("\n").length, 1);
});
test("diagnostic report truncates without dropping count", () => {
  const items = [finding("a", 0, "one"), finding("b", 0, "two")];
  assert.match(copyFindingReport(items, 1), /1 other findings/);
});
for (const limit of [0, -1, 1.5, NaN]) {
  test(`invalid copy diagnostic limit ${String(limit)} throws`, () => {
    assert.throws(() => copyFindingReport([], limit), RangeError);
  });
}
