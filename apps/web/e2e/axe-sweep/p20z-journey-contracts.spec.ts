import { expect, test } from "@playwright/test";
import {
  actionIssues, bilingualMatrix, factIsKnown, factIssues, formatFindings,
  journeyIssues, matrixIssues, snapshotIssues, validDate, validPath,
  type Action, type Fact, type Journey, type Snapshot,
} from "./p20z-journey-contracts";

const fact = (changes: Partial<Fact> = {}): Fact => ({
  id: "sample", name: "Example", value: "Unknown", provenance: {
    source: "Example source", licence: "Example licence", retrievedOn: "2026-11-19", tier: "E",
  }, ...changes,
});
const snapshot = (changes: Partial<Snapshot> = {}): Snapshot => ({
  path: "/journey", locale: "en", connection: "online", status: "ready",
  mainCount: 1, heading: "Journey", title: "Journey - the App",
  focus: { id: "search", visible: true, width: 44, height: 44, trapped: false },
  messages: [], facts: [], ...changes,
});
const action = (changes: Partial<Action> = {}): Action => ({
  kind: "locale", before: snapshot(), after: snapshot({ locale: "fr" }),
  preserveFacts: true, preserveFocus: true, ...changes,
});
const codes = (findings: readonly { code: string }[]): string[] => findings.map((finding) => finding.code);

test("P20Z: baseline snapshot has no false findings", () => {
  expect(snapshotIssues(snapshot(), 0)).toEqual([]);
});

test("P20Z: valid language switch remains on the route", () => {
  expect(actionIssues(action(), 1)).toEqual([]);
});

test("P20Z: connected locale journey passes", () => {
  const event = action();
  expect(journeyIssues({ initial: event.before, actions: [event] })).toEqual([]);
});

for (const value of ["2026-11-19", "2024-02-29", "2000-02-29", "2026-12-31", "2026-01-01"]) {
  test(`P20Z: accepts valid retrievedOn ${value}`, () => expect(validDate(value)).toBe(true));
}
for (const value of [null, "", "2026-02-29", "1900-02-29", "2026-11-31", "2026-00-01", "2026-13-01", "2026-01-00", "yesterday", "2026/11/19", "0000-01-01"]) {
  test(`P20Z: rejects invalid retrievedOn ${String(value)}`, () => expect(validDate(value)).toBe(false));
}
for (const value of ["/", "/help", "/journey", "/more/diary", "/fr/a-b"]) {
  test(`P20Z: permits local route ${value}`, () => expect(validPath(value)).toBe(true));
}
for (const value of ["", "help", "//host", "/a/../b", "/a/./b", "/a?b=1", "/a#id", "/a\\b", "/a:b", "/a*b", "/a\u001fb", "/a\u007fb"]) {
  test(`P20Z: rejects unsafe path ${JSON.stringify(value)}`, () => expect(validPath(value)).toBe(false));
}
for (const [field, value, expected] of [
  ["source", null, "fact-source-unknown"],
  ["source", "UNKNOWN", "fact-source-unknown"],
  ["licence", null, "fact-licence-unknown"],
  ["licence", "Inconnu", "fact-licence-unknown"],
  ["tier", null, "fact-tier-unknown"],
  ["tier", "—", "fact-tier-unknown"],
  ["retrievedOn", null, "fact-date-unknown"],
  ["retrievedOn", "2026-02-30", "fact-date-unknown"],
] as const) {
  test(`P20Z: provenance ${field} ${String(value)} stays unknown`, () => {
    const changed = fact({ provenance: { ...fact().provenance, [field]: value } });
    expect(factIsKnown(changed)).toBe(false);
    expect(codes(factIssues([changed], 3))).toContain(expected);
  });
}

test("P20Z: incomplete value is not asserted as a known fact", () => {
  expect(factIsKnown(fact())).toBe(false);
  expect(factIsKnown(fact({ value: null }))).toBe(false);
  expect(factIsKnown(fact({ value: "Measured" }))).toBe(true);
});

test("P20Z: duplicate fact IDs report both records", () => {
  expect(codes(factIssues([fact(), fact()], 0))).toContain("fact-id-repeated");
});

test("P20Z: blank fact IDs are independently diagnosed", () => {
  expect(codes(factIssues([fact({ id: " " })], 1))).toContain("fact-id-empty");
});

for (const [changed, expected] of [
  [{ mainCount: 0 }, "main-count"],
  [{ mainCount: 2 }, "main-count"],
  [{ heading: "" }, "heading-missing"],
  [{ title: "" }, "title-missing"],
  [{ path: "//elsewhere" }, "path-unsafe"],
  [{ focus: { id: "search", visible: false, width: 44, height: 44, trapped: false } }, "focus-invisible"],
  [{ focus: { id: "search", visible: true, width: 43, height: 44, trapped: false } }, "target-width"],
  [{ focus: { id: "search", visible: true, width: 44, height: 43, trapped: false } }, "target-height"],
  [{ focus: { id: "search", visible: true, width: 44, height: 44, trapped: true } }, "focus-trapped"],
  [{ status: "loading" }, "loading-unannounced"],
  [{ status: "error" }, "result-silent"],
  [{ status: "empty" }, "result-silent"],
] as const) {
  test(`P20Z: screen policy ${expected} from ${JSON.stringify(changed)}`, () => {
    expect(codes(snapshotIssues(snapshot(changed as Partial<Snapshot>), 2))).toContain(expected);
  });
}

