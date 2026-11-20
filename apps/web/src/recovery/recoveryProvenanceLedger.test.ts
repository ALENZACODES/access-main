import { describe, expect, it } from "vitest";
import {
  LEDGER_LIMITS, LEDGER_PHASES, LEDGER_TIERS, LEDGER_VALUES,
  appendLedgerStatement, compareLedgers, filterLedger, ledgerConflicts,
  ledgerIds, ledgerSummary, loadLedger, mergeLedgerDocuments, newLedgerDocument,
  nextLedgerId, parseLedgerDocument, previewLedgerMerge, reviewLedgerStatement,
  saveLedger, sourceIssue, statementIssue, type LedgerDocument,
  type LedgerPhase, type LedgerSource, type LedgerStatement,
  type LedgerValue,
} from "./recoveryProvenanceLedger";

const provenance: LedgerSource = {
  name: "Open city data", licence: "CC-BY-4.0", date: "2026-11-18",
  tier: "UNKNOWN", reference: "City release 22",
};
const first: LedgerStatement = {
  id: "source-1", packId: "region-one", field: "entryWidth",
  value: "UNKNOWN", note: "No measurement in source",
  recordedAt: "2026-11-19T10:00:00.000Z", source: provenance,
  phase: "draft",
};
const second: LedgerStatement = {
  ...first, id: "source-2", field: "stepCount", value: "present",
  source: { ...provenance, name: "Second open release" },
};
const third: LedgerStatement = {
  ...first, id: "source-3", packId: "region-two", value: "absent",
  source: { ...provenance, tier: "third-party-report" },
};
const doc = (...entries: LedgerStatement[]): LedgerDocument => ({ format: "local-source-ledger-v1", entries });
const clone = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;
const accepted = (result: ReturnType<typeof appendLedgerStatement>): LedgerDocument => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issue);
  return result.value;
};

describe("source metadata contract", () => {
  it("accepts a complete open source", () => expect(sourceIssue(provenance)).toBeNull());
  it("accepts each supported open licence", () => {
    for (const licence of ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"]) {
      expect(sourceIssue({ ...provenance, licence })).toBeNull();
    }
  });
  it("rejects unsupported licences", () => {
    for (const licence of ["private", "copyright", "proprietary", "CC-BY-NC-4.0", "", null, 1]) {
      expect(sourceIssue({ ...provenance, licence })).toBe("licence");
    }
  });
  it("accepts every explicitly represented tier", () => {
    for (const tier of LEDGER_TIERS) expect(sourceIssue({ ...provenance, tier })).toBeNull();
  });
  it("does not infer a tier when missing", () => {
    const source: Record<string, unknown> = { ...provenance };
    delete source.tier;
    expect(sourceIssue(source)).toBe("source");
  });
  it("preserves the literal UNKNOWN tier", () => {
    expect(sourceIssue({ ...provenance, tier: "UNKNOWN" })).toBeNull();
    expect(LEDGER_TIERS).toContain("UNKNOWN");
  });
  it("rejects unknown tiers rather than treating them as evidence", () => {
    for (const tier of ["high", "low", "complete", "certified", null, 42]) {
      expect(sourceIssue({ ...provenance, tier })).toBe("tier");
    }
  });
  it("rejects absent source names", () => {
    for (const name of ["", "  ", null, 0]) expect(sourceIssue({ ...provenance, name })).toBe("source");
  });
  it("rejects a source name exceeding the limit", () => {
    expect(sourceIssue({ ...provenance, name: "s".repeat(LEDGER_LIMITS.maxName + 1) })).toBe("source");
  });
  it("accepts the maximum source name length", () => {
    expect(sourceIssue({ ...provenance, name: "s".repeat(LEDGER_LIMITS.maxName) })).toBeNull();
  });
  it("accepts an empty optional reference", () => {
    expect(sourceIssue({ ...provenance, reference: "" })).toBeNull();
  });
  it("rejects oversized references", () => {
    expect(sourceIssue({ ...provenance, reference: "r".repeat(LEDGER_LIMITS.maxReference + 1) })).toBe("source");
  });
  it("rejects markup and controls in source fields", () => {
    for (const name of ["<script>", "a\nb", "a\rb", "a\tb", "a\u0000b"]) {
      expect(sourceIssue({ ...provenance, name })).toBe("source");
    }
  });
  it("rejects impossible calendar dates", () => {
    for (const date of ["2026-02-31", "2025-02-29", "2026-13-01", "2026-00-01", "2026-11-00", "2026-11-32", "today", ""]) {
      expect(sourceIssue({ ...provenance, date })).toBe("date");
    }
  });
  it("accepts a leap day when the year permits", () => {
    expect(sourceIssue({ ...provenance, date: "2024-02-29" })).toBeNull();
  });
  it("rejects unexpected source fields", () => {
    expect(sourceIssue({ ...provenance, privateLocation: "x" })).toBe("source");
  });
  it("rejects arrays, null and primitive sources", () => {
    for (const source of [null, [], "source", 2, false]) expect(sourceIssue(source)).toBe("source");
  });
});

