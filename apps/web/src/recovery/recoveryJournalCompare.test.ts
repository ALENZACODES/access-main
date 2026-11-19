import { describe, expect, it } from "vitest";
import {
  compareCaseDocuments,
  journalCompareCopy,
  mergeCaseDocuments,
  type JournalComparison,
} from "./recoveryJournalCompare";
import {
  appendCaseEvent,
  changeCasePhase,
  newCaseDocument,
  startCase,
  type CaseDocument,
  type CaseEvent,
} from "./recoveryCaseJournal";

const FIRST = "2026-11-18T10:00:00.000Z";
const SECOND = "2026-11-18T10:01:00.000Z";
const THIRD = "2026-11-18T10:02:00.000Z";
const EVIDENCE = { source: "Open records", licence: "CC-BY-4.0", date: "2026-11-17", tier: "source-reported" };

function empty(): CaseDocument {
  const result = newCaseDocument(FIRST);
  if (!result.ok) throw new Error("test setup");
  return result.value;
}

function opened(id: string, packId = "pack-1"): CaseDocument {
  const result = startCase(empty(), id, packId, SECOND);
  if (!result.ok) throw new Error("test setup");
  return result.value;
}

function withEvent(id = "case-1", outcome: "unknown" | "complete" = "unknown"): CaseDocument {
  const original = opened(id);
  const event: CaseEvent = {
    id: "entry-1", caseId: id, kind: "review", outcome, at: THIRD,
    note: "Manual check", evidence: outcome === "complete" ? EVIDENCE : null,
  };
  const result = appendCaseEvent(original, id, event);
  if (!result.ok) throw new Error("test setup");
  return result.value;
}

function expectCount(comparison: JournalComparison, counts: Partial<JournalComparison>): void {
  for (const [key, value] of Object.entries(counts)) {
    expect(comparison[key as keyof JournalComparison]).toEqual(value);
  }
}

describe("manual journal comparison", () => {
  it("reports one newly imported case", () => {
    const result = compareCaseDocuments(empty(), opened("case-1"));
    expectCount(result, { newCount: 1, conflictCount: 0, identicalCount: 0, localOnlyCount: 0, canMerge: true });
    expect(result.differences[0]).toMatchObject({ id: "case-1", state: "new", localEvents: 0 });
  });
  it("reports one local case retained", () => {
    const result = compareCaseDocuments(opened("case-1"), empty());
    expectCount(result, { localOnlyCount: 1, newCount: 0, canMerge: true });
    expect(result.differences[0]).toMatchObject({ id: "case-1", state: "local-only" });
  });
  it("recognizes identical cases without proposing duplicate import", () => {
    const local = withEvent();
    const result = compareCaseDocuments(local, JSON.parse(JSON.stringify(local)) as CaseDocument);
    expectCount(result, { identicalCount: 1, newCount: 0, conflictCount: 0, canMerge: true });
  });
  it("compares evidence by fields rather than property insertion order", () => {
    const local = withEvent("case-1", "complete");
    const changed: CaseDocument = JSON.parse(JSON.stringify(local)) as CaseDocument;
    const entries = changed.cases.map((entry) => ({ ...entry, events: entry.events.map((event) => ({
      ...event,
      evidence: event.evidence && { tier: event.evidence.tier, date: event.evidence.date,
        licence: event.evidence.licence, source: event.evidence.source },
    })) }));
    const result = compareCaseDocuments(local, { ...changed, cases: entries });
    expect(result.identicalCount).toBe(1);
  });
  it("blocks changed historical notes", () => {
    const local = withEvent();
    const imported: CaseDocument = {
      ...local,
      cases: local.cases.map((entry) => ({ ...entry,
        events: entry.events.map((event) => ({ ...event, note: "Different note" })) })),
    };
    expectCount(compareCaseDocuments(local, imported), { conflictCount: 1, canMerge: false });
  });
  it("blocks changed event metadata", () => {
    const local = withEvent("case-1", "complete");
    const imported: CaseDocument = { ...local, cases: local.cases.map((entry) => ({ ...entry,
      events: entry.events.map((event) => ({ ...event, evidence: { ...EVIDENCE, tier: "unknown" } })) })) };
    expect(compareCaseDocuments(local, imported).conflictCount).toBe(1);
  });
  it("blocks changed pack ownership", () => {
    const result = compareCaseDocuments(opened("case-1", "pack-1"), opened("case-1", "pack-2"));
    expect(result.conflictCount).toBe(1);
    expect(result.differences[0]?.state).toBe("conflict");
  });
  it("blocks changed phase", () => {
    const current = opened("case-1");
    const closed = changeCasePhase(current, "case-1", "closed");
    if (!closed.ok) throw new Error("test setup");
    expect(compareCaseDocuments(current, closed.value).canMerge).toBe(false);
  });
  it("reports event lengths for divergent versions", () => {
    const result = compareCaseDocuments(opened("case-1"), withEvent("case-1"));
    expect(result.differences[0]).toMatchObject({ state: "conflict", localEvents: 0, importedEvents: 1 });
  });
  it("produces sorted case IDs for stable comparison", () => {
    const first = opened("case-z");
    const next = startCase(first, "case-a", "pack-2", THIRD);
    if (!next.ok) throw new Error("test setup");
    const ids = compareCaseDocuments(empty(), next.value).differences.map((item) => item.id);
    expect(ids).toEqual(["case-a", "case-z"]);
  });
});

