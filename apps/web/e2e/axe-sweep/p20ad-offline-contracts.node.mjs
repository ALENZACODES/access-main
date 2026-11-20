import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_COPY, auditCopy, accessibleName, normalizeLocale, unknownValue,
  frenchCopyProblems, allCopyProblems, copyPairsAreComplete, languageNameProblem,
  hasAccessibleName, copySummary,
} from "./p20ad-offline-copy.ts";
import {
  calendarDate, safePath, evidenceIsKnown, evidenceIdentity, evidenceProblems,
  provenanceProblems, controlProblems, statusProblems, screenProblems,
  sameScreenIdentity, announcementDifference, transitionProblems, traceProblems,
  offlineFallbackProblems, requiredRouteCells, routeCellKey, routeMatrixProblems,
  summarizeAudit, filterAudit, auditIsBlocking, uniqueAudit, assertLocale,
} from "./p20ad-offline-contracts.ts";
import { keyboardSequenceFindings, navigationFindings } from "./p20ad-offline-browser.ts";

const provenance = (change = {}) => ({
  source: "Example dataset", licence: "Example licence", retrievedOn: "2026-11-19", tier: "E", ...change,
});
const evidence = (change = {}) => ({
  id: "example", label: "Example", value: "Recorded text", provenance: provenance(),
  explicitlyUnknown: false, ...change,
});
const control = (change = {}) => ({
  id: "search", role: "button", name: "Search", visible: true,
  disabled: false, inert: false, tabIndex: 0, width: 44, height: 44,
  focusVisible: true, insideDialog: false, ...change,
});
const status = (change = {}) => ({
  id: "status", text: "Results are ready.", locale: "en", politeness: "polite",
  visible: true, busy: false, emittedAt: 100, ...change,
});
const screen = (change = {}) => ({
  path: "/journey", locale: "en", connection: "online", cache: "fresh",
  outcome: "ready", title: "Journey", heading: "Journey", mainCount: 1,
  dialogOpen: false, focusId: "search", controls: [control()], statuses: [],
  evidence: [], scrollY: 0, historyIndex: 1,
  viewport: { width: 1280, height: 900 }, horizontalOverflow: 0,
  capturedAt: 100, ...change,
});
const event = (change = {}) => ({
  kind: "disconnect", before: screen(), after: screen({ connection: "offline" }),
  ...change,
});
const codes = (findings) => findings.map((finding) => finding.code);

// These fixtures describe synthetic app states only; they are not place data.
test("offline reference screen has no contract findings", () => {
  assert.deepEqual(screenProblems(screen()), []);
});

test("complete bilingual copy has matching keys", () => {
  assert.equal(copyPairsAreComplete(), true);
});

test("the local copy library passes its French typography checks", () => {
  assert.deepEqual(allCopyProblems(), []);
});

test("all offline messages have nonempty translations", () => {
  for (const locale of ["en", "fr"]) {
    for (const key of Object.keys(AUDIT_COPY[locale])) {
      assert.ok(auditCopy(locale, key).trim(), `${locale}/${key}`);
    }
  }
});

test("copy keys intentionally retain the UNKNOWN sentinel", () => {
  assert.equal(auditCopy("en", "unknown"), "UNKNOWN");
  assert.equal(auditCopy("fr", "unknown"), "UNKNOWN");
});

test("French retry name is not the English retry name", () => {
  assert.notEqual(auditCopy("en", "retry"), auditCopy("fr", "retry"));
});

test("language-aware role selector accepts localized search", () => {
  assert.equal(accessibleName("fr", "search").test("Rechercher"), true);
  assert.equal(accessibleName("fr", "search").test("Search"), false);
  assert.equal(accessibleName("en", "search").test("Search"), true);
});

test("role selector anchors to the entire accessible name", () => {
  assert.equal(accessibleName("en", "retry").test("Try again"), true);
  assert.equal(accessibleName("en", "retry").test("Try again later"), false);
});

test("document language en-CA is English", () => {
  assert.equal(normalizeLocale("en-CA"), "en");
});

test("document language fr-CA is French", () => {
  assert.equal(normalizeLocale("fr-CA"), "fr");
});

test("document language fr is French", () => {
  assert.equal(normalizeLocale("fr"), "fr");
});

test("document language en is English", () => {
  assert.equal(normalizeLocale("en"), "en");
});

test("uppercase language tags normalize", () => {
  assert.equal(normalizeLocale("FR-ca"), "fr");
});

test("unknown language tags remain unknown", () => {
  assert.equal(normalizeLocale(null), null);
  assert.equal(normalizeLocale("und"), null);
  assert.equal(normalizeLocale("es"), null);
  assert.equal(normalizeLocale("french"), null);
});

test("matching French document language passes", () => {
  assert.equal(languageNameProblem("fr-CA", "fr"), null);
});

test("mismatched French document language is diagnosed", () => {
  assert.equal(languageNameProblem("en-CA", "fr"), "document-language-mismatch");
});

test("unknown document language has its own finding", () => {
  assert.equal(languageNameProblem(null, "fr"), "document-language-unknown");
});

test("a native label can name a form control", () => {
  assert.equal(hasAccessibleName({ associatedLabel: "Adresse" }), true);
});

test("a labelledby reference can name a control", () => {
  assert.equal(hasAccessibleName({ labelledByText: "Résultats" }), true);
});

test("visible button text can name a control", () => {
  assert.equal(hasAccessibleName({ visibleText: "Retour" }), true);
});

test("image alternative can name an image button", () => {
  assert.equal(hasAccessibleName({ imageAlternative: "Carte" }), true);
});

