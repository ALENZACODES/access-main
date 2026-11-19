import { expect, test } from "@playwright/test";
import {
  displayFindings, evidenceConflict, evidenceItemFindings, evidenceValueFindings,
  findingCodes, frameFindings, isUnknownLabel, journeyFindings, openLicense,
  transitionFindings, validDate,
  type EvidenceFrame, type EvidenceItem, type EvidenceTransition, type EvidenceValue,
} from "./p20x-provenance";

const value = (state: "KNOWN" | "UNKNOWN", content: string | null): EvidenceValue => ({ state, value: content });
const item = (change: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: "place-1", title: "Example place", locale: "en", kind: "official-page",
  source: value("KNOWN", "City catalogue"), licence: value("KNOWN", "CC-BY-4.0"),
  date: value("KNOWN", "2026-11-15"), tier: value("KNOWN", "E"),
  links: ["https://example.org/source"], isDemonstration: false, observedAt: null,
  retrievedAt: "2026-11-15", localOnly: true, ...change,
});
const frame = (change: Partial<EvidenceFrame> = {}): EvidenceFrame => ({
  route: "/places", locale: "en", connectivity: "online", asOf: "2026-11-19",
  records: [item()], pending: false, sourceStatus: "Snapshot", visibleCount: 1, ...change,
});
const transition = (change: Partial<EvidenceTransition> = {}): EvidenceTransition => ({
  action: "navigate", from: frame(), to: frame({ route: "/help" }), expectedRoute: "/help", ...change,
});
const codes = (findings: readonly { rule: string }[]) => findings.map((finding) => finding.rule);

for (const text of [null, "", " ", "UNKNOWN", "Unknown", "Inconnu", "Inconnue", "Not provided", "Non fourni", "Non fournie", "n/a", "—", "-"]) {
  test(`unknown label ${JSON.stringify(text)}`, () => {
    expect(isUnknownLabel(text)).toBe(true);
  });
}
for (const text of ["CC-BY-4.0", "2026-11-19", "E", "recorded observation", "City catalogue", "Toronto"]) {
  test(`non-unknown label ${JSON.stringify(text)}`, () => {
    expect(isUnknownLabel(text)).toBe(false);
  });
}
for (const date of ["2024-02-29", "2000-02-29", "2026-11-19", "2026-01-01", "9999-12-31"]) {
  test(`valid date ${date}`, () => expect(validDate(date)).toBe(true));
}
for (const date of ["2026-02-29", "1900-02-29", "2026-00-01", "2026-13-01", "2026-11-31", "0000-01-01", "2026/11/19", "not a date", "2026-2-9"]) {
  test(`invalid date ${date}`, () => expect(validDate(date)).toBe(false));
}
for (const licence of ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "Open Government Licence - Ontario", "Licence du gouvernement ouvert", "OGL-Canada"]) {
  test(`open licence ${licence}`, () => expect(openLicense(licence)).toBe(true));
}
for (const licence of [null, "", "UNKNOWN", "All rights reserved", "Exclusive", "Proprietary", "restricted", "permission pending"]) {
  test(`unsupported licence ${JSON.stringify(licence)}`, () => expect(openLicense(licence)).toBe(false));
}

test("a known source needs a value", () => {
  expect(codes(evidenceValueFindings("source", value("KNOWN", null), "x"))).toContain("known-without-fact");
});
test("a known source cannot use the UNKNOWN label", () => {
  expect(codes(evidenceValueFindings("source", value("KNOWN", "UNKNOWN"), "x"))).toContain("known-without-fact");
});
test("an unknown source can remain null", () => {
  expect(evidenceValueFindings("source", value("UNKNOWN", null), "x")).toEqual([]);
});
test("unknown state must not contain a real source", () => {
  expect(codes(evidenceValueFindings("source", value("UNKNOWN", "City catalogue"), "x"))).toContain("unknown-with-fact");
});
test("unknown date must not invent a calendar date", () => {
  expect(codes(evidenceValueFindings("date", value("UNKNOWN", "2026-11-19"), "x"))).toContain("unknown-with-fact");
});
test("known date must follow calendar format", () => {
  expect(codes(evidenceValueFindings("date", value("KNOWN", "2026-02-30"), "x"))).toContain("malformed-date");
});
test("known licence must be openly recorded", () => {
  expect(codes(evidenceValueFindings("licence", value("KNOWN", "Exclusive"), "x"))).toContain("unsupported-licence");
});
for (const tier of ["0", "1", "2", "3", "4", "E", "e"]) {
  test(`canonical tier accepted ${tier}`, () => {
    expect(evidenceValueFindings("tier", value("KNOWN", tier), "x")).toEqual([]);
  });
}
for (const tier of ["5", "A", "Level 2", "0.5", "prototype", "UNKNOWN"]) {
  test(`unsupported tier rejected ${tier}`, () => {
    const result = evidenceValueFindings("tier", value("KNOWN", tier), "x");
    expect(result.length).toBeGreaterThan(0);
  });
}