describe("statement schema", () => {
  it("accepts literal UNKNOWN", () => expect(statementIssue(first)).toBeNull());
  it("accepts every declared value", () => {
    for (const value of LEDGER_VALUES) expect(statementIssue({ ...first, value })).toBeNull();
  });
  it("accepts every review phase in imported history", () => {
    for (const phase of LEDGER_PHASES) expect(statementIssue({ ...first, phase })).toBeNull();
  });
  it("rejects an inferred success value", () => {
    expect(statementIssue({ ...first, value: "ready" })).toBe("value");
  });
  it("rejects a made-up review phase", () => {
    expect(statementIssue({ ...first, phase: "approved" })).toBe("phase");
  });
  it("rejects unsafe identifiers", () => {
    for (const id of ["", "..", ".", "../escape", "path/part", " space", "x:y", "x?", "x#y"]) {
      expect(statementIssue({ ...first, id })).toBe("identifier");
    }
  });
  it("rejects unsafe pack identifiers", () => {
    for (const packId of ["", "../escape", "a/b", "..", "a b", "<x>"]) {
      expect(statementIssue({ ...first, packId })).toBe("identifier");
    }
  });
  it("rejects unsafe field keys", () => {
    for (const field of ["", "2width", "with space", "a/b", "a:b", "a?b", "<field>"]) {
      expect(statementIssue({ ...first, field })).toBe("identifier");
    }
  });
  it("accepts a namespaced field key", () => {
    expect(statementIssue({ ...first, field: "door.step-count_2" })).toBeNull();
  });
  it("accepts an empty note", () => expect(statementIssue({ ...first, note: "" })).toBeNull());
  it("rejects multiline notes", () => {
    expect(statementIssue({ ...first, note: "first\nsecond" })).toBe("text");
  });
  it("rejects markup in notes", () => {
    expect(statementIssue({ ...first, note: "<b>claim</b>" })).toBe("text");
  });
  it("rejects notes beyond the boundary", () => {
    expect(statementIssue({ ...first, note: "n".repeat(LEDGER_LIMITS.maxNote + 1) })).toBe("text");
  });
  it("accepts a note at the boundary", () => {
    expect(statementIssue({ ...first, note: "n".repeat(LEDGER_LIMITS.maxNote) })).toBeNull();
  });
  it("rejects a missing timestamp", () => {
    expect(statementIssue({ ...first, recordedAt: "" })).toBe("date");
  });
  it("rejects local-time timestamps", () => {
    expect(statementIssue({ ...first, recordedAt: "2026-11-19T10:00:00-05:00" })).toBe("date");
  });
  it("rejects impossible timestamps", () => {
    expect(statementIssue({ ...first, recordedAt: "2026-02-31T10:00:00Z" })).toBe("date");
  });
  it("accepts timestamps with whole seconds", () => {
    expect(statementIssue({ ...first, recordedAt: "2026-11-19T10:00:00Z" })).toBeNull();
  });
  it("accepts timestamps with one decimal", () => {
    expect(statementIssue({ ...first, recordedAt: "2026-11-19T10:00:00.1Z" })).toBeNull();
  });
  it("rejects fields not in the schema", () => {
    expect(statementIssue({ ...first, deviceId: "secret" })).toBe("format");
  });
  it("rejects a missing source", () => {
    const entry: Record<string, unknown> = { ...first };
    delete entry.source;
    expect(statementIssue(entry)).toBe("format");
  });
  it("rejects invalid source licence", () => {
    expect(statementIssue({ ...first, source: { ...provenance, licence: "private" } })).toBe("licence");
  });
  it("rejects primitive inputs and arrays", () => {
    for (const item of [null, 0, false, "text", []]) expect(statementIssue(item)).toBe("format");
  });
});

