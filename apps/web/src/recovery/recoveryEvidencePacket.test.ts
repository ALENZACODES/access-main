import { describe, expect, it } from "vitest";
import {
  PACKET_CONDITIONS, PACKET_OPERATIONS, PACKET_TIERS, PACKET_LIMITS,
  appendPacketEntry, appendPacketEvent, checkPacketDocument, checkPacketEntry,
  checkPacketEvent, checkPacketObservation, checkPacketSource, emptyPacket,
  exportPacket, filterPacketEntries, importPacket, mergePackets,
  nextPacketEntryId, nextPacketEventId, packetContentReady,
  packetDifference, packetEventsFor, packetFindings, packetPreviewMerge,
  packetSummary, transitionPacketEntry, type PacketDocument,
  type PacketEntry, type PacketEvent,
} from "./recoveryEvidencePacket";

const at = "2026-11-19T15:00:00.000Z";
const source = {
  name: "Local test inventory",
  licence: "Sample licence",
  retrievedOn: "2026-11-19",
  tier: "UNKNOWN" as const,
  reference: "unit-test",
};
const entry = (id = "packet-1", overrides: Partial<PacketEntry> = {}): PacketEntry => ({
  id,
  packId: "pack-a",
  operation: "pack",
  stage: "draft",
  recordedAt: at,
  source,
  observation: { condition: "UNKNOWN", note: "Local observation", bytes: null, digest: null },
  ...overrides,
});
const event = (id = "event-1", overrides: Partial<PacketEvent> = {}): PacketEvent => ({
  id,
  entryId: "packet-1",
  action: "noted",
  at,
  note: "Manual note",
  ...overrides,
});
const document = (...entries: PacketEntry[]): PacketDocument => ({ ...emptyPacket(), entries });
const changed = <T>(value: { ok: true; value: T } | { ok: false; issue: string }): T => {
  if (!value.ok) throw Error(`Unexpected ${value.issue}`);
  return value.value;
};

