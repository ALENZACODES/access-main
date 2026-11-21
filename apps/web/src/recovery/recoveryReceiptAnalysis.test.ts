import { describe, expect, it } from "vitest";
import {
  compareReceiptDocuments, receiptFindings, receiptNarrative,
  receiptOperationGroups, receiptPackGroups, receiptReport,
  receiptReviewQueue, receiptSourceGroups, receiptTimeline,
} from "./recoveryReceiptAnalysis";
import { emptyReceiptDocument, type ReceiptDocument, type ReceiptEntry, type ReceiptEvent } from "./recoveryReceiptLedger";

const source = { name: "Local sample", licence: "Sample usage", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const, reference: "example" };
const observation = { condition: "UNKNOWN" as const, summary: "Local reading", expectedBytes: null, observedBytes: null, digest: null };
const make = (id: string, patch: Partial<ReceiptEntry> = {}): ReceiptEntry => ({
  id, packId: "pack-a", operation: "pack", stage: "draft",
  createdAt: "2026-11-19T12:00:00.000Z", source, observation,
  handoffRole: "reviewer", handoffReference: "example-handoff", ...patch,
});
const makeEvent = (id: string, entryId: string): ReceiptEvent => ({
  id, entryId, action: "note", at: "2026-11-19T13:00:00.000Z", note: "Local note", source,
});
const doc = (entries: ReceiptEntry[], events: ReceiptEvent[] = []): ReceiptDocument => ({
  ...emptyReceiptDocument(), entries, events,
});
const sample = doc([
  make("receipt-1"),
  make("receipt-2", { packId: "pack-b", operation: "download", source: { ...source, tier: "documented" } }),
  make("receipt-3", { packId: "pack-a", operation: "handoff", observation: { ...observation, condition: "interrupted" } }),
], [makeEvent("event-1", "receipt-1")]);

const codes = (document: ReceiptDocument, day = "2026-11-19"): string[] => receiptFindings(document, day).map((item) => item.code);

describe("receipt findings", () => {
  it("has no findings for an empty register", () => { expect(receiptFindings(emptyReceiptDocument(), "2026-11-19")).toEqual([]); });
  it("flags UNKNOWN conditions", () => { expect(codes(sample)).toContain("unknown-condition"); });
  it("flags UNKNOWN evidence tiers", () => { expect(codes(sample)).toContain("unknown-tier"); });
  it("flags unacknowledged drafts", () => { expect(codes(sample)).toContain("unacknowledged"); });
  it("flags a handoff without a reference", () => {
    const value = doc([make("receipt-1", { operation: "handoff", handoffReference: "" })]);
    expect(codes(value)).toContain("unreferenced-handoff");
  });
  it("does not flag a referenced handoff", () => {
    const value = doc([make("receipt-1", { operation: "handoff" })]);
    expect(codes(value)).not.toContain("unreferenced-handoff");
  });
  it("flags expected bytes without observations", () => {
    const value = doc([make("receipt-1", { observation: { ...observation, expectedBytes: 100 } })]);
    expect(codes(value)).toContain("missing-bytes");
  });
  it("does not flag zero as missing", () => {
    const value = doc([make("receipt-1", { observation: { ...observation, expectedBytes: 0, observedBytes: 0 } })]);
    expect(codes(value)).not.toContain("missing-bytes");
  });
  it("flags measured size mismatches", () => {
    const value = doc([make("receipt-1", { observation: { ...observation, expectedBytes: 99, observedBytes: 100 } })]);
    expect(codes(value)).toContain("size-mismatch");
  });
  it("does not flag matching size values", () => {
    const value = doc([make("receipt-1", { observation: { ...observation, expectedBytes: 99, observedBytes: 99 } })]);
    expect(codes(value)).not.toContain("size-mismatch");
  });
  it("flags source evidence older than 90 days", () => { expect(codes(sample, "2027-04-01")).toContain("stale-source"); });
  it("does not flag fresh evidence as stale", () => { expect(codes(sample, "2026-11-19")).not.toContain("stale-source"); });
  it("does not treat a closed receipt as usable", () => {
    expect(codes(doc([make("receipt-1", { stage: "closed" })]))).toContain("closure-not-usable");
  });
  it("flags contradictory conditions for same pack operation", () => {
    const conflict = doc([make("receipt-1"), make("receipt-2", { observation: { ...observation, condition: "interrupted" } })]);
    expect(codes(conflict)).toContain("contradictory-conditions");
  });
  it("does not call different operations contradictory", () => {
    const value = doc([make("receipt-1"), make("receipt-2", { operation: "export", observation: { ...observation, condition: "interrupted" } })]);
    expect(codes(value)).not.toContain("contradictory-conditions");
  });
  it("does not call different packs contradictory", () => {
    const value = doc([make("receipt-1"), make("receipt-2", { packId: "pack-b", observation: { ...observation, condition: "interrupted" } })]);
    expect(codes(value)).not.toContain("contradictory-conditions");
  });
  it("flags a disputed record", () => { expect(codes(doc([make("receipt-1", { stage: "disputed" })]))).toContain("disputed"); });
  it("places high-severity findings ahead of medium", () => {
    const f = receiptFindings(doc([make("receipt-1", { stage: "disputed" })]), "2026-11-19");
    expect(f[0]?.severity).toBe("high");
  });
  it("does not upgrade the UNKNOWN tier in findings", () => {
    const f = receiptFindings(doc([make("receipt-1")]), "2026-11-19");
    expect(f.some((item) => item.code === "unknown-tier")).toBe(true);
  });
  it("records pack identifiers alongside findings", () => {
    expect(receiptFindings(sample, "2026-11-19").every((item) => item.packId.startsWith("pack-"))).toBe(true);
  });
  it("never labels a finding as a permission to use data", () => {
    expect(receiptFindings(sample, "2026-11-19").every((item) => !item.explanation.includes("usable now"))).toBe(true);
  });
});

