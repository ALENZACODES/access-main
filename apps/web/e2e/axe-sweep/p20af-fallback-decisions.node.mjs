import test from "node:test";
import assert from "node:assert/strict";
import {
  TEXT, localized, decide, experienceFindings, knownReview, reviewFindings,
  trailFindings, reviewItems, reviewText, distinctReviewGroups,
} from "./p20af-fallback-decisions.ts";

const resource = (changes = {}) => ({ id: "pack", url: "/offline", purpose: "data", method: "GET", requestState: "fulfilled",
  status: 200, cache: "present", bytes: 100, started: 1, finished: 2,
  sensitive: "public", licence: "Example licence", source: "Example source", retrievedOn: "2026-11-19", ...changes });
const required = (changes = {}) => ({ id: "read-main", resourceId: "pack", essential: true, operation: "read", ...changes });
const experience = (changes = {}) => ({ route: "/offline", locale: "en", connection: "online", requested: "read",
  resources: [resource()], requirements: [required()], ...changes });
const review = (changes = {}) => ({ id: "record", locale: "en", route: "/offline", source: "Example source",
  licence: "Example licence", retrievedOn: "2026-11-19", tier: "E", status: "KNOWN", ...changes });
const codes = (items) => items.map((item) => item.code);

test("complete local resource allows reading", () => assert.equal(decide(experience()).allowLocalRead, true));
test("complete local resource yields available view", () => assert.equal(decide(experience()).view, "available"));
test("read-only request never automatically permits export", () => assert.equal(decide(experience()).allowExport, false));
test("export requires matching operation", () => {
  const changed = experience({ requested: "export", requirements: [required({ operation: "export" })] });
  assert.equal(decide(changed).allowExport, true);
});
test("empty requirements remain unknown", () => assert.equal(decide(experience({ requirements: [] })).view, "unknown"));
test("missing essential resource makes view unavailable", () => {
  assert.equal(decide(experience({ resources: [] })).view, "unavailable");
});
test("unknown cache stays unknown", () => {
  assert.equal(decide(experience({ resources: [resource({ cache: "unknown" })] })).view, "unknown");
});
test("stale cache is not declared usable", () => {
  assert.equal(decide(experience({ resources: [resource({ cache: "stale" })] })).view, "unavailable");
});
test("failed request is not declared usable", () => {
  assert.equal(decide(experience({ resources: [resource({ requestState: "failed" })] })).view, "unavailable");
});
test("partial evidence does not become full availability", () => {
  const changed = experience({ requirements: [required(), required({ id: "second", resourceId: "missing" })] });
  assert.equal(decide(changed).view, "partial");
});
test("optional missing record does not prohibit local reading", () => {
  const changed = experience({ requirements: [required(), required({ id: "extra", resourceId: "missing", essential: false })] });
  assert.equal(decide(changed).allowLocalRead, true);
});
test("available required resource plus unresolved optional is partial", () => {
  const changed = experience({ resources: [resource(), resource({ id: "aux", cache: "unknown" })],
    requirements: [required(), required({ id: "extra", resourceId: "aux", essential: false })] });
  assert.equal(decide(changed).view, "partial");
});
test("unknown essential still prevents full availability", () => {
  const changed = experience({ resources: [resource(), resource({ id: "aux", cache: "unknown" })],
    requirements: [required(), required({ id: "extra", resourceId: "aux" })] });
  assert.equal(decide(changed).view, "unknown");
});
test("offline state is not mistaken for successful network access", () => {
  assert.equal(decide(experience({ connection: "offline" })).reason, "offline");
});
test("failed request identifies failure reason", () => {
  assert.equal(decide(experience({ resources: [resource({ requestState: "failed" })] })).reason, "request-failed");
});
test("stale resource identifies stale reason", () => {
  assert.equal(decide(experience({ resources: [resource({ cache: "stale" })] })).reason, "stale");
});
test("missing resource identifies missing reason", () => {
  assert.equal(decide(experience({ resources: [] })).reason, "missing");
});
test("unknown resource reason is never guessed", () => {
  assert.equal(decide(experience({ resources: [resource({ cache: "unknown" })] })).reason, "unknown");
});
test("available IDs are requirement identities, not resource labels", () => {
  assert.deepEqual(decide(experience()).availableIds, ["read-main"]);
});
test("missing IDs contain missing requirement only", () => {
  assert.deepEqual(decide(experience({ resources: [] })).missingIds, ["read-main"]);
});
test("unknown IDs contain unknown requirement only", () => {
  assert.deepEqual(decide(experience({ resources: [resource({ cache: "unknown" })] })).unresolvedIds, ["read-main"]);
});

