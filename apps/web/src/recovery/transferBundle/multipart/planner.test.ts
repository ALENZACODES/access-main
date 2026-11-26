import { describe, expect, it } from "vitest";
import { BUNDLE_LIMITS, type BundleMember } from "../model";
import { candidatesFromMembers, describePlan, planMatchesMembers, planTransferParts, type TransferCandidate } from "./planner";
import { SET_LIMITS } from "./model";

const candidate = (index: number, byteLength = 100): TransferCandidate => ({
  digest: index.toString(16).padStart(64, "0"),
  byteLength,
  kind: "packet",
  recordCount: index,
});

describe("deterministic multi-part planning", () => {
  it("rejects an empty candidate list", () => {
    expect(planTransferParts([])).toEqual({ ok: false, issue: "empty" });
  });

  it("rejects a selection that fits in one ordinary bundle", () => {
    expect(planTransferParts([candidate(1), candidate(2)])).toEqual({ ok: false, issue: "part-count" });
  });

  it("preserves candidate order while splitting at the ordinary member count", () => {
    const result = planTransferParts(Array.from({ length: 13 }, (_, index) => candidate(index + 1)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parts.map(part => part.memberCount)).toEqual([12, 1]);
    expect(result.value.parts[0]?.memberDigests[0]).toBe(candidate(1).digest);
    expect(result.value.parts[1]?.memberDigests[0]).toBe(candidate(13).digest);
  });

  it("starts a new part before crossing the ordinary aggregate byte limit", () => {
    const result = planTransferParts([candidate(1, BUNDLE_LIMITS.totalBytes - 20), candidate(2, 30)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.parts.map(part => part.byteLength)).toEqual([BUNDLE_LIMITS.totalBytes - 20, 30]);
  });

  it("accepts exactly the supported part count", () => {
    const result = planTransferParts(Array.from({ length: SET_LIMITS.parts * 12 }, (_, index) => candidate(index + 1)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.partCount).toBe(SET_LIMITS.parts);
  });

  it("rejects a selection requiring more than the supported part count", () => {
    const result = planTransferParts(Array.from({ length: SET_LIMITS.members + 1 }, (_, index) => candidate(index + 1)));
    expect(result).toEqual({ ok: false, issue: "member-count" });
  });

  it("rejects duplicate fingerprints", () => {
    expect(planTransferParts([candidate(1), candidate(1)])).toEqual({ ok: false, issue: "duplicate-digest", slot: 2 });
  });

  it("rejects invalid fingerprints", () => {
    expect(planTransferParts([{ ...candidate(1), digest: "bad" }, candidate(2)])).toEqual({
      ok: false, issue: "invalid-candidate", slot: 1,
    });
  });

  it("rejects a kind that is not a supported recovery export", () => {
    expect(planTransferParts([{ ...candidate(1), kind: "unknown-format" }, candidate(2)])).toEqual({
      ok: false, issue: "invalid-candidate", slot: 1,
    });
  });

  it("rejects zero, negative and fractional sizes", () => {
    for (const byteLength of [0, -1, 1.5, Number.NaN]) {
      expect(planTransferParts([candidate(1, byteLength), candidate(2)])).toMatchObject({ ok: false, issue: "invalid-candidate", slot: 1 });
    }
  });

  it("rejects a candidate larger than one ordinary bundle can contain", () => {
    expect(planTransferParts([candidate(1, BUNDLE_LIMITS.totalBytes + 1), candidate(2)])).toEqual({
      ok: false, issue: "member-size", slot: 1,
    });
  });

  it("rejects negative or implausibly large record counts", () => {
    expect(planTransferParts([{ ...candidate(1), recordCount: -1 }, candidate(2)])).toMatchObject({ ok: false, issue: "invalid-candidate" });
    expect(planTransferParts([{ ...candidate(1), recordCount: 1_000_001 }, candidate(2)])).toMatchObject({ ok: false, issue: "record-count" });
  });

  it("rejects aggregate original bytes beyond the transfer-set cap", () => {
    const count = 17;
    const each = Math.floor(SET_LIMITS.rawBytes / count) + 1;
    const result = planTransferParts(Array.from({ length: count }, (_, index) => candidate(index + 1, each)));
    expect(result).toMatchObject({ ok: false, issue: "total-size" });
  });

  it("emits stable compact descriptions", () => {
    const result = planTransferParts(Array.from({ length: 13 }, (_, index) => candidate(index + 1)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(describePlan(result.value)).toEqual(["1/2:12:1200", "2/2:1:100"]);
  });

  it("matches a plan against the same inspected members", () => {
    const fake: BundleMember[] = Array.from({ length: 13 }, (_, index) => ({
      ...candidate(index + 1), kind: "packet", file: new Blob([String(index)]),
    }));
    const result = planTransferParts(candidatesFromMembers(fake));
    expect(result.ok).toBe(true);
    if (result.ok) expect(planMatchesMembers(result.value, fake)).toBe(true);
  });

  it("detects a changed member order", () => {
    const fake: BundleMember[] = Array.from({ length: 13 }, (_, index) => ({
      ...candidate(index + 1), kind: "packet", file: new Blob([String(index)]),
    }));
    const result = planTransferParts(candidatesFromMembers(fake));
    expect(result.ok).toBe(true);
    if (result.ok) expect(planMatchesMembers(result.value, [fake[1]!, fake[0]!, ...fake.slice(2)])).toBe(false);
  });

  it("does not claim a multi-part plan for a single-part set", () => {
    expect(planTransferParts([candidate(1), candidate(2), candidate(3)])).toMatchObject({ ok: false, issue: "part-count" });
  });
});
