import { describe, expect, it } from "vitest";
import {
  checkpointAnalysisExport, checkpointGaps, checkpointGuidance, checkpointHasUncertainty,
  checkpointPairs, checkpointTrends, compareCheckpointPair, disputedCheckpointCount,
  operationBreakdown, reviewedCheckpointCount,
} from "./recoveryCheckpointAnalysis";
import { emptyCheckpointDocument, type CheckpointDocument, type CheckpointEntry } from "./recoveryCheckpoint";

const source = { name: "Public source", licence: "CC0-1.0", date: "2026-11-19", tier: "UNKNOWN" as const, reference: "source-1" };
const obs = { bytes: null, digest: null, condition: "UNKNOWN" as const, note: "no measurements" };
const base = (patch: Partial<CheckpointEntry> = {}): CheckpointEntry => ({
  id: "entry-1", packId: "region-1", operation: "pack", capturedAt: "2026-11-19T12:00:00.000Z",
  source, observation: obs, phase: "draft", ...patch,
});
const doc = (...entries: CheckpointEntry[]): CheckpointDocument => ({ ...emptyCheckpointDocument(), entries });
const second = (patch: Partial<CheckpointEntry> = {}): CheckpointEntry => base({
  id: "entry-2", capturedAt: "2026-11-19T12:01:00.000Z", ...patch,
});

describe("manual checkpoint comparisons", () => {
  it("returns an explicit same difference for identical observations", () => {
    const comparison = compareCheckpointPair(base(), second());
    expect(comparison.differences).toContain("insufficient-information");
  });
  it("identifies a reported status change", () => {
    const comparison = compareCheckpointPair(base(), second({ observation: { ...obs, condition: "damaged" } }));
    expect(comparison.differences).toContain("condition-changed");
  });
  it("identifies a supplied byte-count change", () => {
    const first = base({ observation: { ...obs, bytes: 100 } });
    const next = second({ observation: { ...obs, bytes: 200 } });
    expect(compareCheckpointPair(first, next).differences).toContain("size-changed");
  });
  it("does not infer a positive status from equal bytes", () => {
    const first = base({ observation: { ...obs, bytes: 100 } });
    const next = second({ observation: { ...obs, bytes: 100 } });
    expect(compareCheckpointPair(first, next).cannotDetermineReadiness).toBe(true);
  });
  it("identifies a supplied checksum change", () => {
    const first = base({ observation: { ...obs, digest: "a".repeat(64) } });
    const next = second({ observation: { ...obs, digest: "b".repeat(64) } });
    expect(compareCheckpointPair(first, next).differences).toContain("digest-changed");
  });
  it("does not infer a positive status from matching checksums", () => {
    const first = base({ observation: { ...obs, digest: "a".repeat(64) } });
    const next = second({ observation: { ...obs, digest: "a".repeat(64) } });
    expect(compareCheckpointPair(first, next).cannotDetermineReadiness).toBe(true);
  });
  it("identifies source changes", () => {
    const next = second({ source: { ...source, name: "Other" } });
    expect(compareCheckpointPair(base(), next).differences).toContain("source-changed");
  });
  it("reports whether sources are independent", () => {
    expect(compareCheckpointPair(base(), second()).hasIndependentSource).toBe(false);
    expect(compareCheckpointPair(base(), second({ source: { ...source, reference: "source-2" } })).hasIndependentSource).toBe(true);
  });
  it("keeps UNKNOWN as UNKNOWN", () => {
    expect(compareCheckpointPair(base(), second()).concern).toBe("UNKNOWN");
  });
  it("uses reported-present rather than a readiness claim", () => {
    const next = second({ observation: { ...obs, condition: "available" } });
    expect(compareCheckpointPair(base(), next).concern).toBe("reported-present");
  });
  it("identifies a reversed timeline", () => {
    const next = second({ capturedAt: "2026-11-19T11:00:00.000Z" });
    expect(compareCheckpointPair(base(), next).differences).toContain("time-reversed");
  });
  it("preserves the original observations", () => {
    const before = base();
    const after = second();
    const comparison = compareCheckpointPair(before, after);
    expect(comparison.before).toBe(before);
    expect(comparison.after).toBe(after);
  });
  it("recognizes unchanged complete measurements as the same reported values", () => {
    const observation = { ...obs, bytes: 100, digest: "a".repeat(64) };
    const result = compareCheckpointPair(base({ observation }), second({ observation }));
    expect(result.differences).toEqual(["same"]);
    expect(result.cannotDetermineReadiness).toBe(true);
  });
  it("retains multiple differences in a single pair", () => {
    const after = second({ source: { ...source, name: "Other" }, observation: { ...obs, bytes: 50, condition: "damaged" } });
    const result = compareCheckpointPair(base(), after);
    expect(result.differences).toContain("condition-changed");
    expect(result.differences).toContain("size-changed");
    expect(result.differences).toContain("source-changed");
  });
});

