import { describe, expect, it } from "vitest";
import {
  RECEIPT_ACTIONS, RECEIPT_CONDITIONS, RECEIPT_LIMITS, RECEIPT_OPERATIONS, RECEIPT_STAGES, RECEIPT_TIERS,
  createReceipt, emptyReceiptDocument, exportReceiptDocument, filterReceipts,
  importReceiptDocument, mergeReceiptDocuments, nextReceiptEntryId, nextReceiptEventId,
  previewReceiptMerge, receiptContentReady, receiptEventsFor, receiptSummary,
  recordReceiptEvent, validReceiptDocument, validReceiptEntry, validReceiptEvent,
  validReceiptObservation, validReceiptSource, validateReceiptDocument,
  type ReceiptDocument, type ReceiptEntry, type ReceiptEvent,
} from "./recoveryReceiptLedger";

const at = "2026-11-19T12:00:00.000Z";
const later = "2026-11-19T13:00:00.000Z";
const source = {
  name: "Example local source", licence: "Example usage licence", retrievedOn: "2026-11-19",
  tier: "UNKNOWN" as const, reference: "local-document-1",
};
const observation = {
  condition: "UNKNOWN" as const, summary: "Local observation recorded manually",
  expectedBytes: null, observedBytes: null, digest: null,
};
const make = (id = "receipt-1", patch: Partial<ReceiptEntry> = {}): ReceiptEntry => ({
  id, packId: "pack-1", operation: "handoff", stage: "draft", createdAt: at,
  source, observation, handoffRole: "local reviewer", handoffReference: "handoff-example",
  ...patch,
});
const event = (id = "receipt-event-1", action: ReceiptEvent["action"] = "sent", patch: Partial<ReceiptEvent> = {}): ReceiptEvent => ({
  id, entryId: "receipt-1", action, at: later, note: "Manual follow-up", source, ...patch,
});
const doc = (entries: ReceiptEntry[] = [], events: ReceiptEvent[] = []): ReceiptDocument => ({
  schema: "the-app.recovery-receipt-ledger.v1", entries, events,
});
const expectIssue = <T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: string }, issue: string): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue).toBe(issue);
};