describe("manual evidence packet model", () => {
  it("starts empty", () => {
    expect(emptyPacket().entries).toEqual([]);
    expect(emptyPacket().events).toEqual([]);
  });
  it("has a stable schema identifier", () => {
    expect(emptyPacket().schema).toBe("the-app.recovery-evidence-packet.v1");
  });
  it("uses literal UNKNOWN for missing observations", () => {
    expect(PACKET_CONDITIONS).toContain("UNKNOWN");
  });
  it("uses literal UNKNOWN for evidence tier", () => {
    expect(PACKET_TIERS).toContain("UNKNOWN");
  });
  it("supports explicit operation categories", () => {
    expect(PACKET_OPERATIONS).toEqual(["pack", "download", "export", "handoff"]);
  });
  it("never infers pack readiness", () => {
    expect(packetContentReady(document(entry()))).toBe(false);
  });
  it("accepts a complete source", () => {
    expect(checkPacketSource(source).ok).toBe(true);
  });
  it("rejects a source without a date", () => {
    expect(checkPacketSource({ ...source, retrievedOn: "" })).toEqual({ ok: false, issue: "date" });
  });
  it("rejects malformed calendar dates", () => {
    expect(checkPacketSource({ ...source, retrievedOn: "2026-02-31" })).toEqual({ ok: false, issue: "date" });
  });
  it("rejects an invalid evidence tier", () => {
    expect(checkPacketSource({ ...source, tier: "confirmed" })).toEqual({ ok: false, issue: "source" });
  });
  it("accepts empty source identity without making a claim", () => {
    expect(checkPacketSource({ ...source, name: "", licence: "" }).ok).toBe(true);
  });
  it("rejects a source name with control characters", () => {
    expect(checkPacketSource({ ...source, name: "test\u0001value" }).ok).toBe(false);
  });
  it("rejects a source with oversized reference", () => {
    expect(checkPacketSource({ ...source, reference: "x".repeat(PACKET_LIMITS.sources + 1) }).ok).toBe(false);
  });
  it("accepts an observation with zero bytes", () => {
    expect(checkPacketObservation({ condition: "UNKNOWN", note: "", bytes: 0, digest: null }).ok).toBe(true);
  });
  it("rejects a negative byte count", () => {
    expect(checkPacketObservation({ condition: "UNKNOWN", note: "", bytes: -1, digest: null }).ok).toBe(false);
  });
  it("rejects fractional byte count", () => {
    expect(checkPacketObservation({ condition: "UNKNOWN", note: "", bytes: 1.5, digest: null }).ok).toBe(false);
  });
  it("rejects impossible numeric bytes", () => {
    expect(checkPacketObservation({ condition: "UNKNOWN", note: "", bytes: Number.MAX_VALUE, digest: null }).ok).toBe(false);
  });
  it("rejects empty digest strings", () => {
    expect(checkPacketObservation({ condition: "UNKNOWN", note: "", bytes: null, digest: "" }).ok).toBe(false);
  });
  it("accepts digest null to represent unknown", () => {
    expect(checkPacketObservation({ condition: "UNKNOWN", note: "", bytes: null, digest: null }).ok).toBe(true);
  });
  it("rejects unsupported condition labels", () => {
    expect(checkPacketObservation({ condition: "ready", note: "", bytes: null, digest: null }).ok).toBe(false);
  });
  it("rejects long notes", () => {
    expect(checkPacketObservation({ condition: "UNKNOWN", note: "x".repeat(801), bytes: null, digest: null })).toEqual({ ok: false, issue: "text" });
  });
  it("accepts a valid entry", () => {
    expect(checkPacketEntry(entry()).ok).toBe(true);
  });
  it("rejects spaces in identifiers", () => {
    expect(checkPacketEntry(entry("invalid id")).ok).toBe(false);
  });
  it("rejects blank pack identifiers", () => {
    expect(checkPacketEntry(entry("packet-1", { packId: "" })).ok).toBe(false);
  });
  it("rejects local timestamps without timezone", () => {
    expect(checkPacketEntry(entry("packet-1", { recordedAt: "2026-11-19T15:00:00" })).ok).toBe(false);
  });
  it("rejects impossible timestamps", () => {
    expect(checkPacketEntry(entry("packet-1", { recordedAt: "not-a-date" })).ok).toBe(false);
  });
  it("accepts an explicit reviewed stage", () => {
    expect(checkPacketEntry(entry("packet-1", { stage: "review" })).ok).toBe(true);
  });
  it("accepts a valid event", () => {
    expect(checkPacketEvent(event()).ok).toBe(true);
  });
  it("rejects an event with invalid action", () => {
    expect(checkPacketEvent({ ...event(), action: "automatic" }).ok).toBe(false);
  });
  it("rejects an event with oversized text", () => {
    expect(checkPacketEvent({ ...event(), note: "z".repeat(801) }).ok).toBe(false);
  });
  it("rejects a referenced entry that is not present", () => {
    expect(checkPacketDocument({ ...document(entry()), events: [event("event-1", { entryId: "missing" })] })).toEqual({ ok: false, issue: "reference" });
  });
  it("rejects duplicate entry identities", () => {
    expect(checkPacketDocument(document(entry(), entry()))).toEqual({ ok: false, issue: "duplicate" });
  });
  it("rejects duplicate event identities", () => {
    expect(checkPacketDocument({ ...document(entry()), events: [event(), event()] })).toEqual({ ok: false, issue: "duplicate" });
  });
  it("rejects unknown schema", () => {
    expect(checkPacketDocument({ ...emptyPacket(), schema: "new-schema" })).toEqual({ ok: false, issue: "format" });
  });
  it("rejects non-arrays", () => {
    expect(checkPacketDocument({ ...emptyPacket(), entries: {} })).toEqual({ ok: false, issue: "format" });
  });
  it("rejects more than maximum entries", () => {
    const entries = Array.from({ length: PACKET_LIMITS.entries + 1 }, (_, i) => entry(`packet-${i + 1}`));
    expect(checkPacketDocument(document(...entries))).toEqual({ ok: false, issue: "limit" });
  });
  it("accepts a valid empty document", () => {
    expect(checkPacketDocument(emptyPacket()).ok).toBe(true);
  });
  it("creates an entry", () => {
    const result = appendPacketEntry(emptyPacket(), entry());
    expect(changed(result).entries).toHaveLength(1);
  });
  it("does not permit direct closed entry insertion", () => {
    expect(appendPacketEntry(emptyPacket(), entry("packet-1", { stage: "closed" }))).toEqual({ ok: false, issue: "transition" });
  });
  it("does not insert a duplicate entry", () => {
    expect(appendPacketEntry(document(entry()), entry())).toEqual({ ok: false, issue: "duplicate" });
  });
  it("creates monotonically available identifiers", () => {
    expect(nextPacketEntryId(document(entry(), entry("packet-2")))).toBe("packet-3");
  });
  it("skips an occupied candidate id", () => {
    expect(nextPacketEntryId(document(entry("packet-2")))).toBe("packet-3");
  });
  it("creates available event identifiers", () => {
    expect(nextPacketEventId({ ...document(entry()), events: [event()] })).toBe("event-2");
  });
  it("inserts referenced events", () => {
    expect(changed(appendPacketEvent(document(entry()), event())).events).toHaveLength(1);
  });
  it("rejects an event pointing outside its packet", () => {
    expect(appendPacketEvent(document(entry()), event("event-1", { entryId: "missing" }))).toEqual({ ok: false, issue: "reference" });
  });
  it("rejects a duplicate event", () => {
    const doc = { ...document(entry()), events: [event()] };
    expect(appendPacketEvent(doc, event())).toEqual({ ok: false, issue: "duplicate" });
  });
  it("orders events by timestamp then identity", () => {
    const first = event("event-2", { at: "2026-11-19T16:00:00.000Z" });
    const second = event("event-1", { at: "2026-11-19T15:30:00.000Z" });
    const doc = { ...document(entry()), events: [first, second] };
    expect(packetEventsFor(doc, "packet-1").map((item) => item.id)).toEqual(["event-1", "event-2"]);
  });
  it("allows draft to review", () => {
    expect(changed(transitionPacketEntry(document(entry()), "packet-1", "review")).entries[0]?.stage).toBe("review");
  });
  it("disallows draft directly to closed", () => {
    expect(transitionPacketEntry(document(entry()), "packet-1", "closed")).toEqual({ ok: false, issue: "transition" });
  });
  it("allows review to closed", () => {
    const doc = document(entry("packet-1", { stage: "review" }));
    expect(changed(transitionPacketEntry(doc, "packet-1", "closed")).entries[0]?.stage).toBe("closed");
  });
  it("allows closed to review", () => {
    const doc = document(entry("packet-1", { stage: "closed" }));
    expect(changed(transitionPacketEntry(doc, "packet-1", "review")).entries[0]?.stage).toBe("review");
  });
  it("rejects a transition for a missing entry", () => {
    expect(transitionPacketEntry(emptyPacket(), "missing", "review")).toEqual({ ok: false, issue: "reference" });
  });
  it("keeps a transition immutable", () => {
    const old = document(entry());
    const next = changed(transitionPacketEntry(old, "packet-1", "review"));
    expect(old.entries[0]?.stage).toBe("draft");
    expect(next.entries[0]?.stage).toBe("review");
  });
  it("summarizes drafts and UNKNOWN conditions", () => {
    const total = packetSummary(document(entry(), entry("packet-2", { stage: "closed", observation: { condition: "incomplete", note: "", bytes: null, digest: null } })));
    expect(total).toMatchObject({ total: 2, drafts: 1, closed: 1, unknown: 1, distinctPacks: 1 });
  });
  it("summarizes distinct packs", () => {
    expect(packetSummary(document(entry(), entry("packet-2", { packId: "pack-b" }))).toMatchObject({ distinctPacks: 2 });
  });
  it("filters entries by operation", () => {
    const doc = document(entry(), entry("packet-2", { operation: "download" }));
    expect(filterPacketEntries(doc, { operation: "download" }).map((item) => item.id)).toEqual(["packet-2"]);
  });
  it("filters entries by tier", () => {
    const doc = document(entry(), entry("packet-2", { source: { ...source, tier: "documented" } }));
    expect(filterPacketEntries(doc, { tier: "documented" }).map((item) => item.id)).toEqual(["packet-2"]);
  });
  it("filters entries by stage", () => {
    const doc = document(entry(), entry("packet-2", { stage: "closed" }));
    expect(filterPacketEntries(doc, { stage: "closed" })).toHaveLength(1);
  });
  it("filters entries by condition", () => {
    const doc = document(entry(), entry("packet-2", { observation: { condition: "interrupted", note: "", bytes: null, digest: null } }));
    expect(filterPacketEntries(doc, { condition: "UNKNOWN" })).toHaveLength(1);
  });
  it("filters text without case sensitivity", () => {
    expect(filterPacketEntries(document(entry()), { text: "LOCAL TEST" })).toHaveLength(1);
  });
  it("does not invent a matching value", () => {
    expect(filterPacketEntries(document(entry()), { text: "not-found" })).toHaveLength(0);
  });
  it("roundtrips JSON", () => {
    const original = document(entry());
    const json = changed(exportPacket(original));
    expect(changed(importPacket(json))).toEqual(original);
  });
  it("rejects malformed JSON", () => {
    expect(importPacket("{")).toEqual({ ok: false, issue: "format" });
  });
  it("rejects non-packet JSON", () => {
    expect(importPacket("[]")).toEqual({ ok: false, issue: "format" });
  });
  it("rejects files over the import byte limit", () => {
    expect(importPacket("x".repeat(PACKET_LIMITS.bytes + 1))).toEqual({ ok: false, issue: "limit" });
  });
  it("counts identical records as duplicate, not conflict", () => {
    const doc = document(entry());
    expect(packetPreviewMerge(doc, doc)).toMatchObject({ duplicates: 1, conflicts: 0 });
  });
  it("detects conflicts by identifier", () => {
    const a = document(entry());
    const b = document(entry("packet-1", { packId: "pack-b" }));
    expect(packetPreviewMerge(a, b).conflicts).toBe(1);
  });
  it("merges distinct entries", () => {
    const a = document(entry());
    const b = document(entry("packet-2"));
    expect(changed(mergePackets(a, b)).entries).toHaveLength(2);
  });
  it("does not duplicate identical entries", () => {
    const a = document(entry());
    expect(changed(mergePackets(a, a)).entries).toHaveLength(1);
  });
  it("rejects conflicting entries", () => {
    const a = document(entry());
    const b = document(entry("packet-1", { packId: "pack-b" }));
    expect(mergePackets(a, b)).toEqual({ ok: false, issue: "conflict" });
  });
  it("rejects conflicting event identities", () => {
    const a = { ...document(entry()), events: [event()] };
    const b = { ...document(entry()), events: [event("event-1", { note: "Different" })] };
    expect(mergePackets(a, b)).toEqual({ ok: false, issue: "conflict" });
  });
  it("summarizes a document difference", () => {
    const a = document(entry(), entry("packet-2"));
    const b = document(entry(), entry("packet-3"));
    expect(packetDifference(a, b)).toEqual({ onlyLeft: ["packet-2"], onlyRight: ["packet-3"], changed: [], shared: ["packet-1"] });
  });
  it("identifies missing source details for manual review", () => {
    const doc = document(entry("packet-1", { source: { ...source, name: "", licence: "" } }));
    expect(packetFindings(doc, "2026-11-19").some((finding) => finding.code === "missing-source")).toBe(true);
  });
  it("leaves unknown conditions explicitly unknown", () => {
    expect(packetFindings(document(entry()), "2026-11-19").some((finding) => finding.code === "unknown-condition")).toBe(true);
  });
  it("marks old evidence for manual review", () => {
    const doc = document(entry("packet-1", { source: { ...source, retrievedOn: "2020-01-01" } }));
    expect(packetFindings(doc, "2026-11-19").some((finding) => finding.code === "stale")).toBe(true);
  });
  it("does not mark new evidence as stale", () => {
    expect(packetFindings(document(entry()), "2026-11-19").some((finding) => finding.code === "stale")).toBe(false);
  });
  it("flags events recorded earlier than the entry", () => {
    const doc = { ...document(entry()), events: [event("event-1", { at: "2026-11-18T10:00:00.000Z" })] };
    expect(packetFindings(doc, "2026-11-19").some((finding) => finding.code === "out-of-order")).toBe(true);
  });
  it("flags conflicting observations without resolving them", () => {
    const doc = document(entry(), entry("packet-2", { observation: { condition: "interrupted", note: "", bytes: null, digest: null } }));
    expect(packetFindings(doc, "2026-11-19").filter((finding) => finding.code === "conflicting-observation")).toHaveLength(2);
  });
  it("does not claim any recorded packet is usable", () => {
    const d = document(entry("packet-1", { stage: "closed", source: { ...source, tier: "reviewed" } }));
    expect(packetContentReady(d)).toBe(false);
  });
});