describe("document and bounded JSON", () => {
  it("starts with the expected format", () => {
    expect(newLedgerDocument()).toEqual(doc());
  });
  it("accepts an empty document", () => {
    expect(parseLedgerDocument(doc())).toEqual({ ok: true, value: doc() });
  });
  it("rejects other document formats", () => {
    expect(parseLedgerDocument({ ...doc(), format: "other" })).toEqual({ ok: false, issue: "format" });
  });
  it("rejects added document keys", () => {
    expect(parseLedgerDocument({ ...doc(), privateData: 1 }).ok).toBe(false);
  });
  it("rejects missing entries", () => {
    expect(parseLedgerDocument({ format: "local-source-ledger-v1" }).ok).toBe(false);
  });
  it("rejects non-array entries", () => {
    expect(parseLedgerDocument({ ...doc(), entries: {} }).ok).toBe(false);
  });
  it("rejects repeated IDs", () => {
    expect(parseLedgerDocument(doc(first, first))).toEqual({ ok: false, issue: "duplicate" });
  });
  it("accepts distinct entries", () => {
    expect(parseLedgerDocument(doc(first, second, third)).ok).toBe(true);
  });
  it("does not silently replace unknown values", () => {
    const parsed = parseLedgerDocument(doc(first));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.entries[0]?.value).toBe("UNKNOWN");
  });
  it("makes a new source object instead of sharing references", () => {
    const parsed = parseLedgerDocument(doc(first));
    if (!parsed.ok) throw new Error("invalid fixture");
    expect(parsed.value.entries[0]?.source).not.toBe(first.source);
  });
  it("rejects excessive entry counts", () => {
    const entries = Array.from({ length: LEDGER_LIMITS.maxEntries + 1 }, (_, i) => ({ ...first, id: `source-${i + 1}` }));
    expect(parseLedgerDocument(doc(...entries))).toEqual({ ok: false, issue: "limit" });
  });
  it("accepts the maximum entry count", () => {
    const entries = Array.from({ length: LEDGER_LIMITS.maxEntries }, (_, i) => ({ ...first, id: `source-${i + 1}` }));
    expect(parseLedgerDocument(doc(...entries)).ok).toBe(true);
  });
  it("rejects malformed JSON", () => {
    expect(loadLedger("{")).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a huge JSON file before parsing", () => {
    expect(loadLedger(" ".repeat(LEDGER_LIMITS.maxBytes + 1))).toEqual({ ok: false, issue: "limit" });
  });
  it("rejects an oversized multibyte JSON input", () => {
    expect(loadLedger("é".repeat(LEDGER_LIMITS.maxBytes))).toEqual({ ok: false, issue: "limit" });
  });
  it("round-trips an empty document", () => {
    const saved = saveLedger(doc());
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(loadLedger(saved.value)).toEqual({ ok: true, value: doc() });
  });
  it("round-trips a populated document", () => {
    const current = doc(first, second, third);
    const saved = saveLedger(current);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(loadLedger(saved.value)).toEqual({ ok: true, value: current });
  });
  it("retains source dates exactly", () => {
    const saved = saveLedger(doc(first));
    if (saved.ok) expect(loadLedger(saved.value).ok).toBe(true);
    else throw new Error("could not export fixture");
  });
  it("refuses to export an invalid document", () => {
    expect(saveLedger(doc({ ...first, value: "unsupported" as LedgerValue })).ok).toBe(false);
  });
  it("limits output bytes in addition to the entry count", () => {
    const entries = Array.from({ length: 300 }, (_, i) => ({
      ...first, id: `source-${i + 1}`, note: "n".repeat(LEDGER_LIMITS.maxNote),
      source: { ...provenance, name: "s".repeat(LEDGER_LIMITS.maxName), reference: "r".repeat(LEDGER_LIMITS.maxReference) },
    }));
    expect(saveLedger(doc(...entries)).ok).toBe(false);
  });
  it("rejects invalid entries in imported JSON", () => {
    const raw = JSON.stringify(doc({ ...first, source: { ...provenance, date: "wrong" } }));
    expect(loadLedger(raw)).toEqual({ ok: false, issue: "date" });
  });
});