describe("recovery receipt schema and provenance", () => {
  it("creates an empty local document", () => { expect(emptyReceiptDocument()).toEqual(doc()); });
  it("has an explicit schema identifier", () => { expect(emptyReceiptDocument().schema).toBe("the-app.recovery-receipt-ledger.v1"); });
  it("accepts an empty document", () => { expect(validReceiptDocument(emptyReceiptDocument())).toBe(true); });
  it("does not declare a ready condition", () => { expect(RECEIPT_CONDITIONS).not.toContain("ready"); });
  it("keeps the literal unknown condition", () => { expect(RECEIPT_CONDITIONS).toContain("UNKNOWN"); });
  it("keeps the literal unknown evidence tier", () => { expect(RECEIPT_TIERS).toContain("UNKNOWN"); });
  it("supports all four local operations", () => { expect(RECEIPT_OPERATIONS).toEqual(["pack", "download", "export", "handoff"]); });
  it("supports manual receipt lifecycle stages", () => { expect(RECEIPT_STAGES).toEqual(["draft", "sent", "acknowledged", "disputed", "closed"]); });
  it("supports manual event actions", () => { expect(RECEIPT_ACTIONS).toContain("reopened"); });
  it("caps serialized imports at 512000 bytes", () => { expect(RECEIPT_LIMITS.bytes).toBe(512000); });
  it("caps recorded entries", () => { expect(RECEIPT_LIMITS.entries).toBeLessThan(400); });
  it("caps review history events", () => { expect(RECEIPT_LIMITS.events).toBeLessThan(3000); });
  it("accepts valid source", () => { expect(validReceiptSource(source)).toBe(true); });
  it("does not infer a source name", () => { expect(validReceiptSource({ ...source, name: "" })).toBe(false); });
  it("does not infer a source licence", () => { expect(validReceiptSource({ ...source, licence: " " })).toBe(false); });
  it("does not infer retrieval date", () => { expect(validReceiptSource({ ...source, retrievedOn: "" })).toBe(false); });
  it("does not accept impossible calendar days", () => { expect(validReceiptSource({ ...source, retrievedOn: "2026-02-30" })).toBe(false); });
  it("does not accept invalid leap days", () => { expect(validReceiptSource({ ...source, retrievedOn: "2025-02-29" })).toBe(false); });
  it("accepts valid leap days", () => { expect(validReceiptSource({ ...source, retrievedOn: "2024-02-29" })).toBe(true); });
  it("does not accept an unsupported tier", () => { expect(validReceiptSource({ ...source, tier: "certified" })).toBe(false); });
  it("requires a source reference", () => { expect(validReceiptSource({ ...source, reference: "" })).toBe(false); });
  it("does not accept a newline-only source", () => { expect(validReceiptSource({ ...source, name: "\n" })).toBe(false); });
  it("accepts an explicit unknown tier", () => { expect(validReceiptSource({ ...source, tier: "UNKNOWN" })).toBe(true); });
  it("rejects source control characters", () => { expect(validReceiptSource({ ...source, name: "a\u0001b" })).toBe(false); });
  it("allows ordinary newlines in notes", () => { expect(validReceiptObservation({ ...observation, summary: "a\nb" })).toBe(true); });
  it("rejects note control characters", () => { expect(validReceiptObservation({ ...observation, summary: "a\u0007b" })).toBe(false); });
  it("does not promote unknown to completed", () => { expect(validReceiptObservation(observation)).toBe(true); });
  it("rejects invented readiness", () => { expect(validReceiptObservation({ ...observation, condition: "ready" })).toBe(false); });
  it("supports explicit missing byte counts", () => { expect(validReceiptObservation({ ...observation, expectedBytes: null })).toBe(true); });
  it("allows zero observed bytes", () => { expect(validReceiptObservation({ ...observation, observedBytes: 0 })).toBe(true); });
  it("rejects negative byte counts", () => { expect(validReceiptObservation({ ...observation, observedBytes: -1 })).toBe(false); });
  it("rejects fractional byte counts", () => { expect(validReceiptObservation({ ...observation, observedBytes: 2.5 })).toBe(false); });
  it("rejects NaN byte counts", () => { expect(validReceiptObservation({ ...observation, observedBytes: NaN })).toBe(false); });
  it("rejects infinite byte counts", () => { expect(validReceiptObservation({ ...observation, expectedBytes: Infinity })).toBe(false); });
  it("rejects excessive byte counts", () => { expect(validReceiptObservation({ ...observation, expectedBytes: 1e15 })).toBe(false); });
  it("accepts a 64-digit digest", () => { expect(validReceiptObservation({ ...observation, digest: "a".repeat(64) })).toBe(true); });
  it("rejects an undersized digest", () => { expect(validReceiptObservation({ ...observation, digest: "a".repeat(63) })).toBe(false); });
  it("rejects a nonhex digest", () => { expect(validReceiptObservation({ ...observation, digest: "z".repeat(64) })).toBe(false); });
  it("rejects observation extra keys", () => { expect(validReceiptObservation({ ...observation, extra: true })).toBe(false); });
  it("accepts a draft entry", () => { expect(validReceiptEntry(make())).toBe(true); });
  it("rejects missing entry ID", () => { expect(validReceiptEntry({ ...make(), id: "" })).toBe(false); });
  it("rejects whitespace entry ID", () => { expect(validReceiptEntry({ ...make(), id: "space id" })).toBe(false); });
  it("rejects slash entry ID", () => { expect(validReceiptEntry({ ...make(), id: "a/b" })).toBe(false); });
  it("rejects missing pack ID", () => { expect(validReceiptEntry({ ...make(), packId: "" })).toBe(false); });
  it("rejects unsupported operation", () => { expect(validReceiptEntry({ ...make(), operation: "medical" })).toBe(false); });
  it("rejects unsupported phase", () => { expect(validReceiptEntry({ ...make(), stage: "completed" })).toBe(false); });
  it("rejects invalid timestamps", () => { expect(validReceiptEntry({ ...make(), createdAt: "tomorrow" })).toBe(false); });
  it("rejects local timestamps without Z", () => { expect(validReceiptEntry({ ...make(), createdAt: "2026-11-19T12:00:00" })).toBe(false); });
  it("rejects timestamps before source retrieval", () => { expect(validReceiptEntry({ ...make(), createdAt: "2026-11-18T12:00:00.000Z" })).toBe(false); });
  it("rejects extra entry keys", () => { expect(validReceiptEntry({ ...make(), extra: "x" })).toBe(false); });
  it("does not require a person's name", () => { expect(validReceiptEntry({ ...make(), handoffRole: "" })).toBe(true); });
  it("does not invent a handoff reference", () => { expect(validReceiptEntry({ ...make(), handoffReference: "" })).toBe(true); });
  it("rejects unsafe handoff role", () => { expect(validReceiptEntry({ ...make(), handoffRole: "\u0008" })).toBe(false); });
  it("rejects unsafe handoff reference", () => { expect(validReceiptEntry({ ...make(), handoffReference: "\u0000" })).toBe(false); });
  it("accepts a valid event", () => { expect(validReceiptEvent(event())).toBe(true); });
  it("rejects event without ID", () => { expect(validReceiptEvent({ ...event(), id: "" })).toBe(false); });
  it("rejects event without entry ID", () => { expect(validReceiptEvent({ ...event(), entryId: "" })).toBe(false); });
  it("rejects invalid event action", () => { expect(validReceiptEvent({ ...event(), action: "ready" })).toBe(false); });
  it("rejects invalid event timestamp", () => { expect(validReceiptEvent({ ...event(), at: "2026-11-19" })).toBe(false); });
  it("rejects event earlier than source", () => { expect(validReceiptEvent({ ...event(), at: "2026-11-17T12:00:00.000Z" })).toBe(false); });
  it("rejects extra event properties", () => { expect(validReceiptEvent({ ...event(), unknown: true })).toBe(false); });
  it("rejects unsafe event notes", () => { expect(validReceiptEvent({ ...event(), note: "a\u001fb" })).toBe(false); });
  it("accepts an empty event note", () => { expect(validReceiptEvent({ ...event(), note: "" })).toBe(true); });
  it("rejects unsupported root schema", () => { expect(validReceiptDocument({ ...doc(), schema: "v2" })).toBe(false); });
  it("rejects unexpected root data", () => { expect(validReceiptDocument({ ...doc(), token: "secret" })).toBe(false); });
  it("rejects non-array entries", () => { expect(validReceiptDocument({ ...doc(), entries: {} })).toBe(false); });
  it("rejects non-array events", () => { expect(validReceiptDocument({ ...doc(), events: {} })).toBe(false); });
  it("rejects duplicate entries", () => { expect(validReceiptDocument(doc([make(), make()]))).toBe(false); });
  it("rejects duplicate events", () => {
    const sent = { ...make(), stage: "sent" as const };
    expect(validReceiptDocument(doc([sent], [event(), event()]))).toBe(false);
  });
  it("rejects orphan event references", () => { expect(validReceiptDocument(doc([make()], [event()]))).toBe(false); });
  it("rejects stage mismatch without event", () => { expect(validReceiptDocument(doc([make("receipt-1", { stage: "closed" })]))).toBe(false); });
  it("rejects event occurring before entry", () => {
    expect(validReceiptDocument(doc([make()], [event("receipt-event-1", "sent", { at: "2026-11-19T11:00:00.000Z" })]))).toBe(false);
  });
  it("rejects a closure without acknowledgement", () => {
    expect(validReceiptDocument(doc([make("receipt-1", { stage: "closed" })], [event("receipt-event-1", "closed")]))).toBe(false);
  });
  it("never establishes pack readiness", () => { expect(receiptContentReady()).toBe(false); });
});