describe("ordered history and pack trends", () => {
  it("has no pairs for an empty file", () => {
    expect(checkpointPairs(doc())).toEqual([]);
  });
  it("has no pairs for one record", () => {
    expect(checkpointPairs(doc(base()))).toEqual([]);
  });
  it("creates a pair for two observations of the same operation", () => {
    expect(checkpointPairs(doc(second(), base()))).toHaveLength(1);
  });
  it("sorts observations by time", () => {
    const pair = checkpointPairs(doc(second(), base()))[0];
    expect(pair?.before.id).toBe("entry-1");
    expect(pair?.after.id).toBe("entry-2");
  });
  it("never compares unrelated packs", () => {
    expect(checkpointPairs(doc(base(), second({ packId: "region-2" })))).toHaveLength(0);
  });
  it("never compares different operations", () => {
    expect(checkpointPairs(doc(base(), second({ operation: "download" })))).toHaveLength(0);
  });
  it("creates two adjacent comparisons for three observations", () => {
    const third = second({ id: "entry-3", capturedAt: "2026-11-19T12:02:00.000Z" });
    expect(checkpointPairs(doc(base(), third, second()))).toHaveLength(2);
  });
  it("aggregates one trend for a pack and operation", () => {
    expect(checkpointTrends(doc(base(), second()))).toHaveLength(1);
  });
  it("aggregates two trends for different operations", () => {
    expect(checkpointTrends(doc(base(), second({ operation: "export" })))).toHaveLength(2);
  });
  it("exposes the latest condition as a reported value", () => {
    const next = second({ observation: { ...obs, condition: "damaged" } });
    expect(checkpointTrends(doc(base(), next))[0]?.current).toBe("damaged");
  });
  it("exposes the earlier condition", () => {
    const next = second({ observation: { ...obs, condition: "damaged" } });
    expect(checkpointTrends(doc(base(), next))[0]?.prior).toBe("UNKNOWN");
  });
  it("does not invent a prior condition for a single observation", () => {
    expect(checkpointTrends(doc(base()))[0]?.prior).toBeNull();
  });
  it("reports unknown byte delta if either observation lacks bytes", () => {
    expect(checkpointTrends(doc(base(), second()))[0]?.reportedByteChange).toBeNull();
  });
  it("calculates a reported byte delta without inferring status", () => {
    const first = base({ observation: { ...obs, bytes: 400 } });
    const after = second({ observation: { ...obs, bytes: 300 } });
    expect(checkpointTrends(doc(first, after))[0]?.reportedByteChange).toBe(-100);
    expect(checkpointTrends(doc(first, after))[0]?.current).toBe("UNKNOWN");
  });
  it("counts distinct sources without treating one as authoritative", () => {
    const after = second({ source: { ...source, reference: "different" } });
    expect(checkpointTrends(doc(base(), after))[0]?.sourceCount).toBe(2);
  });
  it("counts one source when multiple observations use it", () => {
    expect(checkpointTrends(doc(base(), second()))[0]?.sourceCount).toBe(1);
  });
  it("returns no trends for invalid documents", () => {
    const invalid = { ...doc(base()), entries: [null] } as unknown as CheckpointDocument;
    expect(checkpointTrends(invalid)).toEqual([]);
  });
});

