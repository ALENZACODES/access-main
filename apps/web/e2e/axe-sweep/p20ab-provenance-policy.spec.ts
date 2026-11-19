import { expect, test } from "@playwright/test";
import {
  countsByTier, diffEvidence, evidenceTier, evidenceTransitionIssues, evidenceUnknown,
  evidenceViewIssues, formatEvidenceIssues, inspectEvidence, inspectTransitions,
  issueSummary, licenceKind, metadataKnowledge, missingTranslations, nameInLanguage,
  recordIdentity, recordIssues, recordSetIdentity, recordsByKnowledge, safeSourceLink,
  unsafeSourceRecords, validDate,
  type EvidenceTransition, type EvidenceView, type SourceRecord,
} from "./p20ab-provenance-policy";

const record = (change: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "place-1", name: { en: "Community hall", fr: "Salle communautaire" },
  source: "Municipal register", licence: "ODbL-1.0", date: "2026-11-15",
  tier: "E", sourceUrl: "https://example.org/source", observedAt: "2026-11-15",
  localOnly: false, demonstration: false, ...change,
});
const view = (change: Partial<EvidenceView> = {}): EvidenceView => ({
  route: "/places", language: "en", connection: "online", state: "ready",
  records: [record()], statusMessage: "1 result", errors: [], asOf: "2026-11-19",
  savedOnDevice: false, ...change,
});
const transition = (change: Partial<EvidenceTransition> = {}): EvidenceTransition => ({
  kind: "refresh", before: view(), after: view(), changedRecordsAllowed: false,
  ...change,
});
const codes = (items: readonly { code: string }[]): string[] => items.map((entry) => entry.code);
const has = (items: readonly { code: string }[], code: string): boolean => codes(items).includes(code);

for (const value of [null, undefined, "", "  ", "UNKNOWN", "Unknown", "Inconnu", "Inconnue", "not provided", "Not Available", "—", "–", "-", "n/a", "s.o."]) {
  test(`missing provenance ${JSON.stringify(value)} remains UNKNOWN`, () => {
    expect(evidenceUnknown(value)).toBe(true);
  });
}
for (const value of ["Toronto", "City of Toronto", "Licence municipale", "CC-BY-4.0", "2026-11-15", "E", "0", "3"]) {
  test(`recognizes supplied provenance ${JSON.stringify(value)} as nonempty`, () => {
    expect(evidenceUnknown(value)).toBe(false);
  });
}
for (const tier of ["0", "1", "2", "3", "4", "E", "e"]) {
  test(`recognizes tier ${tier}`, () => {
    expect(evidenceTier(tier)).toBe(tier.toUpperCase());
  });
}
for (const tier of ["", "UNKNOWN", "7", "X", "-1", "2.5", "E1", null, undefined]) {
  test(`does not invent unsupported tier ${JSON.stringify(tier)}`, () => {
    expect(evidenceTier(tier)).toBe("UNKNOWN");
  });
}
for (const date of ["2024-02-29", "2026-11-19", "2000-02-29", "1999-12-31", "2026-01-01"]) {
  test(`accepts real calendar date ${date}`, () => {
    expect(validDate(date)).toBe(true);
  });
}
for (const date of ["2025-02-29", "2026-02-30", "2026-00-01", "2026-13-01", "2026-11-31", "0000-01-01", "2026/11/19", "2026-1-1", "", null]) {
  test(`rejects invalid calendar date ${String(date)}`, () => {
    expect(validDate(date)).toBe(false);
  });
}
for (const url of ["https://example.org", "http://example.org/source", "https://open.canada.ca/data"]) {
  test(`accepts ordinary public source URL ${url}`, () => {
    expect(safeSourceLink(url)).toBe(true);
  });
}
for (const url of ["javascript:alert(1)", "data:text/plain,x", "ftp://example.org", "http://user:secret@example.org", "example.org", "/relative", "https://"]) {
  test(`rejects unsupported source URL ${JSON.stringify(url)}`, () => {
    expect(safeSourceLink(url)).toBe(false);
  });
}
for (const url of ["UNKNOWN", "Not available", "", null]) {
  test(`missing source URL stays UNKNOWN ${String(url)}`, () => {
    expect(safeSourceLink(url)).toBeNull();
  });
}
for (const licence of ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "Open Government Licence", "Licence du gouvernement ouvert"]) {
  test(`recognizes open licence family ${licence}`, () => {
    expect(licenceKind(licence)).toBe("open");
  });
}
for (const licence of ["All rights reserved", "Proprietary", "Exclusive licence", "Restricted use"]) {
  test(`keeps restricted licences restricted ${licence}`, () => {
    expect(licenceKind(licence)).toBe("restricted");
  });
}
for (const licence of ["UNKNOWN", "", null, "Terms not recorded", "Unclassified permit"]) {
  test(`does not guess ambiguous licensing ${String(licence)}`, () => {
    expect(licenceKind(licence)).toBe("UNKNOWN");
  });
}