describe("append and immutable review", () => {
  it("adds one statement to an empty document", () => {
    expect(accepted(appendLedgerStatement(doc(), first))).toEqual(doc(first));
  });
  it("does not edit the original array", () => {
    const before = doc(first);
    const after = accepted(appendLedgerStatement(before, second));
    expect(before.entries).toHaveLength(1);
    expect(after.entries).toHaveLength(2);
  });
  it("rejects a duplicate ID", () => {
    expect(appendLedgerStatement(doc(first), first)).toEqual({ ok: false, issue: "duplicate" });
  });
  it("does not infer a value while appending", () => {
    const after = accepted(appendLedgerStatement(doc(), first));
    expect(after.entries[0]?.value).toBe("UNKNOWN");
  });
  it("rejects an attempt with unsupported licence", () => {
    expect(appendLedgerStatement(doc(), { ...first, source: { ...provenance, licence: "restricted" } }).ok).toBe(false);
  });
  it("rejects an invalid starting document", () => {
    expect(appendLedgerStatement(doc(first, first), second).ok).toBe(false);
  });
  it("rejects append when count is at maximum", () => {
    const entries = Array.from({ length: LEDGER_LIMITS.maxEntries }, (_, i) => ({ ...first, id: `source-${i + 1}` }));
    expect(appendLedgerStatement(doc(...entries), { ...second, id: "overflow" })).toEqual({ ok: false, issue: "limit" });
  });
  it("marks a draft as reviewed", () => {
    expect(reviewLedgerStatement(doc(first), first.id, "reviewed")).toEqual({
      ok: true, value: doc({ ...first, phase: "reviewed" }),
    });
  });
  it("marks a draft as disputed", () => {
    expect(reviewLedgerStatement(doc(first), first.id, "disputed")).toEqual({
      ok: true, value: doc({ ...first, phase: "disputed" }),
    });
  });
  it("keeps a review idempotent", () => {
    const finished = doc({ ...first, phase: "reviewed" });
    expect(reviewLedgerStatement(finished, first.id, "reviewed")).toEqual({ ok: true, value: finished });
  });
  it("does not reopen a reviewed record", () => {
    const finished = doc({ ...first, phase: "reviewed" });
    expect(reviewLedgerStatement(finished, first.id, "draft")).toEqual({ ok: false, issue: "transition" });
  });
  it("does not turn a dispute into a review", () => {
    const finished = doc({ ...first, phase: "disputed" });
    expect(reviewLedgerStatement(finished, first.id, "reviewed")).toEqual({ ok: false, issue: "transition" });
  });
  it("rejects unknown review targets", () => {
    expect(reviewLedgerStatement(doc(first), "absent", "reviewed")).toEqual({ ok: false, issue: "identifier" });
  });
  it("rejects unsupported phases", () => {
    expect(reviewLedgerStatement(doc(first), first.id, "reopened" as LedgerPhase)).toEqual({ ok: false, issue: "phase" });
  });
  it("does not rewrite evidence while reviewing", () => {
    const result = reviewLedgerStatement(doc(first), first.id, "reviewed");
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.entries[0]?.source).toEqual(provenance);
    expect(result.value.entries[0]?.value).toBe("UNKNOWN");
    expect(result.value.entries[0]?.recordedAt).toBe(first.recordedAt);
  });
});