test("title fallback may name a control", () => {
  assert.equal(hasAccessibleName({ title: "Options" }), true);
});

test("aria-label can name a control", () => {
  assert.equal(hasAccessibleName({ ariaLabel: "Rechercher" }), true);
});

test("blank or absent accessible name stays missing", () => {
  assert.equal(hasAccessibleName({}), false);
  assert.equal(hasAccessibleName({ ariaLabel: " " }), false);
});

test("copy reporter rejects a zero limit", () => {
  assert.throws(() => copySummary([], 0), RangeError);
});

test("copy reporter rejects a fractional limit", () => {
  assert.throws(() => copySummary([], 1.5), RangeError);
});

test("copy reporter collapses exact duplicates", () => {
  const problem = { code: "thin-space", language: "fr", key: "retry", offset: 3 };
  assert.equal(copySummary([problem, problem]).split("\n").length, 1);
});

test("copy reporter bounds output", () => {
  const problems = [
    { code: "thin-space", language: "fr", key: "a", offset: 3 },
    { code: "colon-nbsp", language: "fr", key: "b", offset: 2 },
  ];
  assert.match(copySummary(problems, 1), /further findings/);
});

for (const raw of [null, undefined, "", " ", "UNKNOWN", "unknown", "Inconnu", "Inconnue", "N/A", "—", "-", "null", "undefined"]) {
  test(`unavailable value stays UNKNOWN ${String(raw)}`, () => {
    assert.equal(unknownValue(raw), "UNKNOWN");
  });
}

for (const raw of ["0", "False", "Measured", "Inconnu mais mesuré", "unknown values", "none reported"]) {
  test(`known text is not erased: ${raw}`, () => {
    assert.equal(unknownValue(raw), raw);
  });
}

test("whitespace normalization preserves observable words", () => {
  assert.equal(unknownValue("  Fiche\n source   locale "), "Fiche source locale");
});

test("French apostrophe must be typographic", () => {
  assert.ok(codes(frenchCopyProblems("L'utilisateur")).includes("apostrophe"));
});

test("French curly apostrophe is permitted", () => {
  assert.deepEqual(frenchCopyProblems("L’utilisateur"), []);
});

test("French colon must use nonbreaking space", () => {
  assert.ok(codes(frenchCopyProblems("Source: UNKNOWN")).includes("colon-nbsp"));
});

test("French colon with U+00A0 is accepted", () => {
  assert.deepEqual(frenchCopyProblems("Source\u00a0: UNKNOWN"), []);
});

test("French semicolon must use narrow no-break space", () => {
  assert.ok(codes(frenchCopyProblems("Oui; non")).includes("thin-space"));
});

test("French semicolon with U+202F is accepted", () => {
  assert.deepEqual(frenchCopyProblems("Oui\u202f; non"), []);
});

test("French question mark must use narrow no-break space", () => {
  assert.ok(codes(frenchCopyProblems("Pourquoi?")).includes("thin-space"));
});

test("French question mark with U+202F is accepted", () => {
  assert.deepEqual(frenchCopyProblems("Pourquoi\u202f?"), []);
});

test("French exclamation point must use narrow no-break space", () => {
  assert.ok(codes(frenchCopyProblems("Attention!")).includes("thin-space"));
});

test("French exclamation point with U+202F is accepted", () => {
  assert.deepEqual(frenchCopyProblems("Attention\u202f!"), []);
});

test("French left guillemet must be followed by narrow no-break space", () => {
  assert.ok(codes(frenchCopyProblems("«Bonjour\u202f»")).includes("opening-guillemet"));
});

test("French right guillemet must be preceded by narrow no-break space", () => {
  assert.ok(codes(frenchCopyProblems("«\u202fBonjour»")).includes("closing-guillemet"));
});

test("French guillemets pass with both narrow no-break spaces", () => {
  assert.deepEqual(frenchCopyProblems("«\u202fBonjour\u202f»"), []);
});

for (const value of ["2026-11-19", "2024-02-29", "2000-02-29", "2026-12-31", "2026-04-30", "2026-09-30"]) {
  test(`date accepts ${value}`, () => {
    assert.equal(calendarDate(value), true);
  });
}

for (const value of [null, "", "yesterday", "2026-02-29", "1900-02-29", "2026-13-01", "2026-00-01", "2026-11-31", "2026-04-31", "0000-01-01", "2026/11/19", "2026-1-1"]) {
  test(`date rejects ${String(value)}`, () => {
    assert.equal(calendarDate(value), false);
  });
}

for (const value of ["/", "/journey", "/help", "/more/auditors", "/settings/language", "/places/example", "/a%20b"]) {
  test(`local route accepted ${value}`, () => {
    assert.equal(safePath(value), true);
  });
}

for (const value of ["", "help", "//foreign", "/a/../b", "/a/./b", "/a?b=1", "/a#panel", "/a\\b", "/a:b", "/a*b", "/a\u001fb", "/a\u007fb"]) {
  test(`unsafe route rejected ${JSON.stringify(value)}`, () => {
    assert.equal(safePath(value), false);
  });
}

test("complete example evidence has a source, licence, retrieval and tier", () => {
  assert.equal(evidenceIsKnown(evidence()), true);
  assert.deepEqual(evidenceProblems([evidence()], "/places"), []);
});

test("explicitly unknown evidence stays unresolved", () => {
  assert.equal(evidenceIsKnown(evidence({ explicitlyUnknown: true })), false);
});

test("evidence without a value stays unresolved", () => {
  assert.equal(evidenceIsKnown(evidence({ value: null })), false);
});