test("stable identifiers are preserved", () => {
  expect(recordIdentity(record())).toBe("place-1");
});
test("missing identifier stays unknown", () => {
  expect(recordIdentity(record({ id: "  " }))).toBeNull();
});
test("English name is selected from English copy", () => {
  expect(nameInLanguage(record(), "en")).toBe("Community hall");
});
test("French name is selected from French copy", () => {
  expect(nameInLanguage(record(), "fr")).toBe("Salle communautaire");
});
test("missing French translation is not backfilled from English", () => {
  expect(nameInLanguage(record({ name: { en: "Hall" } }), "fr")).toBeNull();
});
test("blank translated name does not become known", () => {
  expect(nameInLanguage(record({ name: { en: " ", fr: "Salle" } }), "en")).toBeNull();
});
test("complete metadata with an open source remains known", () => {
  expect(metadataKnowledge(record())).toBe("KNOWN");
});
for (const [field, value] of [
  ["source", null], ["licence", null], ["date", null], ["tier", null],
  ["sourceUrl", null], ["source", "UNKNOWN"], ["licence", "UNKNOWN"],
  ["date", "2026-02-30"], ["tier", "7"], ["licence", "Proprietary"],
  ["sourceUrl", "javascript:alert(1)"], ["id", ""],
] as const) {
  test(`incomplete ${field} ${String(value)} cannot produce KNOWN metadata`, () => {
    expect(metadataKnowledge(record({ [field]: value }))).toBe("UNKNOWN");
  });
}
test("complete record exposes no findings", () => {
  expect(recordIssues(record(), "en", "/places")).toEqual([]);
});
for (const [code, change] of [
  ["record-id", { id: "" }],
  ["record-name", { name: { en: "" } }],
  ["source-unknown", { source: null }],
  ["licence-unknown", { licence: null }],
  ["licence-restricted", { licence: "All rights reserved" }],
  ["licence-unclassified", { licence: "Unknown terms by source" }],
  ["source-date-unknown", { date: null }],
  ["source-date-invalid", { date: "2026-02-30" }],
  ["source-tier-unknown", { tier: "7" }],
  ["source-link-unsafe", { sourceUrl: "file:///private/file" }],
  ["source-link-unknown", { sourceUrl: null }],
  ["observation-date-invalid", { observedAt: "yesterday" }],
  ["local-record-external-link", { localOnly: true }],
  ["demonstration-live-claim", { demonstration: true, tier: "4" }],
] as const) {
  test(`flags record finding ${code}`, () => {
    expect(has(recordIssues(record(change), "en", "/places"), code)).toBe(true);
  });
}
test("unknown data is information rather than accessibility failure", () => {
  const finding = recordIssues(record({ source: null }), "en", "/places").find((entry) => entry.code === "source-unknown");
  expect(finding?.level).toBe("information");
});
test("restricted licence is a warning, not redistribution permission", () => {
  const finding = recordIssues(record({ licence: "All rights reserved" }), "en", "/places").find((entry) => entry.code === "licence-restricted");
  expect(finding?.level).toBe("warning");
});
test("unsafe scheme is a concrete error", () => {
  const finding = recordIssues(record({ sourceUrl: "javascript:void(0)" }), "en", "/places").find((entry) => entry.code === "source-link-unsafe");
  expect(finding?.level).toBe("error");
});