describe("staged merge safety", () => {
  it("shows an empty incoming document as no changes", () => {
    expect(previewLedgerMerge(doc(first), doc())).toEqual({
      ok: true, value: { added: [], same: [], collisions: [], remaining: LEDGER_LIMITS.maxEntries - 1 },
    });
  });
  it("previews new entries", () => {
    const result = previewLedgerMerge(doc(first), doc(second));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.added).toEqual([second]);
  });
  it("previews duplicate unchanged entries", () => {
    const result = previewLedgerMerge(doc(first), doc(first));
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.same).toEqual([first.id]);
    expect(result.value.added).toHaveLength(0);
  });
  it("detects duplicate IDs with different statements", () => {
    const result = previewLedgerMerge(doc(first), doc({ ...first, note: "different" }));
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.collisions).toEqual([first.id]);
  });
  it("rejects applying an ID conflict", () => {
    expect(mergeLedgerDocuments(doc(first), doc({ ...first, value: "present" }))).toEqual({ ok: false, issue: "conflict" });
  });
  it("merges nonconflicting statements", () => {
    expect(mergeLedgerDocuments(doc(first), doc(second))).toEqual({ ok: true, value: doc(first, second) });
  });
  it("keeps stable ordering after merge", () => {
    const result = mergeLedgerDocuments(doc(second), doc(first));
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.entries.map((entry) => entry.id)).toEqual([second.id, first.id]);
  });
  it("does not promote UNKNOWN while merging", () => {
    const result = mergeLedgerDocuments(doc(first), doc(second));
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.entries[0]?.value).toBe("UNKNOWN");
  });
  it("does not modify either input document", () => {
    const a = doc(first);
    const b = doc(second);
    mergeLedgerDocuments(a, b);
    expect(a.entries).toHaveLength(1);
    expect(b.entries).toHaveLength(1);
  });
  it("rejects an invalid incoming document", () => {
    expect(mergeLedgerDocuments(doc(first), doc({ ...second, source: { ...provenance, licence: "closed" } })).ok).toBe(false);
  });
  it("rejects an invalid current document", () => {
    expect(mergeLedgerDocuments(doc(first, first), doc(second)).ok).toBe(false);
  });
  it("refuses a combined count overflow", () => {
    const oldEntries = Array.from({ length: 290 }, (_, i) => ({ ...first, id: `old-${i + 1}` }));
    const incoming = Array.from({ length: 20 }, (_, i) => ({ ...second, id: `incoming-${i + 1}` }));
    expect(previewLedgerMerge(doc(...oldEntries), doc(...incoming))).toEqual({ ok: false, issue: "limit" });
  });
  it("shows mixed unchanged, additions, and conflicts", () => {
    const changed = { ...first, note: "changed" };
    const result = previewLedgerMerge(doc(first, second), doc(second, changed, third));
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.same).toEqual([second.id]);
    expect(result.value.collisions).toEqual([first.id]);
    expect(result.value.added).toEqual([third]);
  });
});

