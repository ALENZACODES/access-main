import { expect, test } from "@playwright/test";
import {
  announcementIssues, calendarDate, coverageIssues, coverageMatrix,
  evidenceChangeIssues, evidenceCompleteness, evidenceIssues, historySummary,
  normalizedEvidenceValue, sameScreenIdentity, screenIssues, sequenceIssues,
  transitionIssues, type ActionSequence, type AnnouncementRecord,
  type EvidenceEntry, type ScreenState, type ScreenTransition,
} from "./p20y-state-history";

const record = (changes: Partial<EvidenceEntry> = {}): EvidenceEntry => ({
  id: "record-1", source: "City open data", licence: "Open licence",
  date: "2026-11-15", tier: "E", status: "KNOWN", label: "Example stop",
  version: "1.0.0", ...changes,
});

const screen = (changes: Partial<ScreenState> = {}): ScreenState => ({
  route: "/places", language: "en", connectivity: "online", result: "ready",
  focusId: "search", scrollPosition: 0, message: "1 result", busy: false,
  evidence: [record()], ...changes,
});

const change = (changes: Partial<ScreenTransition> = {}): ScreenTransition => ({
  action: "language", before: screen(), after: screen({ language: "fr" }),
  expectedRoute: "/places", preserveEvidence: true, preserveFocus: true,
  ...changes,
});

const announcement = (changes: Partial<AnnouncementRecord> = {}): AnnouncementRecord => ({
  id: "status", state: "ready", locale: "en", politeness: "polite",
  text: "1 result", emittedAt: 120, afterActionAt: 100,
  busy: false, ...changes,
});

const codes = (items: readonly { code: string }[]): string[] => items.map((item) => item.code);

test("a complete dated record remains known", () => {
  expect(evidenceCompleteness(record())).toBe("KNOWN");
  expect(evidenceIssues([record()], "/places")).toEqual([]);
});

for (const value of [null, "", "  ", "UNKNOWN", "Unknown", "INCONNU", "Inconnue", "—", "N/A", "-"]) {
  test(`missing value ${JSON.stringify(value)} stays unknown`, () => {
    expect(normalizedEvidenceValue(value)).toBeNull();
  });
}

test("known text is normalized but never invented", () => {
  expect(normalizedEvidenceValue("  Source\n locale   ")).toBe("Source locale");
  expect(normalizedEvidenceValue("  Inconnu mais mesuré  ")).toBe("Inconnu mais mesuré");
});

for (const value of [
  "2026-02-28", "2024-02-29", "2026-11-19", "2000-02-29", "2026-12-31",
]) {
  test(`calendar accepts ${value}`, () => {
    expect(calendarDate(value)).toBe(true);
  });
}

for (const value of [
  "2025-02-29", "1900-02-29", "2026-02-30", "2026-00-01", "2026-13-01",
  "2026-11-31", "0000-01-01", "2026-01-00", "2026/11/19", "yesterday", "",
]) {
  test(`calendar rejects ${value || "empty"}`, () => {
    expect(calendarDate(value)).toBe(false);
  });
}

test("missing calendar date stays unknown", () => {
  expect(calendarDate(null)).toBe(false);
  expect(evidenceCompleteness(record({ date: null }))).toBe("UNKNOWN");
});

for (const [field, value] of [
  ["id", ""], ["label", ""], ["source", null], ["licence", "UNKNOWN"],
  ["date", "2026-02-30"], ["tier", "Inconnu"],
] as const) {
  test(`missing ${field} prevents known evidence status`, () => {
    const modified = record({ [field]: value });
    expect(evidenceCompleteness(modified)).toBe("UNKNOWN");
  });
}

test("known state with a missing source produces an error", () => {
  const findings = evidenceIssues([record({ source: null })], "/places");
  expect(codes(findings)).toContain("unsupported-known-state");
});

test("an incomplete record labelled unknown is not upgraded", () => {
  const findings = evidenceIssues([record({ source: null, status: "UNKNOWN" })], "/places");
  expect(findings).toEqual([]);
});

test("empty identifiers and names are identified independently", () => {
  const findings = evidenceIssues([record({ id: "", label: "" })], "/places");
  expect(codes(findings)).toContain("record-id-empty");
  expect(codes(findings)).toContain("record-name-empty");
});

test("duplicate records never collapse silently", () => {
  const findings = evidenceIssues([record(), record()], "/places");
  expect(codes(findings)).toContain("record-duplicate-id");
});

test("invalid known date and version are both identified", () => {
  const findings = evidenceIssues([record({ date: "2026-02-30", version: "prototype?" })], "/places");
  expect(codes(findings)).toContain("record-date-invalid");
  expect(codes(findings)).toContain("record-version-invalid");
});

test("a missing version is allowed when source fields are present", () => {
  expect(evidenceIssues([record({ version: null })], "/places")).toEqual([]);
});

test("language switches preserve identical source metadata", () => {
  expect(evidenceChangeIssues([record()], [record({ label: "Arrêt exemple" })], "/places", true)).toEqual([]);
});

for (const [field, value] of [
  ["source", "Different source"], ["licence", "Different licence"],
  ["date", "2026-11-18"], ["tier", "1"],
] as const) {
  test(`evidence transition catches ${field} drift`, () => {
    const findings = evidenceChangeIssues([record()], [record({ [field]: value })], "/places", true);
    expect(codes(findings)).toContain("record-provenance-changed");
  });
}

test("removing a record during a preserving transition is a finding", () => {
  expect(codes(evidenceChangeIssues([record()], [], "/places", true))).toContain("record-lost");
});

