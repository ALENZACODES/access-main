import { describe, expect, it } from "vitest";
import {
  emptyGuidedDocument, mergeGuidedDocuments, parseGuidedDocument,
  previewGuidedMerge, serializeGuidedDocument, GUIDED_LIMITS,
  type GuidedCase, type GuidedDocument, type GuidedStep, type GuidedEvent,
} from "./recoveryGuidedReview";
const provenance = { name: "Sample", licence: "Example licence", retrievedOn: "2026-11-19", reference: "local-a", tier: "UNKNOWN" as const };
const c = (id: string, updates: Partial<GuidedCase> = {}): GuidedCase => ({
  id, packId: "pack-a", condition: "UNKNOWN", phase: "draft", title: "Local recovery issue",
  openedAt: "2026-11-20T09:00:00.000Z", source: provenance, ...updates,
});
const s = (id: string, caseId = "case-a", updates: Partial<GuidedStep> = {}): GuidedStep => ({
  id, caseId, topic: "connection", evidence: "UNKNOWN", outcome: "UNKNOWN",
  note: "Observed manually", capturedAt: "2026-11-20T09:05:00.000Z", source: provenance, ...updates,
});
const e = (id: string, caseId = "case-a", updates: Partial<GuidedEvent> = {}): GuidedEvent => ({
  id, caseId, action: "note-added", at: "2026-11-20T09:10:00.000Z", note: "Manual note", stepId: null, ...updates,
});
const doc = (cases: GuidedCase[] = [], steps: GuidedStep[] = [], events: GuidedEvent[] = []): GuidedDocument => ({ ...emptyGuidedDocument(), cases, steps, events });
const one = doc([c("case-a")], [s("step-a")], [e("event-a")]);
const two = doc([c("case-b", { packId: "pack-b" })], [s("step-b", "case-b")], [e("event-b", "case-b")]);

describe("guided review JSON export", () => {
  it("serializes an empty document", () => {
    const result = serializeGuidedDocument(emptyGuidedDocument());
    expect(result.ok).toBe(true);
  });
  it("serializes a complete local observation", () => {
    const result = serializeGuidedDocument(one);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain("pack-a");
  });
  it("round-trips the case count", () => {
    const result = serializeGuidedDocument(one);
    if (!result.ok) throw new Error("fixture export failed");
    const parsed = parseGuidedDocument(result.value);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.cases).toHaveLength(1);
  });
  it("preserves source licence after round-trip", () => {
    const result = serializeGuidedDocument(one);
    if (!result.ok) throw new Error("fixture export failed");
    const parsed = parseGuidedDocument(result.value);
    if (parsed.ok) expect(parsed.value.cases[0]?.source.licence).toBe("Example licence");
  });
  it("preserves literal UNKNOWN after round-trip", () => {
    const result = serializeGuidedDocument(one);
    if (!result.ok) throw new Error("fixture export failed");
    const parsed = parseGuidedDocument(result.value);
    if (parsed.ok) expect(parsed.value.steps[0]?.evidence).toBe("UNKNOWN");
  });
  it("rejects empty input", () => {
    expect(parseGuidedDocument("").ok).toBe(false);
  });
  it("rejects invalid JSON syntax", () => {
    expect(parseGuidedDocument("{unquoted}").ok).toBe(false);
  });
  it("rejects primitive JSON", () => {
    expect(parseGuidedDocument("null").ok).toBe(false);
  });
  it("rejects extraneous payload properties", () => {
    expect(parseGuidedDocument(JSON.stringify({ ...one, telemetry: true })).ok).toBe(false);
  });
  it("rejects an unrecognized schema", () => {
    expect(parseGuidedDocument(JSON.stringify({ ...one, schema: "other" })).ok).toBe(false);
  });
  it("rejects oversized import", () => {
    expect(parseGuidedDocument(" ".repeat(GUIDED_LIMITS.bytes + 1)).ok).toBe(false);
  });
  it("rejects missing parent case", () => {
    expect(parseGuidedDocument(JSON.stringify(doc([], [s("step-a")]))).ok).toBe(false);
  });
  it("rejects duplicate event identifiers", () => {
    expect(parseGuidedDocument(JSON.stringify(doc([c("case-a")], [], [e("event-a"), e("event-a")]))).ok).toBe(false);
  });
  it("rejects missing source metadata", () => {
    expect(parseGuidedDocument(JSON.stringify(doc([c("case-a", { source: null as unknown as GuidedCase["source"] })]))).ok).toBe(false);
  });
  it("rejects an invalid evidence tier", () => {
    expect(parseGuidedDocument(JSON.stringify(doc([c("case-a", { source: { ...provenance, tier: "approved" as GuidedCase["source"]["tier"] } })]))).ok).toBe(false);
  });
  it("does not allow anonymous pack identifiers", () => {
    expect(parseGuidedDocument(JSON.stringify(doc([c("case-a", { packId: "" })]))).ok).toBe(false);
  });
  it("keeps data imports offline", () => {
    expect(parseGuidedDocument(JSON.stringify(one)).ok).toBe(true);
  });
});