test("evidence without a name stays unresolved", () => {
  assert.equal(evidenceIsKnown(evidence({ label: "UNKNOWN" })), false);
});

test("evidence identity excludes translated label text", () => {
  assert.equal(evidenceIdentity(evidence()), evidenceIdentity(evidence({ label: "Exemple" })));
});

test("evidence identity retains source", () => {
  assert.notEqual(evidenceIdentity(evidence()), evidenceIdentity(evidence({ provenance: provenance({ source: "Alternate" }) })));
});

test("evidence identity retains licence", () => {
  assert.notEqual(evidenceIdentity(evidence()), evidenceIdentity(evidence({ provenance: provenance({ licence: "Other" }) })));
});

test("evidence identity retains retrievedOn", () => {
  assert.notEqual(evidenceIdentity(evidence()), evidenceIdentity(evidence({ provenance: provenance({ retrievedOn: "2026-11-18" }) })));
});

test("evidence identity retains tier", () => {
  assert.notEqual(evidenceIdentity(evidence()), evidenceIdentity(evidence({ provenance: provenance({ tier: "F" }) })));
});

for (const [field, value, expected] of [
  ["source", null, "evidence-source-unknown"],
  ["source", "UNKNOWN", "evidence-source-unknown"],
  ["licence", null, "evidence-licence-unknown"],
  ["licence", "Inconnu", "evidence-licence-unknown"],
  ["retrievedOn", null, "evidence-date-unknown"],
  ["retrievedOn", "2026-02-30", "evidence-date-unknown"],
  ["tier", null, "evidence-tier-unknown"],
  ["tier", "—", "evidence-tier-unknown"],
]) {
  test(`missing provenance ${field}/${String(value)} stays diagnosed`, () => {
    const input = evidence({ provenance: provenance({ [field]: value }) });
    assert.equal(evidenceIsKnown(input), false);
    assert.ok(codes(evidenceProblems([input], "/places")).includes(expected));
  });
}

test("evidence blank id is diagnosed", () => {
  assert.ok(codes(evidenceProblems([evidence({ id: "" })], "/places")).includes("evidence-id-empty"));
});

test("evidence repeated identifiers are diagnosed", () => {
  assert.ok(codes(evidenceProblems([evidence(), evidence()], "/places")).includes("evidence-id-duplicate"));
});

test("a missing value is information, not a positive accessibility claim", () => {
  const findings = evidenceProblems([evidence({ value: null })], "/places");
  assert.ok(findings.some((item) => item.code === "evidence-value-unknown" && item.severity === "warning"));
});

test("preserved evidence may have localized labels", () => {
  assert.deepEqual(provenanceProblems([evidence()], [evidence({ label: "Exemple" })], "/places", 1, true), []);
});

test("non-preserving search permits replacing records", () => {
  assert.deepEqual(provenanceProblems([evidence()], [], "/places", 1, false), []);
});

test("preserving transition detects lost records", () => {
  assert.ok(codes(provenanceProblems([evidence()], [], "/places", 1, true)).includes("evidence-lost"));
});

test("preserving transition detects changed source", () => {
  const after = evidence({ provenance: provenance({ source: "Different" }) });
  assert.ok(codes(provenanceProblems([evidence()], [after], "/places", 1, true)).includes("evidence-provenance-changed"));
});

test("preserving transition detects changed licence", () => {
  const after = evidence({ provenance: provenance({ licence: "Different" }) });
  assert.ok(codes(provenanceProblems([evidence()], [after], "/places", 1, true)).includes("evidence-provenance-changed"));
});

test("preserving transition detects changed date", () => {
  const after = evidence({ provenance: provenance({ retrievedOn: "2026-11-17" }) });
  assert.ok(codes(provenanceProblems([evidence()], [after], "/places", 1, true)).includes("evidence-provenance-changed"));
});

test("preserving transition detects changed evidence tier", () => {
  const after = evidence({ provenance: provenance({ tier: "G" }) });
  assert.ok(codes(provenanceProblems([evidence()], [after], "/places", 1, true)).includes("evidence-provenance-changed"));
});

test("a 44 by 44 pixel control passes", () => {
  assert.deepEqual(controlProblems([control()], "/journey"), []);
});

test("43px control width is a blocking error", () => {
  assert.ok(codes(controlProblems([control({ width: 43 })], "/journey")).includes("control-width-small"));
});

test("43px control height is a blocking error", () => {
  assert.ok(codes(controlProblems([control({ height: 43 })], "/journey")).includes("control-height-small"));
});

test("unobserved control width remains unknown", () => {
  const findings = controlProblems([control({ width: null })], "/journey");
  assert.ok(findings.some((item) => item.code === "control-width-unknown" && item.severity === "warning"));
});

test("unobserved control height remains unknown", () => {
  assert.ok(codes(controlProblems([control({ height: null })], "/journey")).includes("control-height-unknown"));
});

test("infinite geometry is not interpreted as a large target", () => {
  assert.ok(codes(controlProblems([control({ width: Infinity })], "/journey")).includes("control-width-unknown"));
});

test("not-a-number geometry is not interpreted as a valid target", () => {
  assert.ok(codes(controlProblems([control({ height: NaN })], "/journey")).includes("control-height-unknown"));
});

test("unnamed visible control is a failure", () => {
  assert.ok(codes(controlProblems([control({ name: null })], "/journey")).includes("control-name-unknown"));
});

test("disabled controls do not trigger interactive findings", () => {
  assert.deepEqual(controlProblems([control({ disabled: true, name: null, width: 1 })], "/journey"), []);
});

