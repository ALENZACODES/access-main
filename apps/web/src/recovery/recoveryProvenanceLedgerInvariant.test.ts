import { describe, expect, it } from "vitest";
import {
  LEDGER_LIMITS, LEDGER_TIERS, LEDGER_VALUES,
  appendLedgerStatement, compareLedgers, filterLedger, ledgerConflicts,
  ledgerSummary, loadLedger, mergeLedgerDocuments, newLedgerDocument,
  nextLedgerId, parseLedgerDocument, previewLedgerMerge, reviewLedgerStatement,
  saveLedger, sourceIssue, statementIssue,
  type LedgerDocument, type LedgerStatement, type LedgerValue,
} from "./recoveryProvenanceLedger";

const base: LedgerStatement = {
  id: "statement-1", packId: "north", field: "entry.surface",
  value: "UNKNOWN", note: "", recordedAt: "2026-11-19T13:00:00.000Z",
  phase: "draft", source: {
    name: "Regional open source", licence: "OGL-ON-1.0", date: "2026-11-19",
    tier: "UNKNOWN", reference: "Open dataset",
  },
};
const doc = (entries: readonly LedgerStatement[]): LedgerDocument => ({ format: "local-source-ledger-v1", entries });
const generate = (count: number, offset = 1): LedgerStatement[] => Array.from({ length: count }, (_, i) => ({
  ...base, id: `statement-${offset + i}`, packId: i % 2 ? "south" : "north",
  field: i % 3 ? "entry.surface" : "path.width",
  value: LEDGER_VALUES[i % LEDGER_VALUES.length] ?? "UNKNOWN",
  source: { ...base.source, tier: LEDGER_TIERS[i % LEDGER_TIERS.length] ?? "UNKNOWN" },
}));

function assertGood(document: LedgerDocument): void {
  const result = parseLedgerDocument(document);
  expect(result.ok).toBe(true);
  const output = saveLedger(document);
  expect(output.ok).toBe(true);
  if (output.ok) expect(loadLedger(output.value).ok).toBe(true);
}