test("P20Z: a spoken loading status avoids a false positive", () => {
  const changed = snapshot({ status: "loading", messages: [{ text: "Loading", locale: "en", politeness: "polite", busy: true }] });
  expect(snapshotIssues(changed, 1)).toEqual([]);
});

test("P20Z: French status can use correct punctuation", () => {
  const changed = snapshot({ locale: "fr", status: "empty", messages: [{ text: "Aucun résultat\u00a0: essayez encore\u00a0!", locale: "fr", politeness: "polite", busy: false }] });
  expect(snapshotIssues(changed, 1)).toEqual([]);
});

test("P20Z: missing announcement locale is surfaced", () => {
  const changed = snapshot({ locale: "fr", messages: [{ text: "Ready", locale: "en", politeness: "polite", busy: false }] });
  expect(codes(snapshotIssues(changed, 1))).toContain("message-locale");
});

test("P20Z: empty live announcement is surfaced", () => {
  const changed = snapshot({ messages: [{ text: "  ", locale: "en", politeness: "polite", busy: false }] });
  expect(codes(snapshotIssues(changed, 1))).toContain("message-blank");
});

for (const [changed, expected] of [
  [{ after: snapshot({ locale: "en" }) }, "locale-unchanged"],
  [{ after: snapshot({ locale: "fr", path: "/help" }) }, "locale-route-lost"],
  [{ after: snapshot({ locale: "fr", focus: { id: null, visible: true, width: null, height: null, trapped: false } }) }, "focus-lost"],
  [{ kind: "disconnect", after: snapshot() }, "disconnect-unobserved"],
  [{ kind: "reconnect", after: snapshot({ connection: "unknown" }) }, "reconnect-unobserved"],
  [{ kind: "clear", after: snapshot({ status: "loading" }) }, "clear-started-search"],
  [{ kind: "retry" }, "retry-not-available"],
  [{ kind: "navigate", target: "/help" }, "navigation-target"],
  [{ kind: "search", after: snapshot({ status: "idle" }) }, "search-no-result"],
] as const) {
  test(`P20Z: detects action failure ${expected} with ${JSON.stringify(changed)}`, () => {
    expect(codes(actionIssues(action(changed as Partial<Action>), 1))).toContain(expected);
  });
}

test("P20Z: changing a source on locale switch is a regression", () => {
  const before = snapshot({ facts: [fact()] });
  const after = snapshot({ locale: "fr", facts: [fact({ provenance: { ...fact().provenance, source: "different" } })] });
  expect(codes(actionIssues(action({ before, after }), 1))).toContain("fact-provenance-changed");
});

test("P20Z: removing a fact on locale switch is a regression", () => {
  const before = snapshot({ facts: [fact()] });
  expect(codes(actionIssues(action({ before }), 1))).toContain("fact-lost");
});

test("P20Z: translating a label preserves factual provenance", () => {
  const before = snapshot({ facts: [fact({ value: "Measured" })] });
  const after = snapshot({ locale: "fr", facts: [fact({ name: "Exemple", value: "Mesuré" })] });
  expect(actionIssues(action({ before, after }), 1)).toEqual([]);
});

test("P20Z: explicit unknown after known value is diagnosed", () => {
  const before = snapshot({ facts: [fact({ value: "Measured" })] });
  const after = snapshot({ locale: "fr", facts: [fact({ value: "INCONNU" })] });
  expect(codes(actionIssues(action({ before, after }), 1))).toContain("fact-value-lost");
});

test("P20Z: non-preserving search permits a new fact set", () => {
  const before = snapshot({ facts: [fact()] });
  const after = snapshot({ status: "empty", messages: [{ text: "No results", locale: "en", politeness: "polite", busy: false }] });
  expect(actionIssues(action({ kind: "search", before, after, preserveFacts: false, preserveFocus: false }), 1)).toEqual([]);
});

test("P20Z: disconnected transition chain is diagnosed", () => {
  const first = action();
  const second = action({ before: snapshot({ status: "loading" }) });
  const journey: Journey = { initial: first.before, actions: [first, second] };
  expect(codes(journeyIssues(journey))).toContain("journey-disconnected");
});

test("P20Z: English and French width matrix is complete", () => {
  const routes = ["/", "/help", "/journey"];
  const matrix = bilingualMatrix(routes);
  expect(matrix).toHaveLength(routes.length * 4);
  expect(matrixIssues(routes, matrix)).toEqual([]);
});

test("P20Z: missing screen matrix cell is detected", () => {
  const routes = ["/", "/help"];
  expect(codes(matrixIssues(routes, bilingualMatrix(routes).slice(1)))).toContain("matrix-missing");
});

test("P20Z: repeated screen matrix cell is detected", () => {
  const routes = ["/help"];
  const matrix = bilingualMatrix(routes);
  expect(codes(matrixIssues(routes, [...matrix, matrix[0]!] ))).toContain("matrix-duplicate");
});

test("P20Z: diagnostics are deduplicated and bounded", () => {
  const finding = { code: "broken", step: 1, detail: "example" };
  expect(formatFindings([finding, finding])).toBe("1: broken example");
  expect(formatFindings([finding, { ...finding, code: "other" }], 1)).toContain("more findings");
  expect(() => formatFindings([], 0)).toThrow();
  expect(() => formatFindings([], 1.5)).toThrow();
});