test("complete online evidence view produces a passing inspection", () => {
  expect(inspectEvidence(view())).toMatchObject({ decision: "PASS", observed: 1, known: 1, unknown: 0, issues: [] });
});
test("no source must not produce a positive inspection", () => {
  expect(inspectEvidence(view({ records: [record({ source: null })] })).decision).toBe("UNKNOWN");
});
test("invalid source date blocks the audit", () => {
  expect(inspectEvidence(view({ records: [record({ date: "2026-02-30" })] })).decision).toBe("BLOCKED");
});
test("missing language copy is not silently translated", () => {
  expect(has(evidenceViewIssues(view({ language: "fr", records: [record({ name: { en: "Hall" } })] })), "record-name")).toBe(true);
});
test("duplicate visible record IDs are rejected", () => {
  expect(has(evidenceViewIssues(view({ records: [record(), record()] })), "duplicate-record")).toBe(true);
});
test("empty state cannot display nonempty record list", () => {
  expect(has(evidenceViewIssues(view({ state: "empty" })), "empty-with-records")).toBe(true);
});
test("ready state without records stays a warning", () => {
  expect(has(evidenceViewIssues(view({ records: [] })), "ready-without-records")).toBe(true);
});
test("error state requires error feedback", () => {
  expect(has(evidenceViewIssues(view({ state: "error", errors: [] })), "silent-error")).toBe(true);
});
test("loading state requires a loading announcement", () => {
  expect(has(evidenceViewIssues(view({ state: "loading", statusMessage: "Ready" })), "silent-loading")).toBe(true);
});
test("French loading announcement is accepted", () => {
  expect(has(evidenceViewIssues(view({ state: "loading", statusMessage: "Chargement…" })), "silent-loading")).toBe(false);
});
test("offline data with unknown local origin cannot be reported as fully available", () => {
  expect(has(evidenceViewIssues(view({ connection: "offline", savedOnDevice: false })), "offline-data-origin-unknown")).toBe(true);
});
test("a stored offline pack may retain dated known provenance", () => {
  expect(has(evidenceViewIssues(view({ connection: "offline", savedOnDevice: true })), "offline-data-origin-unknown")).toBe(false);
});
test("unknown connection remains information", () => {
  expect(has(evidenceViewIssues(view({ connection: "UNKNOWN" })), "connection-unknown")).toBe(true);
});
test("unknown state never implies ready", () => {
  expect(has(evidenceViewIssues(view({ state: "UNKNOWN" })), "view-state-unknown")).toBe(true);
});
test("as-of date must be a calendar date when supplied", () => {
  expect(has(evidenceViewIssues(view({ asOf: "2026-15-01" })), "view-asof-invalid")).toBe(true);
});
test("missing as-of date does not fabricate freshness", () => {
  expect(has(evidenceViewIssues(view({ asOf: null })), "view-asof-invalid")).toBe(false);
});
test("explicit missing metadata is counted as unknown", () => {
  const result = inspectEvidence(view({ records: [record(), record({ id: "p2", source: null })] }));
  expect(result).toMatchObject({ observed: 2, known: 1, unknown: 1, decision: "UNKNOWN" });
});

test("no evidence changes produce an empty change ledger", () => {
  expect(diffEvidence(view(), view())).toEqual([]);
});
for (const key of ["source", "licence", "date", "tier", "sourceUrl"] as const) {
  test(`loss of ${key} is detected across language navigation`, () => {
    const after = view({ records: [record({ [key]: null })] });
    expect(has(diffEvidence(view(), after), "evidence-lost")).toBe(true);
  });
  test(`addition of ${key} stays informational`, () => {
    const before = view({ records: [record({ [key]: null })] });
    const added = diffEvidence(before, view());
    expect(added).toContainEqual(expect.objectContaining({ code: "evidence-added", level: "information" }));
  });
  test(`conflicting known ${key} is reported`, () => {
    const after = view({ records: [record({ [key]: `Changed ${key}` })] });
    expect(has(diffEvidence(view(), after), "evidence-changed")).toBe(true);
  });
}
test("records newly added by a refresh are not confused with old IDs", () => {
  const after = view({ records: [record({ id: "new" })] });
  expect(diffEvidence(view(), after)).toEqual([]);
});
test("missing record identity does not cause invented correspondence", () => {
  const after = view({ records: [record({ id: "other", source: null })] });
  expect(has(diffEvidence(view(), after), "evidence-lost")).toBe(false);
});

