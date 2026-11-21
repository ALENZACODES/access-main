import test from "node:test";
import assert from "node:assert/strict";
import {
  COPY, localCopy, localeTag, frenchTypographyFindings, copyTableFindings,
  announcementFindings, localeFindings, languageEventFindings, localizedAccessibleName,
  normalizedAnnouncement, statusChanged, languageCoverage,
} from "./p20ak-locale.ts";
import { sampleEvent, sampleSnapshot, UNKNOWN } from "./p20ak-types.ts";
const codes = (findings) => findings.map((finding) => finding.code);
const message = (patch = {}) => ({ key: "status", text: "Results ready", language: "en", politeness: "polite",
  busy: false, visible: true, observedAt: 100, ...patch });

test("bilingual copy keys are complete", () => {
  assert.deepEqual(Object.keys(COPY.en).sort(), Object.keys(COPY.fr).sort());
});
test("copy table passes French punctuation", () => {
  assert.deepEqual(copyTableFindings(), []);
});
test("UNKNOWN is the same sentinel in both languages", () => {
  assert.equal(localCopy("en", "unknown"), UNKNOWN);
  assert.equal(localCopy("fr", "unknown"), UNKNOWN);
});
for (const key of Object.keys(COPY.en)) {
  test(`English ${key} is nonempty`, () => {
    assert.ok(localCopy("en", key).trim());
  });
  test(`French ${key} is nonempty`, () => {
    assert.ok(localCopy("fr", key).trim());
  });
  test(`French ${key} passes typography`, () => {
    assert.deepEqual(frenchTypographyFindings(localCopy("fr", key)), []);
  });
}
for (const [tag, expected] of [["en", "en"], ["en-CA", "en"], ["EN-us", "en"], ["fr", "fr"], ["fr-CA", "fr"], ["FR-ca", "fr"], ["es", UNKNOWN], ["und", UNKNOWN], ["", UNKNOWN], ["english", UNKNOWN], [null, UNKNOWN]]) {
  test(`locale token ${String(tag)} maps to ${expected}`, () => {
    assert.equal(localeTag(tag), expected);
  });
}
for (const [input, code] of [["l'homme", "fr-apostrophe"], ["Titre:", "fr-colon"], ["Pourquoi?", "fr-thin-space"], ["Oui!", "fr-thin-space"], ["Un; deux", "fr-thin-space"], ["«bonjour", "fr-guillemet-open"], ["bonjour»", "fr-guillemet-close"]]) {
  test(`French malformed punctuation ${input} is diagnosed`, () => {
    assert.ok(codes(frenchTypographyFindings(input)).includes(code));
  });
}
for (const clean of ["L’état", "Titre\u00a0:", "Pourquoi\u202f?", "Oui\u202f!", "Un\u202f; deux", "«\u202fbonjour\u202f»"]) {
  test(`correct French typography ${clean} passes`, () => {
    assert.deepEqual(frenchTypographyFindings(clean), []);
  });
}
test("matching announcement language passes", () => {
  assert.deepEqual(announcementFindings([message()], "en"), []);
});
test("status mismatched to page language is diagnosed", () => {
  assert.ok(codes(announcementFindings([message({ language: "fr" })], "en")).includes("announcement-language"));
});
test("unknown announcement language remains UNKNOWN", () => {
  assert.ok(codes(announcementFindings([message({ language: UNKNOWN })], "en")).includes("announcement-language-unknown"));
});
test("visible empty live status is diagnosed", () => {
  assert.ok(codes(announcementFindings([message({ text: "" })], "en")).includes("announcement-empty"));
});
test("hidden empty live region is not a spoken failure", () => {
  assert.equal(codes(announcementFindings([message({ text: "", visible: false })], "en")).includes("announcement-empty"), false);
});
test("duplicate live region keys are diagnosed", () => {
  assert.ok(codes(announcementFindings([message(), message()])).includes("announcement-key-repeated"));
});
test("duplicate spoken messages are diagnosed", () => {
  assert.ok(codes(announcementFindings([message(), message({ key: "another" })])).includes("announcement-duplicate"));
});
test("different announcements do not look duplicated", () => {
  assert.equal(codes(announcementFindings([message(), message({ key: "another", text: "Loading" })])).includes("announcement-duplicate"), false);
});
test("busy assertive status is flagged", () => {
  assert.ok(codes(announcementFindings([message({ busy: true, politeness: "assertive" })], "en")).includes("announcement-busy-assertive"));
});
test("invalid observed time is flagged", () => {
  assert.ok(codes(announcementFindings([message({ observedAt: -1 })], "en")).includes("announcement-time"));
});
test("unknown politeness is retained", () => {
  assert.ok(codes(announcementFindings([message({ politeness: UNKNOWN })], "en")).includes("announcement-politeness-unknown"));
});
test("document language UNKNOWN is a finding", () => {
  assert.ok(codes(localeFindings(UNKNOWN, "/help")).includes("document-language-unknown"));
});
test("known supported page language passes", () => {
  assert.deepEqual(localeFindings("fr", "/help"), []);
});
test("language event must switch locales", () => {
  assert.ok(codes(languageEventFindings(sampleEvent({ action: "language" }))).includes("locale-not-changed"));
});
test("language event must preserve route identity", () => {
  const after = sampleSnapshot({ route: "/help", language: "fr" });
  assert.ok(codes(languageEventFindings(sampleEvent({ action: "language", after }))).includes("locale-route-reset"));
});
test("language event cannot claim known target language from UNKNOWN", () => {
  const after = sampleSnapshot({ language: UNKNOWN });
  assert.ok(codes(languageEventFindings(sampleEvent({ action: "language", after }))).includes("locale-target-unknown"));
});
test("localized search name accepts French copy", () => {
  assert.equal(localizedAccessibleName("fr", "search").test("Rechercher"), true);
});
test("localized search name rejects English copy in French", () => {
  assert.equal(localizedAccessibleName("fr", "search").test("Search"), false);
});
test("localized name is fully anchored", () => {
  assert.equal(localizedAccessibleName("en", "retry").test("Try again later"), false);
});
test("unknown message is normalized to sentinel", () => {
  assert.equal(normalizedAnnouncement("Inconnu"), UNKNOWN);
});
test("new live message is a status transition", () => {
  assert.equal(statusChanged([message()], [message({ text: "Updated" })]), true);
});
test("same live message does not fabricate status transition", () => {
  assert.equal(statusChanged([message()], [message()]), false);
});
test("language coverage distinguishes unknown", () => {
  assert.deepEqual(languageCoverage([message(), message({ language: "fr" }), message({ language: UNKNOWN })]),
    { en: 1, fr: 1, unknown: 1 });
});