describe("evidence gaps and manual next steps", () => {
  it("marks missing bytes", () => {
    expect(checkpointGaps(doc(base()))[0]?.missingBytes).toBe(true);
  });
  it("marks missing checksum", () => {
    expect(checkpointGaps(doc(base()))[0]?.missingDigest).toBe(true);
  });
  it("marks unknown condition", () => {
    expect(checkpointGaps(doc(base()))[0]?.unknownCondition).toBe(true);
  });
  it("does not create evidence for absent observations", () => {
    expect(checkpointGaps(doc())).toEqual([]);
  });
  it("marks disputed review", () => {
    expect(checkpointGaps(doc(base({ phase: "disputed" })))[0]?.disputed).toBe(true);
  });
  it("retains a dispute even when a later note is present", () => {
    expect(checkpointGaps(doc(base({ phase: "disputed" }), second()))[0]?.disputed).toBe(true);
  });
  it("marks single-source evidence", () => {
    expect(checkpointGaps(doc(base()))[0]?.singleSource).toBe(true);
  });
  it("reports two sources distinctly", () => {
    const after = second({ source: { ...source, reference: "source-2" } });
    expect(checkpointGaps(doc(base(), after))[0]?.singleSource).toBe(false);
  });
  it("recommends manual pack inspection", () => {
    expect(checkpointGuidance(doc(base()))[0]?.actions).toContain("read-pack");
  });
  it("recommends storage review for downloads", () => {
    expect(checkpointGuidance(doc(base({ operation: "download" })))[0]?.actions).toContain("check-storage");
  });
  it("recommends connection review for downloads", () => {
    expect(checkpointGuidance(doc(base({ operation: "download" })))[0]?.actions).toContain("check-connection");
  });
  it("recommends output inspection for exports", () => {
    expect(checkpointGuidance(doc(base({ operation: "export" })))[0]?.actions).toContain("review-output");
  });
  it("recommends documenting UNKNOWN", () => {
    expect(checkpointGuidance(doc(base()))[0]?.actions).toContain("document-unknown");
  });
  it("recommends file comparison for reported damage", () => {
    const damaged = base({ observation: { ...obs, condition: "damaged" } });
    expect(checkpointGuidance(doc(damaged))[0]?.actions).toContain("compare-files");
  });
  it("does not automatically authorize a retry", () => {
    expect(checkpointGuidance(doc(base()))[0]?.contentReady).toBe(false);
  });
  it("marks manual review as necessary", () => {
    expect(checkpointGuidance(doc(base()))[0]?.needsManualReview).toBe(true);
  });
  it("returns no guidance for invalid documents", () => {
    const invalid = { ...doc(base()), format: "bad" } as unknown as CheckpointDocument;
    expect(checkpointGuidance(invalid)).toEqual([]);
  });
});

describe("summary and controlled exports", () => {
  it("counts no reviewed records before review", () => {
    expect(reviewedCheckpointCount(doc(base()))).toBe(0);
  });
  it("counts reviewed records", () => {
    expect(reviewedCheckpointCount(doc(base({ phase: "reviewed" })))).toBe(1);
  });
  it("counts disputed records", () => {
    expect(disputedCheckpointCount(doc(base({ phase: "disputed" })))).toBe(1);
  });
  it("marks uncertainty when measurements are missing", () => {
    expect(checkpointHasUncertainty(doc(base()))).toBe(true);
  });
  it("marks uncertainty for an empty document", () => {
    expect(checkpointHasUncertainty(doc())).toBe(true);
  });
  it("marks uncertainty for a disputed record", () => {
    const observation = { ...obs, bytes: 10, digest: "a".repeat(64), condition: "available" as const };
    expect(checkpointHasUncertainty(doc(base({ observation, phase: "disputed" })))).toBe(true);
  });
  it("tracks reported present as a count without claiming readiness", () => {
    const observation = { ...obs, condition: "available" as const };
    expect(operationBreakdown(doc(base({ observation }))).pack.reportedPresent).toBe(1);
  });
  it("tracks UNKNOWN separately from reported present", () => {
    expect(operationBreakdown(doc(base())).pack.unknown).toBe(1);
    expect(operationBreakdown(doc(base())).pack.reportedPresent).toBe(0);
  });
  it("preserves source attribution in the analysis export", () => {
    const output = checkpointAnalysisExport(doc(base()));
    expect(output).not.toBeNull();
    expect(output).toContain(source.name);
    expect(output).toContain(source.licence);
    expect(output).toContain(source.date);
    expect(output).toContain(source.tier);
  });
  it("keeps the UNKNOWN token in exported reports", () => {
    expect(checkpointAnalysisExport(doc(base()))).toContain("UNKNOWN");
  });
  it("exports an empty report without inventing rows", () => {
    const output = checkpointAnalysisExport(doc());
    expect(JSON.parse(output ?? "null").entries).toEqual([]);
  });
  it("rejects an invalid source report", () => {
    const invalid = { ...doc(base()), entries: [null] } as unknown as CheckpointDocument;
    expect(checkpointAnalysisExport(invalid)).toBeNull();
  });
  it("preserves the declared number of entries", () => {
    const json = checkpointAnalysisExport(doc(base(), second()));
    expect(JSON.parse(json ?? "null").entries).toHaveLength(2);
  });
  it("keeps all operations represented in the breakdown", () => {
    expect(Object.keys(operationBreakdown(doc()))).toEqual(["pack", "download", "export"]);
  });
});