test("identical transition does not rewrite evidence", () => {
  expect(evidenceTransitionIssues(transition())).toEqual([]);
});
test("non-navigation transition cannot change route", () => {
  expect(has(evidenceTransitionIssues(transition({ after: view({ route: "/help" }) })), "route-changed")).toBe(true);
});
test("navigation checks its required destination", () => {
  const result = evidenceTransitionIssues(transition({ kind: "navigate", expectedRoute: "/help", after: view({ route: "/places" }) }));
  expect(has(result, "destination-mismatch")).toBe(true);
});
test("French language change requires French page state", () => {
  expect(has(evidenceTransitionIssues(transition({ kind: "language", expectedLanguage: "fr" })), "language-mismatch")).toBe(true);
});
test("missing requested locale is explicitly UNKNOWN", () => {
  expect(has(evidenceTransitionIssues(transition({ kind: "language", expectedLanguage: undefined })), "language-unknown")).toBe(true);
});
test("unrequested locale changes are rejected", () => {
  const result = evidenceTransitionIssues(transition({ after: view({ language: "fr" }) }));
  expect(has(result, "unexpected-locale")).toBe(true);
});
test("offline transition must reach offline state", () => {
  expect(has(evidenceTransitionIssues(transition({ kind: "offline" })), "offline-not-applied")).toBe(true);
});
test("online transition must reach online state", () => {
  const result = evidenceTransitionIssues(transition({ kind: "online", after: view({ connection: "offline", savedOnDevice: true }) }));
  expect(has(result, "online-not-applied")).toBe(true);
});
test("retry error persistence is visible", () => {
  const result = evidenceTransitionIssues(transition({ kind: "retry", before: view({ state: "error" }), after: view({ state: "error", errors: ["Unavailable"] }) }));
  expect(has(result, "retry-still-error")).toBe(true);
});
test("filter cannot introduce a new record ID", () => {
  const result = evidenceTransitionIssues(transition({ kind: "filter", after: view({ records: [record(), record({ id: "new" })] }) }));
  expect(has(result, "filter-added-record")).toBe(true);
});
test("filters can remove a record without inventing another", () => {
  const before = view({ records: [record(), record({ id: "second" })] });
  expect(has(evidenceTransitionIssues(transition({ kind: "filter", before, after: view() })), "filter-added-record")).toBe(false);
});
test("locale transition rejects lost licence evidence", () => {
  const after = view({ language: "fr", records: [record({ licence: null })] });
  const result = evidenceTransitionIssues(transition({ kind: "language", expectedLanguage: "fr", after }));
  expect(has(result, "evidence-lost")).toBe(true);
});
test("explicit data-change permission does not disguise malformed evidence", () => {
  const after = view({ records: [record({ date: "2026-02-30" })] });
  const result = evidenceTransitionIssues(transition({ kind: "online", changedRecordsAllowed: true, after }));
  expect(has(result, "source-date-invalid")).toBe(true);
});
test("unknown transition history remains unknown", () => {
  expect(inspectTransitions([])).toMatchObject({ decision: "UNKNOWN", observed: 0, known: 0, unknown: 0 });
});
test("stable refresh transition can pass", () => {
  expect(inspectTransitions([transition()]).decision).toBe("PASS");
});
test("unsafe URL in transition blocks report", () => {
  const after = view({ records: [record({ sourceUrl: "javascript:bad" })] });
  expect(inspectTransitions([transition({ after })]).decision).toBe("BLOCKED");
});
test("missing source in final transition is UNKNOWN", () => {
  const after = view({ records: [record({ source: null })] });
  expect(inspectTransitions([transition({ after })]).decision).toBe("UNKNOWN");
});

test("tier counts preserve UNKNOWN explicitly", () => {
  const records = [record({ tier: "0" }), record({ id: "b", tier: "E" }), record({ id: "c", tier: null })];
  expect(countsByTier(records)).toMatchObject({ "0": 1, E: 1, UNKNOWN: 1 });
});
test("record knowledge groups are disjoint", () => {
  const records = [record(), record({ id: "second", licence: null })];
  const groups = recordsByKnowledge(records);
  expect(groups.known).toHaveLength(1);
  expect(groups.unknown).toHaveLength(1);
});
test("record set identity is independent of display ordering", () => {
  const first = [record({ id: "a" }), record({ id: "b" })];
  expect(recordSetIdentity(first)).toBe(recordSetIdentity([...first].reverse()));
});
test("missing French titles are reported by record identity", () => {
  expect(missingTranslations([record({ name: { en: "Hall" } })])).toEqual(["place-1"]);
});
test("complete bilingual name does not need fallback", () => {
  expect(missingTranslations([record()])).toEqual([]);
});
test("unsafe external source references retain record IDs", () => {
  expect(unsafeSourceRecords([record(), record({ id: "unsafe", sourceUrl: "data:text/plain,x" })])).toEqual(["unsafe"]);
});
test("issues are classified by severity without altering the underlying issue list", () => {
  const issues = recordIssues(record({ licence: null, date: "2026-02-30" }), "en", "/places");
  const summary = issueSummary(issues);
  expect(summary.error).toBeGreaterThan(0);
  expect(summary.information).toBeGreaterThan(0);
});
test("formatting deduplicates identical findings", () => {
  const issues = recordIssues(record({ source: null }), "en", "/places");
  expect(formatEvidenceIssues([...issues, ...issues]).split("\n")).toHaveLength(issues.length);
});
test("formatting shows truncated count", () => {
  const issues = recordIssues(record({ source: null, licence: null, date: null, tier: null }), "en", "/places");
  expect(formatEvidenceIssues(issues, 1)).toContain("additional findings");
});
test("formatting rejects nonpositive report limit", () => {
  expect(() => formatEvidenceIssues([], 0)).toThrow(RangeError);
});