describe("guided conflict-safe merge preview", () => {
  it("accepts two independent documents", () => {
    expect(previewGuidedMerge(one, two).canMerge).toBe(true);
  });
  it("counts incoming cases", () => {
    expect(previewGuidedMerge(one, two).incomingCases).toBe(1);
  });
  it("counts incoming observations", () => {
    expect(previewGuidedMerge(one, two).incomingSteps).toBe(1);
  });
  it("counts incoming manual events", () => {
    expect(previewGuidedMerge(one, two).incomingEvents).toBe(1);
  });
  it("counts new cases", () => {
    expect(previewGuidedMerge(one, two).newCases).toBe(1);
  });
  it("counts new steps", () => {
    expect(previewGuidedMerge(one, two).newSteps).toBe(1);
  });
  it("counts new events", () => {
    expect(previewGuidedMerge(one, two).newEvents).toBe(1);
  });
  it("treats identical repeated records as no-op", () => {
    const preview = previewGuidedMerge(one, one);
    expect(preview.canMerge).toBe(true);
    expect(preview.newCases).toBe(0);
    expect(preview.newSteps).toBe(0);
    expect(preview.newEvents).toBe(0);
  });
  it("refuses conflicting case title", () => {
    const conflicting = doc([c("case-a", { title: "Different" })]);
    expect(previewGuidedMerge(one, conflicting).canMerge).toBe(false);
  });
  it("names the conflicting case identifier", () => {
    const conflicting = doc([c("case-a", { title: "Different" })]);
    expect(previewGuidedMerge(one, conflicting).conflicts).toContain("case:case-a");
  });
  it("refuses conflicting observation", () => {
    const conflicting = doc([c("case-a")], [s("step-a", "case-a", { note: "Contradiction" })]);
    expect(previewGuidedMerge(one, conflicting).canMerge).toBe(false);
  });
  it("names conflicting observation", () => {
    const conflicting = doc([c("case-a")], [s("step-a", "case-a", { note: "Contradiction" })]);
    expect(previewGuidedMerge(one, conflicting).conflicts).toContain("step:step-a");
  });
  it("refuses conflicting manual event", () => {
    const conflicting = doc([c("case-a")], [], [e("event-a", "case-a", { note: "Other" })]);
    expect(previewGuidedMerge(one, conflicting).canMerge).toBe(false);
  });
  it("rejects dangling references created by merge", () => {
    const incoming = doc([c("case-c")], [s("step-x", "case-c")]);
    const preview = previewGuidedMerge(one, incoming);
    expect(preview.canMerge).toBe(true);
  });
  it("does not accept invalid source document", () => {
    const corrupt = { ...one, schema: "wrong" } as unknown as GuidedDocument;
    expect(previewGuidedMerge(one, corrupt).canMerge).toBe(false);
  });
  it("does not accept invalid destination document", () => {
    const corrupt = { ...one, cases: [c("case-a"), c("case-a")] };
    expect(previewGuidedMerge(corrupt, two).canMerge).toBe(false);
  });
});

describe("guided append-only import", () => {
  it("merges distinct case sets", () => {
    const merged = mergeGuidedDocuments(one, two);
    expect(merged.ok).toBe(true);
    if (merged.ok) expect(merged.value.cases).toHaveLength(2);
  });
  it("merges distinct observation sets", () => {
    const merged = mergeGuidedDocuments(one, two);
    if (merged.ok) expect(merged.value.steps).toHaveLength(2);
  });
  it("merges distinct manual event sets", () => {
    const merged = mergeGuidedDocuments(one, two);
    if (merged.ok) expect(merged.value.events).toHaveLength(2);
  });
  it("does not duplicate identical input", () => {
    const merged = mergeGuidedDocuments(one, one);
    if (merged.ok) expect(merged.value.cases).toHaveLength(1);
  });
  it("refuses conflicting case without rewriting original", () => {
    const incoming = doc([c("case-a", { title: "Changed" })]);
    const original = JSON.stringify(one);
    expect(mergeGuidedDocuments(one, incoming).ok).toBe(false);
    expect(JSON.stringify(one)).toBe(original);
  });
  it("refuses a contradictory event", () => {
    const incoming = doc([c("case-a")], [], [e("event-a", "case-a", { action: "opened" })]);
    expect(mergeGuidedDocuments(one, incoming).ok).toBe(false);
  });
  it("sorts merged case IDs", () => {
    const merged = mergeGuidedDocuments(two, one);
    if (merged.ok) expect(merged.value.cases.map((r) => r.id)).toEqual(["case-a", "case-b"]);
  });
  it("preserves imported source references", () => {
    const merged = mergeGuidedDocuments(one, two);
    if (merged.ok) expect(merged.value.cases.every((r) => r.source.reference === "local-a")).toBe(true);
  });
  it("does not imply any pack is ready", () => {
    const merged = mergeGuidedDocuments(one, two);
    if (merged.ok) expect(merged.value.schema).toBe("the-app.recovery-guided-review.v1");
  });
});