test("inert controls do not trigger interactive findings", () => {
  assert.deepEqual(controlProblems([control({ inert: true, name: null, width: 1 })], "/journey"), []);
});

test("hidden controls do not trigger interactive findings", () => {
  assert.deepEqual(controlProblems([control({ visible: false, name: null, width: 1 })], "/journey"), []);
});

test("duplicate control identifiers are diagnosed", () => {
  assert.ok(codes(controlProblems([control(), control()], "/journey")).includes("control-id-duplicate"));
});

test("invalid negative tabindex is diagnosed", () => {
  assert.ok(codes(controlProblems([control({ tabIndex: -4 })], "/journey")).includes("control-tabindex-invalid"));
});

test("fractional tabindex is diagnosed", () => {
  assert.ok(codes(controlProblems([control({ tabIndex: 0.5 })], "/journey")).includes("control-tabindex-invalid"));
});

test("a roving tabindex -1 target is not measured as a primary keyboard stop", () => {
  assert.deepEqual(controlProblems([control({ tabIndex: -1, width: 12, height: 12 })], "/journey"), []);
});

test("absent focus indicator is diagnosed", () => {
  assert.ok(codes(controlProblems([control({ focusVisible: false })], "/journey")).includes("focus-indicator-absent"));
});

test("unknown focus indicator is not silently classified as false", () => {
  assert.deepEqual(controlProblems([control({ focusVisible: null })], "/journey"), []);
});

test("named and visible status has no findings", () => {
  assert.deepEqual(statusProblems([status()], "/journey"), []);
});

test("hidden status does not trigger announcement findings", () => {
  assert.deepEqual(statusProblems([status({ visible: false, text: "" })], "/journey"), []);
});

test("empty polite status is diagnosed", () => {
  assert.ok(codes(statusProblems([status({ text: "" })], "/journey")).includes("status-message-empty"));
});

test("empty status with aria-live off does not claim speech", () => {
  assert.deepEqual(statusProblems([status({ text: "", politeness: "off" })], "/journey"), []);
});

test("unrecognized status urgency is recorded as unknown", () => {
  const findings = statusProblems([status({ politeness: "unknown" })], "/journey");
  assert.ok(findings.some((item) => item.code === "status-politeness-unknown" && item.severity === "warning"));
});

test("missing status locale is explicitly unknown", () => {
  assert.ok(codes(statusProblems([status({ locale: null })], "/journey")).includes("status-language-unknown"));
});

test("duplicate status IDs are diagnosed", () => {
  assert.ok(codes(statusProblems([status(), status()], "/journey")).includes("status-id-duplicate"));
});

test("status timestamp cannot precede zero", () => {
  assert.ok(codes(statusProblems([status({ emittedAt: -1 })], "/journey")).includes("status-time-invalid"));
});

test("status timestamp cannot be infinite", () => {
  assert.ok(codes(statusProblems([status({ emittedAt: Infinity })], "/journey")).includes("status-time-invalid"));
});

test("unknown status timestamp is not invented", () => {
  assert.deepEqual(statusProblems([status({ emittedAt: null })], "/journey"), []);
});

test("missing main region is diagnosed", () => {
  assert.ok(codes(screenProblems(screen({ mainCount: 0 }))).includes("main-count"));
});

test("duplicate main regions are diagnosed", () => {
  assert.ok(codes(screenProblems(screen({ mainCount: 2 }))).includes("main-count"));
});

test("unknown document title is diagnosed", () => {
  assert.ok(codes(screenProblems(screen({ title: null }))).includes("title-unknown"));
});

test("unknown first heading is diagnosed", () => {
  assert.ok(codes(screenProblems(screen({ heading: "" }))).includes("heading-unknown"));
});

test("missing language is not assumed to be English", () => {
  assert.ok(codes(screenProblems(screen({ locale: null }))).includes("language-unknown"));
});

test("unsafe path fails the screen contract", () => {
  assert.ok(codes(screenProblems(screen({ path: "//foreign" }))).includes("route-unsafe"));
});

test("horizontal overflow at 320 is diagnosed", () => {
  const result = screenProblems(screen({ viewport: { width: 320, height: 720 }, horizontalOverflow: 12 }));
  assert.ok(codes(result).includes("horizontal-overflow"));
});

test("exactly zero horizontal overflow passes", () => {
  assert.deepEqual(screenProblems(screen({ horizontalOverflow: 0 })), []);
});

test("unknown horizontal overflow remains unmeasured", () => {
  assert.deepEqual(screenProblems(screen({ horizontalOverflow: null })), []);
});

test("invalid viewport width is rejected", () => {
  assert.ok(codes(screenProblems(screen({ viewport: { width: 0, height: 720 } }))).includes("viewport-invalid"));
});

test("fractional viewport width is rejected", () => {
  assert.ok(codes(screenProblems(screen({ viewport: { width: 320.5, height: 720 } }))).includes("viewport-invalid"));
});

test("negative scroll position is diagnosed", () => {
  assert.ok(codes(screenProblems(screen({ scrollY: -1 }))).includes("scroll-invalid"));
});

test("unknown scroll position is not invented", () => {
  assert.deepEqual(screenProblems(screen({ scrollY: null })), []);
});

test("negative history position is diagnosed", () => {
  assert.ok(codes(screenProblems(screen({ historyIndex: -1 }))).includes("history-invalid"));
});

test("fractional history position is diagnosed", () => {
  assert.ok(codes(screenProblems(screen({ historyIndex: 1.5 }))).includes("history-invalid"));
});

test("unknown history position is not invented", () => {
  assert.deepEqual(screenProblems(screen({ historyIndex: null })), []);
});

