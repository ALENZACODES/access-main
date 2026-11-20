import { describe, expect, it } from "vitest";
import {
  compareEvidencePack, evidenceActivity, evidenceDateRange,
  evidenceNarrative, evidenceReport, evidenceTrends,
  groupEvidenceFindings, groupEvidenceOperations, groupEvidencePacks,
  groupEvidenceSources, investigateEvidence,
} from "./recoveryEvidenceAnalysis";
import { emptyPacket, type PacketDocument, type PacketEntry, type PacketEvent } from "./recoveryEvidencePacket";

const source = { name: "Example source", licence: "Example licence", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const, reference: "local-a" };
const observation = { condition: "UNKNOWN" as const, note: "Local test evidence", bytes: null, digest: null };
const make = (id: string, values: Partial<PacketEntry> = {}): PacketEntry => ({
  id, packId: "pack-a", operation: "pack", stage: "draft",
  recordedAt: "2026-11-19T09:00:00.000Z", source, observation,
  ...values,
});
const makeEvent = (id: string, entryId: string, at = "2026-11-19T10:00:00.000Z"): PacketEvent => ({
  id, entryId, at, action: "noted", note: "Manual event",
});
const doc = (entries: PacketEntry[], events: PacketEvent[] = []): PacketDocument => ({
  ...emptyPacket(), entries, events,
});
const sample = doc([
  make("packet-1"),
  make("packet-2", { packId: "pack-b", operation: "download", stage: "review", source: { ...source, tier: "documented" } }),
  make("packet-3", { operation: "export", stage: "closed", observation: { ...observation, condition: "interrupted" } }),
], [makeEvent("event-1", "packet-1")]);