test("complete official-page record passes", () => {
  expect(evidenceItemFindings(item(), "2026-11-19")).toEqual([]);
});
test("record IDs cannot be missing", () => {
  expect(codes(evidenceItemFindings(item({ id: " " }), "2026-11-19"))).toContain("missing-id");
});
test("record title is mandatory", () => {
  expect(codes(evidenceItemFindings(item({ title: "" }), "2026-11-19"))).toContain("missing-title");
});
test("demonstration kind requires a demonstration label", () => {
  expect(codes(evidenceItemFindings(item({ kind: "demonstration" }), "2026-11-19"))).toContain("demo-unmarked");
});
test("official page cannot also carry demonstration status", () => {
  expect(codes(evidenceItemFindings(item({ isDemonstration: true }), "2026-11-19"))).toContain("demo-official-conflict");
});
test("unknown kind with all known facts cannot imply a reliable origin", () => {
  expect(codes(evidenceItemFindings(item({ kind: "unspecified" }), "2026-11-19"))).toContain("unspecified-origin");
});
test("unknown kind with missing facts remains unclassified", () => {
  const unknownSource = item({ kind: "unspecified", source: value("UNKNOWN", null) });
  expect(codes(evidenceItemFindings(unknownSource, "2026-11-19"))).not.toContain("unspecified-origin");
});
test("invalid observation date is detected", () => {
  expect(codes(evidenceItemFindings(item({ observedAt: "2026-13-19" }), "2026-11-19"))).toContain("invalid-observation-date");
});
test("invalid retrieval date is detected", () => {
  expect(codes(evidenceItemFindings(item({ retrievedAt: "2026/11/19" }), "2026-11-19"))).toContain("invalid-retrieval-date");
});
test("retrieval date after the clock is not accepted", () => {
  expect(codes(evidenceItemFindings(item({ retrievedAt: "2027-11-19" }), "2026-11-19"))).toContain("future-retrieval");
});
test("observation date after the clock is not accepted", () => {
  expect(codes(evidenceItemFindings(item({ observedAt: "2027-11-19" }), "2026-11-19"))).toContain("future-observation");
});
test("observation cannot happen after retrieval", () => {
  const bad = item({ observedAt: "2026-11-18", retrievedAt: "2026-11-15" });
  expect(codes(evidenceItemFindings(bad, "2026-11-19"))).toContain("observation-after-retrieval");
});
test("observation on retrieval day is allowed", () => {
  const good = item({ observedAt: "2026-11-15", retrievedAt: "2026-11-15" });
  expect(codes(evidenceItemFindings(good, "2026-11-19"))).not.toContain("observation-after-retrieval");
});
test("duplicate links are a metadata error", () => {
  const bad = item({ links: ["https://example.org/source", "https://example.org/source"] });
  expect(codes(evidenceItemFindings(bad, "2026-11-19"))).toContain("duplicate-link");
});
for (const link of ["javascript:alert(1)", "data:text/html,a", "http://example.org", "//example.org", "ftp://example.org", ""] as const) {
  test(`rejects unsafe source URL ${JSON.stringify(link)}`, () => {
    expect(codes(evidenceItemFindings(item({ links: [link] }), "2026-11-19"))).toContain("unsafe-source-link");
  });
}
test("https source URL is accepted", () => {
  expect(codes(evidenceItemFindings(item(), "2026-11-19"))).not.toContain("unsafe-source-link");
});
test("known official source needs an actionable link", () => {
  expect(codes(evidenceItemFindings(item({ links: [] }), "2026-11-19"))).toContain("source-without-link");
});
test("local observation may have no external link", () => {
  expect(codes(evidenceItemFindings(item({ kind: "observation", links: [] }), "2026-11-19"))).not.toContain("source-without-link");
});
test("demo data cannot become remotely shareable", () => {
  const bad = item({ kind: "demonstration", isDemonstration: true, localOnly: false });
  expect(codes(evidenceItemFindings(bad, "2026-11-19"))).toContain("demonstration-not-local");
});
test("labelled local demo is not an official accessibility claim", () => {
  const good = item({ kind: "demonstration", isDemonstration: true });
  expect(evidenceItemFindings(good, "2026-11-19")).toEqual([]);
});

