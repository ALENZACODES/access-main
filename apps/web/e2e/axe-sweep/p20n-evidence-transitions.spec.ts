import { expect, test } from "@playwright/test";
import {
  compareLocaleEvidence, compareOfflineEvidence, duplicateEvidenceIssues,
  effectiveEvidenceState, formatTransitionIssues, hasCompleteEvidence,
  isLocalRoute, safeIdentity, type EvidenceSnapshot,
} from "./p20n-evidence-transitions";

const complete = (changes: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
  id: "sample-place", route: "/places/sample-place", locale: "en",
  connectivity: "online", source: "Local source", licence: "ODbL-1.0",
  date: "2026-11-15", tier: "E", state: "KNOWN", ...changes,
});

for (const value of ["/", "/places/a", "/help/article", "/more/housing"]) {
  test(`accepts local route ${value}`, () => expect(isLocalRoute(value)).toBe(true));
}
for (const value of ["", "places", "//other", "/a?b=c", "/a#frag", "/a/../b", "/a/./b", "/a\\b"]) {
  test(`rejects nonlocal route ${JSON.stringify(value)}`, () => expect(isLocalRoute(value)).toBe(false));
}
for (const value of ["", "  ", "\u0000", "x".repeat(161)]) {
  test(`rejects invalid identity of length ${value.length}`, () => expect(safeIdentity(value)).toBeNull());
}

test("full evidence retains its declared state", () => {
  expect(hasCompleteEvidence(complete())).toBe(true);
  expect(effectiveEvidenceState(complete())).toBe("KNOWN");
});

for (const field of ["source", "licence", "date", "tier"] as const) {
  test(`missing ${field} stays unknown`, () => {
    const entry = complete({ [field]: "UNKNOWN" });
    expect(hasCompleteEvidence(entry)).toBe(false);
    expect(effectiveEvidenceState(entry)).toBe("UNKNOWN");
  });
  test(`translation cannot add missing ${field}`, () => {
    const before = complete({ [field]: null });
    const after = complete({ locale: "fr" });
    expect(compareLocaleEvidence(before, after).map((entry) => entry.code)).toContain("unknown-upgraded");
  });
  test(`offline copies cannot add missing ${field}`, () => {
    const before = complete({ [field]: null });
    const after = complete({ connectivity: "offline" });
    expect(compareOfflineEvidence(before, after).map((entry) => entry.code)).toContain("offline-inferred");
  });
}

test("an explicit unknown remains unknown with otherwise complete fields", () => {
  expect(effectiveEvidenceState(complete({ state: "UNKNOWN" }))).toBe("UNKNOWN");
});

test("malformed dates do not establish evidence", () => {
  expect(effectiveEvidenceState(complete({ date: "2026-02-30" }))).toBe("UNKNOWN");
});

test("a translation with unchanged metadata passes", () => {
  expect(compareLocaleEvidence(complete(), complete({ locale: "fr" }))).toEqual([]);
});

test("a translation cannot invent a known state", () => {
  expect(compareLocaleEvidence(complete({ state: "UNKNOWN" }), complete({ locale: "fr" }))
    .map((entry) => entry.code)).toContain("state-upgraded");
});

test("translation metadata changes are reported", () => {
  expect(compareLocaleEvidence(complete(), complete({ locale: "fr", source: "Different source" }))
    .map((entry) => entry.code)).toContain("evidence-changed");
});

test("changing the record ID is not a translation", () => {
  expect(compareLocaleEvidence(complete(), complete({ locale: "fr", id: "other" }))
    .map((entry) => entry.code)).toEqual(["record-identity"]);
});

test("a matching offline copy retains language and evidence", () => {
  expect(compareOfflineEvidence(complete(), complete({ connectivity: "offline" }))).toEqual([]);
});

test("offline copy changing language fails", () => {
  expect(compareOfflineEvidence(complete(), complete({ locale: "fr", connectivity: "offline" }))
    .map((entry) => entry.code)).toContain("locale-changed-offline");
});

test("offline copy altering known metadata fails", () => {
  expect(compareOfflineEvidence(complete(), complete({ licence: "CC0-1.0", connectivity: "offline" }))
    .map((entry) => entry.code)).toContain("offline-metadata-changed");
});

test("an offline upgrade in claimed evidence state fails", () => {
  expect(compareOfflineEvidence(complete({ state: "UNKNOWN" }), complete({ connectivity: "offline" }))
    .map((entry) => entry.code)).toContain("offline-state-upgraded");
});

test("identical ID and route are not silently deduplicated", () => {
  expect(duplicateEvidenceIssues([complete(), complete()]).map((entry) => entry.code)).toContain("duplicate-record");
});

test("conflicting evidence for one ID is detected", () => {
  expect(duplicateEvidenceIssues([complete(), complete({ locale: "fr", state: "UNKNOWN" })])
    .map((entry) => entry.code)).toContain("inconsistent-state");
});

test("invalid ID is a finding", () => {
  expect(duplicateEvidenceIssues([complete({ id: "" })]).map((entry) => entry.code)).toEqual(["invalid-identity"]);
});

test("diagnostics list rule and record without inventing claims", () => {
  const findings = compareOfflineEvidence(complete(), complete({ locale: "fr", connectivity: "offline" }));
  expect(formatTransitionIssues(findings)).toContain("locale-changed-offline");
  expect(formatTransitionIssues([])).toBe("");
});