describe("filters, source conflicts, and summaries", () => {
  const current = doc(first, second, third, { ...first, id: "source-4", value: "present" });
  it("returns every row when no filters are supplied", () => {
    expect(filterLedger(current, {})).toHaveLength(4);
  });
  it("filters a single pack", () => {
    expect(filterLedger(current, { packId: "region-two" }).map((item) => item.id)).toEqual([third.id]);
  });
  it("filters a field", () => {
    expect(filterLedger(current, { field: "stepCount" }).map((item) => item.id)).toEqual([second.id]);
  });
  it("filters UNKNOWN explicitly", () => {
    expect(filterLedger(current, { value: "UNKNOWN" }).map((item) => item.id)).toEqual([first.id]);
  });
  it("filters by review phase", () => {
    const updated = doc({ ...first, phase: "reviewed" }, second);
    expect(filterLedger(updated, { phase: "reviewed" }).map((item) => item.id)).toEqual([first.id]);
  });
  it("filters by evidence tier", () => {
    expect(filterLedger(current, { tier: "third-party-report" }).map((item) => item.id)).toEqual([third.id]);
  });
  it("supports searching source names", () => {
    expect(filterLedger(current, { search: "second open" }).map((item) => item.id)).toEqual([second.id]);
  });
  it("supports searching context notes", () => {
    expect(filterLedger(current, { search: "measurement" }).map((item) => item.id)).toEqual([first.id, second.id, third.id, "source-4"]);
  });
  it("ignores case during text search", () => {
    expect(filterLedger(current, { search: "CITY" })).toHaveLength(4);
  });
  it("combines pack and field filters", () => {
    expect(filterLedger(current, { packId: "region-one", field: "stepCount" })).toEqual([second]);
  });
  it("does not infer any pack readiness from one source", () => {
    expect(ledgerConflicts(doc(first))[0]?.result).toBe("UNKNOWN");
  });
  it("treats one reported value as a single claim", () => {
    expect(ledgerConflicts(doc(second))[0]?.result).toBe("single");
  });
  it("does not resolve present versus absent", () => {
    const conflict = ledgerConflicts(doc(second, { ...second, id: "source-9", value: "absent" }));
    expect(conflict[0]?.result).toBe("disputed");
  });
  it("does not count UNKNOWN as evidence against a reported value", () => {
    const one = ledgerConflicts(doc(first, { ...first, id: "source-9", value: "present" }));
    expect(one[0]?.result).toBe("single");
  });
  it("tracks a declared conflicting value", () => {
    const one = ledgerConflicts(doc({ ...first, value: "conflicting" }));
    expect(one[0]?.result).toBe("disputed");
  });
  it("tracks a manually disputed record", () => {
    const one = ledgerConflicts(doc({ ...first, phase: "disputed" }));
    expect(one[0]?.result).toBe("disputed");
  });
  it("does not mix fields from different packs", () => {
    const summary = ledgerConflicts(doc(first, third));
    expect(summary).toHaveLength(2);
    expect(summary.every((item) => item.result !== "disputed")).toBe(true);
  });
  it("preserves source statement IDs in conflict groups", () => {
    const conflict = ledgerConflicts(doc(first, { ...first, id: "source-8", value: "absent" }));
    expect(conflict[0]?.ids).toEqual([first.id, "source-8"]);
  });
  it("counts distinct packs and sources", () => {
    const summary = ledgerSummary(current);
    expect(summary.count).toBe(4);
    expect(summary.packs).toBe(2);
    expect(summary.distinctSources).toBe(2);
  });
  it("counts unknown statements", () => {
    expect(ledgerSummary(current).unknown).toBe(1);
  });
  it("counts disputed review phases", () => {
    expect(ledgerSummary(doc({ ...first, phase: "disputed" })).disputed).toBe(1);
  });
  it("counts reviewed phases", () => {
    expect(ledgerSummary(doc({ ...first, phase: "reviewed" })).reviewed).toBe(1);
  });
  it("reports no dates missing from a valid document", () => {
    expect(ledgerSummary(current).missingDates).toBe(0);
  });
  it("sorts known pack IDs without injecting others", () => {
    expect(ledgerIds(doc(third, first, second))).toEqual(["region-one", "region-two"]);
  });
  it("finds the first open local ID", () => {
    expect(nextLedgerId(doc(first, { ...second, id: "source-3" }))).toBe("source-2");
  });
});

describe("comparison without historical promotion", () => {
  it("reports added entries", () => {
    expect(compareLedgers(doc(first), doc(first, second))).toEqual([{ id: second.id, type: "added", packId: second.packId }]);
  });
  it("reports removed entries", () => {
    expect(compareLedgers(doc(first, second), doc(second))).toEqual([{ id: first.id, type: "removed", packId: first.packId }]);
  });
  it("reports changed values but does not reconcile them", () => {
    expect(compareLedgers(doc(first), doc({ ...first, value: "present" }))).toEqual([{ id: first.id, type: "changed", packId: first.packId }]);
  });
  it("reports changed review phases", () => {
    expect(compareLedgers(doc(first), doc({ ...first, phase: "disputed" }))).toHaveLength(1);
  });
  it("reports no differences for identical content", () => {
    expect(compareLedgers(doc(first, second), doc(first, second))).toEqual([]);
  });
  it("detects changed source dates", () => {
    expect(compareLedgers(doc(first), doc({ ...first, source: { ...provenance, date: "2026-11-17" } }))).toHaveLength(1);
  });
  it("sorts changes by identifier", () => {
    const result = compareLedgers(doc(third, first), doc({ ...first, note: "modified" }, second));
    expect(result.map((item) => item.id)).toEqual(["source-1", "source-2", "source-3"]);
  });
  it("does not mutate earlier snapshots", () => {
    const before = doc(first);
    const after = doc({ ...first, value: "absent" });
    compareLedgers(before, after);
    expect(before.entries[0]?.value).toBe("UNKNOWN");
  });
  it("does not change sources during JSON comparison", () => {
    const before = clone(doc(first));
    const after = clone(doc(first, second));
    const original = JSON.stringify(before);
    compareLedgers(before as LedgerDocument, after as LedgerDocument);
    expect(JSON.stringify(before)).toBe(original);
  });
});