test("capture timestamp must be finite", () => {
  assert.ok(codes(screenProblems(screen({ capturedAt: NaN }))).includes("capture-time-invalid"));
});

test("capture timestamp must not be negative", () => {
  assert.ok(codes(screenProblems(screen({ capturedAt: -1 }))).includes("capture-time-invalid"));
});

test("modal dialog detects escaped focus", () => {
  const target = control({ insideDialog: false });
  const findings = screenProblems(screen({ dialogOpen: true, controls: [target] }));
  assert.ok(codes(findings).includes("modal-focus-escaped"));
});

test("modal dialog permits focus inside", () => {
  const target = control({ insideDialog: true });
  assert.deepEqual(screenProblems(screen({ dialogOpen: true, controls: [target] })), []);
});

test("loading state requires an observed busy region", () => {
  assert.ok(codes(screenProblems(screen({ outcome: "loading" }))).includes("loading-unannounced"));
});

test("visible busy region satisfies loading contract", () => {
  const message = status({ text: "Loading", busy: true });
  assert.deepEqual(screenProblems(screen({ outcome: "loading", statuses: [message] })), []);
});

test("hidden busy region cannot satisfy loading contract", () => {
  const message = status({ text: "Loading", busy: true, visible: false });
  assert.ok(codes(screenProblems(screen({ outcome: "loading", statuses: [message] }))).includes("loading-unannounced"));
});

test("empty outcome needs an accessible status", () => {
  assert.ok(codes(screenProblems(screen({ outcome: "empty" }))).includes("outcome-silent"));
});

test("error outcome needs an accessible status", () => {
  assert.ok(codes(screenProblems(screen({ outcome: "error" }))).includes("outcome-silent"));
});

test("visible polite status satisfies error outcome", () => {
  assert.deepEqual(screenProblems(screen({ outcome: "error", statuses: [status()] })), []);
});

test("aria-live off does not satisfy error outcome", () => {
  const findings = screenProblems(screen({ outcome: "error", statuses: [status({ politeness: "off" })] }));
  assert.ok(codes(findings).includes("outcome-silent"));
});

test("French document with English status reports language mismatch", () => {
  const findings = screenProblems(screen({ locale: "fr", statuses: [status({ locale: "en" })] }));
  assert.ok(codes(findings).includes("status-language-mismatch"));
});

test("French document with French status passes", () => {
  assert.deepEqual(screenProblems(screen({ locale: "fr", statuses: [status({ locale: "fr", text: "Prêt" })] })), []);
});

test("same screen identity ignores focus position", () => {
  assert.equal(sameScreenIdentity(screen(), screen({ focusId: null })), true);
});

test("same screen identity ignores scroll position", () => {
  assert.equal(sameScreenIdentity(screen(), screen({ scrollY: 300 })), true);
});

test("same screen identity detects different path", () => {
  assert.equal(sameScreenIdentity(screen(), screen({ path: "/help" })), false);
});

test("same screen identity detects different locale", () => {
  assert.equal(sameScreenIdentity(screen(), screen({ locale: "fr" })), false);
});

test("same screen identity detects different connection", () => {
  assert.equal(sameScreenIdentity(screen(), screen({ connection: "offline" })), false);
});

test("same screen identity detects different cache state", () => {
  assert.equal(sameScreenIdentity(screen(), screen({ cache: "stale" })), false);
});

test("same screen identity detects different result state", () => {
  assert.equal(sameScreenIdentity(screen(), screen({ outcome: "empty" })), false);
});

test("adding one new status creates one announcement difference", () => {
  assert.equal(announcementDifference(screen(), screen({ statuses: [status()] })).length, 1);
});

test("unchanged status does not create a second announcement", () => {
  const before = screen({ statuses: [status()] });
  assert.deepEqual(announcementDifference(before, before), []);
});

test("hidden status does not create an announcement", () => {
  assert.deepEqual(announcementDifference(screen(), screen({ statuses: [status({ visible: false })] })), []);
});

test("aria-live off does not create an announcement", () => {
  assert.deepEqual(announcementDifference(screen(), screen({ statuses: [status({ politeness: "off" })] })), []);
});

test("changed message creates one new announcement", () => {
  const before = screen({ statuses: [status()] });
  const after = screen({ statuses: [status({ text: "No results" })] });
  assert.equal(announcementDifference(before, after).length, 1);
});

test("two duplicated messages are counted as a multiset", () => {
  const before = screen({ statuses: [status()] });
  const after = screen({ statuses: [status(), status({ id: "another" })] });
  assert.equal(announcementDifference(before, after).length, 1);
});

test("unobserved messages do not invent status timing", () => {
  const after = screen({ statuses: [status({ emittedAt: null })] });
  assert.equal(announcementDifference(screen(), after)[0]?.emittedAt, null);
});

test("normal disconnection transition passes", () => {
  assert.deepEqual(transitionProblems(event(), 1), []);
});

test("disconnection must result in observed offline state", () => {
  assert.ok(codes(transitionProblems(event({ after: screen() }), 1)).includes("disconnect-not-observed"));
});

test("reconnection must result in observed online state", () => {
  const before = screen({ connection: "offline" });
  const after = screen({ connection: "unknown" });
  assert.ok(codes(transitionProblems(event({ kind: "reconnect", before, after }), 1)).includes("reconnect-not-observed"));
});

test("successful reconnection transition passes", () => {
  const before = screen({ connection: "offline" });
  const after = screen({ connection: "online" });
  assert.deepEqual(transitionProblems(event({ kind: "reconnect", before, after }), 1), []);
});

