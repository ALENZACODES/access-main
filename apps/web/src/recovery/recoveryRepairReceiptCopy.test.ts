import { describe, expect, it } from "vitest";
import { ATTEMPT_COPY, emptyAttemptDocument, replaceRecoveryAttempt, type RecoveryAttempt } from "./recoveryRepairReceipt";

const observation: RecoveryAttempt = {
  id: "attempt-1", packId: "region-1", kind: "inspection", outcome: "unknown",
  at: "2026-11-19T12:00:00.000Z", note: "Local observation",
  provenance: { source: "User supplied record", licence: "CC0-1.0", date: "2026-11-19", tier: "UNKNOWN" },
};

describe("recovery attempt copy regressions", () => {
  it("includes the literal UNKNOWN in English copy", () => {
    expect(ATTEMPT_COPY.en.unknownLabel).toBe("UNKNOWN");
    expect(ATTEMPT_COPY.en.outcome).toContain("UNKNOWN");
  });
  it("includes the literal UNKNOWN in French copy", () => {
    expect(ATTEMPT_COPY.fr.unknownLabel).toBe("UNKNOWN");
    expect(ATTEMPT_COPY.fr.outcome).toContain("UNKNOWN");
  });
  it("does not permit edits to earlier attempt records", () => {
    expect(replaceRecoveryAttempt(emptyAttemptDocument(), observation)).toEqual({
      ok: false, issue: "invalid-transition",
    });
  });
});