describe("manual recovery evidence analysis", () => {
  it("returns no groups for no entries", () => {
    expect(groupEvidencePacks(emptyPacket())).toEqual([]);
  });
  it("sorts pack groups by identifier", () => {
    expect(groupEvidencePacks(sample).map((group) => group.packId)).toEqual(["pack-a", "pack-b"]);
  });
  it("tracks entry counts per pack", () => {
    expect(groupEvidencePacks(sample)[0]?.entries).toBe(2);
  });
  it("tracks outstanding reviews", () => {
    expect(groupEvidencePacks(sample)[0]?.unresolved).toBe(1);
  });
  it("reports different conditions without resolving them", () => {
    expect(groupEvidencePacks(sample)[0]?.conditions).toEqual(["UNKNOWN", "interrupted"]);
  });
  it("never claims a content ready state", () => {
    for (const group of groupEvidencePacks(sample)) expect(group.contentReady).toBe(false);
  });
  it("does not mark different operations as conflicts", () => {
    expect(groupEvidencePacks(sample)[0]?.hasConflict).toBe(false);
  });
  it("detects different conditions for the same operation", () => {
    const conflict = doc([make("packet-1"), make("packet-2", { observation: { ...observation, condition: "interrupted" } })]);
    expect(groupEvidencePacks(conflict)[0]?.hasConflict).toBe(true);
  });
  it("tracks source tiers without upgrading them", () => {
    expect(groupEvidencePacks(sample)[1]?.tiers).toEqual(["documented"]);
  });
  it("tracks distinct pack operations", () => {
    expect(groupEvidencePacks(sample)[0]?.operations).toEqual(["export", "pack"]);
  });
  it("has empty date ranges with no observations", () => {
    expect(evidenceDateRange(emptyPacket())).toEqual({ earliest: null, latest: null, retrievalEarliest: null, retrievalLatest: null });
  });
  it("includes the earliest entry date", () => {
    expect(evidenceDateRange(sample).earliest).toBe("2026-11-19T09:00:00.000Z");
  });
  it("includes the latest event date", () => {
    expect(evidenceDateRange(sample).latest).toBe("2026-11-19T10:00:00.000Z");
  });
  it("includes source retrieval bounds", () => {
    expect(evidenceDateRange(sample).retrievalEarliest).toBe("2026-11-19");
  });
  it("creates one daily trend per day", () => {
    expect(evidenceTrends(sample)).toHaveLength(1);
  });
  it("counts observations in trend", () => {
    expect(evidenceTrends(sample)[0]?.added).toBe(3);
  });
  it("counts manual events in trend", () => {
    expect(evidenceTrends(sample)[0]?.events).toBe(1);
  });
  it("keeps daily trends in chronological order", () => {
    const multi = doc([make("packet-1"), make("packet-2", { recordedAt: "2026-11-17T09:00:00.000Z" })]);
    expect(evidenceTrends(multi).map((item) => item.date)).toEqual(["2026-11-17", "2026-11-19"]);
  });
  it("group findings by code", () => {
    const result = groupEvidenceFindings([{ entryId: "p-1", code: "unknown-tier", detail: "" }, { entryId: "p-2", code: "unknown-tier", detail: "" }]);
    expect(result).toEqual([{ code: "unknown-tier", count: 2, entryIds: ["p-1", "p-2"] }]);
  });
  it("preserves all operation categories", () => {
    expect(groupEvidenceOperations(emptyPacket()).map((item) => item.operation)).toEqual(["pack", "download", "export", "handoff"]);
  });
  it("counts operation entries", () => {
    expect(groupEvidenceOperations(sample).find((item) => item.operation === "pack")?.entries).toBe(1);
  });
  it("counts open operation entries", () => {
    expect(groupEvidenceOperations(sample).find((item) => item.operation === "download")?.open).toBe(1);
  });
  it("does not treat closed entries as open", () => {
    expect(groupEvidenceOperations(sample).find((item) => item.operation === "export")?.open).toBe(0);
  });
  it("groups entries sharing exactly the same source", () => {
    expect(groupEvidenceSources(sample)).toHaveLength(2);
  });
  it("counts entries sharing a source", () => {
    expect(groupEvidenceSources(sample).some((item) => item.count === 2)).toBe(true);
  });
  it("preserves explicit source licence", () => {
    expect(groupEvidenceSources(sample).every((item) => item.source.licence === "Example licence")).toBe(true);
  });
  it("includes no activity for missing entries", () => {
    expect(evidenceActivity(sample, "missing")).toEqual([]);
  });
  it("includes the entry creation event", () => {
    expect(evidenceActivity(sample, "packet-1")[0]).toContain("created");
  });
  it("includes activity events when present", () => {
    expect(evidenceActivity(sample, "packet-1")).toHaveLength(2);
  });
  it("does not invent unrelated events", () => {
    expect(evidenceActivity(sample, "packet-2")).toHaveLength(1);
  });
  it("identifies unknown tier for investigation", () => {
    expect(investigateEvidence(sample, "2026-11-19").some((item) => item.priority === "medium")).toBe(true);
  });
  it("keeps investigation identifiers stable", () => {
    expect(investigateEvidence(sample, "2026-11-19").map((item) => item.id)).toContain("investigate:pack-a");
  });
  it("never claims that an investigation makes content ready", () => {
    expect(investigateEvidence(sample, "2026-11-19").every((item) => item.contentReady === false)).toBe(true);
  });
  it("prioritizes contradictory evidence", () => {
    const conflicting = doc([make("packet-1"), make("packet-2", { observation: { ...observation, condition: "interrupted" } })]);
    expect(investigateEvidence(conflicting, "2026-11-19")[0]?.priority).toBe("high");
  });
  it("reports unknown conditions", () => {
    expect(evidenceReport(sample, "2026-11-19").unknown).toBe(2);
  });
  it("reports unfinished reviews", () => {
    expect(evidenceReport(sample, "2026-11-19").unfinished).toBe(2);
  });
  it("includes manual review findings", () => {
    expect(evidenceReport(sample, "2026-11-19").findings.length).toBeGreaterThan(0);
  });
  it("includes every observed pack", () => {
    expect(evidenceReport(sample, "2026-11-19").packs).toHaveLength(2);
  });
  it("does not report a content ready state", () => {
    expect(evidenceReport(sample, "2026-11-19").contentReady).toBe(false);
  });
  it("compares pack-specific added identifiers", () => {
    const a = doc([make("packet-1")]);
    const b = doc([make("packet-1"), make("packet-2")]);
    expect(compareEvidencePack(a, b, "pack-a").addedIds).toEqual(["packet-2"]);
  });
  it("compares pack-specific removed identifiers", () => {
    const a = doc([make("packet-1")]);
    const b = emptyPacket();
    expect(compareEvidencePack(a, b, "pack-a").removedIds).toEqual(["packet-1"]);
  });
  it("compares changed observations", () => {
    const a = doc([make("packet-1")]);
    const b = doc([make("packet-1", { observation: { ...observation, note: "Changed" } })]);
    expect(compareEvidencePack(a, b, "pack-a").changedIds).toEqual(["packet-1"]);
  });
  it("ignores unrelated pack changes", () => {
    const a = doc([make("packet-1")]);
    const b = doc([make("packet-1"), make("packet-2", { packId: "pack-b" })]);
    expect(compareEvidencePack(a, b, "pack-a").addedIds).toEqual([]);
  });
  it("includes date in English narrative", () => {
    expect(evidenceNarrative(sample, "2026-11-19", "en")).toContain("2026-11-19");
  });
  it("includes UNKNOWN in both narratives", () => {
    expect(evidenceNarrative(sample, "2026-11-19", "en")).toContain("UNKNOWN");
    expect(evidenceNarrative(sample, "2026-11-19", "fr")).toContain("UNKNOWN");
  });
  it("includes a non-use disclaimer in both languages", () => {
    expect(evidenceNarrative(sample, "2026-11-19", "en")).toContain("never confirms");
    expect(evidenceNarrative(sample, "2026-11-19", "fr")).toContain("ne confirme jamais");
  });
  it("uses a French no-break colon", () => {
    expect(evidenceNarrative(sample, "2026-11-19", "fr")).toContain("\u00a0:");
  });
});