describe("receipt grouping, investigation and comparisons", () => {
  it("has no pack groups when empty", () => { expect(receiptPackGroups(emptyReceiptDocument())).toEqual([]); });
  it("sorts pack groups", () => { expect(receiptPackGroups(sample).map((item) => item.packId)).toEqual(["pack-a", "pack-b"]); });
  it("counts records for each pack", () => { expect(receiptPackGroups(sample)[0]?.total).toBe(2); });
  it("counts open records", () => { expect(receiptPackGroups(sample)[0]?.open).toBe(2); });
  it("preserves unknown conditions in grouping", () => { expect(receiptPackGroups(sample)[0]?.conditions).toContain("UNKNOWN"); });
  it("preserves observed conditions in grouping", () => { expect(receiptPackGroups(sample)[0]?.conditions).toContain("interrupted"); });
  it("preserves tiers per pack", () => { expect(receiptPackGroups(sample)[1]?.tiers).toEqual(["documented"]); });
  it("counts distinct operations per pack", () => { expect(receiptPackGroups(sample)[0]?.operations).toEqual(["handoff", "pack"]); });
  it("does not claim pack readiness", () => { expect(receiptPackGroups(sample).every((item) => item.contentReady === false)).toBe(true); });
  it("always includes operation groups for all four operations", () => {
    expect(receiptOperationGroups(emptyReceiptDocument()).map((item) => item.operation)).toEqual(["pack", "download", "export", "handoff"]);
  });
  it("counts the pack operation", () => { expect(receiptOperationGroups(sample).find((item) => item.operation === "pack")?.total).toBe(1); });
  it("counts download operations", () => { expect(receiptOperationGroups(sample).find((item) => item.operation === "download")?.total).toBe(1); });
  it("counts handoff operations", () => { expect(receiptOperationGroups(sample).find((item) => item.operation === "handoff")?.total).toBe(1); });
  it("counts unknown observations by operation", () => { expect(receiptOperationGroups(sample).find((item) => item.operation === "pack")?.unknown).toBe(1); });
  it("does not fabricate closed operations", () => { expect(receiptOperationGroups(sample).find((item) => item.operation === "pack")?.stages.closed).toBe(0); });
  it("uses one source group per exact provenance", () => { expect(receiptSourceGroups(sample)).toHaveLength(2); });
  it("counts identical sources together", () => { expect(receiptSourceGroups(sample).some((item) => item.count === 2)).toBe(true); });
  it("preserves source licence in summary", () => { expect(receiptSourceGroups(sample)[0]?.source.licence).toBe("Sample usage"); });
  it("keeps source IDs", () => { expect(receiptSourceGroups(sample).flatMap((item) => item.entryIds).sort()).toEqual(["receipt-1", "receipt-2", "receipt-3"]); });
  it("returns empty timeline for unknown pack", () => { expect(receiptTimeline(sample, "unknown-pack")).toEqual([]); });
  it("includes the manually created entry", () => { expect(receiptTimeline(sample, "pack-a")[0]?.description).toContain("created"); });
  it("includes manual note events", () => { expect(receiptTimeline(sample, "pack-a").some((item) => item.description.includes("note"))).toBe(true); });
  it("does not include unrelated pack events", () => { expect(receiptTimeline(sample, "pack-b")).toHaveLength(1); });
  it("creates review items for unresolved pack evidence", () => { expect(receiptReviewQueue(sample, "2026-11-19")).toHaveLength(2); });
  it("creates a stable review identifier", () => { expect(receiptReviewQueue(sample, "2026-11-19")[0]?.id.startsWith("review:")).toBe(true); });
  it("prioritizes contradictions", () => {
    const value = doc([make("receipt-1"), make("receipt-2", { observation: { ...observation, condition: "interrupted" } })]);
    expect(receiptReviewQueue(value, "2026-11-19")[0]?.priority).toBe("high");
  });
  it("never claims review queue content is ready", () => { expect(receiptReviewQueue(sample, "2026-11-19").every((item) => !item.contentReady)).toBe(true); });
  it("returns no comparison for empty documents", () => { expect(compareReceiptDocuments(doc([]), doc([]))).toEqual([]); });
  it("finds added receipt identifiers", () => {
    expect(compareReceiptDocuments(doc([make("receipt-1")]), doc([make("receipt-1"), make("receipt-2")]))[0]?.kind).toBe("added");
  });
  it("finds removed receipt identifiers", () => {
    expect(compareReceiptDocuments(doc([make("receipt-1")]), doc([]))[0]?.kind).toBe("removed");
  });
  it("finds changed observations", () => {
    expect(compareReceiptDocuments(doc([make("receipt-1")]), doc([make("receipt-1", { observation: { ...observation, summary: "Changed" } })]))[0]?.kind).toBe("changed");
  });
  it("does not invent changes for identical entries", () => { expect(compareReceiptDocuments(doc([make("receipt-1")]), doc([make("receipt-1")]))).toEqual([]); });
  it("records pack identifiers on changed rows", () => {
    expect(compareReceiptDocuments(doc([]), doc([make("receipt-1", { packId: "pack-z" })]))[0]?.packId).toBe("pack-z");
  });
  it("reports actual number of receipts", () => { expect(receiptReport(sample, "2026-11-19").summary.entries).toBe(3); });
  it("reports generated date without fetching it", () => { expect(receiptReport(sample, "2026-11-19").generatedFor).toBe("2026-11-19"); });
  it("reports all observed pack groups", () => { expect(receiptReport(sample, "2026-11-19").packs).toHaveLength(2); });
  it("does not authorize installed pack access", () => { expect(receiptReport(sample, "2026-11-19").contentReady).toBe(false); });
});

