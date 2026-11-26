import { BUNDLE_LIMITS, type BundleMember } from "../model";
import { isRecoveryKind } from "../formats";
import { SET_LIMITS, type SetProblemCode } from "./model";

export interface TransferCandidate {
  readonly digest: string;
  readonly byteLength: number;
  readonly kind: string;
  readonly recordCount: number;
}

export interface PlannedPart {
  readonly index: number;
  readonly memberDigests: readonly string[];
  readonly memberCount: number;
  readonly byteLength: number;
}

export interface TransferPlan {
  readonly parts: readonly PlannedPart[];
  readonly memberCount: number;
  readonly byteLength: number;
  readonly partCount: number;
  readonly requiresMultipart: boolean;
}

export type PlanIssueCode = SetProblemCode | "invalid-candidate" | "duplicate-digest" | "record-count";
export type PlanResult =
  | { readonly ok: true; readonly value: TransferPlan }
  | { readonly ok: false; readonly issue: PlanIssueCode; readonly slot?: number };

const ok = (value: TransferPlan): PlanResult => ({ ok: true, value });
const bad = (issue: PlanIssueCode, slot?: number): PlanResult =>
  slot === undefined ? { ok: false, issue } : { ok: false, issue, slot };

function validCandidate(candidate: TransferCandidate): boolean {
  return /^[a-f0-9]{64}$/u.test(candidate.digest) &&
    Number.isSafeInteger(candidate.byteLength) && candidate.byteLength > 0 &&
    Number.isSafeInteger(candidate.recordCount) && candidate.recordCount >= 0 &&
    isRecoveryKind(candidate.kind);
}

/**
 * Deterministic first-fit-in-input-order planner. It never reorders exports:
 * the user's selected order is preserved in the part and member sequence.
 */
export function planTransferParts(candidates: readonly TransferCandidate[]): PlanResult {
  if (candidates.length === 0) return bad("empty");
  if (candidates.length > SET_LIMITS.members) return bad("member-count");
  const seen = new Set<string>();
  const parts: PlannedPart[] = [];
  let digests: string[] = [];
  let partBytes = 0;
  let totalBytes = 0;
  for (const [index, candidate] of candidates.entries()) {
    const slot = index + 1;
    if (!validCandidate(candidate)) return bad("invalid-candidate", slot);
    if (candidate.byteLength > BUNDLE_LIMITS.totalBytes) return bad("member-size", slot);
    if (candidate.recordCount > 1_000_000) return bad("record-count", slot);
    if (seen.has(candidate.digest)) return bad("duplicate-digest", slot);
    seen.add(candidate.digest);
    totalBytes += candidate.byteLength;
    if (totalBytes > SET_LIMITS.rawBytes) return bad("total-size", slot);
    const needsNext = digests.length >= BUNDLE_LIMITS.members || partBytes + candidate.byteLength > BUNDLE_LIMITS.totalBytes;
    if (needsNext) {
      parts.push(Object.freeze({
        index: parts.length + 1,
        memberDigests: Object.freeze(digests),
        memberCount: digests.length,
        byteLength: partBytes,
      }));
      digests = [];
      partBytes = 0;
    }
    digests.push(candidate.digest);
    partBytes += candidate.byteLength;
  }
  if (digests.length > 0) {
    parts.push(Object.freeze({
      index: parts.length + 1,
      memberDigests: Object.freeze(digests),
      memberCount: digests.length,
      byteLength: partBytes,
    }));
  }
  if (parts.length < 2) return bad("part-count");
  if (parts.length > SET_LIMITS.parts) return bad("part-count");
  return ok(Object.freeze({
    parts: Object.freeze(parts),
    memberCount: candidates.length,
    byteLength: totalBytes,
    partCount: parts.length,
    requiresMultipart: true,
  }));
}

export function candidatesFromMembers(members: readonly BundleMember[]): readonly TransferCandidate[] {
  return members.map(member => ({
    digest: member.digest,
    byteLength: member.byteLength,
    kind: member.kind,
    recordCount: member.recordCount,
  }));
}

export function describePlan(plan: TransferPlan): string[] {
  return plan.parts.map(part => `${part.index}/${plan.partCount}:${part.memberCount}:${part.byteLength}`);
}

export function planMatchesMembers(plan: TransferPlan, members: readonly BundleMember[]): boolean {
  if (plan.memberCount !== members.length) return false;
  const candidates = candidatesFromMembers(members);
  const rebuilt = planTransferParts(candidates);
  if (!rebuilt.ok) return false;
  if (rebuilt.value.partCount !== plan.partCount || rebuilt.value.byteLength !== plan.byteLength) return false;
  return rebuilt.value.parts.every((part, index) => {
    const expected = plan.parts[index];
    return expected !== undefined && part.index === expected.index &&
      part.byteLength === expected.byteLength && part.memberCount === expected.memberCount &&
      part.memberDigests.every((digest, digestIndex) => digest === expected.memberDigests[digestIndex]);
  });
}