test("a complete route frame passes", () => {
  expect(frameFindings(frame())).toEqual([]);
});
test("frame must use local route path", () => {
  expect(codes(frameFindings(frame({ route: "//host" })))).toContain("invalid-route");
});
test("date used for the snapshot must be a calendar date", () => {
  expect(codes(frameFindings(frame({ asOf: "today" })))).toContain("invalid-as-of");
});
test("count must match displayed records", () => {
  expect(codes(frameFindings(frame({ visibleCount: 0 })))).toContain("count-disagreement");
});
test("pending state may withhold final count", () => {
  expect(codes(frameFindings(frame({ visibleCount: null, pending: true })))).not.toContain("count-disagreement");
});
test("duplicate record identifiers are rejected", () => {
  expect(codes(frameFindings(frame({ records: [item(), item()], visibleCount: 2 })))).toContain("duplicate-record");
});
test("record language must match route language", () => {
  expect(codes(frameFindings(frame({ locale: "fr" })))).toContain("record-locale-mismatch");
});
test("French record on French route passes language check", () => {
  const f = frame({ locale: "fr", records: [item({ locale: "fr" })] });
  expect(codes(frameFindings(f))).not.toContain("record-locale-mismatch");
});
test("offline source cannot be described as current live data", () => {
  const bad = frame({ connectivity: "offline", pending: true, sourceStatus: "Current live source" });
  expect(codes(frameFindings(bad))).toContain("offline-live-claim");
});
test("offline snapshot can use dated source without live claim", () => {
  const good = frame({ connectivity: "offline", pending: false, sourceStatus: "Saved snapshot" });
  expect(frameFindings(good)).toEqual([]);
});

test("matching evidence across routes is stable", () => {
  expect(evidenceConflict(item(), item({ locale: "fr", title: "Exemple de lieu" }))).toEqual([]);
});
for (const key of ["source", "licence", "date", "tier"] as const) {
  test(`conflict on ${key} remains visible`, () => {
    const updated = item({ [key]: value("KNOWN", key === "date" ? "2026-11-16" : "changed") });
    expect(codes(evidenceConflict(item(), updated))).toContain("changed-evidence");
  });
  test(`missing ${key} stays unknown across locale`, () => {
    const unknown = value("UNKNOWN", null);
    const old = item({ [key]: unknown });
    const translated = item({ [key]: unknown, locale: "fr" });
    expect(evidenceConflict(old, translated)).toEqual([]);
  });
}
test("changing record kind across locale is detected", () => {
  expect(codes(evidenceConflict(item(), item({ kind: "observation" })))).toContain("changed-kind");
});
test("demo marker cannot silently change", () => {
  expect(codes(evidenceConflict(item(), item({ isDemonstration: true })))).toContain("changed-demo-status");
});
test("a local-only record cannot become remote", () => {
  expect(codes(evidenceConflict(item(), item({ localOnly: false })))).toContain("local-data-escaped");
});