describe("bilingual local narrative", () => {
  it("includes date in English", () => { expect(receiptNarrative(sample, "2026-11-19", "en")).toContain("2026-11-19"); });
  it("includes date in French", () => { expect(receiptNarrative(sample, "2026-11-19", "fr")).toContain("2026-11-19"); });
  it("preserves UNKNOWN in English", () => { expect(receiptNarrative(sample, "2026-11-19", "en")).toContain("UNKNOWN"); });
  it("preserves UNKNOWN in French", () => { expect(receiptNarrative(sample, "2026-11-19", "fr")).toContain("UNKNOWN"); });
  it("uses Canadian French typography at label separators", () => { expect(receiptNarrative(sample, "2026-11-19", "fr")).toContain("\u00a0:"); });
  it("uses a proper typographic apostrophe", () => { expect(receiptNarrative(sample, "2026-11-19", "fr")).toContain("’"); });
  it("includes an English non-use warning", () => { expect(receiptNarrative(sample, "2026-11-19", "en")).toContain("never confirms"); });
  it("includes a French non-use warning", () => { expect(receiptNarrative(sample, "2026-11-19", "fr")).toContain("ne confirme jamais"); });
  it("does not make claims about places", () => { expect(receiptNarrative(sample, "2026-11-19", "en")).not.toContain("accessible venue"); });
  it("does not change the input data", () => { receiptNarrative(sample, "2026-11-19", "fr"); expect(sample.entries).toHaveLength(3); });
});