describe("non-destructive journal merge", () => {
  it("adds a new case", () => {
    const result = mergeCaseDocuments(empty(), opened("case-1"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.cases).toHaveLength(1);
      expect(result.document.createdAt).toBe(SECOND);
    }
  });
  it("keeps an existing case unchanged", () => {
    const current = withEvent();
    const result = mergeCaseDocuments(current, current);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.cases).toEqual(current.cases);
  });
  it("preserves local-only cases", () => {
    const current = opened("case-1");
    const result = mergeCaseDocuments(current, empty());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.cases).toEqual(current.cases);
  });
  it("blocks history mismatch atomically", () => {
    const result = mergeCaseDocuments(opened("case-1"), withEvent("case-1"));
    expect(result).toMatchObject({ ok: false, reason: "conflict" });
  });
  it("blocks changed pack ID atomically", () => {
    const result = mergeCaseDocuments(opened("case-1", "pack-1"), opened("case-1", "pack-2"));
    expect(result).toMatchObject({ ok: false, reason: "conflict" });
  });
  it("rejects invalid imported cases", () => {
    const invalid = { ...opened("case-1"), cases: [{ id: "bad" }] } as unknown as CaseDocument;
    expect(mergeCaseDocuments(empty(), invalid)).toMatchObject({ ok: false, reason: "invalid-document" });
  });
  it("rejects invalid local journals", () => {
    const invalid = { ...empty(), format: "other" } as unknown as CaseDocument;
    expect(mergeCaseDocuments(invalid, empty())).toMatchObject({ ok: false, reason: "invalid-document" });
  });
  it("blocks an imported journal with duplicate identifiers", () => {
    const source = opened("case-1");
    const invalid = { ...source, cases: [source.cases[0], source.cases[0]] } as CaseDocument;
    expect(mergeCaseDocuments(empty(), invalid)).toMatchObject({ ok: false, reason: "invalid-document" });
  });
  it("does not modify its arguments", () => {
    const left = empty();
    const right = opened("case-1");
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    mergeCaseDocuments(left, right);
    expect(JSON.stringify(left)).toBe(a);
    expect(JSON.stringify(right)).toBe(b);
  });
});

describe("bilingual comparison guidance", () => {
  it("contains all difference labels in English and French", () => {
    for (const locale of ["en", "fr"] as const) {
      const copy = journalCompareCopy(locale);
      expect(copy.states.new).toBeDefined();
      expect(copy.states.conflict).toBeDefined();
      expect(copy.states.identical).toBeDefined();
      expect(copy.states["local-only"]).toBeDefined();
      expect(copy.apply.trim()).not.toBe("");
      expect(copy.discard.trim()).not.toBe("");
    }
  });
  it("uses an explicit conflict message", () => {
    expect(journalCompareCopy("en").errors.conflict).toMatch(/same identifier/i);
    expect(journalCompareCopy("fr").errors.conflict).toMatch(/même identifiant/i);
  });
});