for (const [key, en, fr] of [
  ["offline", "Offline", "Hors ligne"], ["retry", "Try again", "Réessayer"],
  ["back", "Go back", "Retour"], ["source", "Source", "Source"],
  ["licence", "Licence", "Licence"], ["date", "Retrieved on", "Date de consultation"],
  ["tier", "Evidence tier", "Niveau de preuve"], ["export", "Export local copy", "Exporter la copie locale"],
]) {
  test(`localized copy ${key} uses the frozen bilingual wording`, () => {
    assert.equal(localized("en", key), en);
    assert.equal(localized("fr", key), fr);
  });
}
test("UNKNOWN token remains uppercase in both languages", () => {
  assert.equal(TEXT.en.unknown, "UNKNOWN");
  assert.equal(TEXT.fr.unknown, "UNKNOWN");
});
test("French contraction uses typographic apostrophe", () => assert.match(TEXT.fr.failed, /n’a/));
test("French copy avoids English-only retry button name", () => assert.notEqual(TEXT.fr.retry, TEXT.en.retry));

for (const [changes, code] of [
  [{ route: "//other" }, "experience-route"],
  [{ requirements: [required(), required()] }, "requirement-duplicate"],
  [{ requirements: [required({ id: "" })] }, "requirement-id-empty"],
  [{ requirements: [required({ resourceId: "missing" })] }, "requirement-resource-missing"],
  [{ resources: [] }, "experience-unavailable"],
  [{ resources: [resource({ cache: "unknown" })] }, "experience-unknown"],
]) {
  test(`experience ${JSON.stringify(changes)} reports ${code}`, () => {
    assert.ok(codes(experienceFindings(experience(changes))).includes(code));
  });
}
test("baseline experience has no errors", () => {
  assert.deepEqual(experienceFindings(experience()).filter((item) => item.severity === "error"), []);
});
test("unavailable fallback is a warning, not asserted success", () => {
  const findings = experienceFindings(experience({ resources: [] }));
  assert.equal(findings.find((item) => item.code === "experience-unavailable")?.severity, "warning");
});
test("unknown fallback is information, not asserted failure", () => {
  const findings = experienceFindings(experience({ resources: [resource({ cache: "unknown" })] }));
  assert.equal(findings.find((item) => item.code === "experience-unknown")?.severity, "information");
});
test("private resource in offline export is diagnosed", () => {
  const changed = experience({ connection: "offline", requested: "export", resources: [resource({ sensitive: "private" })], requirements: [required({ operation: "export" })] });
  assert.ok(codes(experienceFindings(changed)).includes("private-export-risk"));
});

test("complete review can remain KNOWN", () => assert.equal(knownReview(review()), true));
test("UNKNOWN labelled review is never KNOWN", () => assert.equal(knownReview(review({ status: "UNKNOWN" })), false));
for (const [field, value] of [
  ["source", null], ["licence", null], ["tier", null],
  ["retrievedOn", null], ["retrievedOn", "2026-02-30"],
  ["source", "UNKNOWN"], ["licence", "Inconnu"], ["tier", "—"],
]) {
  test(`incomplete review ${field}=${String(value)} stays unresolved`, () => {
    assert.equal(knownReview(review({ [field]: value })), false);
    assert.ok(codes(reviewFindings([review({ [field]: value })])).some((code) => code.startsWith("review-")));
  });
}
test("known review with missing source reports an error", () => {
  assert.ok(codes(reviewFindings([review({ source: null })])).includes("review-unsupported-known"));
});
test("incomplete UNKNOWN review does not report unsupported known", () => {
  assert.equal(codes(reviewFindings([review({ source: null, status: "UNKNOWN" })])).includes("review-unsupported-known"), false);
});
test("repeated review identifiers report duplicate", () => assert.ok(codes(reviewFindings([review(), review()])).includes("review-id-duplicate")));
test("review route must be local", () => assert.ok(codes(reviewFindings([review({ route: "//host" })])).includes("review-invalid-route")));
test("empty review identifier is surfaced", () => assert.ok(codes(reviewFindings([review({ id: "" })])).includes("review-id-empty")));