test("valid navigation with shared records passes", () => {
  expect(transitionFindings(transition())).toEqual([]);
});
test("unrequested route change fails", () => {
  const t = transition({ action: "filter" });
  expect(codes(transitionFindings(t))).toContain("unexpected-navigation");
});
test("declared route must match destination", () => {
  const t = transition({ expectedRoute: "/other" });
  expect(codes(transitionFindings(t))).toContain("wrong-route");
});
test("non-language action cannot change locale", () => {
  const t = transition({ to: frame({ locale: "fr", route: "/help", records: [item({ locale: "fr" })] }) });
  expect(codes(transitionFindings(t))).toContain("language-drift");
});
test("language action checks expected locale", () => {
  const t = transition({ action: "language", to: frame(), expectedLocale: "fr", expectedRoute: undefined });
  expect(codes(transitionFindings(t))).toContain("language-mismatch");
});
test("language switch maintains record provenance", () => {
  const t = transition({ action: "language", to: frame({ locale: "fr", records: [item({ locale: "fr" })] }), expectedLocale: "fr", expectedRoute: undefined });
  expect(transitionFindings(t)).toEqual([]);
});
test("disconnect changes the connection state", () => {
  const t = transition({ action: "disconnect", to: frame(), expectedRoute: undefined });
  expect(codes(transitionFindings(t))).toContain("offline-not-applied");
});
test("reconnect changes state to online", () => {
  const t = transition({ action: "reconnect", from: frame({ connectivity: "offline" }), to: frame({ connectivity: "offline" }), expectedRoute: undefined });
  expect(codes(transitionFindings(t))).toContain("online-not-applied");
});
test("record disappearing across locale is an error", () => {
  const t = transition({ action: "language", expectedRoute: undefined, to: frame({ locale: "fr", records: [], visibleCount: 0 }) });
  expect(codes(transitionFindings(t))).toContain("record-disappeared");
});
test("explicitly removed record can be absent", () => {
  const t = transition({ action: "language", expectedRoute: undefined, removedIds: ["place-1"], to: frame({ locale: "fr", records: [], visibleCount: 0 }) });
  expect(codes(transitionFindings(t))).not.toContain("record-disappeared");
});
test("filter must remove declared IDs", () => {
  const t = transition({ action: "filter", expectedRoute: undefined, removedIds: ["place-1"], to: frame() });
  expect(codes(transitionFindings(t))).toContain("filter-did-not-remove");
});
test("reset must restore declared IDs", () => {
  const t = transition({ action: "reset", expectedRoute: undefined, removedIds: ["place-1"], to: frame({ records: [], visibleCount: 0 }) });
  expect(codes(transitionFindings(t))).toContain("reset-did-not-restore");
});
test("journey checks locales", () => {
  const t = transition();
  expect(codes(journeyFindings({ steps: [t], expectedLocales: ["fr"], mustRemainLocal: false }))).toContain("journey-locale");
});
test("journey requires local-only records when requested", () => {
  const t = transition({ to: frame({ route: "/help", records: [item({ localOnly: false })] }) });
  expect(codes(journeyFindings({ steps: [t], expectedLocales: ["en"], mustRemainLocal: true }))).toContain("journey-remote-record");
});
test("journey detects mismatched intermediary dates", () => {
  const a = transition();
  const b = transition({ from: frame({ asOf: "2026-11-18" }) });
  expect(codes(journeyFindings({ steps: [a, b], expectedLocales: ["en"], mustRemainLocal: false }))).toContain("journey-gap");
});
test("empty journey has no invented findings", () => {
  expect(journeyFindings({ steps: [], expectedLocales: ["en", "fr"], mustRemainLocal: true })).toEqual([]);
});
test("findingCodes preserves issue names and order", () => {
  const problems = frameFindings(frame({ route: "bad", visibleCount: 2 }));
  expect(findingCodes(problems)).toEqual(problems.map((entry) => entry.rule));
});
test("rendering findings preserves record identity", () => {
  const problems = evidenceItemFindings(item({ title: "" }), "2026-11-19");
  expect(displayFindings(problems)).toContain("place-1");
});
test("rendering findings deduplicates repeated diagnostics", () => {
  const problems = evidenceItemFindings(item({ title: "" }), "2026-11-19");
  expect(displayFindings([...problems, ...problems])).toBe(displayFindings(problems));
});
test("rendering findings includes truncation count", () => {
  const problems = Array.from({ length: 8 }, (_, i) => ({ rule: "example", owner: "x", detail: String(i) }));
  expect(displayFindings(problems, 2)).toContain("6 more findings");
});