describe("repeatable multi-entry document scenarios", () => {
  it("accepts every small generated document", () => {
    for (let count = 0; count <= 24; count += 1) assertGood(doc(generate(count)));
  });
  it("preserves every generated UNKNOWN value", () => {
    const input = doc(generate(44));
    const output = saveLedger(input);
    if (!output.ok) throw new Error(output.issue);
    const read = loadLedger(output.value);
    if (!read.ok) throw new Error(read.issue);
    expect(read.value.entries.map((e) => e.value)).toEqual(input.entries.map((e) => e.value));
  });
  it("retains source provenance for every entry", () => {
    const input = doc(generate(40));
    const checked = parseLedgerDocument(input);
    if (!checked.ok) throw new Error(checked.issue);
    for (let i = 0; i < input.entries.length; i += 1) {
      expect(checked.value.entries[i]?.source).toEqual(input.entries[i]?.source);
    }
  });
  it("refuses duplicate IDs at every position", () => {
    for (let pos = 0; pos < 20; pos += 1) {
      const entries = generate(20);
      entries[pos] = { ...base, id: entries[(pos + 1) % 20]?.id ?? "statement-1" };
      expect(parseLedgerDocument(doc(entries)).ok).toBe(false);
    }
  });
  it("generates sequential new IDs without collisions", () => {
    let current = newLedgerDocument();
    const ids = new Set<string>();
    for (let i = 0; i < 80; i += 1) {
      const id = nextLedgerId(current);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
      const result = appendLedgerStatement(current, { ...base, id });
      if (!result.ok) throw new Error(result.issue);
      current = result.value;
    }
    expect(current.entries).toHaveLength(80);
  });
  it("preserves insertion order after successive appends", () => {
    let current = newLedgerDocument();
    for (const entry of generate(30)) {
      const result = appendLedgerStatement(current, entry);
      if (!result.ok) throw new Error(result.issue);
      current = result.value;
    }
    expect(current.entries.map((entry) => entry.id)).toEqual(generate(30).map((entry) => entry.id));
  });
  it("reviewing one item never changes another", () => {
    const original = doc(generate(30));
    const result = reviewLedgerStatement(original, "statement-12", "reviewed");
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.entries.filter((e) => e.phase === "reviewed").map((e) => e.id)).toEqual(["statement-12"]);
    expect(original.entries.every((e) => e.phase === "draft")).toBe(true);
  });
  it("validates every generated source tier", () => {
    for (const tier of LEDGER_TIERS) {
      expect(sourceIssue({ ...base.source, tier })).toBeNull();
    }
  });
  it("supports all declared values without status elevation", () => {
    for (const value of LEDGER_VALUES) {
      expect(statementIssue({ ...base, value })).toBeNull();
      const result = appendLedgerStatement(newLedgerDocument(), { ...base, value });
      if (!result.ok) throw new Error(result.issue);
      expect(result.value.entries[0]?.value).toBe(value);
    }
  });
  it("calculates consistent totals for different sizes", () => {
    for (const size of [0, 1, 2, 5, 13, 40, 60]) {
      const records = generate(size);
      const summary = ledgerSummary(doc(records));
      expect(summary.count).toBe(size);
      expect(summary.unknown).toBe(records.filter((e) => e.value === "UNKNOWN").length);
      expect(summary.packs).toBe(new Set(records.map((e) => e.packId)).size);
    }
  });
  it("never treats unknown-only fields as disputed", () => {
    const entries = generate(25).map((item) => ({ ...item, value: "UNKNOWN" as LedgerValue }));
    expect(ledgerConflicts(doc(entries)).every((group) => group.result === "UNKNOWN")).toBe(true);
  });
  it("never resolves two opposing claims by quantity", () => {
    const reports = Array.from({ length: 20 }, (_, i) => ({
      ...base, id: `claim-${i + 1}`, value: (i === 19 ? "absent" : "present") as LedgerValue,
    }));
    expect(ledgerConflicts(doc(reports))[0]?.result).toBe("disputed");
  });
  it("does not mask disputes after adding UNKNOWN", () => {
    const original = [
      { ...base, id: "one", value: "present" as LedgerValue },
      { ...base, id: "two", value: "absent" as LedgerValue },
    ];
    for (let count = 0; count < 20; count += 1) {
      const uncertain = Array.from({ length: count }, (_, i) => ({ ...base, id: `uncertain-${i}`, value: "UNKNOWN" as LedgerValue }));
      expect(ledgerConflicts(doc([...original, ...uncertain]))[0]?.result).toBe("disputed");
    }
  });
  it("merge preview is stable across matching snapshots", () => {
    const snapshot = doc(generate(22));
    const preview = previewLedgerMerge(snapshot, snapshot);
    if (!preview.ok) throw new Error(preview.issue);
    expect(preview.value.added).toHaveLength(0);
    expect(preview.value.same).toHaveLength(22);
    expect(preview.value.collisions).toHaveLength(0);
  });
  it("split batches merge without removing prior entries", () => {
    const a = doc(generate(15));
    const b = doc(generate(15, 16));
    const result = mergeLedgerDocuments(a, b);
    if (!result.ok) throw new Error(result.issue);
    expect(result.value.entries).toHaveLength(30);
    expect(result.value.entries.slice(0, 15)).toEqual(a.entries);
  });
  it("rejects a changed imported history even with other new IDs", () => {
    const initial = doc(generate(10));
    const incoming = doc([...generate(10).map((e, i) => i === 0 ? { ...e, note: "different" } : e), ...generate(5, 11)]);
    expect(mergeLedgerDocuments(initial, incoming)).toEqual({ ok: false, issue: "conflict" });
  });
  it("filter results remain a subset of the original entries", () => {
    const current = doc(generate(50));
    const allIds = new Set(current.entries.map((e) => e.id));
    for (const filter of [
      { packId: "north" }, { field: "path.width" }, { value: "UNKNOWN" as LedgerValue },
      { search: "dataset" }, { search: "unmatched" }, { phase: "reviewed" as const },
    ]) {
      for (const item of filterLedger(current, filter)) expect(allIds.has(item.id)).toBe(true);
    }
  });
  it("changing a source date appears in the comparison", () => {
    const original = doc(generate(18));
    const changed = doc(original.entries.map((e, i) => i === 10 ? {
      ...e, source: { ...e.source, date: "2026-11-18" },
    } : e));
    expect(compareLedgers(original, changed).map((e) => e.id)).toEqual(["statement-11"]);
  });
  it("repeated export-import does not alter statements", () => {
    let current = doc(generate(10));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const serialized = saveLedger(current);
      if (!serialized.ok) throw new Error(serialized.issue);
      const parsed = loadLedger(serialized.value);
      if (!parsed.ok) throw new Error(parsed.issue);
      current = parsed.value;
    }
    expect(current).toEqual(doc(generate(10)));
  });
  it("rejects count overflow from large imported batches", () => {
    const current = doc(generate(LEDGER_LIMITS.maxEntries - 3));
    const incoming = doc(generate(6, 400));
    expect(mergeLedgerDocuments(current, incoming)).toEqual({ ok: false, issue: "limit" });
  });
  it("does not expose a successful state in any summary field", () => {
    const summary = ledgerSummary(doc(generate(17)));
    expect(Object.keys(summary).some((key) => key === "ready" || key === "accessible")).toBe(false);
  });
});