describe("manual receipt transitions and exports", () => {
  it("chooses the first available entry ID", () => { expect(nextReceiptEntryId(emptyReceiptDocument())).toBe("receipt-1"); });
  it("skips an occupied entry ID", () => { expect(nextReceiptEntryId(doc([make()]))).toBe("receipt-2"); });
  it("chooses the first available event ID", () => { expect(nextReceiptEventId(emptyReceiptDocument())).toBe("receipt-event-1"); });
  it("skips an occupied event ID", () => { expect(nextReceiptEventId(doc([], [event()]))).toBe("receipt-event-2"); });
  it("creates a draft entry", () => { expect(createReceipt(doc(), make()).ok).toBe(true); });
  it("refuses a non-draft entry without history", () => { expectIssue(createReceipt(doc(), make("receipt-1", { stage: "sent" })), "source"); });
  it("refuses a duplicate entry", () => { expectIssue(createReceipt(doc([make()]), make()), "duplicate"); });
  it("refuses to append to invalid documents", () => {
    expectIssue(createReceipt({ ...doc(), entries: [make(), make()] }, make("receipt-2")), "format");
  });
  it("cannot send an unknown receipt ID", () => { expectIssue(recordReceiptEvent(doc([make()]), { ...event(), entryId: "missing" }), "reference"); });
  it("allows a draft to be sent", () => {
    const result = recordReceiptEvent(doc([make()]), event());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries[0]?.stage).toBe("sent");
  });
  it("cannot acknowledge a draft", () => { expectIssue(recordReceiptEvent(doc([make()]), event("receipt-event-1", "acknowledged")), "transition"); });
  it("cannot dispute a draft", () => { expectIssue(recordReceiptEvent(doc([make()]), event("receipt-event-1", "disputed")), "transition"); });
  it("cannot close a draft", () => { expectIssue(recordReceiptEvent(doc([make()]), event("receipt-event-1", "closed")), "transition"); });
  it("cannot reopen a draft", () => { expectIssue(recordReceiptEvent(doc([make()]), event("receipt-event-1", "reopened")), "transition"); });
  it("permits an ordinary note on a draft", () => {
    const result = recordReceiptEvent(doc([make()]), event("receipt-event-1", "note"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries[0]?.stage).toBe("draft");
  });
  it("permits a created event as a local note", () => { expect(recordReceiptEvent(doc([make()]), event("receipt-event-1", "created")).ok).toBe(true); });
  it("does not allow duplicate event IDs", () => {
    const sent = recordReceiptEvent(doc([make()]), event());
    if (!sent.ok) throw new Error("test setup failed");
    expectIssue(recordReceiptEvent(sent.value, event()), "duplicate");
  });
  it("permits acknowledgement after sending", () => {
    const sent = recordReceiptEvent(doc([make()]), event());
    if (!sent.ok) throw new Error("test setup failed");
    const receipt = recordReceiptEvent(sent.value, event("receipt-event-2", "acknowledged", { at: "2026-11-19T14:00:00.000Z" }));
    expect(receipt.ok).toBe(true);
    if (receipt.ok) expect(receipt.value.entries[0]?.stage).toBe("acknowledged");
  });
  it("permits a dispute after sending", () => {
    const sent = recordReceiptEvent(doc([make()]), event());
    if (!sent.ok) throw new Error("test setup failed");
    const disputed = recordReceiptEvent(sent.value, event("receipt-event-2", "disputed", { at: "2026-11-19T14:00:00.000Z" }));
    expect(disputed.ok).toBe(true);
    if (disputed.ok) expect(disputed.value.entries[0]?.stage).toBe("disputed");
  });
  it("permits reopening a dispute", () => {
    let current = doc([make()]);
    for (const [index, action] of ["sent", "disputed", "reopened"].entries()) {
      const result = recordReceiptEvent(current, event(`receipt-event-${index + 1}`, action as ReceiptEvent["action"], { at: `2026-11-19T${String(index + 13).padStart(2, "0")}:00:00.000Z` }));
      if (!result.ok) throw new Error("test setup failed");
      current = result.value;
    }
    expect(current.entries[0]?.stage).toBe("draft");
  });
  it("permits closing an acknowledged receipt", () => {
    let current = doc([make()]);
    for (const [index, action] of ["sent", "acknowledged", "closed"].entries()) {
      const result = recordReceiptEvent(current, event(`receipt-event-${index + 1}`, action as ReceiptEvent["action"], { at: `2026-11-19T${String(index + 13).padStart(2, "0")}:00:00.000Z` }));
      if (!result.ok) throw new Error("test setup failed");
      current = result.value;
    }
    expect(current.entries[0]?.stage).toBe("closed");
    expect(receiptContentReady()).toBe(false);
  });
  it("refuses a late event preceding the last logged event", () => {
    const sent = recordReceiptEvent(doc([make()]), event());
    if (!sent.ok) throw new Error("test setup failed");
    expectIssue(recordReceiptEvent(sent.value, event("receipt-event-2", "acknowledged", { at })), "timestamp");
  });
  it("sorts events for one entry chronologically", () => {
    const result = receiptEventsFor(doc([make()], [event("receipt-event-2", "note", { at: "2026-11-19T14:00:00.000Z" }), event()]), "receipt-1");
    expect(result.map((item) => item.id)).toEqual(["receipt-event-1", "receipt-event-2"]);
  });
  it("does not retrieve unrelated event references", () => {
    expect(receiptEventsFor(doc([], [event()]), "other")).toEqual([]);
  });
  it("filters records by pack identifier", () => {
    expect(filterReceipts(doc([make(), make("receipt-2", { packId: "pack-2" })]), { packId: "pack-2" }).map((item) => item.id)).toEqual(["receipt-2"]);
  });
  it("filters by operation", () => {
    expect(filterReceipts(doc([make(), make("receipt-2", { operation: "export" })]), { operation: "export" }).map((item) => item.id)).toEqual(["receipt-2"]);
  });
  it("filters by stage", () => {
    expect(filterReceipts(doc([make()]), { stage: "sent" })).toEqual([]);
  });
  it("filters by unknown condition", () => {
    expect(filterReceipts(doc([make()]), { condition: "UNKNOWN" })).toHaveLength(1);
  });
  it("filters case-insensitive summary text", () => {
    expect(filterReceipts(doc([make()]), { contains: "OBSERVATION" })).toHaveLength(1);
  });
  it("filters by local role", () => {
    expect(filterReceipts(doc([make()]), { contains: "reviewer" })).toHaveLength(1);
  });
  it("filters by handoff reference", () => {
    expect(filterReceipts(doc([make()]), { contains: "handoff-example" })).toHaveLength(1);
  });
  it("keeps an empty filter inclusive", () => { expect(filterReceipts(doc([make()]), { contains: "  " })).toHaveLength(1); });
  it("counts empty summary correctly", () => { expect(receiptSummary(doc()).entries).toBe(0); });
  it("counts UNKNOWN without changing the token", () => { expect(receiptSummary(doc([make()])).unknown).toBe(1); });
  it("counts distinct packs", () => { expect(receiptSummary(doc([make(), make("receipt-2", { packId: "pack-2" })])).distinctPacks).toBe(2); });
  it("counts open documents", () => { expect(receiptSummary(doc([make()])).open).toBe(1); });
  it("never reports contentReady true", () => { expect(receiptSummary(doc([make()])).contentReady).toBe(false); });
  it("serializes valid documents", () => { expect(exportReceiptDocument(doc([make()])).ok).toBe(true); });
  it("round-trips a valid document", () => {
    const result = exportReceiptDocument(doc([make()]));
    if (!result.ok) throw new Error("test setup failed");
    const decoded = importReceiptDocument(result.value);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.value.entries[0]?.id).toBe("receipt-1");
  });
  it("rejects malformed JSON", () => { expectIssue(importReceiptDocument("{"), "format"); });
  it("rejects non-document JSON", () => { expectIssue(importReceiptDocument("[]"), "format"); });
  it("rejects JSON with extra keys", () => { expectIssue(importReceiptDocument(JSON.stringify({ ...doc(), secret: "x" })), "format"); });
  it("rejects oversized JSON", () => { expectIssue(importReceiptDocument(" ".repeat(RECEIPT_LIMITS.bytes + 1)), "limit"); });
  it("rejects unsafe imported entries", () => {
    expectIssue(importReceiptDocument(JSON.stringify(doc([{ ...make(), source: { ...source, name: "" } }]))), "format");
  });
  it("fails closed when merging an invalid document", () => {
    expect(previewReceiptMerge(doc(), { ...doc(), entries: [make(), make()] }).canMerge).toBe(false);
  });
  it("allows merging disjoint entries", () => {
    const merged = mergeReceiptDocuments(doc([make()]), doc([make("receipt-2", { packId: "pack-2" })]));
    expect(merged.ok).toBe(true);
    if (merged.ok) expect(merged.value.entries).toHaveLength(2);
  });
  it("detects conflicting entry identifiers", () => {
    const preview = previewReceiptMerge(doc([make()]), doc([make("receipt-1", { handoffRole: "different role" })]));
    expect(preview.conflicts).toBe(1);
    expect(preview.canMerge).toBe(false);
  });
  it("refuses conflicting imports", () => {
    expectIssue(mergeReceiptDocuments(doc([make()]), doc([make("receipt-1", { handoffRole: "different role" })])), "conflict");
  });
  it("recognizes identical duplicates", () => {
    const preview = previewReceiptMerge(doc([make()]), doc([make()]));
    expect(preview.duplicates).toBe(1);
    expect(preview.conflicts).toBe(0);
  });
  it("merges identical duplicate documents without multiplying rows", () => {
    const merged = mergeReceiptDocuments(doc([make()]), doc([make()]));
    expect(merged.ok).toBe(true);
    if (merged.ok) expect(merged.value.entries).toHaveLength(1);
  });
  it("does not mutate original documents", () => {
    const left = doc([make()]);
    mergeReceiptDocuments(left, doc([make("receipt-2")]));
    expect(left.entries).toHaveLength(1);
  });
  it("detects event collisions with distinct notes", () => {
    const sentDoc = doc([{ ...make(), stage: "sent" }], [event()]);
    const altered = doc([{ ...make(), stage: "sent" }], [event("receipt-event-1", "sent", { note: "changed" })]);
    expect(previewReceiptMerge(sentDoc, altered).conflicts).toBe(1);
  });
  it("does not allow a cross-document event to invent its entry", () => {
    const external = doc([{ ...make(), stage: "sent" }], [event()]);
    const preview = previewReceiptMerge(doc([make()]), external);
    expect(preview.canMerge).toBe(false);
    expect(preview.conflicts).toBe(1);
  });
  it("rejects a stage mismatch in merged documents", () => {
    const left = doc([make()]);
    const external = doc([{ ...make("receipt-2"), stage: "sent" }], [event("receipt-event-1", "sent", { entryId: "receipt-2" })]);
    const preview = previewReceiptMerge(left, external);
    expect(preview.canMerge).toBe(true);
  });
  it("rejects unknown document properties", () => { expect(validateReceiptDocument({ ...doc(), unexpected: "x" }).ok).toBe(false); });
});
