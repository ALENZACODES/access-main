import { describe, expect, it } from "vitest";
import {
  addRecoveryAttempt, emptyAttemptDocument, exportRecoveryAttempts,
  isAttemptProvenance, mergeRecoveryAttempts, parseRecoveryAttempts,
  previewAttemptMerge, replaceRecoveryAttempt, summarizeRecoveryAttempts,
  validateAttempt, validateAttemptDocument,
  type RecoveryAttempt,
} from "./recoveryRepairReceipt";

const entry: RecoveryAttempt = {
  id: "attempt-1", packId: "region-1", kind: "inspection", outcome: "unknown",
  at: "2026-11-19T12:00:00.000Z", note: "Local observation",
  provenance: { source: "Open sample", licence: "CC-BY-4.0", date: "2026-11-18", tier: "UNKNOWN" },
};
const filled = () => ({ ...emptyAttemptDocument(), entries: [entry] });

describe("local repair attempt ledger", () => {
  it("starts empty", () => expect(summarizeRecoveryAttempts(emptyAttemptDocument()).total).toBe(0));
  it("accepts complete provenance", () => expect(isAttemptProvenance(entry.provenance)).toBe(true));
  it("rejects absent source", () => expect(isAttemptProvenance({ ...entry.provenance, source: "" })).toBe(false));
  it("rejects closed licence", () => expect(isAttemptProvenance({ ...entry.provenance, licence: "restricted" })).toBe(false));
  it("rejects impossible date", () => expect(isAttemptProvenance({ ...entry.provenance, date: "2026-02-31" })).toBe(false));
  it("requires an evidence tier", () => expect(isAttemptProvenance({ ...entry.provenance, tier: "" })).toBe(false));
  it("accepts UNKNOWN tier without inference", () => expect(validateAttempt(entry)).toBeNull());
  it("rejects malicious identifiers", () => expect(validateAttempt({ ...entry, id: "../a" })).toBe("invalid-id"));
  it("rejects unsupported outcome", () => expect(validateAttempt({ ...entry, outcome: "ready" })).toBe("invalid-attempt"));
  it("rejects unsupported operation", () => expect(validateAttempt({ ...entry, kind: "delete" })).toBe("invalid-attempt"));
  it("rejects markup in notes", () => expect(validateAttempt({ ...entry, note: "<script>" })).toBe("unsafe-text"));
  it("rejects newlines in notes", () => expect(validateAttempt({ ...entry, note: "one\ntwo" })).toBe("unsafe-text"));
  it("rejects malformed timestamps", () => expect(validateAttempt({ ...entry, at: "tomorrow" })).toBe("invalid-date"));
  it("rejects extra attempt keys", () => expect(validateAttempt({ ...entry, secret: "x" })).toBe("invalid-attempt"));
  it("preserves UNKNOWN after adding", () => {
    const result = addRecoveryAttempt(emptyAttemptDocument(), entry);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries[0]?.outcome).toBe("unknown");
  });
  it("does not silently change earlier events", () => expect(replaceRecoveryAttempt(filled(), entry).ok).toBe(false));
  it("rejects duplicate IDs", () => expect(addRecoveryAttempt(filled(), entry).ok).toBe(false));
  it("rejects duplicate IDs from imported JSON", () => {
    const result = validateAttemptDocument({ ...filled(), entries: [entry, entry] });
    expect(result.ok).toBe(false);
  });
  it("accepts empty input structure", () => expect(validateAttemptDocument(emptyAttemptDocument()).ok).toBe(true));
  it("rejects wrong version", () => expect(validateAttemptDocument({ ...filled(), version: 2 }).ok).toBe(false));
  it("rejects extra document keys", () => expect(validateAttemptDocument({ ...filled(), other: 1 }).ok).toBe(false));
  it("rejects excessive number of records", () => expect(validateAttemptDocument({ ...filled(), entries: Array(201).fill(entry) }).ok).toBe(false));
  it("rejects unparseable JSON", () => expect(parseRecoveryAttempts("{").ok).toBe(false));
  it("rejects excessively large input", () => expect(parseRecoveryAttempts(" ".repeat(300000)).ok).toBe(false));
  it("roundtrips the ledger", () => {
    const result = exportRecoveryAttempts(filled());
    expect(result.ok).toBe(true);
    if (result.ok) expect(parseRecoveryAttempts(result.value)).toEqual({ ok: true, value: filled() });
  });
  it("shows duplicate IDs as unchanged when content matches", () => {
    const result = previewAttemptMerge(filled(), filled());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.unchanged).toEqual(["attempt-1"]);
  });
  it("rejects conflicting histories", () => {
    const incoming = { ...filled(), entries: [{ ...entry, note: "different" }] };
    expect(mergeRecoveryAttempts(filled(), incoming).ok).toBe(false);
  });
  it("adds only new records", () => {
    const incoming = { ...filled(), entries: [{ ...entry, id: "attempt-2" }] };
    const result = mergeRecoveryAttempts(filled(), incoming);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries).toHaveLength(2);
  });
  it("never converts reported completion into pack readiness", () => {
    const complete = { ...filled(), entries: [{ ...entry, outcome: "reported-complete" }] };
    const result = validateAttemptDocument(complete);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries[0]?.outcome).toBe("reported-complete");
  });
});