test("disconnection must not navigate unexpectedly", () => {
  const after = screen({ path: "/help", connection: "offline" });
  assert.ok(codes(transitionProblems(event({ after }), 1)).includes("unexpected-navigation"));
});

test("disconnection must not switch locale unexpectedly", () => {
  const after = screen({ locale: "fr", connection: "offline" });
  assert.ok(codes(transitionProblems(event({ after }), 1)).includes("unexpected-language"));
});

test("language action permits switching locale", () => {
  const after = screen({ locale: "fr" });
  assert.deepEqual(transitionProblems(event({ kind: "language", after, intendedLocale: "fr" }), 1), []);
});

test("language action must actually switch locale", () => {
  assert.ok(codes(transitionProblems(event({ kind: "language", after: screen() }), 1)).includes("language-unchanged"));
});

test("language action must match the requested locale", () => {
  const after = screen({ locale: "fr" });
  const findings = transitionProblems(event({ kind: "language", after, intendedLocale: "en" }), 1);
  assert.ok(codes(findings).includes("language-target-mismatch"));
});

test("language action preserves current route", () => {
  const after = screen({ locale: "fr", path: "/help" });
  assert.ok(codes(transitionProblems(event({ kind: "language", after }), 1)).includes("unexpected-navigation"));
});

test("navigation action can intentionally change path", () => {
  const after = screen({ path: "/help" });
  assert.deepEqual(transitionProblems(event({ kind: "navigate", after, intendedRoute: "/help" }), 1), []);
});

test("navigation target mismatch is diagnosed", () => {
  const after = screen({ path: "/help" });
  const findings = transitionProblems(event({ kind: "navigate", after, intendedRoute: "/places" }), 1);
  assert.ok(codes(findings).includes("route-target-mismatch"));
});

test("back action requires decreasing history position", () => {
  const before = screen({ historyIndex: 2 });
  const after = screen({ historyIndex: 2 });
  assert.ok(codes(transitionProblems(event({ kind: "back", before, after }), 1)).includes("history-back-invalid"));
});

test("valid backward history position passes", () => {
  const before = screen({ historyIndex: 2 });
  const after = screen({ historyIndex: 1 });
  assert.deepEqual(transitionProblems(event({ kind: "back", before, after }), 1), []);
});

test("forward action requires increasing history position", () => {
  const before = screen({ historyIndex: 1 });
  const after = screen({ historyIndex: 1 });
  assert.ok(codes(transitionProblems(event({ kind: "forward", before, after }), 1)).includes("history-forward-invalid"));
});

test("valid forward history position passes", () => {
  const before = screen({ historyIndex: 1 });
  const after = screen({ historyIndex: 2 });
  assert.deepEqual(transitionProblems(event({ kind: "forward", before, after }), 1), []);
});

test("retry must originate from an unsuccessful outcome", () => {
  assert.ok(codes(transitionProblems(event({ kind: "retry" }), 1)).includes("retry-without-failure"));
});

test("retry after an error may start loading", () => {
  const before = screen({ outcome: "error" });
  const after = screen({ outcome: "loading" });
  assert.deepEqual(transitionProblems(event({ kind: "retry", before, after }), 1), []);
});

test("clear action should not start another search", () => {
  const after = screen({ outcome: "loading" });
  assert.ok(codes(transitionProblems(event({ kind: "clear", after }), 1)).includes("clear-started-loading"));
});

test("cache read remains unknown if no result is observed", () => {
  const after = screen({ cache: "unknown" });
  assert.ok(codes(transitionProblems(event({ kind: "cache-read", after }), 1)).includes("cache-result-unknown"));
});

test("cache write does not claim success if state is stale", () => {
  const after = screen({ cache: "stale" });
  assert.ok(codes(transitionProblems(event({ kind: "cache-write", after }), 1)).includes("cache-write-not-confirmed"));
});

test("cache write with observed fresh state passes", () => {
  assert.deepEqual(transitionProblems(event({ kind: "cache-write" }), 1), []);
});

test("open-dialog requires an observed dialog", () => {
  assert.ok(codes(transitionProblems(event({ kind: "open-dialog" }), 1)).includes("dialog-not-open"));
});

test("close-dialog requires no dialog after close", () => {
  const before = screen({ dialogOpen: true });
  const after = screen({ dialogOpen: true });
  assert.ok(codes(transitionProblems(event({ kind: "close-dialog", before, after }), 1)).includes("dialog-not-closed"));
});

test("valid open-dialog transition passes", () => {
  const after = screen({ dialogOpen: true });
  assert.deepEqual(transitionProblems(event({ kind: "open-dialog", after }), 1), []);
});

test("valid close-dialog transition passes", () => {
  const before = screen({ dialogOpen: true });
  assert.deepEqual(transitionProblems(event({ kind: "close-dialog", before }), 1), []);
});

test("preserve-focus transition detects lost focus", () => {
  const after = screen({ focusId: null, connection: "offline" });
  assert.ok(codes(transitionProblems(event({ after, preserveFocus: true }), 1)).includes("focus-not-restored"));
});

test("preserve-focus transition accepts the same focus identifier", () => {
  assert.deepEqual(transitionProblems(event({ preserveFocus: true }), 1), []);
});

test("preserve-evidence transition rejects source change", () => {
  const before = screen({ evidence: [evidence()] });
  const changed = evidence({ provenance: provenance({ source: "Other" }) });
  const after = screen({ connection: "offline", evidence: [changed] });
  assert.ok(codes(transitionProblems(event({ before, after, preserveEvidence: true }), 1))
    .includes("evidence-provenance-changed"));
});