test("a non-preserving search can return a different evidence set", () => {
  expect(evidenceChangeIssues([record()], [record({ id: "another" })], "/places", false)).toEqual([]);
});

test("a complete screen has no local continuity findings", () => {
  expect(screenIssues(screen())).toEqual([]);
});

for (const [changes, code] of [
  [{ route: "//foreign" }, "screen-invalid-route"],
  [{ scrollPosition: -1 }, "screen-invalid-scroll"],
  [{ result: "loading", busy: false }, "loading-not-busy"],
  [{ result: "ready", busy: true }, "busy-after-load"],
  [{ result: "error", message: "" }, "error-silent"],
  [{ result: "empty", message: "" }, "empty-silent"],
] as const) {
  test(`screen contract catches ${code}`, () => {
    expect(codes(screenIssues(screen(changes as Partial<ScreenState>)))).toContain(code);
  });
}

test("the valid French transition preserves focus and evidence", () => {
  expect(transitionIssues(change())).toEqual([]);
});

for (const [changes, code] of [
  [{ expectedRoute: "/help" }, "transition-route-mismatch"],
  [{ after: screen({ language: "en" }) }, "language-not-changed"],
  [{ after: screen({ language: "fr", focusId: null }) }, "focus-lost"],
  [{ after: screen({ language: "fr", route: "/about" }) }, "language-loses-route"],
  [{ action: "disconnect", after: screen() }, "disconnect-unobserved"],
  [{ action: "reconnect", after: screen({ connectivity: "offline" }) }, "reconnect-unobserved"],
  [{ action: "retry", before: screen({ result: "ready" }) }, "retry-without-failure"],
  [{ action: "clear", after: screen({ result: "loading", busy: true }) }, "clear-started-search"],
] as const) {
  test(`screen transition catches ${code}`, () => {
    expect(codes(transitionIssues(change(changes as Partial<ScreenTransition>)))).toContain(code);
  });
}

test("disconnection preserves evidence and locale", () => {
  const before = screen({ language: "fr" });
  const after = screen({ language: "fr", connectivity: "offline" });
  expect(transitionIssues(change({ action: "disconnect", before, after }))).toEqual([]);
});

test("connectivity unknown is distinct from claiming online", () => {
  const event = change({ action: "reconnect", before: screen({ connectivity: "offline" }),
    after: screen({ connectivity: "unknown" }) });
  expect(codes(transitionIssues(event))).toContain("reconnect-unobserved");
});

test("a single status announcement is timely and named", () => {
  expect(announcementIssues([announcement()])).toEqual([]);
});

for (const [changes, code] of [
  [{ text: "" }, "announcement-empty"],
  [{ emittedAt: 99 }, "announcement-before-action"],
  [{ emittedAt: 1700 }, "announcement-late"],
  [{ state: "error", politeness: "off" }, "announcement-error-silent"],
  [{ state: "loading", busy: false }, "announcement-loading-busy"],
  [{ emittedAt: Number.NaN }, "announcement-time-invalid"],
] as const) {
  test(`announcement policy catches ${code}`, () => {
    expect(codes(announcementIssues([announcement(changes as Partial<AnnouncementRecord>)]))).toContain(code);
  });
}

test("repeated announcement without new action is detected", () => {
  expect(codes(announcementIssues([announcement(), announcement({ id: "second" })])))
    .toContain("announcement-duplicate");
});

test("a new action permits the same message again", () => {
  expect(announcementIssues([announcement(), announcement({ afterActionAt: 125, emittedAt: 150 })])).toEqual([]);
});

test("invalid timeline limits are rejected", () => {
  expect(() => announcementIssues([], -1)).toThrow();
  expect(() => announcementIssues([], Number.NaN)).toThrow();
});

test("a connected action sequence passes", () => {
  const initial = screen();
  const next = screen({ language: "fr" });
  const sequence: ActionSequence = {
    initial, transitions: [change({ before: initial, after: next })],
    announcements: [announcement({ locale: "fr" })],
  };
  expect(sequenceIssues(sequence)).toEqual([]);
});

test("the sequence detects a discontinuity in route and locale", () => {
  const sequence: ActionSequence = {
    initial: screen(),
    transitions: [change({ before: screen({ route: "/help" }) })],
    announcements: [],
  };
  expect(codes(sequenceIssues(sequence))).toContain("transition-chain-broken");
});

test("screen identity omits unimportant focus changes", () => {
  expect(sameScreenIdentity(screen(), screen({ focusId: null }))).toBe(true);
  expect(sameScreenIdentity(screen(), screen({ language: "fr" }))).toBe(false);
});

test("coverage enumerates language, connection, and result outcomes", () => {
  const routes = ["/", "/places", "/help"];
  const matrix = coverageMatrix(routes);
  expect(matrix).toHaveLength(routes.length * 2 * 2 * 3);
  expect(coverageIssues(routes, matrix)).toEqual([]);
  expect(codes(coverageIssues(routes, matrix.slice(1)))).toContain("coverage-missing");
});

test("unknown is not silently treated as a complete coverage state", () => {
  const matrix = coverageMatrix(["/"]).filter((entry) => entry.state !== "error");
  expect(coverageIssues(["/"], matrix)).toHaveLength(4);
});

test("history diagnostics deduplicate and truncate cleanly", () => {
  const failures = screenIssues(screen({ result: "loading" }));
  const summary = historySummary([...failures, ...failures], 1);
  expect(summary).toContain("loading-not-busy");
  expect(historySummary(failures, 10)).toContain("loading-not-busy");
});

test("invalid history report limits are rejected", () => {
  expect(() => historySummary([], 0)).toThrow();
  expect(() => historySummary([], 2.5)).toThrow();
});