for (const [field, value] of [
  ["source", "Other source"], ["licence", "Other licence"],
  ["retrievedOn", "2026-11-18"], ["tier", "B"],
]) {
  test(`review trail catches changed ${field}`, () => {
    const trail = { before: [review()], after: [review({ [field]: value })], action: "locale", preserve: true };
    assert.ok(codes(trailFindings(trail)).includes("review-provenance-drift"));
  });
}
test("review trail catches record lost during preserving action", () => {
  assert.ok(codes(trailFindings({ before: [review()], after: [], action: "locale", preserve: true })).includes("review-lost"));
});
test("review trail catches UNKNOWN unexpectedly promoted to KNOWN", () => {
  const changed = { before: [review({ status: "UNKNOWN" })], after: [review()], action: "locale", preserve: true };
  assert.ok(codes(trailFindings(changed)).includes("review-unknown-promoted"));
});
test("non-preserving search may change review set", () => {
  const changed = { before: [review()], after: [], action: "search", preserve: false };
  assert.equal(codes(trailFindings(changed)).includes("review-lost"), false);
});
test("unchanged review survives language transition", () => {
  const changed = { before: [review()], after: [review({ locale: "fr" })], action: "locale", preserve: true };
  assert.equal(codes(trailFindings(changed)).includes("review-provenance-drift"), false);
});

test("offline review adds connection notice", () => {
  assert.ok(reviewItems(experience({ connection: "offline" })).some((item) => item.id === "connection"));
});
test("missing resource adds fallback notice", () => {
  assert.ok(reviewItems(experience({ resources: [] })).some((item) => item.id === "missing"));
});
test("unknown resource adds unresolved notice", () => {
  assert.ok(reviewItems(experience({ resources: [resource({ cache: "unknown" })] })).some((item) => item.id === "unresolved"));
});
test("stale resource adds staleness notice", () => {
  assert.ok(reviewItems(experience({ resources: [resource({ cache: "stale" })] })).some((item) => item.id === "stale"));
});
test("failed request adds failure notice", () => {
  assert.ok(reviewItems(experience({ resources: [resource({ requestState: "failed" })] })).some((item) => item.id === "failed"));
});
test("available resource offers review action", () => {
  assert.ok(reviewItems(experience()).some((item) => item.id === "review"));
});
test("export action only when all requirements met", () => {
  const changed = experience({ requested: "export", requirements: [required({ operation: "export" })] });
  assert.ok(reviewItems(changed).some((item) => item.id === "export"));
});
test("export action not offered for missing data", () => {
  const changed = experience({ requested: "export", resources: [], requirements: [required({ operation: "export" })] });
  assert.equal(reviewItems(changed).some((item) => item.id === "export"), false);
});
test("rendered review text is locale-sensitive", () => {
  const output = reviewText(experience({ locale: "fr", connection: "offline" }));
  assert.match(output, /Hors ligne/);
});
test("English review text remains English", () => assert.match(reviewText(experience({ connection: "offline" })), /Offline/));
test("review groups count complete and incomplete records separately", () => {
  const groups = distinctReviewGroups([review(), review({ id: "other", status: "UNKNOWN" }), review({ id: "fr", locale: "fr" })]);
  assert.deepEqual(groups, { en: { known: 1, unknown: 1 }, fr: { known: 1, unknown: 0 } });
});