test("offline transition warns if previously seen evidence disappears", () => {
  const before = screen({ evidence: [evidence()] });
  const after = screen({ connection: "offline", evidence: [] });
  assert.ok(codes(transitionProblems(event({ before, after }), 1)).includes("offline-evidence-lost"));
});

test("missing cache prevents asserting lost cached evidence", () => {
  const before = screen({ cache: "missing", evidence: [evidence()] });
  const after = screen({ connection: "offline", evidence: [] });
  assert.equal(codes(transitionProblems(event({ before, after }), 1)).includes("offline-evidence-lost"), false);
});

test("required transition status must change", () => {
  assert.ok(codes(transitionProblems(event({ requireStatus: true }), 1)).includes("status-not-updated"));
});

test("changed status satisfies announcement transition", () => {
  const after = screen({ connection: "offline", statuses: [status()] });
  assert.deepEqual(transitionProblems(event({ after, requireStatus: true }), 1), []);
});

test("new status cannot predate action", () => {
  const after = screen({ connection: "offline", statuses: [status({ emittedAt: 90 })] });
  const findings = transitionProblems(event({ after, requireStatus: true, actionAt: 100 }), 1);
  assert.ok(codes(findings).includes("status-before-action"));
});

test("unknown announcement time is not invented", () => {
  const after = screen({ connection: "offline", statuses: [status({ emittedAt: null })] });
  assert.deepEqual(transitionProblems(event({ after, requireStatus: true, actionAt: 100 }), 1), []);
});

test("a connected trace passes with correct prior state", () => {
  const first = event();
  assert.deepEqual(traceProblems({ initial: first.before, steps: [first] }), []);
});

test("an interrupted trace reports discontinuity", () => {
  const first = event();
  const second = event({ before: screen(), after: screen({ connection: "offline" }) });
  assert.ok(codes(traceProblems({ initial: first.before, steps: [first, second] })).includes("trace-discontinuous"));
});

test("empty cache cannot silently claim a ready offline result", () => {
  const offline = screen({ connection: "offline", cache: "missing", evidence: [], outcome: "ready" });
  assert.ok(codes(offlineFallbackProblems(offline)).includes("empty-cache-claimed-ready"));
});

test("offline unknown cache remains visibly unresolved", () => {
  const offline = screen({ connection: "offline", cache: "unknown", outcome: "ready" });
  assert.ok(codes(offlineFallbackProblems(offline)).includes("cache-status-unknown"));
});

test("offline stale evidence missing its date is diagnosed", () => {
  const entry = evidence({ provenance: provenance({ retrievedOn: null }) });
  const offline = screen({ connection: "offline", cache: "stale", evidence: [entry] });
  assert.ok(codes(offlineFallbackProblems(offline)).includes("stale-evidence-date-unknown"));
});

test("offline error must be announced", () => {
  const offline = screen({ connection: "offline", cache: "missing", outcome: "error" });
  assert.ok(codes(offlineFallbackProblems(offline)).includes("offline-error-unannounced"));
});

test("online screen does not trigger an offline-only rule", () => {
  assert.deepEqual(offlineFallbackProblems(screen({ cache: "missing" })), []);
});

test("fresh offline cache containing evidence is not incorrectly rejected", () => {
  const offline = screen({ connection: "offline", cache: "fresh", evidence: [evidence()] });
  assert.deepEqual(offlineFallbackProblems(offline), []);
});

test("two routes generate 16 network/language/width audit cells", () => {
  assert.equal(requiredRouteCells(["/", "/help"]).length, 16);
});

test("one route generates exactly eight audit cells", () => {
  assert.equal(requiredRouteCells(["/journey"]).length, 8);
});

test("matrix keys encode locale, viewport and connectivity", () => {
  const keys = requiredRouteCells(["/"]).map(routeCellKey);
  assert.equal(new Set(keys).size, 8);
});

test("complete route matrix passes", () => {
  const cells = requiredRouteCells(["/", "/journey"]);
  assert.deepEqual(routeMatrixProblems(cells, cells), []);
});

test("missing matrix cell is diagnosed", () => {
  const cells = requiredRouteCells(["/", "/journey"]);
  assert.ok(codes(routeMatrixProblems(cells, cells.slice(1))).includes("matrix-missing"));
});

test("duplicate matrix cell is diagnosed", () => {
  const cells = requiredRouteCells(["/"]);
  assert.ok(codes(routeMatrixProblems(cells, [...cells, cells[0]])).includes("matrix-duplicate"));
});

test("unexpected matrix cell is diagnosed", () => {
  const cells = requiredRouteCells(["/"]);
  const unexpected = requiredRouteCells(["/help"])[0];
  assert.ok(codes(routeMatrixProblems(cells, [...cells, unexpected])).includes("matrix-unexpected"));
});

test("reporting remains bounded", () => {
  const result = screenProblems(screen({ mainCount: 0, title: "", heading: "" }));
  assert.match(summarizeAudit(result, 1), /additional findings/);
});

test("reporting deduplicates identical findings", () => {
  const result = screenProblems(screen({ mainCount: 0 }));
  assert.equal(summarizeAudit([...result, ...result]), summarizeAudit(result));
});

test("reporting rejects zero limit", () => {
  assert.throws(() => summarizeAudit([], 0), RangeError);
});

test("reporting rejects noninteger limit", () => {
  assert.throws(() => summarizeAudit([], 1.2), RangeError);
});

test("blocking error is detectable without conflating warnings", () => {
  const problem = screenProblems(screen({ mainCount: 0 }));
  assert.equal(auditIsBlocking(problem), true);
});

