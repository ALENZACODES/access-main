import { describe, expect, it } from "vitest";
import {
  createReceipt, emptyReceiptDocument, exportReceiptDocument, importReceiptDocument,
  mergeReceiptDocuments, previewReceiptMerge, recordReceiptEvent, receiptSummary,
  validReceiptDocument, type ReceiptDocument, type ReceiptEntry, type ReceiptEvent,
} from "./recoveryReceiptLedger";

const provenance = {
  name: "Manual record", licence: "Test licence", retrievedOn: "2026-11-19",
  tier: "UNKNOWN" as const, reference: "test-reference",
};
const entry = (id: string, patch: Partial<ReceiptEntry> = {}): ReceiptEntry => ({
  id, packId: "pack-a", operation: "handoff", stage: "draft",
  createdAt: "2026-11-19T10:00:00.000Z", source: provenance,
  observation: { condition: "UNKNOWN", summary: "Awaiting manual review", expectedBytes: null, observedBytes: null, digest: null },
  handoffRole: "local operator", handoffReference: "reference-a", ...patch,
});
const log = (id: string, action: ReceiptEvent["action"], at: string): ReceiptEvent => ({
  id, entryId: "a", action, at, note: "Manually captured", source: provenance,
});
const document = (entries: ReceiptEntry[], events: ReceiptEvent[] = []): ReceiptDocument => ({
  ...emptyReceiptDocument(), entries, events,
});

describe("import safety and manual workflow invariants", () => {
  it("rejects a private note that contains a control byte", () => {
    expect(createReceipt(emptyReceiptDocument(), entry("a", { observation: { ...entry("a").observation, summary: "test\u0000value" } })).ok).toBe(false);
  });
  it("rejects UTF-8 document size beyond the stated byte cap", () => {
    expect(importReceiptDocument("é".repeat(260000)).ok).toBe(false);
  });
  it("does not confuse character count with byte count", () => {
    const result = exportReceiptDocument(document([entry("a", { handoffRole: "é" })]));
    expect(result.ok).toBe(true);
  });
  it("rejects an unrecognized schema version instead of guessing", () => {
    expect(importReceiptDocument(JSON.stringify({ ...emptyReceiptDocument(), schema: "another-schema" })).ok).toBe(false);
  });
  it("rejects null roots", () => { expect(importReceiptDocument("null").ok).toBe(false); });
  it("rejects scalar roots", () => { expect(importReceiptDocument("7").ok).toBe(false); });
  it("rejects a string in place of entries", () => {
    expect(importReceiptDocument(JSON.stringify({ ...emptyReceiptDocument(), entries: "not an array" })).ok).toBe(false);
  });
  it("rejects a string in place of events", () => {
    expect(importReceiptDocument(JSON.stringify({ ...emptyReceiptDocument(), events: "not an array" })).ok).toBe(false);
  });
  it("rejects a source without its required licence", () => {
    const unsafe = { ...entry("a"), source: { ...provenance, licence: null } };
    expect(importReceiptDocument(JSON.stringify(document([unsafe as unknown as ReceiptEntry]))).ok).toBe(false);
  });
  it("rejects unsupported secret properties", () => {
    const unsafe = { ...entry("a"), credential: "do-not-store" };
    expect(importReceiptDocument(JSON.stringify(document([unsafe]))).ok).toBe(false);
  });
  it("accepts anonymous role labels without a personal identifier", () => {
    expect(createReceipt(emptyReceiptDocument(), entry("a", { handoffRole: "" })).ok).toBe(true);
  });
  it("does not invent a source when the licence field is blank", () => {
    expect(createReceipt(emptyReceiptDocument(), entry("a", { source: { ...provenance, licence: "" } })).ok).toBe(false);
  });
  it("does not infer pack availability from a documented tier", () => {
    const added = createReceipt(emptyReceiptDocument(), entry("a", { source: { ...provenance, tier: "documented" } }));
    expect(added.ok).toBe(true);
    if (added.ok) expect(receiptSummary(added.value).contentReady).toBe(false);
  });
  it("does not infer pack availability from a reviewed tier", () => {
    const added = createReceipt(emptyReceiptDocument(), entry("a", { source: { ...provenance, tier: "reviewed" } }));
    expect(added.ok).toBe(true);
    if (added.ok) expect(receiptSummary(added.value).contentReady).toBe(false);
  });
  it("does not infer availability from a completed handoff reference", () => {
    const added = createReceipt(emptyReceiptDocument(), entry("a", { handoffReference: "documented-handoff" }));
    expect(added.ok).toBe(true);
    if (added.ok) expect(receiptSummary(added.value).contentReady).toBe(false);
  });
  it("rejects late observations inserted before prior history", () => {
    const start = document([entry("a")]);
    const sent = recordReceiptEvent(start, log("event-1", "sent", "2026-11-19T12:00:00.000Z"));
    if (!sent.ok) throw new Error("test setup failed");
    const oldNote = recordReceiptEvent(sent.value, log("event-2", "note", "2026-11-19T11:00:00.000Z"));
    expect(oldNote.ok).toBe(false);
  });
  it("rejects an invalid cross-document merge that changes a receipt ID", () => {
    const original = document([entry("a")]);
    const altered = document([entry("a", { packId: "another-pack" })]);
    expect(previewReceiptMerge(original, altered).canMerge).toBe(false);
    expect(mergeReceiptDocuments(original, altered).ok).toBe(false);
  });
  it("leaves original state unchanged after a rejected merge", () => {
    const original = document([entry("a")]);
    mergeReceiptDocuments(original, document([entry("a", { packId: "another-pack" })]));
    expect(original.entries[0]?.packId).toBe("pack-a");
  });
  it("does not mutate an existing observation on export", () => {
    const original = document([entry("a")]);
    exportReceiptDocument(original);
    expect(original.entries[0]?.observation.condition).toBe("UNKNOWN");
  });
  it("rejects a forged stage without matching review history", () => {
    expect(validReceiptDocument(document([entry("a", { stage: "acknowledged" })]))).toBe(false);
  });
  it("rejects a forged closed stage without matching review history", () => {
    expect(validReceiptDocument(document([entry("a", { stage: "closed" })]))).toBe(false);
  });
  it("rejects a dispute without a sent event", () => {
    expect(validReceiptDocument(document([entry("a", { stage: "disputed" })], [log("event-1", "disputed", "2026-11-19T12:00:00.000Z")]))).toBe(false);
  });
  it("handles an empty import as invalid instead of resetting state", () => {
    expect(importReceiptDocument("").ok).toBe(false);
  });
  it("does not accept two identical IDs as separate cases", () => {
    expect(validReceiptDocument(document([entry("a"), entry("a")]))).toBe(false);
  });
  it("does not silently strip additional properties", () => {
    expect(importReceiptDocument(JSON.stringify({ ...emptyReceiptDocument(), telemetry: true })).ok).toBe(false);
  });
  it("does not treat null source as UNKNOWN evidence", () => {
    const unsafe = { ...entry("a"), source: null };
    expect(importReceiptDocument(JSON.stringify(document([unsafe as unknown as ReceiptEntry]))).ok).toBe(false);
  });
});