test("warnings alone are not a blocking failure", () => {
  const problem = evidenceProblems([evidence({ value: null })], "/journey");
  assert.equal(auditIsBlocking(problem), false);
});

test("severity filter retains only requested severity", () => {
  const problem = screenProblems(screen({ mainCount: 0, locale: null }));
  assert.ok(filterAudit(problem, "error").every((item) => item.severity === "error"));
});

test("finding deduplication retains first occurrence", () => {
  const item = screenProblems(screen({ mainCount: 0 }))[0];
  assert.deepEqual(uniqueAudit([item, item]), [item]);
});

test("locale assertion accepts regional French", () => {
  assert.equal(assertLocale("fr-CA", "fr"), true);
});

test("locale assertion rejects English in French run", () => {
  assert.equal(assertLocale("en-CA", "fr"), false);
});

test("locale assertion does not infer a missing tag", () => {
  assert.equal(assertLocale(null, "en"), false);
});

test("keyboard Tab with observed eligible focus passes", () => {
  const sequence = [{ key: "Tab", before: null, after: "search", beforeScrollY: 0,
    afterScrollY: 0, beforeUrl: "/", afterUrl: "/", pressedAt: 100 }];
  assert.deepEqual(keyboardSequenceFindings(sequence, [control()]), []);
});

test("keyboard Tab without focus has an UNKNOWN finding", () => {
  const sequence = [{ key: "Tab", before: null, after: null, beforeScrollY: 0,
    afterScrollY: 0, beforeUrl: "/", afterUrl: "/", pressedAt: 100 }];
  assert.ok(keyboardSequenceFindings(sequence, [control()]).some((item) => item.startsWith("keyboard-focus-unknown")));
});

test("Tab must not land on an inert control", () => {
  const sequence = [{ key: "Tab", before: null, after: "search", beforeScrollY: 0,
    afterScrollY: 0, beforeUrl: "/", afterUrl: "/", pressedAt: 100 }];
  assert.ok(keyboardSequenceFindings(sequence, [control({ inert: true })]).some((item) => item.startsWith("keyboard-focus-unavailable")));
});

test("Tab must not land on a hidden control", () => {
  const sequence = [{ key: "Tab", before: null, after: "search", beforeScrollY: 0,
    afterScrollY: 0, beforeUrl: "/", afterUrl: "/", pressedAt: 100 }];
  assert.ok(keyboardSequenceFindings(sequence, [control({ visible: false })]).some((item) => item.startsWith("keyboard-focus-unavailable")));
});

test("Escape does not unexpectedly navigate", () => {
  const sequence = [{ key: "Escape", before: "search", after: "search", beforeScrollY: 0,
    afterScrollY: 0, beforeUrl: "/", afterUrl: "/help", pressedAt: 100 }];
  assert.ok(keyboardSequenceFindings(sequence, [control()]).some((item) => item.startsWith("escape-navigated")));
});

test("keyboard timestamp must be observed and finite", () => {
  const sequence = [{ key: "Tab", before: null, after: "search", beforeScrollY: 0,
    afterScrollY: 0, beforeUrl: "/", afterUrl: "/", pressedAt: NaN }];
  assert.ok(keyboardSequenceFindings(sequence, [control()]).some((item) => item.startsWith("keyboard-timestamp-invalid")));
});

test("successful navigation snapshot passes", () => {
  const item = { from: "/", to: "/help", responseStatus: 200,
    title: "Help", heading: "Help", locale: "en", mainCount: 1 };
  assert.deepEqual(navigationFindings(item, "/help", "en"), []);
});

test("navigation wrong target is diagnosed", () => {
  const item = { from: "/", to: "/", responseStatus: 200,
    title: "Help", heading: "Help", locale: "en", mainCount: 1 };
  assert.ok(navigationFindings(item, "/help", "en").includes("navigation-wrong-route"));
});

test("navigation missing HTTP response stays unknown", () => {
  const item = { from: "/", to: "/help", responseStatus: null,
    title: "Help", heading: "Help", locale: "en", mainCount: 1 };
  assert.ok(navigationFindings(item, "/help", "en").includes("navigation-response-unknown"));
});

test("navigation HTTP error is diagnosed", () => {
  const item = { from: "/", to: "/help", responseStatus: 404,
    title: "Help", heading: "Help", locale: "en", mainCount: 1 };
  assert.ok(navigationFindings(item, "/help", "en").includes("navigation-response-error"));
});

test("navigation French mismatch is diagnosed", () => {
  const item = { from: "/", to: "/help", responseStatus: 200,
    title: "Aide", heading: "Aide", locale: "en", mainCount: 1 };
  assert.ok(navigationFindings(item, "/help", "fr").includes("navigation-language-mismatch"));
});

test("navigation lacking a heading is diagnosed", () => {
  const item = { from: "/", to: "/help", responseStatus: 200,
    title: "Help", heading: null, locale: "en", mainCount: 1 };
  assert.ok(navigationFindings(item, "/help", "en").includes("navigation-heading-missing"));
});

test("navigation missing title is diagnosed", () => {
  const item = { from: "/", to: "/help", responseStatus: 200,
    title: "", heading: "Help", locale: "en", mainCount: 1 };
  assert.ok(navigationFindings(item, "/help", "en").includes("navigation-title-missing"));
});

test("navigation duplicated main is diagnosed", () => {
  const item = { from: "/", to: "/help", responseStatus: 200,
    title: "Help", heading: "Help", locale: "en", mainCount: 2 };
  assert.ok(navigationFindings(item, "/help", "en").includes("navigation-main-count"));
});
